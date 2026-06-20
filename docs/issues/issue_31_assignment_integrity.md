# Issue #31 Assignment Integrity

This PR adds storage-level assignment guards without changing the existing assignment table shape. Assignment date ranges remain sourced from `events.start_date` and `events.end_date`.

## Integrity Model

- Employee event assignments cannot overlap with another active event assignment.
- Employee event assignments cannot overlap with driver bookings for another active event.
- Vehicle assignments cannot overlap with another active event vehicle booking.
- Driver assignments cannot overlap with another active event employee assignment or driver booking.
- Multiple vehicle rows for the same event may keep the same driver to preserve current SRD seed behavior; cross-event overlaps are blocked.

## Concurrency Model

The trigger functions take `pg_advisory_xact_lock` locks scoped to the assigned employee, vehicle, and driver before checking overlap rows. This serializes concurrent inserts for the same resource at the database layer, while existing API transactions and clear conflict responses remain in place.

## Rollback Notes

Rollback should drop `trg_prevent_event_assignment_overlap`, `trg_prevent_vehicle_assignment_overlap`, `prevent_event_assignment_overlap()`, and `prevent_vehicle_assignment_overlap()`. Existing app-level conflict checks should remain active during rollback.

## Verification Notes

- `cd backend && bun test src/__tests__/assignment-integrity.test.ts`: pass, 4 tests.
- `cd backend && bun run lint`: pass.
- `cd backend && bun run build`: pass.
- `cd backend && bun test`: pass, 216 tests.
- `git diff --check`: pass.
