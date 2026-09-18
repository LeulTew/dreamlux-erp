# Payroll publication contract

Issue #239 coordinates DreamLux's existing payroll writers. Issue #233 adds a
visible, read-only consumer of the same authoritative calculation.

## Entry points and compatibility

| Endpoint | Behavior |
| --- | --- |
| `POST /payroll/preview` | Read one complete, current source snapshot; no persistence. |
| `POST /payroll/drafts` | Create or atomically replace the most recently updated active draft for the exact date bounds. |
| `POST /payroll/runs` | Create an active finalized run, rejecting an existing active finalized run with identical date bounds. |
| `PATCH /payroll/runs/:id/status` → `FINALIZED` | Recalculate current sources for the saved period, replace snapshots and finalize in one transaction. |
| Other status changes | Preserve saved amounts and existing flag/trash/restore semantics. |
| `DELETE /payroll/runs/:id` | Keep the existing soft-delete contract: set `deleted_at`, without changing status. |
| Permanent deletion | Coordinate with other writers and retain audit metadata; deleting an already absent UUID remains idempotent. |

An already-active finalized run is immutable on repeated finalization: no source
recalculation, snapshot/timestamp rewrite, new audit, or repeated notification.
Status finalization notifications are emitted only after an acknowledged new
finalization; direct creation retains its previous notification behavior.
Optional delivery failures, including rejected promises, are logged and contained:
they do not turn a committed finalization into an HTTP failure or an unhandled
rejection.
Successful API envelopes and saved employee/event payloads remain compatible.
Authenticated effective permissions (including secondary roles) govern writes;
a submitted `created_by_user_id` is not authoritative.

The period resolver is unchanged:

- Weekly requires a start and ends six days later, even across month boundaries.
- Monthly uses month/year, not submitted range endpoints.
- Custom ranges use both explicit endpoints.
- The resolver's fallback is half-month; the start day selects H1 or H2.
  The existing request schema first defaults omitted `period_kind` to `month`,
  so an HTTP request with no kind still produces a month. Neither layer's
  existing default is changed by this backport.
- Generated titles retain their existing formats. Status publication preserves
  the stored title and period metadata.

Salary-code lookup, employee-base fallback, compensation modes, and verified
attended-assignment aggregation are unchanged. This introduces no proration,
cross-period overlap rule, full-time filter, or salary-FK reconciliation.
Client event quantities, employee omissions, rates, and overrides do not replace
the authoritative active employees and verified attendance.

## Visible read-only preview

`POST /payroll/preview` retains `month`, `year`, `total_payroll_value` and
`employee_lines`. It additionally returns the resolver's canonical `period_start`,
`period_end` and `period_kind`. Each generated employee line has an optional
`employee_code_snapshot`: the current human-readable `employees.employee_id`
code, **not** the employee's `id` UUID. The UUID remains the line's `employee_id`.
The code comes from the same single SQL source snapshot as compensation and
attendance, with no second identity query. Missing codes render as a labelled
record UUID, not an invented employee code.

These are read metadata only. The existing employee/event persistence mappers
still emit exactly their previous fields, without a new saved column or schema.
There is no later salary-ID authority helper or salary-FK policy in this backport.

The run page labels local figures as estimates. **Preview** captures an immutable
copy of the current request, user and requested period, then opens the existing
Radix-based [Sheet](../frontend/src/components/ui/sheet.tsx) through
[PayrollPreviewSheet](../frontend/src/components/PayrollPreviewSheet.tsx).
The successful result shows the returned employee identities, compensation
modes, base/commission/employee totals, whole-roster totals and canonical period.
It explains any difference from the captured requested dates or kind rather
than relabelling the old result. Preview is not approval: saving/finalizing still
recalculates current inputs through the atomic writer.

- A current `payroll:read` grant is required independently of the page's
  `payroll:write` grant. Without read access the trigger is disabled and explains
  why. When refreshed client grants revoke access, cached values hide immediately
  and the sheet closes, restoring focus to that explanation. User/period/setup-scope changes invalidate
  the captured request, including a later switch back to the old context.
- Reads use a 30-second Axios timeout and the query's abort signal, no automatic
  retries, no focus/reconnect/interval refetch, and no retained query cache after
  unmount. Close, unmount and stale-context transitions cancel the observation;
  late payloads cannot reopen the sheet or replace the current result. Refresh
  and retry are explicit, hide the previous result, and restart display paging.
