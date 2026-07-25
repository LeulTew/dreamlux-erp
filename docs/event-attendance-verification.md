# Event staff attendance verification

Issue #197. QA finding: *"On the staff allocation the attendance is already checked it shouldn't
be like that."*

Assigning an employee to an event means they are **scheduled**. It has never meant they were
**present**. The old default conflated the two: `event_assignments.attended` defaulted to `TRUE`,
the create schema defaulted an omitted value to `true`, and the workspace never sent the field, so
every new assignment was inserted as attended. Labor expense and payroll commission both key off
`attended`, so the system could create real financial liability for people whose presence was
never confirmed.

## Chosen model: boolean, default FALSE

Attendance stays a **boolean**, now `NOT NULL DEFAULT FALSE`, rather than becoming a
`scheduled | attended | absent` enum.

Why:

- Every consumer only ever asks one question: *was attendance explicitly verified?* Labor uses
  `attended = true`; payroll uses `ea.attended IS TRUE`. Nothing in the product reports on,
  deducts for, or reconciles absence.
- A tri-state would force us to invent meaning for historical data. Today's `false` rows are
  ambiguous — some were deliberately unchecked, some were never touched — so mapping them to
  either `absent` or `unverified` would fabricate a fact the database does not contain.
- The smallest safe model that fixes the reported bug is the right one.

**Known limitation, accepted deliberately:** `false` means "not verified", which covers both *not
yet checked* and *did not show up*. The UI therefore says **"Attendance unverified"** and never
claims the employee was absent. If the business later needs genuine absence reporting (for example
to deduct pay or to flag no-shows), that is a follow-up issue requiring a real status column and a
deliberate backfill policy — not an inference from this boolean.

## Historical data policy

The migration changes the **default for future rows only**.

- No blanket `UPDATE event_assignments SET attended = FALSE`. Existing `TRUE` rows are preserved
  exactly as stored. Their provenance cannot be reconstructed — a genuinely verified row is
  indistinguishable from a defaulted one — and rewriting them would retroactively erase labor
  expenses and payroll commissions that have already been generated, approved, and in some cases
  paid.
- The one exception is `UPDATE event_assignments SET attended = FALSE WHERE attended IS NULL`.
  This is financially inert: `attended = true` and `ea.attended IS TRUE` both already exclude
  `NULL`, so no labor or commission total changes. It exists only so the column can be constrained
  `NOT NULL` and stay honest going forward.
- Demo/SRD seed rows keep their explicit `attended = true`, because the seeded sample event is a
  completed event whose labor expense is part of the fixture.

Applied in three places that must agree:

| Path | File |
| :--- | :--- |
| Fresh database | `backend/src/db/schema.sql` |
| SRD parity database | `backend/src/db/migrations/srd_parity.sql` |
| Existing deployment | `backend/src/db/startup-migration.ts` (runs every boot) and `backend/src/db/migrations/event_assignment_attendance.sql` via `bun run db:migrate` |

`backend/src/__tests__/event-assignment-attendance-migration.test.ts` pins all three so they cannot
drift apart again, and asserts that the migration contains exactly one `UPDATE` — the NULL
normalization.

Two audit columns were added alongside: `attendance_marked_at` and `attendance_marked_by`.

## Scheduling never asserts attendance

`attended` was **removed from the create contract** entirely:

- `createEventAssignmentSchema` no longer has an `attended` field, so a payload sending
  `attended: true` is stripped by zod and cannot bypass verification.
- The insert uses a SQL literal `VALUES ($1, $2, $3, $4, FALSE)` rather than relying on the column
  default, so the row is unverified regardless of the deployed schema version.
- The `ON CONFLICT` branch no longer sets `attended = EXCLUDED.attended`. Re-assigning an employee
  to change their role or commission deliberately leaves an already-verified attendance alone
  instead of silently clearing it.
- Scheduling now writes an `event_assignment_scheduled` audit row.

## Verifying attendance

`PATCH /events/:id/assignments/employees/:employeeId/attendance` is the only path that sets
`attended = true`. It was hardened because it directly creates financial liability:

| Before | After |
| :--- | :--- |
| `hasAnyPermission([event_assignments:write, vehicle_assignments:write])` | `hasPermission(event_assignments:write)` |
| Raw `req.body`, only `undefined` rejected (so `null` nulled the column) | `updateEventAssignmentAttendanceSchema` — strict boolean |
| Two separate `pool.query` calls, event check not atomic with the write | One transaction, `events` then `event_assignments` both `FOR UPDATE` |
| No audit row | `event_assignment_attendance` audit with old and new value |
| Assignment looked up by `event_id` + `employee_id` | Unchanged, still event-scoped (BOLA) |

The permission tightening is a BFLA fix: verifying staff attendance is payroll-affecting and must
not be reachable with only a fleet permission. No seeded role loses access — every role holding
`vehicle_assignments:write` (`ops_manager`, `event_manager`) also holds `event_assignments:write`.

Re-sending the same value is idempotent and writes no audit row; only a real transition is
recorded. Completed-event locking and the `events:override_completed` correction path are
unchanged, and an override correction is flagged in the audit payload.

## Labor generation

Unchanged in what it counts: `SUM(commission_amount) WHERE attended = true`, which excludes both
`false` and legacy `NULL`.

What changed is the explanation. Previously any zero total returned *"No attended labor assignments
found for this event"*, which hid the actual reason. The helper now distinguishes:

- **`attendance_unverified`** → `409`, *"Attendance must be verified before labor can be generated.
  N assigned employees still have unverified attendance."* plus `unverified_count`.
- **`no_labor`** → `400`, the original message, for when nobody is assigned or nobody earns
  commission.

The extra count query lives inside the zero branch so the happy path keeps its existing query
sequence.

**Mixed attendance policy:** labor is generated from the verified subset, and unresolved
assignments remain visible and correctable. Generation is not blocked until every assignment is
resolved. This matches the existing workflow — the duplicate-protection index
(`idx_expenses_auto_labor_once_per_event`) means labor is generated once, so blocking on stragglers
would risk an event being finalized with no labor at all rather than with partial labor.

**Ordering note:** labor requires the event to be `Completed`, but attendance is locked once the
event is `Completed` for anyone without `events:override_completed`. The intended sequence is
therefore **verify attendance → complete the event → generate labor**. If an event is completed
with attendance still unverified, an override-authorized user must correct it.

## Payroll

No change was required. `ELIGIBLE_COMMISSIONS_SQL` already filters on `ea.attended IS TRUE`, which
excludes unverified, false, and NULL. Because new assignments now start `false`, scheduled-but-
unverified staff correctly contribute zero commission — which is the whole point of the fix.
Finalized payroll snapshots remain immutable; a later attendance correction does not rewrite them.

## UI

In the Event Workspace → Team & Vehicles tab each assignment shows:

- a **status badge** — `Attendance unverified` (warning) or `Attended` (success) — which carries
  the fact, so state is never communicated by a checkbox alone;
- a **"Verify attendance" checkbox** whose checked state means verified attendance only, with an
  accessible name including the employee, a 48px-safe target, and disabled states for read-only
  users, in-flight requests, and completed events;
- a localized explanation when the control is locked by event completion.

There is no optimistic update: the box reflects the server's value and only flips after the
round-trip and refetch land. A successful transition invalidates the workspace, event profit, and
payroll commission eligibility caches.

All new strings are translated in English and Amharic, including the badge statuses in
`StatusBadge` (which resolves its own translations and would otherwise fall back to raw English).
