## Summary
- Fixes the PR #38 backend CI parser failure by committing cleaned route files without NUL padding.
- Hardens dynamic RBAC so permission-protected middleware fails closed when fresh DB permission lookup fails instead of authorizing from stale JWT claims.
- Removes direct role-name matching from `requireRole` compatibility logic.
- Adds metadata-backed event field redaction via `field_permissions` and lookup indexes for RBAC scope/field tables.
- Replaces the permissions UI native `confirm()` with an in-app confirmation modal, localizes added role-management strings, and removes `rounded-2xl` from the touched permissions page structure.

Closes #24 follow-up checklist items from the senior review.

## Verification
- [x] `cd backend && bun test src/__tests__/rbac-cache-guardrails.test.ts src/__tests__/row-scope.test.ts` - 15 pass, 0 fail
- [x] `cd backend && bun test` - 209 pass, 0 fail
- [x] `cd backend && bun run lint` - passed
- [x] `cd backend && bun run build` - passed
- [x] `cd frontend && bun run lint` - passed
- [x] `cd frontend && bun test` - 9 pass, 0 fail
- [x] `cd frontend && bun run build` - passed
- [x] `git diff --check` - passed
- [x] NUL-byte scan for `backend/src/routes/users.ts` and `backend/src/routes/events.ts` - 0 NUL bytes

## Notes
- Backend tests intentionally log simulated DB errors in graceful-error test cases; the commands exit 0.
- `user_access_scopes` and `field_permissions` are backend-owned metadata tables; this PR adds lookup indexes and does not grant public Data API access.
