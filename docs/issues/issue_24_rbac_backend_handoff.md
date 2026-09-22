# Issue #24 Dynamic RBAC Backend Handoff

## Completed Backend Work

- Centralized the permission catalog and role-to-permission seed map in `backend/src/lib/permissions.ts`.
- Reworked backend auth middleware to evaluate effective permission slugs instead of granting access from hardcoded role names.
- Added effective permission resolution to login tokens, `/auth/me`, and the new `/auth/permissions` endpoint.
- Added backend admin contracts for the future UI:
  - `GET /users/roles` now returns role `permission_slugs`.
  - `GET /users/permissions` returns the permission catalog.
  - `PUT /users/roles/:id/permissions` replaces a role's permission assignments.
- Replaced route-level role gates with permission gates for:
  - departments
  - salary levels
  - payroll
  - exports
  - event type mutations/trash
  - employee mutations/recovery/deletion

## Backend API Contract For Frontend

Use `GET /auth/permissions` after login or app bootstrap to get the current user's effective permissions:

```json
{
  "user_id": "uuid-or-null",
  "role": "SUPER_ADMIN",
  "roles": ["SUPER_ADMIN"],
  "permission_slugs": ["*"],
  "is_superuser": true,
  "catalog": [{ "slug": "assets:read", "description": "..." }]
}
```

Use `permission_slugs` for all navigation, route, button, and field gates. Treat `*` as full access. Avoid checking literal role names in frontend code except for display labels.

For user-role admin UI:

- List roles with `GET /users/roles`.
- List available permissions with `GET /users/permissions`.
- Update role permissions with `PUT /users/roles/:id/permissions` and body:

```json
{ "permission_slugs": ["assets:read", "assets:write"] }
```

Existing user create/update payloads already accept `roleId` and `roleIds`; keep using `roleIds` for multi-role assignment.

## Current-Grant Authority Contract (Issue #278)

Successful `role_permissions` / `permissions` reads are authoritative for
ordinary roles, including an empty grant set. Runtime decisions must not add
provisioning seeds or the role editor's unsynchronized `roles.permissions`
snapshot. `SUPER_ADMIN`, `ADMIN`, and `OWNER` remain protected full-access roles,
recognized from an active, non-deleted user's current database role membership,
not from a stale token or browser label. Explicit current wildcard grants remain
valid for other roles. The retained identifier-less bootstrap/recovery
exception below is not current-database-backed authority.

`SYSTEM_MANAGER` is an editable role and follows its current assigned grants.
The parent coordinator selected this policy from the existing editor, schema,
and replacement API contract after owner confirmation was unavailable. This is
an evidence-based source decision, not a claim of direct owner approval or live
rollout verification. No stored grant rewrite is part of the change.

The resolver preserves primary plus additional role assignments and does not
substitute a caller's old primary role when the current assignment is empty.
Missing, inactive, and soft-deleted accounts do not receive an authorized
context. `/auth/me`, `/auth/permissions`, and notification permission selection
consume the same current-grant rules. Auth metadata uses the context validated
by middleware; it does not perform a second unguarded lookup or restore seeds.
The existing cache revision/invalidation protections and last-administrator
guardrails remain unchanged.

### Explicit Legacy Boundary

- SQLSTATE `42703` must identify `role_ids` before using the primary-role-only
  user/membership query. Account activity/deletion checks still apply. Login
  separately retains its `profile_image_url`-column compatibility path.
- SQLSTATE `42P01` must identify `role_permissions` or `permissions` before
  reading `roles.permissions` as the explicit legacy grant representation.
  The legacy map is not merged into a successful current grant set.
- Permission denials, transport failures, arbitrary query errors, and
  PostgREST schema-cache misses (`PGRST204` / `PGRST205`) do not prove legacy
  schema absence. Failed authority reads fail closed. Alternate transport
  recovery must successfully read the current grants; it cannot substitute
  JSON snapshots after a failed grant read.
- The defined administrator bootstrap/recovery path retains its explicit
  full-access grant. It is not a fallback for ordinary failed authority reads.
  No bootstrap schema or stored-grant mutation was added.

### Retained Bootstrap/Recovery Exception

