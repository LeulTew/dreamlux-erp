# Frontend

This frontend uses Next.js with Bun.

## Local Development

From repository root:

```bash
bun run install:all
bun run dev:frontend
```

Or from this folder:

```bash
bun install
bun run dev
```

## Commands

```bash
bun run dev
bun run build
bun run start
bun run lint
```

## Required Environment Variable

- `NEXT_PUBLIC_API_URL` (for example: `http://localhost:4000` locally)

## Shared navigation

The five section choices are device-local, under
`dreamlux:sidebar-sections:v1:<encoded actual user ID>`. Role preview uses the
same identity; expand/collapse-all updates only sections allowed by both parent
and child navigation guards. An explicit choice overrides the active-route
default for Reference Data. No API-backed list preferences or role grants are
changed.

If storage is malformed or blocked, the sidebar reports the failure and keeps
temporary choices in memory across page remounts (not a full reload). A valid
matching-key storage event resynchronizes the open tab. Other users' keys and
sessionStorage events are ignored.

Desktop icon navigation uses portalled Radix popovers and tooltips. Mobile
retains the desktop cookie, presents full labels in a bounded bottom sheet,
and exposes an in-layout lower navigation entry. Only the sheet handle accepts
downward dismissal; close, Done, Escape and backdrop dismissal restore the
opening control's focus.

Targeted checks from this folder:

```powershell
bun run test app-sidebar.test.tsx sidebar-nav.test.ts breadcrumbs.test.tsx auth-session-ui.test.tsx --maxWorkers=1
bun run test:e2e --config playwright.navigation.config.ts
```

The navigation browser harness uses one worker and its own local server on
`127.0.0.1:3114`. Auth, API, and notification WebSocket responses are synthetic;
unmocked API or socket requests and non-local browser requests fail the tests.
The JSON report in `test-results` retains measurements and screenshots from
passing cases as well as failures. It does not verify a live
backend or production Auth, Database, or Storage. Do not supply production
environment files to this harness.
