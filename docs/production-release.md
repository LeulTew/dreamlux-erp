# DreamLux production release

Application startup does not apply schema changes, normalize employee/payroll
records, or upsert service-scope catalogs. The legacy `startup-migration.ts`
is historical migration source, not an application initialization step.
The permission-cache invalidation listener and read-only `/health` connection
check remain active.

## Before deployment

1. Confirm one release owner and pin the reviewed DreamLux commit. Attest the
   existing provider account, repository link, project IDs, current production
   domain routing and rollback deployment IDs. Historical names in
   `project-context.md` and fallback URLs are not target evidence.
2. Remove ambient connection-bearing variables from local child environments.
   Never copy another product's environment, credentials, database, browser
   profile, deployment links, dependencies, or build outputs.
3. Verify the actual DreamLux database/project and execution role. Inspect
   migration history and the required catalog/schema read-only. Do not infer
   missing DDL from an empty Supabase migrations panel: DreamLux's legacy SQL
   runners do not maintain a checksum ledger.
4. Compare production source with the release source. Apply only necessary,
   reviewed DreamLux DDL using explicit target preconditions, one transaction
   and an agreed release lock, followed by independent post-verification.
   Preserve business records, grants and financial snapshots. Do not run
   `migrate:all`, `migrate-robust.ts`, seeds, backups or the historical startup
   helper as a deployment shortcut.

`DATABASE_BACKUP_URL` is a legacy override in several connection/migration
helpers, not permission to target a second database. Inspect its presence
without revealing values; do not run those helpers with an unapproved override.
Never retrieve non-readable provider secrets through a diagnostic deployment.

## Manual release sequence

Keep `git.deploymentEnabled.main = false` in the root and both applications.
A separately authorized one-off production release does not require removing
the automatic-main holds or starting a CI campaign.

Use clean exports of the pinned Git inputs, with the application's own public
assets, package manifest, lockfile and build configuration. Check the final
upload inventory: no `.env*`, authentication state, `node_modules`, `.next`,
test reports, traces, backups or untracked workspace files. Preserve the actual
provider root-directory layout; do not guess it from the project name.

Discover the installed CLI's options before use. Stage the backend against its
existing production environment with domain promotion disabled
(`--prod --skip-domain` in Vercel CLI 59.20). Verify the immutable staged source
and the running health/commit response through normal owner-authorized
deployment protection. Metadata alone is not running-code proof.

Promote the backend only after schema and stage verification. Verify the live
frontend proxy reaches it before promoting the frontend. Preserve old real
production deployments as rollback targets; historical alias arrays are not
proof of current domain routing.

DreamLux intentionally retains the activity route chain:
browser `/api/api/activity` -> Next rewrite `/api/:path*` ->
backend `/api/activity`. Do not replace the frontend call with `/activity`
without changing and verifying the complete contract.

## Live evidence and rollback

Render the actual production app, using a legitimate DreamLux session. Exercise
read/open/cancel flows for navigation, language, notifications, employee and
activity drawers, staff lookup, payroll previews and expense review. Check
desktop/mobile presentation and required asset/API failures. Never count a
missing dataset or permission denial as a successful full workflow.

Do not save, publish, approve, delete or otherwise alter real business data
without separately justified authorization. Distinguish production read-only
evidence from isolated write/concurrency tests. Record access limitations,
source SHA, schema disposition, upload hashes, staged/promoted deployment IDs,
actual domain bindings and the prior rollback IDs in the release receipt.

If a deployment is unhealthy, use the previously attested production
deployment as the rollback target. An application rollback is not a database
rollback: reviewed DDL requires its own compatibility and recovery plan.

## Future database-owner handoff

See [the database handoff index](database-handoff/README.md) for the offline,
versioned migration-source archive and its limitations. An existing Supabase
project ownership/organization transfer is not a new-database migration and
does not call for replaying schema SQL.
