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
settings, plus runtime mode for cookie flags. Source defaults exist; no values
or deployed configuration are attested here. Tokens and cookies have a seven-day
lifetime. Logout clears the cookie; no per-token revocation or bootstrap-specific
rate limiter is implemented in the inspected login/middleware path. Upstream
hosting controls are unverified. Separate hardening requires a new decision and
must not silently replace the compatibility policy preserved in this change.

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
preview authority discards the preview. A failed permission refresh cannot retain grants from a
previous successful response or from preview storage.

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
