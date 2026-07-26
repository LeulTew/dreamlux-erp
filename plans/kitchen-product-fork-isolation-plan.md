# Kitchen Product Fork — Isolation Architecture and Delivery Plan

Status: planning only
Audit date: 2026-07-26
Source: record the exact `main` commit SHA, dirty/untracked status, submodule/LFS state, and allowlisted snapshot hashes before export
Safety: no app, migration, deployment, Supabase, DB, Storage, MCP, or GitHub network command was run

## 1. Executive decision

Create Kitchen ERP as a one-time sanitized source snapshot in a new repository and infrastructure boundary. It is not a branch, tenant, environment, or second DreamLux deployment.

Acceptance means the fork can build, run, authenticate, process Kitchen work, schedule jobs, back up, restore, and be deleted without DreamLux. Deleting the original repo and Supabase project must not affect it.

Phase 0 is incident containment: this audit found committed live-looking credentials/project identifiers. Do not fork the current tree/history until credentials are revoked/rotated and a sanitized export exists.

## 2. Current architecture and connection audit

- Next.js 16 frontend; Express/Bun REST backend.
- PostgreSQL through `pg` plus Supabase Data API with a service-role client.
- Custom Auth: application `users`/`roles`, password hashes, backend JWT, HttpOnly cookie—not Supabase Auth.
- Supabase Storage for inventory images; browser Supabase Realtime for notifications.
- Vercel frontend/backend; GitHub and Vercel scheduled keep-alives.
- Browser IndexedDB/offline mutation queue; no durable server queue found.
- Many executable migration, seed, backup, replication, verification, and reprocessing tools.

### Supabase surfaces

| Surface | Current use | Fork action |
|---|---|---|
| `backend/src/db/supabase.ts` | Service-role client | Replace; fail closed and attest target before creation |
| `backend/src/db/pool.ts` | Primary Postgres pool | Replace; remove backup-URL precedence |
| Backend routes/libs | Direct Data API/RPC across Auth, inventory, users, HR, payroll, settings, exports | Put behind repositories; new project only |
| `backend/src/storage/storage.ts` | Upload/delete/public/signed URL/download | New project and explicit new private buckets |
| Migration/backup/reprocess tools | Independent remote clients | Quarantine; remove or reauthorize individually |
| Frontend Supabase client | Public browser client | Prefer removal |
| Notification UI | Direct `postgres_changes` | Prefer API-authenticated SSE/WebSocket |
| `.vscode/mcp.json` | Project-bound Supabase MCP | Exclude; recreate only after new target attestation |
| Keep-alive workflow | Hardcoded project/credential fallback | Disable/remove; never copy |

No Edge Function invocation was found. Replacing Supabase keys alone does not isolate Auth: `JWT_SECRET`, custom users/hashes, roles, cookies, and bootstrap credentials must be rebuilt too.

### Configuration names found (values omitted)

