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
