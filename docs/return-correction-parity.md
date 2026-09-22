# Return correction integrity and DreamLux availability

Issue [#273](https://github.com/LeulTew/dreamlux-erp/issues/273) is a bounded,
source-only repair of `POST /events/returns/:receiptId/corrections`. It does not
deploy, migrate a live database, introduce a correction UI, or change the
condition-resolution API repaired in #268/#270.

## Existing DreamLux rules

- Reconciliation requires the current `assets:reconcile` grant. A session alone
  is not authorization. Missing authority is rejected before transaction
  acquisition.
- The authority lookup compares invalidation revisions, not clock ticks. A
  lookup started after invalidation in the same millisecond can use its current
  grants; an invalidation during the lookup prevents both authorization and
  caching. Pruning old markers cannot revive an in-flight result. The existing
  60-second TTL and 2,000-entry LRU policy are unchanged (#275).
- Original return receipts and correction records are append-only. A correction
  adds compensating deltas and adjusts the allocation's running condition totals.
- Good returns release their outstanding reservation. Damaged and repair stock
  remain owned but unavailable; only losses change owned quantity.
- Reservations are **global**, not event-window-based: all non-`Returned`
  allocations count, including reservations attached to disjoint, completed or
  soft-deleted events. Legacy `Returned` rows are not counted as active demand
  even if they lack modern condition counters.
- DreamLux does not have Koti's additive `quantity_dispatched` or `cancelled_at`
  columns. Its item/workspace reads and reservation creation/growth already
  use the same outstanding-return accounting. Do not import Koti's DDL,
  cancellation/window policy, service scopes or grants into this repair.

## Atomic correction contract

The transaction locks the receipt/allocation, then reads cumulative corrections
in a **fresh statement after the lock**. A statement that waits for a row lock can
retain its earlier snapshot for scalar aggregates. Re-reading prevents two
waiting corrections from overdrawing a receipt when another receipt on the same
allocation provides enough goods to conceal the error in allocation totals.

The item lock serializes correction capacity checks with reservation creation
and growth. With `usable = owned - damaged - repair`, a correction must not
increase `max(global_outstanding - usable, 0)`. This both protects returned stock
already reallocated to another event and permits neutral/capacity-releasing
corrections that help recover an existing shortage.

All required writes must acknowledge exactly one row: correction, item,
conditional loss movement, allocation and event audit. Any missing write or SQL
failure rolls back the transaction. `returned_by` binds as UUID, including when
the correction reopens an allocation and clears its return metadata.

### Responses and recovery

| Response | Meaning |
| --- | --- |
| `201` | The correction and all required effects were acknowledged as committed. |
| `400` | Malformed receipt ID or invalid correction input; no transaction acquired. |
| `403` | Missing current reconciliation authority. |
| `404` | Receipt unavailable, including a soft-deleted parent event. |
| `409` | Invalid balances, reserved capacity, duplicate key, or unavailable item. |
| `409`, `RETURN_CORRECTION_BUSY` | A lock timeout/deadlock prevented the change. Reload before deciding to retry. |
| `500` | A pre-commit failure; no successful correction is reported. |
| `503`, `RETURN_CORRECTION_UNCONFIRMED`, `outcome_uncertain: true` | COMMIT acknowledgement was lost. The database may already contain the correction. |

**Never automatically replay an unconfirmed correction.** Inspect
`GET /events/:eventId/returns` (original receipts, corrections and allocation
totals) and the affected inventory before retrying. Reuse the original
idempotency key when a retry is appropriate. An unconfirmed COMMIT or failed
rollback acknowledgement discards the pooled connection. BEGIN acknowledgement
loss is also cleaned up before a connection is reused.

## Permanent verification

Use the reviewed native-equipment entry point from an independently configured
QA checkout, never a quarantined/live-linked checkout:

```text
bun --no-env-file scripts/equipment/run.ts --allow-disposable-postgres \
  --postgrest <verified-local-binary> --frontend-build <approved-build-artifact>
```

The existing native target validator requires loopback `127.0.0.1:55434`,
`dreamlux_parity`, an independently generated 64-hex password and a fresh
`dreamlux_ephemeral_equipment_259_<random>` database. PostgreSQL durability stays
on. Tests use actual development-mode account/permission lookups, real
PostgREST/Express requests, and an independent SQL observer. No provider secrets,
legacy bootstrap runners or live Auth/Storage target are needed.

The equipment runner retains its **170-second overall deadline** and runs each
native suite in a separate process:

| Suite | Exact cases |
| --- | ---: |
| Existing equipment deletion | 26 |
| Existing condition resolution | 23 |
| Return correction and availability | 35 |
| Existing desktop/mobile equipment browsers | 8 |
| Added desktop/mobile return browsers | 4 |

The 35 return cases cover normal dispatch/returns/reallocation, native schema
differences, established global policy, immutable history, receipt and allocation
concurrency, current authority, idempotency, true PostgreSQL write suppression,
real BEGIN/COMMIT/ROLLBACK acknowledgement loss, acquisition errors and bounded
lock contention. Faults execute the real SQL before dropping the acknowledgement;
they do not invent transaction success. The browser cases exercise the actual
correction API from Chromium, inspect independently persisted state and continue
the existing rendered return workflow. They do not claim a new correction form.

Registry/JUnit verification rejects missing cases, retries and skips. The
existing local-CI and hosted equipment entry points pick up this suite without
changing the existing three/three/five-minute job caps. Hosted Actions execution,
live migration, release and whole-project certification remain separate gates.
