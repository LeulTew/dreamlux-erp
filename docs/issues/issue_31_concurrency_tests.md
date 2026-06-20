# Issue #31 Concurrency Tests

This PR adds explicit concurrency integrity assertions for the database and API paths introduced or relied on by issue #31.

## Coverage Model

- Assignment concurrency is verified at the migration level because the backend test setup globally mocks `pg` for deterministic unit tests.
- The tests assert that assignment overlap triggers acquire transaction-scoped advisory locks before reading overlap rows.
- Employee, vehicle, and driver guards are checked for active-event date overlap predicates.
- Inventory allocation concurrency is verified against the API source: the route locks the target `items` row with `FOR UPDATE` before summing active allocations and inserting the reservation.

## Verification Notes

- `cd backend && bun test src/__tests__/db-concurrency-integrity.test.ts`: pass, 3 tests.
- `cd backend && bun run lint`: pass.
- `cd backend && bun run build`: pass.
- `cd backend && bun test`: pass, 219 tests.
- `git diff --check`: pass.