- Loading, malformed payloads, HTTP failures and a genuine successful empty
  roster have distinct states. Missing canonical period metadata is an error,
  never permission to reconstruct dates or show setup estimates as server data.
- [The preview parser](../frontend/src/lib/payroll-preview.ts) validates finite,
  nonnegative cent-denominated amounts, unique nonblank identities, compensation
  modes and valid civil dates. It first permits operation-count-bounded floating
  noise, capped at **0.01 cent (ETB 0.0001)**, then reconciles integer cents for
  each employee and the full total. It does not round away ETB 0.001 corruption.
  Arithmetic tests partition the documented ETB 500 training amount; they
  introduce no compensation or proration policy.
- Only ten returned employees render per page. Desktop uses a semantic table;
  mobile uses compact rows with every base/commission/total value and a
  bottom-anchored sheet. Actions are at least 48px, with bilingual labels,
  focus trapping, Escape/backdrop dismissal, focus restoration and a mobile
  swipe handle. The bottom height uses the side-qualified
  `data-[side=bottom]:h-[90dvh]` override so the primitive's `h-auto` cannot move
  the close control between loading and success.
- Preview never calls the mutation guard's begin/complete/fail methods, never
  marks the draft dirty and never modifies the save payload. Existing
  `writePending` and unknown-outcome `needsReload` opening guards remain intact.

The additive backend metadata must be released before or alongside this UI
consumer through the independently authorized release process. An older response
without canonical metadata deliberately fails validation rather than displaying
a misleading payroll preview.

## Transaction and coordination

`PayrollPersistenceService` owns all official payroll mutations on one checked-out
PostgreSQL connection. It starts `READ COMMITTED`, sets a 10-second lock timeout
and a 30-second statement timeout, then takes the transaction-scoped
`dreamlux-payroll-period` advisory lock for `start:end`. ID-based operations read
the period, acquire that same lock, lock/re-read the run, and reject a changed
period. These locks coordinate official writers, not arbitrary out-of-band SQL.

After any lock wait, **one SQL statement** reads active employees, event types,
salary levels, and eligible commission aggregates under one statement snapshot.
Separate REST reads and pre-lock repeatable-read snapshots are not used for
calculation. Snapshot inserts are batched, not per-employee queries.

Header, employee/event snapshots and mandatory financial audit either commit
together or fail. Returned employee IDs must match every generated employee
exactly, with unique valid line IDs. Insert counts and persisted employee/event
counts are checked before audit. Lifecycle activity is also transactional.
Permanent-delete audit retains the original ID in metadata when the run FK is
cleared by deletion.

Required financial reads fail explicitly: source errors cannot become empty
payrolls, and failed saved-total/event lookups cannot masquerade as zero totals
or complete historical detail. A genuinely empty successful source result is
still valid. Optional historical photo lookup remains best-effort.

## Failure and recovery

- Validation, missing run, and exact-period conflict return `400`, `404`, and
  `409` respectively.
- Pre-commit failures return a failure response, not a partial-success envelope.
  Lock timeout returns `503` with `outcome_uncertain: false`; other pre-commit
  failures normally return `500` with the same explicit false marker.
- A failed/lost **COMMIT acknowledgement** returns `503` with
  `outcome_uncertain: true`. A subsequent rollback cannot prove it did not commit.
  The connection is discarded, as it is after a rollback failure.
- A failed rollback acknowledgement does not imply a commit when no COMMIT was
  attempted and the connection is discarded. Conversely, unexpected route or
  cleanup failures after COMMIT must not carry a known-rollback marker.
- Mutation API wrappers validate resolved success bodies before notifying
  callers: drafts/publications require a valid generated UUID and the expected
  status; status changes require the requested UUID and status. Deletes require
  `success: true`, preserving older responses without an ID but rejecting any
  supplied mismatching/invalid ID. Missing, malformed, HTML, or wrong-record
  receipts raise a safe unknown-outcome error before success callbacks.
- All five mutation wrappers use a 45-second client timeout. Timeout is an
  unknown outcome, **not cancellation or proof of database rollback**.
- Run, detail, and history callers disable automatic mutation retries and
  coordinate pending writes synchronously. Unknown outcomes, missing responses,
  and unclassified server `5xx` errors block further writes until a full reload,
  even when a `5xx` body contains an error message. Only the explicit server-owned
  false marker permits a `5xx` manual retry; `502`/`504` remain unknown regardless
  of that marker. Normal `4xx` failures retain manual recovery.
  Client-side navigation or a history refetch does not clear that guard.