- DB: `DATABASE_URL`, `DATABASE_BACKUP_URL`.
- Supabase server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_BUCKET`.
- Browser: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Auth: `JWT_SECRET`, `ADMIN_PASSWORD`, `MANAGER_PASSWORD`.
- Routing/runtime: `NEXT_PUBLIC_API_URL`, `FRONTEND_URL`, `ALLOWED_ORIGINS`, `ALLOW_VERCEL_PREVIEWS`, `PORT`, Vercel metadata/tokens.

Local env files exist at root/backend/frontend. A production-pulled environment export is tracked. Copy none of them.

## 3. Risk register

| Severity | Finding and failure mode | Pre-fork treatment |
|---|---|---|
| Critical | Tracked DB-to-DB migration embeds source/destination credentials; execution can copy/overwrite live data | Revoke, exclude, scan/rewrite history |
| Critical | Tracked scratch DB utility embeds a credential | Revoke, exclude, scan history |
| Critical | Scheduled workflow hardcodes Supabase endpoint and credential fallback | Disable; rotate; never inherit schedule |
| Critical | Tracked production env export | Rotate applicable secrets; purge export/history |
| Critical | MCP config pins a Supabase project | Remove; keep agents unattached during quarantine |
| Critical | API startup runs DDL | Remove boot DDL; migrations become explicit release action |
| High | Runtime pool prefers `DATABASE_BACKUP_URL` | Separate backup tooling; runtime accepts one attested URL |
| High | Migrations infer project refs/passwords and try remote host variants | Delete guessing; exact target only |
| High | Broad service-role client bypasses RLS in many routes | Centralize/least privilege/new key/new project |
| High | `exec_sql` RPC fallback expands arbitrary-SQL blast radius | Remove from app path |
| High | JWT/admin defaults and DB-failure super-admin fallbacks | Remove defaults; new secrets/users; fail closed |
| High | Login returns JWT JSON as well as cookie | Cookie-only session in fork |
| High | Custom API Auth and browser Supabase Realtime use different trust systems | Backend-authenticated realtime or deliberate Auth/RLS redesign |
| High | Vercel link folders target existing projects | Exclude; create new projects explicitly |
| High | Hardcoded API defaults can call old deployments | No fallback; exact URL and hostname assertion |
| Medium | Image allowlist accepts any Supabase host | Exact new host or backend proxy |
| Medium | Generic bucket default hides wrong target | Explicit fork/environment bucket; no fallback |
| Medium | Duplicate scheduled keep-alives | Remove; recreate only justified fork schedules |
| Medium | Backup/seed/verify/rename/reprocess scripts are executable | Quarantine and individually approve |
| Medium | Browser offline queue can replay against changed API | New origin/scope; clear storage during setup |
| Medium | Old URLs/repo links/CORS/branding in docs/config | Rename and scan |

Sensitive files span multiple commits; deleting at HEAD is not enough for a shared-history fork.

## 4. Fork strategy and gates

### Phase 0 — contain exposure

1. Disable legacy hardcoded keep-alive.
2. Revoke/rotate exposed DB passwords, Supabase keys, deployment/OIDC tokens, JWT/bootstrap secrets, and credentials in tracked exports.
3. Audit Supabase DB/API/Auth/Storage logs around exposure and prior fork incidents.
4. Remove sensitive files at HEAD; coordinate history rewrite or permanently revoke all historical values. Never test an old credential; rely on provider-side rotation/revocation evidence and audit logs.
5. Add pre-commit/CI secret scanning for DB URLs, JWTs, service keys, env exports, `.vercel`, and project-bound MCP.

Gate: security owner records rotations and proves old values cannot authenticate.

### Phase 1 — sanitized source snapshot

1. Prefer a new repository initialized from an allowlisted file snapshot, not a GitHub fork with inherited history/settings.
2. Exclude `.env*` (except new placeholders), `.vercel*`, MCP refs, logs, backups, production exports, scratch connection scripts, replication tools.
3. Do not copy Actions schedules/secrets/environments, deploy keys, webhooks, or Vercel integrations.
4. Rename packages, cookie, PWA identity, storage/queue/monitoring namespaces, and remote.
5. Record only source commit provenance; do not retain unsafe history.

Gate: offline secret scan and legacy-reference scan have zero unapproved matches.

### Phase 2 — quarantine new repo

1. Network-restrict early CI/static builds.
2. Add fail-closed target attestation before any client.
3. Remove boot migrations, URL/key defaults, host guessing, hardcoded endpoints, wildcard storage hosts.
4. Disable migrations/seeds/backups/storage tools/jobs/MCP/deploy until reviewed.
5. Use per-process, default-deny outbound allowlists containing only exact attested new DB/API/Storage/queue/monitoring targets. Keep a legacy host/project denylist as defense in depth and test aliases, alternate poolers, CNAMEs, and resolved IPs.

Gate: incomplete config stops startup before DNS/network I/O.

### Phase 3 — independent infrastructure

Create new repo/CI secrets, Supabase project, frontend/API/worker deployments, domains/DNS, Auth secrets/users, buckets, queue, cron secret/schedules, monitoring/logging/backups/alerts. Prefer a separate organization/account and administrators.

Gate: resource manifest maps every dependency to a new owner, ID, credential, and deletion policy; none map to DreamLux.

### Phase 4 — clean baseline

1. Treat current schema/migrations as design evidence—not a dump or automatically trusted chain.
2. Consolidate reviewed DDL; remove company seeds, compatibility debris, unsafe RPCs, boot DDL, hardcoded IDs, production assumptions.
3. Apply locally/ephemerally first.
4. Seed synthetic data/new users only; copy no rows, UUIDs, hashes, sessions, URLs, audits, or files.
5. Add Kitchen migrations after baseline.
6. Test empty-to-current and fork-only backup/restore.

### Phase 5 — deploy/prove independence

1. Link new projects explicitly and verify IDs before secrets.
2. Deploy API with non-secret product/environment/target fingerprints, then frontend with one API origin.
3. Enable jobs individually after dry run.
4. Block known legacy hosts and prove attempts fail.
5. Remove all fork identities/credentials from legacy resources, block legacy egress from fork processes, and run a non-destructive simulated-unavailability drill. Never delete or alter DreamLux infrastructure as part of validation.
6. Restore from fork-only backups.

## 5. Supabase/Auth/Storage isolation

### New Supabase project

- New organization/project/ref, DB password, region/billing owner.
- New publishable/anon and secret/service-role keys; server key in new secret manager only.
- API runtime receives only an attested pooled `DATABASE_URL`. A separately scoped release/migrator job alone receives `DATABASE_DIRECT_URL`; a separately scoped backup job receives only approved backup credentials. None are present in the API environment.
- Record expected new ref/hosts for attestation.

### Schema from scratch

- Never use production dumps, replication, cross-project SQL, FDWs, or copied migration state.
- Build clean baseline from reviewed repository DDL; declare extensions, constraints, FK indexes, queue indexes.
- Remove arbitrary SQL RPCs. Put unavoidable privileged functions in unexposed schema, revoke `PUBLIC`, authorize explicitly.
- Run new-project security/performance advisors before release.

### Auth reconstruction

Recommended parity path: retain custom backend Auth initially, rebuilt empty.

- Empty users/roles/permissions/scopes; seed definitions only; enroll new humans. No copied hashes.
- New high-entropy JWT secret so old tokens fail; fork-specific cookie/domain.
- Remove `dev-secret`, `admin`, and DB-failure super-admin fallbacks; bootstrap is one-time/audited/explicit.
- Cookie-only login response; define rotation, expiry, and revocation.

Alternative: adopt Supabase Auth as a separate project. Create new users/providers/redirects/templates; map `auth.users`; authorization claims go in `app_metadata`; rebuild RLS. Never copy JWT secrets/Auth exports.

### Data API, RLS, and Realtime

Recommended model: backend owns business-table access; RLS stays defense-in-depth; exposed roles are revoked; API enforces permission/BOLA; browser realtime moves to JWT-authenticated API SSE/WebSocket.

If direct Realtime remains, use only the new project plus compatible Supabase identity, explicit publication, and recipient/order RLS. Custom app JWT does not automatically authorize Supabase subscriptions.

### Storage

- Explicit new private buckets, e.g. `<product>-<env>-inventory-private` and `...-kitchen-private`.
- Signed URLs by default; explicit policies for upload/select/update/upsert/delete.
- Copy no objects and retain no old public URLs.
- Define type/size scanning, retention, and orphan cleanup under fork workers.

Test for old ref/URL in env, workflow, Vercel, browser bundle, MCP, cached builds, Git/logs; shared JWT/hashes; legacy RLS assumptions; RLS-bypassing views/functions; Realtime disclosure; old bucket URLs. Review offline evidence for `pg_cron`/`pg_net`, DB webhooks/triggers, Vault/secrets, FDWs/dblink, publications/replication, `SECURITY DEFINER` functions/search paths, roles/grants, Auth redirects/providers, and embedded project refs. Recreate reviewed definitions only; copy no resident credentials/config.

### Redacted disposition appendix

Record every discovered surface with path, line/range, connection class, and one disposition before implementation:

| Surface | Examples | Disposition |
|---|---|---|
| Env/exports | root/backend/frontend `.env*`, production export | `REMOVE` values/files; `REPLACE` placeholders/new secret scopes |
| CI/deploy/jobs | workflows, Vercel configs/links | `REMOVE` inherited bindings; `REPLACE` projects/secrets/schedules |
| MCP/dev tools | project-bound MCP | `REMOVE`; recreate unattached only after attestation |
| Runtime clients | Supabase factories, `pg` pool, browser Realtime | `REPLACE` behind attested adapters |
| DB executables | migrations, startup DDL, seed, backup, replication, keep-alive, reprocess | `REVIEW`, then `REPLACE` or `REMOVE` |
| APIs/assets | API URL, CORS, image hosts, service worker | `REPLACE` exact origins; remove fallbacks/wildcards |
| Auth/security | JWT/admin defaults, hashes, cookies, RLS/RPC | `REPLACE`; remove defaults/unsafe RPC |
| Build/integrations | lifecycle scripts, `.npmrc`, Git lockfile URLs, containers/IaC, registry, telemetry/webhooks | `REVIEW`; remove credentials/bindings |
| Supabase controls | extensions, jobs, triggers, FDWs, publications, grants, Storage/Auth | `REVIEW` offline; recreate only in new project |
| Pure source | UI/domain utilities and isolated mocked tests | `KEEP` after static scan |

## 6. Configuration separation

Backend secret template (placeholders only):

```dotenv
PRODUCT_ID=kitchen-erp
APP_ENV=development
INSTANCE_ID=kitchen-erp-dev
EXPECTED_SUPABASE_PROJECT_REF=replace-me
EXPECTED_DATABASE_HOST=replace-me
DATABASE_URL=replace-me
SUPABASE_URL=replace-me
SUPABASE_SECRET_KEY=replace-me
SUPABASE_INVENTORY_BUCKET=kitchen-erp-dev-inventory-private
SUPABASE_KITCHEN_BUCKET=kitchen-erp-dev-kitchen-private
JWT_SECRET=replace-me
SESSION_COOKIE_NAME=kitchen_erp_session_dev
FRONTEND_URL=http://localhost:3100
ALLOWED_ORIGINS=http://localhost:3100
CRON_SECRET=replace-me
QUEUE_URL=replace-me
```

Frontend public template:

```dotenv
NEXT_PUBLIC_PRODUCT_ID=kitchen-erp
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:5100
```

Add public Supabase values only if browser access survives review; never expose service-role/secret values. Local/test/preview/staging/prod use different secret scopes; previews never inherit production DB/Auth.

Startup validates required/non-placeholder values, URL schemes, expected ref/DB host agreement, a positive per-process outbound allowlist, legacy denylist, origins, and fork-specific cookie/bucket/queue/process names. Log hashed target fingerprints only; mismatch exits before DNS. The release/migrator environment separately contains `DATABASE_DIRECT_URL`; API runtime never does.

## 7. Architecture

```text
Users / Kitchen displays
          |
          v
