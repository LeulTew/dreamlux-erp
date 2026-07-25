# Editing active event inventory allocations

Issue #196. Storekeepers previously had to release and re-create an allocation to fix a mistyped
quantity or a wrong note. That destroyed the row's continuity (created_by, created_at, dispatch
check state) and was impossible once the load had departed, because release is a hard delete.

`PATCH /events/:id/allocations/:allocationId` corrects an allocation in place. No schema change was
required: `event_allocations.quantity_allocated`, `event_allocations.notes`, and the `event_logs`
audit table already exist.

## Request

Both fields are optional, but at least one must be present:

```json
{ "quantity_allocated": 20, "notes": "Back hall only" }
```

- `quantity_allocated` — integer, 1 to 1,000,000. Omitted means "leave unchanged".
- `notes` — trimmed string up to 1000 characters, or `null` to clear. Omitted means "leave unchanged";
  an explicit `null` or empty string clears the note.

Sending `{}` is rejected rather than producing an empty audit entry.

## Authorization

- Requires `event_allocations:write` or `assets:write`.
- A `Completed` event additionally requires `events:override_completed`, matching the existing POST
  and DELETE allocation routes.
- The allocation is looked up by `id AND event_id`. An allocation belonging to another event is not
  reachable by pairing it with a visible event id (BOLA), and the response is an indistinguishable
  404 either way.

## Lifecycle locks

Editing is refused with `409` when the allocation has departed (`departed_at`), has been returned
(`status = 'Returned'`, `returned_at`, or any non-zero `returned_*_quantity`). The same predicates
are repeated in the `UPDATE ... WHERE` clause, so a depart or return that commits between the read
and the write cannot be silently overwritten — that race also yields `409`.

## Concurrency and availability

Everything runs in one transaction with this lock order, which matches `events/returns.ts`
(allocation before item) so the two routes cannot deadlock:

```
BEGIN
  events              FOR UPDATE
  event_allocations   FOR UPDATE   (scoped by id AND event_id)
  items               FOR UPDATE   (only when the quantity grows)
  availability check
  UPDATE event_allocations
  INSERT INTO event_logs
COMMIT
```

Stock is only re-checked when the reservation grows. The availability sum **excludes the allocation
being edited**:

```sql
SELECT COALESCE(SUM(quantity_allocated
  - returned_good_quantity - returned_damaged_quantity
  - returned_lost_quantity - returned_repair_quantity), 0)
FROM event_allocations
WHERE item_id = $1 AND status != 'Returned' AND id <> $2
```

Without `id <> $2` the row's current reservation would be counted twice and a 10 → 20 correction
would be treated as needing 20 fresh units instead of 10. Worked example: 100 physical units, 70
held by other active allocations, this allocation at 10. Availability for this row is 30, so raising
it to 20 succeeds and the resulting total active allocation is 90.

A decrease needs no item lock: availability is derived from the allocation rows themselves, so the
freed units drop out of the sum as soon as the transaction commits.

Insufficient stock returns `409` with the computed `available_quantity` so the client can show a
concrete number.

## Audit

Every successful edit writes one `event_logs` row inside the same transaction, with
`field_changed = 'allocation_update'` and JSON old/new values carrying `allocation_id`, `item_id`,
`quantity_allocated`, and `notes`. `user_id` and `changed_at` give attribution and timing. If the
audit insert fails the whole transaction rolls back, so an allocation can never change without a
matching log entry.

## UI

The Event Workspace → Inventory Allocation tab exposes an inline Edit control on eligible rows.
Locked rows show a short reason (`Locked after departure` / `Locked after return`) instead of a
control that would always fail. On success the workspace, item-picker availability, inventory, and
dispatch-queue caches are all invalidated. All new strings are translated in English and Amharic.
