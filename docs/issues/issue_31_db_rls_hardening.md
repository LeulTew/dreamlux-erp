# Issue #31 DB/RLS Hardening

This PR treats the Express backend as the only supported access path for protected ERP data. Supabase direct Data API access for backend-owned public tables is denied by enabling RLS and revoking direct `anon` / `authenticated` table privileges.

## Exposure Model

- Public frontend clients must not receive the Supabase `service_role` key.
- Frontend data access continues through the Express API and its dynamic RBAC middleware.
- The backend may keep using direct Postgres and Supabase service-role access for server-side operations.
- If future work intentionally exposes a table directly through Supabase, that work must add a narrow RLS policy and document the row ownership or scope predicate.

## Protected Tables

The hardening migration covers user, RBAC, HR, payroll, events, assignments, inventory, reconciliation, expense, trip, settings, and audit-support tables currently owned by the backend.

## Rollback Notes

Rollback should be explicit per table. Re-enabling direct Supabase access requires both:

1. Restoring the necessary `GRANT` statements for the intended role.
2. Adding least-privilege RLS policies for the intended operation.

Do not disable RLS globally to restore access.

## Verification Notes

- `cd backend && bun test src/__tests__/db-rls-hardening.test.ts`: pass, 2 tests.
- `cd backend && bun run lint`: pass.
- `cd backend && bun run build`: pass.
- `cd backend && bun test`: pass, 212 tests.
- Supabase CLI/advisor output was not available from the local shell, and no `SUPABASE_ACCESS_TOKEN`, `DATABASE_URL`, or `DATABASE_BACKUP_URL` was exported for a live advisor run in this environment.