The existing public login route can attempt bootstrap when a credential query
returns no matching row and the reserved bootstrap identity/password gate
matches. That is not an empty-database check. The existing bootstrap helper can
create or update the reserved administrator in a populated database.

If that helper fails, or login reaches its outer query-error recovery branch,
the same credential gate can issue a wildcard JWT without a user identifier.
`requireAuth` verifies its signature/expiry but performs database authority
resolution only when an identifier exists. This compatibility path is unchanged
by #278; claims that *all* authentication is current-database-only are incorrect.
Existing tokens without identifiers also retain the older map/role fallback
when an explicit grant array is absent.

Configuration classes are the bootstrap-password and JWT-signing-secret
settings, plus runtime mode for cookie flags. Issue #280 removes source-default
activation as described below; no deployed configuration is attested here.
Tokens and cookies have a seven-day
lifetime. Logout clears the cookie; no per-token revocation or bootstrap-specific
rate limiter is implemented in the inspected login/middleware path. Upstream
hosting controls are unverified. Separate hardening requires a new decision and
must not silently replace the compatibility policy preserved in this change.

### Explicit Authentication Configuration (Issue #280)

**Rollout prerequisite:** signing and verification require an explicitly
provisioned `JWT_SECRET`. Without valid configuration, authentication that would
issue or verify a token fails with a generic 503 before database or provisioning
work. Diagnostics identify the setting class and reason, never the value.
There is no development/test-mode exception.

The normalized key must contain at least 32 UTF-8 bytes. Blank, control-character,
multiline, recognized placeholder and trivially repeated values are rejected;
historical source defaults are shorter than the permitted minimum. Enclosing
quotes and outer whitespace are normalized consistently for signing and
verification, without selecting one line from a multiline secret. There is no
distinct-character quota. **Length and format do not establish entropy:** use an
independently provisioned, cryptographically generated key with at least 32
random bytes, not a human-chosen phrase or the repository's public test fixtures.

`ADMIN_PASSWORD` is optional for ordinary database authentication. When absent,
the login recovery capability is disabled; successful ordinary logins, including
the reserved administrator's actual database password, still work. When present,
the recovery credential must be explicitly provisioned, at least 16 UTF-8 bytes,
and pass the same blank/control/multiline/placeholder/trivial-repeat checks.
Only the reserved identity plus an exact match to that valid configured
credential activates the existing privileged recovery path. Invalid recovery
configuration cannot create, reset, promote or reactivate an account through
the login fallback, or issue its identifier-less recovery token.

The authenticated `/users/bootstrap-admin` endpoint provisions both reserved
accounts. It requires **both** `ADMIN_PASSWORD` and `MANAGER_PASSWORD` to pass
the 16-byte provisioning checks **before either mutation**, including before
alternate-transport recovery. Missing/invalid configuration returns a generic
503 for that endpoint. Missing manager configuration does not disable ordinary
login or separately configured administrator login recovery. Existing protected
roles, last-administrator guards and correctly configured populated-database
recovery are unchanged. This is a configuration preflight before either writer,
not a transaction spanning the subsequent administrator and manager mutations;
a later provisioning failure can still leave partial account changes.

The signing change does not retroactively attest deployed configuration or
revoke tokens. If a source-default/weak key was ever used, retiring that key and
the tokens it signed is a separate, target-attested operator action.
**Persisted-password prerequisite:** this source fix does not replace a default
password already stored on an account. Ordinary database login can still accept
that stored password. If default credentials were ever persisted, separately
authorized credential remediation and verification are required before claiming
the exposure is resolved. No key rotation, account-password change, stored-grant
rewrite, schema change, deployment or provider operation is performed by this
source change. The retained seven-day identifier-less recovery/revocation
boundary above remains a separate policy limitation.

### Role Preview

Preview remains a client-side view of an administrator's unsaved
`assignedSlugs`. It requires resolved current `users:manage` or
`settings:write` authority and can only narrow the user's actual permissions.
Wildcard intersections work in either direction; an intentionally empty draft
stays empty. Local role labels never create superuser authority, and preview
does not replace the actual user's role-membership fields.