New Next.js frontend domain
          | HTTPS + fork cookie
          v
New Express/Bun API domain ----> fork-authenticated SSE/WebSocket
          |
          +--> Kitchen services
          |      order/ticket state machines
          |      inventory reserve/consume
          |      dispatch/audit/outbox
          |
          +--> fork data/storage adapters
                   |              |
                   v              v
          New Supabase DB   New Supabase Storage
                   |
                   +--> new fork-only worker/queue/cron

Optional: Fork API <-- versioned HTTPS + scoped credential --> External API
Forbidden: any shared DreamLux DB/Supabase/Auth/Storage/queue/worker/cron
```

## 8. Kitchen module design

Kitchen is a bounded backend module with domain/application/infrastructure/HTTP layers and its own frontend feature. It may reference fork-local events/employees/inventory through interfaces; do not add it to the monolithic event route.

Suggested later structure:

```text
backend/src/modules/kitchen/{domain,application,infrastructure,http}/
frontend/src/app/kitchen/
frontend/src/features/kitchen/
```

### MVP tables

| Table | Purpose/key fields |
|---|---|
| `kitchen_stations` | code, bilingual names, active flag |
| `kitchen_menu_items` | SKU/names/unit/default station/allergen snapshot |
| `kitchen_orders` | order number, optional event, service type, guests, priority, required-at, status, notes, version, actors/timestamps |
| `kitchen_order_items` | order/menu item, quantity/unit, station, instructions, allergens, status |
| `kitchen_tickets` | order/station/sequence/status/priority/due, assignment and timestamps |
| `kitchen_ticket_items` | ticket/order-line quantity, completed/wasted quantity |
| `kitchen_status_history` | append-only entity transition, actor, reason, idempotency key |
| `kitchen_inventory_reservations` | order/line/fork inventory item, quantity, status, expiry |
| `kitchen_consumption` | issued/consumed/wasted amounts linked to inventory movement |

Phase 2 only after requirements: recipes/components, prep-task dependencies, temperatures/allergen confirmations, waste, dispatch batches.

Add FK indexes and `(station_id,status,priority DESC,due_at)` queue index. Use optimistic versioning or row locks. Inventory/state/history changes share one transaction.

### State machines

```text
Order:  DRAFT -> SUBMITTED -> ACCEPTED -> IN_PREP -> READY -> DISPATCHED -> COMPLETED
        allowed states may -> CANCELLED only with permission/reason

