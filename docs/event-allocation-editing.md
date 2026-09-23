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

## Unavailable stock after returns

`POST /events/returns/items/:itemId/condition-resolutions` resolves previously
returned damaged or repair stock. It requires the current `assets:reconcile`
permission and an active item UUID. The existing request accepts
`source_condition` (`damaged` or `repair`), `outcome` (`good`, `damaged`, `repair`,
or `lost`), a positive integer `quantity` up to 1,000,000, and optional notes
and an idempotency key. Quantity cannot exceed the selected unavailable balance.
Recording an inspection with an unchanged condition remains supported.

A successful `201 { resolved, outcome, resolution }` means one transaction acknowledged
the resolution record, the net damaged/repair balance update, and a stock
movement if the outcome was loss. Restoring good stock releases availability
without increasing owned quantity; loss reduces owned quantity. Prior return
receipts, item condition metadata, and immutable historical ledgers are not
rewritten. A repeated item/idempotency key remains a `409`, not a second write.

Item locking is bounded by a transaction-local ten-second timeout. Contention
returns `409 CONDITION_RESOLUTION_BUSY`. A lost COMMIT acknowledgement returns
`503 CONDITION_RESOLUTION_UNCONFIRMED` with `outcome_uncertain: true` and no
`resolved` receipt: verify stored inventory before retrying, rather than assuming
nothing committed. Missing or rejected required writes roll back together.
An unacknowledged BEGIN also triggers rollback before the connection can be
reused; a failed rollback causes that connection to be discarded.

The additive `resolution` field is the immutable record for the submitted item,
source, outcome, quantity, notes, actor and idempotency key. Existing
`resolved`/`outcome` consumers retain their fields. A generic successful status or
cache refresh is not a receipt for a particular operation.

### Condition-stock operator workflow (#279)

Inventory contains a separate **Condition stock** entry at `/assets/conditions`.
The return workflow links to the item when the current operator has
`assets:read` or `assets:reconcile`. This does not grant access to returns,
dispatch or unrelated inventory pages. Reconciliation-only operators see the
containing Inventory group and can inspect the data needed for their existing
write capability. Read-only operators cannot submit resolutions.

The list and detail show actual location, unit and full existing item UUID so
same-name stock is distinguishable. Missing metadata is labelled as not
recorded; inactive locations and archived items are identified rather than
silently substituted. Archived history remains inspectable, but writes still
require an active item. Recounts and the descriptive item condition are separate.

- `GET /events/returns/condition-stock`: literal name search (maximum 100
  characters), UUID keyset paging, optional archived items, and a 1-50 row limit.
- `GET /events/returns/items/:itemId/condition-stock`: one-snapshot item,
  bounded immutable history, next cursor and optional exact-key recovery record.
  NULL historical keys and timestamps are retained. An absent recovery record
  does not establish that an in-flight request cannot still commit.
- History uses `(created_at, id)` descending keysets, with NULL timestamps last.
  Offset cursors normalize to the same comparison axis without wrapping the
  indexed stored column. Microseconds are preserved.
- A valid current actor is required. The UI verifies `/auth/permissions`
  `user_id` and slugs, not role labels; identity-less legacy sessions cannot
  create a journal. `X-Condition-Actor` binds operator requests to the expected
  session actor. An actor mismatch is rejected, not treated as another user's
  acknowledgement.
- A temporary authority-read failure withholds stock actions and offers an
  explicit read retry without erasing the session or requiring another login.
  Rejected or identity-less authentication retains the separate sign-in path.

DreamLux's ledger column is **timestamp without time zone**, not `timestamptz`.
Historical physical instants cannot be reconstructed from that column alone.
Existing values are not rewritten. New resolutions explicitly store UTC;
serialized microsecond cursors use a UTC-labelled stored-clock axis. History
displays that clock without applying the browser's timezone and explains the
older-record limitation. No schema or grant migration is introduced.

### Deliberate recovery

The immutable submitted intent is written and read back in session storage
under `dreamlux-erp:condition-resolution:v1:<verified-user-UUID>` before any
dispatch. A QueryClient-lifetime ownership guard supplements that journal:
navigation, cache clearing and reload cannot silently release an uncertain
operation or let a late callback clear another draft.

If storage, identity or online admission cannot be verified, no unprotected
write is sent. There is no automatic mutation retry, paused offline mutation,
queue entry or reconnect replay. Existing queue entries for this endpoint are
blocked with an explicit warning.

An uncertain operator can **Check saved outcome** or deliberately **Retry exact
request**, retaining the same key and payload. Only a matching immutable record
confirms the operation. Mismatched identity/intent is a conflict. A later known
rejection cannot disprove an earlier uncertain commit. Rejections preserve
authored input. Acknowledgement releases independently of advisory refreshes;
stale reads remain visible. Loss requires a separate item-specific confirmation,
and its stock movement has a negative sign and loss styling.

A first-attempt rate limit is a known rejection, not an ambiguous commit. Its
inputs can be deliberately edited and submitted again. If an earlier attempt
was already uncertain, a rate-limited retry still cannot release that original
identity or establish rollback.

Global reservations are unchanged: making stock usable does not increase owned
quantity, and non-overlapping event dates do not create an additional stock pool.

Current normalized-grant revocation and inactive-account denial use the shared
authority integration in #284. The condition suite retains those assertions;
the operator workflow adds no role-name or stale-map authority fallback.

The existing equipment verifier registers condition inspection/resolution,
deletion, return correction and provisioning as separate native processes.
Its browser registry includes both the existing workflows and the real
condition-stock journey. Verification retains the original deadlines and
reuses the source-matched frontend artifact from the separate CI build job.
