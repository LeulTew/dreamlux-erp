# Releasing allocations and removing assignments

Issue #219. Both delete endpoints were bare hard deletes — `pool.query`, no transaction, no audit
row, and for allocations no lifecycle guard at all. They could destroy records the rest of the
system had been carefully taught to protect.

## Why this mattered

`event_allocations` is referenced by two tables with **opposite** delete behaviours:

| Referencing table | FK behaviour | Effect of deleting the allocation |
| :--- | :--- | :--- |
| `event_return_receipts` | `ON DELETE CASCADE` | Return receipts — deliberately made **immutable** by triggers in #173 — were silently deleted along with it |
| `event_return_corrections` | `ON DELETE RESTRICT` | The delete instead failed with an opaque foreign-key error |

So releasing a returned allocation either quietly erased return history or produced a confusing
500, depending on whether a correction happened to exist. Neither is acceptable, and neither was
visible to the caller.

For assignments the damage was subtler: deleting one removed a **verified attendance**. If labor
had already been generated from it, the labor expense survived with no source record, while
payroll commission eligibility silently recomputed without it — the expense and the payroll basis
disagreed, with nothing recording why.

The UI disabled the Release button for departed allocations, but frontend gating is not
authorization: the API accepted the call.

## Guards

Both endpoints now run in a single transaction, locking the event and the target row
`FOR UPDATE`, and both write an audit row inside that transaction.

**Releasing an allocation** is refused with `409` when it has departed or has any return activity
(`status = 'Returned'`, `returned_at`, or any non-zero `returned_*_quantity`). The lifecycle
predicates are repeated in the `DELETE ... WHERE` clause so a depart or return committing between
the read and the write cannot be overtaken — that race also returns `409`.

Releasing remains a **hard delete**, deliberately. Once departed and returned rows are protected,
the only rows still deletable are reserved allocations that never left the store, and nothing
references those. A soft delete would add a filter to every availability query for no gain.

**Removing an assignment** is refused with `409` when the attendance is verified *and* a generated
labor expense still exists for the event. The response carries `labor_expense_id`, and the fix is
to reverse the labor expense first (`POST /events/:id/expenses/reverse-auto-labor`), which is an
audited action of its own. The labor lookup is skipped entirely when the assignment was never
attended, so the common case costs nothing.

Existing permission rules, completed-event locks, override behaviour, and event-scoped (BOLA)
lookups are unchanged.

## Audit records

Both write the removed row's contents as `old_value` with a `null` `new_value`, so a deletion is
reconstructible from `event_logs`:

| Action | `field_changed` | Captured |
| :--- | :--- | :--- |
| Release allocation | `allocation_released` | allocation id, item id, quantity, status, notes |
| Remove assignment | `event_assignment_removed` | assignment id, employee id, role, commission, attended, marker timestamp |

If the audit insert fails, the whole transaction rolls back — a record cannot disappear without a
corresponding log entry.

## UI

The Release button now disables for **returned** allocations as well as departed ones, matching
the server guard rather than only half of it.

The release mutation previously had **no error handler**, so a refusal produced no feedback at all
and the row simply appeared not to change. It now surfaces the server message, and a successful
release refreshes item availability and the dispatch queue alongside the workspace, since the
freed units re-enter the availability pool.
