---
name: fork-isolation-safety
description: Safely audit, plan, create, or validate an independent fork of this repository without contacting or reusing legacy infrastructure. Use for product forks, clones, white-label deployments, environment migrations, Supabase project changes, database moves, new deployment targets, or any task that could copy or execute connection-bearing configuration, migrations, seeds, backups, workers, cron jobs, MCP settings, or credentials.
---

# Fork Isolation Safety

Treat a fork as a new security boundary and product, not as another DreamLux environment.

## Non-negotiable rules

1. Start in read-only quarantine. Do not run the app, integration tests, migrations, seeds, backups, keep-alives, deployments, Supabase CLI/MCP, or scripts that instantiate database/storage clients.
2. Never expose secret values in chat or logs. Inventory variable names and redact values. Report exposed credentials by file and class only.
3. Never copy `.env*`, Vercel links, MCP project refs, CI secrets, database URLs, JWT secrets, Supabase keys, bucket credentials, OAuth credentials, queue URLs, webhook secrets, or monitoring DSNs.
4. Never initialize from production data/dumps, Auth users, password hashes, sessions, refresh tokens, storage objects, or JWT secrets. Build reviewed baseline DDL from version-controlled design and seed synthetic data only.
5. Require a new repository/remote, Supabase project, deployments, DNS, auth secrets, buckets, queues, workers, schedules, monitoring, and secret-manager namespace.
6. Treat `DATABASE_BACKUP_URL` as live. Never allow it to override the application database.
7. Disable boot-time schema mutation. Apply migrations only through an explicit, attested release step.
8. Fail closed before client creation on missing/placeholders, unknown hosts, legacy references, or target-attestation mismatch.
9. Permit interoperability only through authenticated, versioned external APIs—never shared databases, Supabase projects, storage, queues, or schemas.

## Audit workflow

### Establish quarantine

- Confirm task authority and inspect repository rules/worktree.
- Keep network-capable commands disabled during discovery.
- Inventory `.env*`, deployment/MCP links, workflows, process configs, migrations, seeds, backups, one-off scripts, and schedules.

### Inventory connection surfaces

Search tracked and untracked files for:

- `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`, `DATABASE_*`, `POSTGRES_*`, `PG*`, `JWT_*`, `*_SECRET`, `*_TOKEN`, `*_KEY`, `*_URL`, buckets, queues, and cron secrets.
- `createClient`, `createBrowserClient`, `Pool`, `Client`, `postgresql://`, `.supabase.co`, Storage, Realtime, Auth, RPC, Edge Functions, webhooks, queues, and cron.
- Hardcoded APIs/origins, CORS, image hosts, service-worker caches, Vercel links, workflows, MCP refs, and supervisor names.
- Scripts that migrate, seed, replicate, rename, verify, back up, reprocess, keep alive, or deploy.

Report paths, line numbers, and connection classes with values redacted.

### Classify and attest

Classify every surface as `REMOVE`, `REPLACE`, `REVIEW`, or `KEEP`. Do not declare readiness with unclassified items.

Before later implementation, require one connection factory to validate product/instance identity, environment, expected new Supabase ref/DB host, allowed origins, a legacy-host denylist, non-placeholder secrets, and unique cookie/bucket/queue/worker/cron/deployment names. Validate before creating any client; add a no-network isolation check to CI.

Proceed only after a human records new target identifiers out of band and confirms old credentials are absent/rotated, the new project is empty and independently owned, migrations target only the attested project, seeds are synthetic, resources are independently named/credentialed, and legacy-host egress tests fail.

## Repository-specific hazards

Always inspect:

- `.github/workflows/keep-alive.yml`, `.vscode/mcp.json`, `.vercel*/project.json`, and nested `.vercel` links.
- `frontend/env-pulled-prod.local` and all `.env*`.
- `backend/src/db/migrate-data.ts`, `pool.ts`, `startup-migration.ts`, and `backend/src/index.ts`.
- Robust/pricing migrations plus backup, keep-alive, seed, rename, and reprocessing tools.
- Backend/frontend Supabase client factories and direct consumers.
- `frontend/next.config.ts`, `frontend/src/lib/api.ts`, service-worker/offline queue code, and root deploy/migrate scripts.

The repository database rule requiring remote production schema application does not apply during fork quarantine. This skill takes precedence: contact neither the original nor a new remote until target attestation and explicit implementation/deployment authorization exist.

## Required deliverables

Produce a fork/quarantine strategy, redacted connection inventory, Supabase/Auth/Storage/schema recreation plan, secret/history remediation, process/job isolation, architecture diagram, zero-coupling checklist, incident response procedure, and reusable agent prompt.

Do not infer zero coupling from configuration review alone. Require static scans, runtime attestation, egress denial tests, and independent deletion/recovery drills.
