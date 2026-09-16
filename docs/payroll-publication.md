# Payroll publication contract

Issue #239 coordinates DreamLux's existing payroll writers. The visible preview
workflow remains a separate concern in #233.

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
- The unknown-outcome notice focuses **Reload payroll** when recovery first
  becomes required and when entering another caller with that persistent state.
  Known failures do not move manual editing focus.
- Known failures remain manually retryable. A failed history read must be retried
  successfully before history-dependent writes. Autosave pauses after failure;
  the current dirty flag starts false and its legacy edit setters are unbound,
  so this is not evidence of a reproduced initial autosave loop.

## Verification and isolation

The mocked payroll suites cover current-source calculation, old-draft
preservation, required write/audit failures, row-link/cardinality failures,
official writer ordering, immutable repeated publication, period compatibility,
permission boundaries, and known versus unknown acknowledgements. Frontend
classifier, guard, actual API-wrapper/adapter, and caller tests cover malformed
resolved receipts, bounded request configuration, manual recovery, and cross-page
blocking.
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
