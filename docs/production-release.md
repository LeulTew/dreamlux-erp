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

## Database backup tooling

`bun run backup:db` retains DreamLux's backup-only selection:
`DATABASE_BACKUP_URL` first, otherwise `DATABASE_URL`. It writes plain SQL to
`backups/database-dump-<timestamp>.sql`; it does not use Koti's custom-format
archive or catering-only restore procedure. Attest the selected DreamLux
provider/project before running it. The transport guard is not independent
proof that a configured endpoint belongs to this product.

The native process receives a password-free URI and a private password file,
not a credential-bearing command argument. Inherited application secrets and
`PG*` routing overrides are not forwarded. URI routing/credential overrides
are rejected, normal TLS settings are retained, and connection timeouts are
capped at ten seconds without relaxing shorter positive limits. Each tool is
bounded to 120 seconds and each diagnostic/output pipe to 1 MiB.
The SQL artifact streams directly to disk, so it is not constrained by the
diagnostic limit or buffered in application memory.

The artifact is staged privately and published only after successful nonempty
output. Publication uses a same-filesystem hard link and refuses to overwrite
an existing timestamped artifact. Failed dumps/empty output are not published;
staging and credential-file cleanup failures remain errors. Use a private
backup directory (including appropriate Windows ACLs), sufficient free space
and a filesystem supporting hard links. Abrupt process/host loss can interrupt
cleanup; review only the owned `.dreamlux-db-backup-*` staging directories,
not unrelated backup files.

If a connection fails, obtain the exact authorized endpoint from the
DreamLux project's Connect panel. Use its direct connection or supported
session pooler as appropriate for IPv4/IPv6 reachability. Do not invent a
host, substitute a transaction-pooler port, weaken TLS, or reset credentials
as a diagnostic shortcut. The legacy `backup-db-preflight.ts` is not the
selected backup CLI and is not evidence that this command's chosen target,
backup contents or restore path were verified.

### Isolated backup verification

`bun run verify:backup:native` requires a separate
`DREAMLUX_BACKUP_TEST_ADMIN_URL` supplied privately and fails if it is absent.
The existing native QA attester restricts it to an independently owned local
service on `127.0.0.1:55434`, role `dreamlux_parity`, maintenance database
`postgres` and a generated 64-hex password. The tests create only namespaced
synthetic databases. Never use a live connection or copy production records
or Auth data into the fixture.

The Linux native suite requires compatible `pg_dump` and `psql` tools. Its
independent plain-SQL restore uses the owned service's local socket and checks
exact values, quoted identifiers and foreign keys. It also exercises CLI
selection/output, a large streamed artifact, collisions, partial/empty failures,
private process credentials and bounded termination. The ordinary backend
suite keeps these native cases opt-in; a skip is not a pass. The separate
non-authenticating CLI-stub test runs on Linux without a database.

This is source and synthetic recovery evidence, not a current production
backup, RPO/RTO, Storage-object recovery or full provider-platform rehearsal.
`backup:storage` and the combined `backup` command are separate existing
surfaces and were not executed by this verification. Database SQL does not
contain external Storage object contents. Keep original backup artifacts and
their operational readiness evidence separate from a migration-source handoff.

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
