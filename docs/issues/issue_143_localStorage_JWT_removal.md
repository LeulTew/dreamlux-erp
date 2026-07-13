# [Security]: Remove localStorage JWT Dependency

**Issue ID**: `ISSUE-143`
**Labels**: `type:task`, `area:security`, `priority:p0`, `status:in-progress`

---

## Context

PR #140 (resolving issue #139) fixed a login redirect loop by re-introducing the storage of the JWT token in `localStorage`. This regresses the security hardening of issue #137, which aimed to completely remove the JWT from `localStorage` (where it is vulnerable to XSS extraction) and use HttpOnly secure cookies instead.

This issue implements a robust cookie-only session bootstrapping flow that does not depend on local token markers.

## Acceptance Criteria

- Login succeeds without storing JWT in `localStorage`.
- Browser session remains authenticated via server cookie only.
- Axios/request bootstrap no longer reads `localStorage.token` or appends `Authorization` headers.
- Protected-shell bootstrap uses `/auth/permissions` or `/auth/me` with cookie credentials, not local token presence.
- Logout clears cookie and all non-sensitive local markers.
- Stale `localStorage.user` alone cannot keep a user “logged in”.
- Dev and prod both work without redirect loops.
- E2E covers:
  - successful login redirect
  - refresh after login
  - logout
  - stale local user with missing/expired cookie
  - direct protected-route load with valid cookie and no local token