Malformed or inaccessible storage is handled without losing actual session
access. Clearing preview updates mounted hook consumers without reloading the
session, including when storage removal fails. A failed removal also suppresses
that unchanged stored snapshot for subsequent or pending hook hydration in the
current document; a later different draft remains usable. The existing preview
selection workflow reloads the document after saving a new draft. Loss of actual
preview authority discards the preview. Failed permission or current-session
refreshes cannot retain grants from a previous successful response or from
preview storage. A retained user display snapshot is not fresh authority:
actions remain denied until the session read recovers, without introducing a
new forced logout on a transient read failure.

### Bounded Invalidation Bursts (Issue #281)

The invalidation map keeps its existing ceiling and revision barrier, but
size-triggered sweeps now leave half the threshold available for new markers.
This avoids repeatedly sorting the entire map for each user in a simultaneous
burst. Periodic age sweeps still reclaim expired markers after batching lowers
the size; the two-TTL retention constant, actual cache TTL and true-LRU limit
are unchanged.

Removing any marker still advances the global revision so an old in-flight
lookup cannot become current after eviction. The caller's new marker is added
after the sweep. The existing 20,000-invalidation control retains its original
deadline; deterministic headroom, stale/fresh revision and age controls cover
the batching behavior separately from host timing.

### Usable Provisioned Accounts (Issue #282)

The primary login query retains PostgreSQL's existing verification for supported
stored formats. A bcrypt `2b` candidate is verified with the same bcrypt library
that produces account passwords before any token or recovery decision. Stored
hashes are neither relabeled as another algorithm variant nor returned in login
responses. This preserves newly provisioned and existing bcrypt accounts on
PostgreSQL versions whose `pgcrypto` does not support that prefix, including the
explicit missing-profile-column compatibility path. Wrong credentials still
fail normally.

When provisioning creates the editable SYSTEM_MANAGER role for the first time,
the role, its advertised `users:manage` and `settings:write` grant links, and its
required activity record commit in one bounded, serialized transaction before
the manager account is written. Existing role grants, including an intentionally
empty set, are never rewritten from the legacy map. Existing roles with missing
grants therefore require an explicit permission-editor decision; runtime
authorization must not infer their intended permissions.

Creating that new role requires the direct transaction path. If it is unavailable,
the request fails explicitly before a new manager account is written rather
than using separate Data API writes for partial authority. Recovery using an
already configured role retains its existing alternate-transport path.
Unacknowledged role commits are reported as uncertain; review current roles
before retrying. The wider administrator/manager account pair remains the
separate non-atomic provisioning boundary documented above.

The permanent native provisioning suite runs as its own process in the existing
equipment verifier, without increasing its 170-second total budget. It tests
actual login/current grants, customized and empty roles, wrong passwords,
compatibility, suppressed grants/audit, concurrent initialization and lost
transaction acknowledgements. Public test credentials and disposable accounts
are not production credential-remediation evidence.

### Verification Boundary

Focused coverage lives in
`backend/src/__tests__/current-grant-policy.repro.test.ts` and
`frontend/src/hooks/useAuth.authority.repro.test.ts`. Backend tests require the
repository's synthetic test preload and invoke Router handlers directly without
an app listener; temporary spies are restored. Hook tests use a mocked API and
synthetic storage. These tests do not execute SQL, mutate providers, or establish
deployment/database parity. Live rollout remains separately gated.

## Left Frontend Instructions For Gemini Agent

1. Add a frontend permission hook/provider that fetches `GET /auth/permissions`, caches the result, and exposes:
   - `permissionSlugs`
   - `isSuperuser`
   - `hasPermission(slug)`
   - `hasAnyPermission(slugs)`
2. Replace hardcoded sidebar, page, action-button, and report/profit visibility role checks with permission slug checks.
3. Add user-role admin UI under settings/users or a nearby admin surface:
   - role list
   - permission checklist grouped by module prefix
   - save/revert states
   - loading/error states
4. Preserve the Dream Lux visual system:
   - warm-white/light and charcoal-slate/dark backgrounds
   - gold accents
   - minimal radius and shadows
   - WCAG-readable text and focus states
5. Do not expose Supabase service-role keys or query RBAC tables directly from the browser; use the backend endpoints only.
6. Verify frontend behavior at desktop and 320px mobile widths.

## Verification Notes

- `cd backend && bun test`: 194 passed, 0 failed.
- `cd backend && bun run lint`: passed.
- `cd backend && bun run build`: passed.
