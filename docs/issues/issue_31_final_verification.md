# Issue #31 Final Verification Closure

This pass adds explicit, repeatable verification hooks for the two senior-review caveats that remained after PRs #41-#43:

- Live Supabase Data API denial checks when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are available.
- Live Postgres parallel assignment writes when `DATABASE_BACKUP_URL` or `DATABASE_URL` is available.

The scripts are intentionally guarded. They skip with a clear message when credentials are unavailable, so ordinary CI remains deterministic, but environments with real database credentials can now prove the controls against actual services instead of relying only on source-level assertions.

## Commands

From `backend`:

```bash
bun run verify:supabase-rls
bun run verify:db-concurrency
```

## Expected Evidence

- `verify:supabase-rls` checks protected ERP tables through Supabase REST and requires denied HTTP status for direct anon-key access.
- `verify:db-concurrency` applies the assignment integrity migration, creates isolated future-dated fixtures, fires parallel inserts for the same employee/vehicle/driver, and requires exactly one insert success plus one overlap failure.

## Safety

The live DB verifier uses issue-specific fixture names and IDs. It does not alter application route code or weaken any production authorization path.
