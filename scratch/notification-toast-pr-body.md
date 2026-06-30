Fixes #97

## Summary
- Await employee create/update/recover/delete notification fanout and expose `_notification_count` for QA checks.
- Keep actor-visible HR CRUD notifications and include actor display/username metadata when available.
- Route compatibility `toast.success`, `toast.error`, and `toast.info` through PremiumToast so older call sites keep the newer toast design.
- Repair the PremiumToast test mock for the configured Vitest/jsdom runner and add toast helper coverage.

## Verification
- `cd backend && bun test` — 342 pass.
- `cd backend && bun run lint` — pass.
- `cd backend && bun run build` — pass.
- `cd frontend && bunx vitest run` — 101 pass.
- `cd frontend && bun run lint` — pass.
- `cd frontend && bun run build` — pass.

## Senior Review Notes
- Scope hygiene: limited to employee route notification observability and toast helper/test compatibility.
- Security/RBAC: backend HR write/read gates remain unchanged; notification fanout still uses permission-based recipients.
- Data integrity: employee CRUD remains non-blocking if notification delivery returns zero, but QA now receives `_notification_count` and server logs zero fanout.
- Deployment: deploy after merge; previous Vercel token was invalid, so production deployment must be verified explicitly.