- Issue252 keeps response ownership separate from the write guard. Requests
  capture their actor, record or setup context before dispatch. Every receipt
  still settles its write and invalidates the appropriate saved-data queries,
  but an unmounted or changed context cannot redirect the newer page, close its
  dialog, load an older draft into it, or mark its period as saved. Returning
  to the previous context does not revive an obsolete response.
- The callers use `networkMode: "always"` with retries disabled: an offline
  attempt reaches the bounded transport and its failure notice instead of
  becoming a paused financial write that executes automatically on reconnect.
  An unconfirmed transport failure remains blocked until explicit reconciliation.
  This does not weaken the server's current permission checks or change pay.
- A confirmed receipt releases the write guard before read revalidation. Slow
  reads cannot hold an acknowledged write or clear a subsequent write's guard.
  Saved and finalized setup metadata belongs only to its captured period and
  actor; switching periods does not inherit a previous period's success state.
- The unknown-outcome notice focuses **Reload payroll** when recovery first
  becomes required and when entering another caller with that persistent state.
  Known failures do not move manual editing focus.
- Known failures remain manually retryable. A failed history read must be retried
  successfully before history-dependent writes. Autosave pauses after failure;
  the current dirty flag starts false and its legacy edit setters are unbound,
  so this is not evidence of a reproduced initial autosave loop.

## Current authority prerequisite

Issue242 is required by the preview's permission-revocation contract. After a
successful database-backed or cached role resolution, middleware replaces the
token's previous role names and explicit grants and removes its stale legacy
permission map. A current empty role/grant set remains authoritative. Existing
role-default and secondary-role policy is unchanged.

A failed current lookup stops the request before a protected route executes.
If an invalidation arrives during the lookup, the existing cache timestamp
guard rejects that result; it is neither used nor cached. Both conditions return
the existing `503` permission-unavailable response with
`outcome_uncertain: false`, because no requested mutation has begun. This
preserves safe manual recovery rather than claiming a payroll commit was lost.

Preview results disappear when current client grants change; a server-denied
refresh also removes old amounts. This does not promise instantaneous
cross-instance invalidation or change the application's existing refresh/cache
policy. Native proof uses actual role changes, cookie authentication and cache
invalidation, not token-only unit mode.

## Verification and isolation

The mocked payroll suites cover current-source calculation, old-draft
preservation, required write/audit failures, row-link/cardinality failures,
official writer ordering, immutable repeated publication, period compatibility,
permission boundaries, and known versus unknown acknowledgements. Frontend
classifier, guard, actual API-wrapper/adapter, and caller tests cover malformed
resolved receipts, bounded request configuration, manual recovery, and cross-page
blocking.
Preview-specific backend controls cover canonical MONTH/H1/H2/weekly/range
metadata, unchanged persisted payload keys, current employee codes, and a
synthetic Planner plus Team Leader calculation of ETB 17,000 changing to ETB
2,000 after current compensation/attendance changes. Frontend parser, component,
caller and adapter cases cover malformed/empty/failing reads, cancellation,
current-user/period/grant invalidation, 10-row paging and floating accumulation
at 25/250/1,000/5,000 employees. Frontend runtime tests must run only in the
credential-free QA snapshot described in
[payroll-native-verification.md](payroll-native-verification.md), not beside
original environment files.
Synthetic compensation examples use the DreamLux DOCX anchors: Operations Manager
35,000; Planner 14,500; Store Keeper 10,000; Guard/Loader 7,000; General Manager
70,000; Team Leader 2,000/event plus 500 for training attendance.

Protocol mocks are **not** PostgreSQL constraint, MVCC, concurrency, crash or
browser evidence. Native fault/concurrency/API and actual browser validation
require an independently owned synthetic DreamLux target and credential-free
source snapshot. This change adds no schema, migration, environment or bootstrap
operation. It does not repair the existing backup-URL priority or boot-time
migration hazards: do not start the normal entrypoint against existing services
to validate it. Production remains held; issue completion belongs to the
independent integration/review workflow.

For #233, the parent owns the native registry and actual browser proof: Preview
must leave run, employee-line, line-event and audit persistence unchanged;
mobile/keyboard/contrast/close-target geometry must be checked in the rendering
browser, including loading-to-success and permission revocation. Static class
checks and mocked focus tests are not that geometry/native proof. No counts or
approval thresholds in the independent verification runner are relaxed here.
