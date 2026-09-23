# Event editing and persistence

`PUT /events/:id` accepts partial event edits with `events:write`. The editor
submits only the fields the operator changed, so unloaded service scopes,
hidden financial values and stale untouched fields are not written back as
defaults. Creation and duplication keep their complete normalized payload.
Explicit zero values and nullable clears remain intentional writes. Choosing
service scopes in the editor sends `service_scope_ids`.

## Transaction boundary

An event update owns one leased transaction. It locks and reads the current
non-deleted event before applying completed-event and transition rules. Scalar
updates, service-scope links, event audit entries, completion/labor checks and
response preparation finish before commit, so a failure cannot leave a
partial update.

An unconfirmed commit returns HTTP 503 with `outcome_uncertain: true` and asks
the operator to reload before retrying; it is not described as a rollback.
Status notifications remain post-commit and best effort.

## Service scopes

`service_scope_ids` is a junction-table input, never an `events` column.
Omitting it preserves existing links; an explicit empty array clears them.
The `service_scopes` string/array alias accepts catalog IDs, codes and
bilingual names. When both are supplied, `service_scope_ids` wins. Malformed
or unknown values fail with HTTP 400 and nothing is written.

## Dates and rescheduling

Partial date edits are validated against the retained opposite date.
PostgreSQL normalizes submitted dates, and stored `DATE` values are compared
and logged as calendar days, not UTC instants, so unchanged dates do not
trigger rescheduling checks or date log entries.

A changed date range is checked against every other event that overlaps it
(partially, containing or contained) for the event's assigned employees,
drivers and vehicles. The edit locks assigned vehicles and then
employees/drivers in a stable order, matching the assignment writers, before
evaluating conflicts. Completed-event overrides, state transitions and
attendance/labor rules are unchanged.

Successful edits refresh event lists and the event workspace. An `?edit=` deep
link is consumed once per open request; closing or saving removes only that
parameter and keeps list filters and sort state.

## Verification

`backend/src/db/event-editing.integration.test.ts` runs as the third process
of `bun run verify:imports:native` against the attested native PostgreSQL
target. It covers an ordinary edit-sheet save with service scopes, partial
employee and vehicle overlaps, unchanged dates inside a containing booking,
a partial end date before the start, and an invalid scope that must leave the
event untouched. Editor payload behavior is covered by
`frontend/src/__tests__/event-editor-persistence.test.tsx` and
`frontend/src/lib/event-edit-payload.test.ts`.