Ticket: QUEUED -> IN_PROGRESS -> READY -> HANDED_OFF
        QUEUED/IN_PROGRESS -> HELD or VOIDED under explicit rules
```

Each transition defines prior states, permission, required data/reason, inventory/notification effects, idempotency, and audit event.

### Services and endpoints

Services: `KitchenOrderService`, `KitchenTicketService`, `KitchenInventoryService`, `KitchenDispatchService`, `KitchenQueryService`, `KitchenEventPublisher` (after-commit/outbox if durable jobs exist).

```text
GET/POST /api/v1/kitchen/orders
GET/PATCH /api/v1/kitchen/orders/:id
POST /api/v1/kitchen/orders/:id/{submit,accept,cancel,dispatch}
GET /api/v1/kitchen/stations
GET /api/v1/kitchen/stations/:id/board
POST /api/v1/kitchen/tickets/:id/{start,hold,ready,hand-off}
GET /api/v1/kitchen/orders/:id/history
GET /api/v1/kitchen/stream
```

Mutations require idempotency key and expected version; stale/invalid transitions return `409`. Validate schemas, paginate, and enforce BOLA/permissions before repositories.

Permissions: `kitchen:read`, `kitchen:orders:create/update/cancel`, `kitchen:tickets:update`, `kitchen:dispatch`, `kitchen:inventory:reserve/consume`, `kitchen:configure`, `kitchen:audit:read`. Seed role definitions (Manager, Chef/Station Lead, Prep, Expeditor, Operations read-only), never users.

## 9. Supervisor, workers, queues, cron

Managed profile: separate Vercel web/API projects; separate long-lived worker host; new queue account/namespace/credentials `kitchen-erp-<env>`; new schedules and cron secret. Remove legacy keep-alive.

VPS/container profile uses unique users/workdirs/ports/env/logs/PIDs:

```text
kitchen-erp-web-<env>
kitchen-erp-api-<env>
kitchen-erp-worker-<env>
kitchen-erp-scheduler-<env>  (single elected instance)
```

Never reuse DreamLux process/Unix user/port/log/env/Redis DB/queue/cron. Workers attest product, instance, queue namespace, and DB fingerprint before consuming. MVP may stay synchronous; future async work gets a new queue, never shared Redis/Supabase/host processes.

## 10. Zero-coupling checklist

- [ ] New repo/remote with sanitized history; all exposed credentials revoked.
- [ ] No production env, credential, Vercel link, or project-bound MCP config.
- [ ] Static secret and legacy-ref scans pass across retained history.
- [ ] Missing config fails before client/DNS; runtime attests all targets.
- [ ] Legacy endpoints blocked by egress and negative tests.
- [ ] No boot DDL, backup-URL override, host guessing, or URL fallback.
- [ ] New Supabase/ref/keys/password/Auth/RLS/Realtime/buckets.
- [ ] Reviewed empty baseline and synthetic seeds only.
- [ ] Server-only secret key; no arbitrary privileged RPC.
- [ ] New deployments/domains/DNS/CI secrets/logs/alerts/backups/jobs.
- [ ] New browser origin/service-worker/offline queue cannot replay old API calls.
- [ ] Fork-only backup/restore succeeds.
- [ ] Fork-side egress to original repo/Supabase/API/storage blocked: fork and Kitchen smoke tests pass; original infrastructure remains untouched.
- [ ] Fork deleted: original remains unaffected.
- [ ] Optional interoperability disabled: both products remain independent.

## 11. Incident response

If a fork process may contact legacy infrastructure: stop fork web/API/workers/jobs; revoke fork deploy credentials; block legacy egress; preserve logs; rotate affected legacy credential even for apparent read-only access; audit DB/Auth/Storage/API operations; restore legacy data if needed; rebuild from sanitized snapshot rather than resuming contaminated environment.

## 12. Prompt for Claude Code, Antigravity, Codex, or another agent

```text
You are working on the Kitchen ERP product fork. It is a separate product/security boundary, not a DreamLux environment.

