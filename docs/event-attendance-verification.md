# Event staff attendance verification

Issue #197. QA finding: *"On the staff allocation the attendance is already checked it shouldn't
be like that."*

Assigning an employee to an event means they are **scheduled**. It has never meant they were
**present**. The old default conflated the two: `event_assignments.attended` defaulted to `TRUE`,
the create schema defaulted an omitted value to `true`, and the workspace never sent the field, so
every new assignment was inserted as attended. Labor expense and payroll commission both key off
`attended`, so the system could create real financial liability for people whose presence was
never confirmed.

## Chosen model: three states derived from two columns

> **Revised by issue #203.** The original #197 design kept a plain boolean and documented the
> ambiguity of `false` as an accepted limitation. That held only while nothing depended on the
> distinction. When #202 began *blocking event completion and labor* on unresolved attendance,
> the ambiguity became load-bearing and deadlocked a normal workflow: a genuine no-show is
> honestly recorded by leaving the box unticked, but that was indistinguishable from "nobody has
> decided yet", so the event could never be completed and its labor could never be generated.
> There was no override bypass, and the only escapes were paying a no-show or deleting the
> assignment. Attendance therefore now has three states.

Attendance is `attended BOOLEAN NOT NULL DEFAULT FALSE` **plus** the `attendance_marked_at` /
`attendance_marked_by` marker columns, which together express three states without a new column,
a new enum, or any backfill:

| State | Data | Meaning | Paid? | Blocks completion/labor? |
| :--- | :--- | :--- | :---: | :---: |
| Unresolved | `attended = false`, `attendance_marked_at IS NULL` | Nobody has decided yet | No | **Yes** |
| Attended | `attended = true` | Verified present | **Yes** | No |
| Absent | `attended = false`, `attendance_marked_at IS NOT NULL` | Explicitly recorded no-show | No | No |

The authoritative predicate, identical in the backend SQL and the UI:

```
resolved   = attended IS TRUE OR attendance_marked_at IS NOT NULL
unresolved = attended IS NOT TRUE AND attendance_marked_at IS NULL
```

`attended IS TRUE` counts as resolved on its own so that legacy rows written before the marker
columns existed are never reinterpreted as unresolved - no backfill is required.

Money logic is untouched: only `attended IS TRUE` is ever paid, by either labor or payroll.

Why this shape rather than an enum:

- It needs no new column, no enum type, and above all **no backfill**. A `scheduled | attended |
  absent` enum would have forced us to invent a meaning for every historical `false` row, which
  is exactly the fabrication the #197 design was right to refuse.
- The money predicate stays a single unambiguous test (`attended IS TRUE`), so labor and payroll
  did not have to change at all.
- The third state is derived from data the audit trail already had to record — who resolved the
  attendance and when — rather than from a parallel field that could disagree with it.

**Remaining limitation:** absence is recorded as a fact but carries no reason code. If the
business later needs to distinguish an excused absence from a no-show, or to deduct pay for one,
that needs a real reason column - it cannot be inferred from what is stored today.

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

Unchanged in what it counts: only explicitly attended assignments are ever billed. One aggregate
now returns both the payable total and the number of unresolved rows:

```sql
SELECT COALESCE(SUM(commission_amount) FILTER (WHERE attended IS TRUE), 0) AS total,
       COUNT(*) FILTER (WHERE attended IS NOT TRUE AND attendance_marked_at IS NULL)::int AS unverified
  FROM event_assignments
 WHERE event_id = $1
```

Previously any zero total returned *"No attended labor assignments found for this event"*, which
hid the actual reason. The helper now distinguishes:

- **`attendance_unverified`** → `409`, *"Attendance must be resolved before labor can be generated.
  N assigned employees still need to be marked attended or absent."* plus `unverified_count`.
- **`no_labor`** → `400`, the original message, for when nobody is assigned or nobody earns
  commission.

Note the ordering: the unresolved check runs **before** the zero-total check, so "somebody still
has to be marked" is always reported in preference to "there is nothing to bill".

**Mixed attendance policy:** labor generation is blocked until every assignment is **resolved**
(attended or explicitly absent) - not until every assignment is *attended*. The generated labor
expense is unique per event, so creating it from only the verified subset would permanently omit
anyone verified later. The API returns `attendance_unverified` with the unresolved count, and the
workspace keeps the generation action disabled until every assignment is resolved. A recorded
absence resolves the row and contributes zero.

**Ordering note:** labor requires the event to be `Completed`, but attendance is locked once the
event is `Completed` for anyone without `events:override_completed`. The intended sequence is
therefore **verify attendance → complete the event → generate labor**. A normal transition to
`Completed` is rejected while any assignment remains **unresolved**, preventing an event from
entering a state where ordinary users can no longer resolve attendance. Because absence is
recordable, this gate can always be satisfied honestly. Historical completed events with
unresolved attendance still require an override-authorized correction.

## Payroll

No change was required. `ELIGIBLE_COMMISSIONS_SQL` already filters on `ea.attended IS TRUE`, which
excludes unverified, false, and NULL. Because new assignments now start `false`, scheduled-but-
unverified staff correctly contribute zero commission — which is the whole point of the fix.
Finalized payroll snapshots remain immutable; a later attendance correction does not rewrite them.

## UI

In the Event Workspace → Team & Vehicles tab each assignment shows:

- a **status badge** - `Attendance unverified` (warning), `Attended` (success), or `Absent`
  (neutral, because a recorded no-show is a settled outcome rather than an outstanding action);
- an **Attended / Absent radiogroup**. A checkbox cannot express three states, so it was replaced:
  neither option is selected while the row is unresolved, `aria-checked` reflects the recorded
  fact only, each option is a 48px-safe target with an accessible name including the employee,
  and both are disabled for read-only users, in-flight requests, and completed events;
- a localized explanation when the control is locked by event completion.

When every assignment is resolved but nobody attended, the workspace says **"No attended
employees. No labor expense is required."** rather than offering to generate a zero-value
expense - an all-absent event is a valid terminal state, not an error.

There is no optimistic update: the control reflects the server's value and only flips after the
round-trip and refetch land. A successful transition invalidates the workspace, event profit, and
payroll commission eligibility caches.

All new strings are translated in English and Amharic, including the badge statuses in
`StatusBadge` (which resolves its own translations and would otherwise fall back to raw English).