First read completely:
1. `.agents/skills/fork-isolation-safety/SKILL.md`
2. `.agents/AGENTS.md`, `RULES.md`, `CLAUDE.md`
3. `.claude/rules/architecture.md` and `.claude/rules/database.md`
4. `plans/kitchen-product-fork-isolation-plan.md`
Then inspect Git status and connection-bearing files using read-only, value-redacting searches.

Until a human explicitly authorizes implementation/deployment and supplies independently created target identifiers out of band:
- Do not run the app, integration tests, migrations, seeds, backups/restores/replication/reprocessing, keep-alives, workers, cron, deploy commands, Supabase CLI/MCP, DB clients, or network-capable commands.
- Do not print/copy/reuse secret values from env, Git, Vercel, GitHub, MCP, logs, scratch, or production exports.
- Do not reuse any DreamLux DB, Supabase, Auth, JWT, users/hashes, bucket, API, queue, worker, cron, deploy project, domain, monitoring, or credential.
- Do not copy production data/dumps/files. Build reviewed baseline DDL and synthetic seeds only.

For later authorized implementation:
- New repo/infrastructure for every dependency.
- Remove boot migrations, defaults, host guessing, backup runtime precedence, hardcoded URLs, and bound MCP/deploy links.
- Validate PRODUCT_ID, INSTANCE_ID, expected new Supabase ref/DB host, origins, resource names, positive outbound allowlists, and legacy denylist before client creation. Fail before DNS.
- New server-only Supabase secret, JWT, cookie, users, roles, policies; no copied hashes/sessions.
- Prefer backend-authenticated SSE/WebSocket because current Auth is custom, not Supabase Auth.
- Explicit attested migrations only against a new empty project.
- Require classified redacted inventory, secret/ref scans, default-deny egress tests, empty-to-current migration, fork backup/restore, and a non-destructive fork-side original-infrastructure blocking drill. Never delete or alter DreamLux for validation.

If a target is ambiguous or any legacy reference remains, stop and report file/connection class with values redacted. Never test a connection to discover whether it is safe.

Current objective: [INSERT TASK]. Preserve planning-only scope unless explicit implementation authority is given.
```
