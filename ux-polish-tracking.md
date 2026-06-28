# DreamLux UX / Event Lifecycle Tracking

Local tracking note for agent continuity and zero-hallucination handoff context.

## Required Context For Every Session

| Source | Must use for |
| :--- | :--- |
| `project-context.md` | Architecture, modules, active issue map, known caveats, and DreamLux domain boundaries. |
| `RULES.md` | Bun-only workflow, GitHub issue/branch/PR rules, secrets checks, senior diff review, and merge discipline. |
| AGENTS prompt rules | Local safety, no destructive git, UI quality rules, and tracked/untracked work separation. |
| `.agents/skills/enforce_senior_frontend_engineering_and_anti_slop_design_systems/SKILL.md` | Required before frontend UI edits. |
| `docs/SENIOR_ISSUE_REVIEW_PROMPT.md` | Completion, security, performance, diff, and test review before claiming an issue is complete. |

## Current Status

| Item | Status | Evidence |
| :--- | :--- | :--- |
| Active branch at cleanup start | `main` | Clean and synced with `origin/main` before this final tracker-only cleanup branch. |
| #25 UX polish | Closed | [PR #61](https://github.com/LeulTew/dreamlux-erp/pull/61) - [PR #71](https://github.com/LeulTew/dreamlux-erp/pull/71) merged; final #25 comment records 100% E2E portability completion. |
| #2 Core Event Lifecycle | Closed | [PR #72](https://github.com/LeulTew/dreamlux-erp/pull/72) merged; GitHub issue #2 body has all checklist items checked and state is closed. |
| #73 Frontend RBAC audit | Closed | [PR #74](https://github.com/LeulTew/dreamlux-erp/pull/74) and [PR #75](https://github.com/LeulTew/dreamlux-erp/pull/75) merged; GitHub issue #73 state is closed. |
| #77 Reference Data | Closed | [PR #88](https://github.com/LeulTew/dreamlux-erp/pull/88) merged; adds Departments, Positions, and Offices setup/reference table CRUD screens. |
| Final tracker cleanup | Docs-only | This file was compacted after confirming no open #2/#73/77 implementation work remained. |


## Completed Issue Ledger

| Issue | Scope | Closure evidence | Final result |
| :--- | :--- | :--- | :--- |
| #25 | UX polish, route guard E2E, backend hardening, Playwright portability | [PR #61](https://github.com/LeulTew/dreamlux-erp/pull/61) - [PR #71](https://github.com/LeulTew/dreamlux-erp/pull/71) merged; `bun run test`, `bun run lint`, `bun run build`, and `bun run test:e2e` passed in the final phase evidence. | Complete. No remaining local tracking items. |
| #2 | Core event lifecycle reconciliation and closeout | [PR #72](https://github.com/LeulTew/dreamlux-erp/pull/72) merged; event lifecycle checklist reconciled against merged child issues; issue #2 confirmed closed through GitHub. | Complete. Normalized CRM and DB-level immutability trigger remain future separate scope only if product opens a new issue. |
| #73 | Frontend RBAC audit and multi-role UX alignment | [PR #74](https://github.com/LeulTew/dreamlux-erp/pull/74) aligned shared frontend permission matching and proposal/profit/event gates; [PR #75](https://github.com/LeulTew/dreamlux-erp/pull/75) tightened payroll and event-type read/write/delete gating; issue #73 confirmed closed through GitHub. | Complete. Backend remains the RBAC source of truth; frontend gates mirror backend permission slugs for UX/access polish. |
| #77 | Reference data setup pages and sidebar grouping | [PR #88](https://github.com/LeulTew/dreamlux-erp/pull/88) merged; unit tests and frontend build verify layout, permissions, and delete impact validation. | Complete. Departments, positions, and offices screens are now live under the Reference Data collapsible menu group. |



## Issue #73 Final RBAC Audit Closure

| Area | Final state | Evidence |
| :--- | :--- | :--- |
| Shared frontend matcher | Complete | `frontend/src/lib/permission-matcher.ts` mirrors backend semantics for superuser, `*`, exact slugs, and module wildcards; covered by unit tests. |
| `useAuth`, sidebar, breadcrumbs | Complete | Shared matcher is used for permission checks; sidebar and breadcrumb tests cover wildcard and parent-link behavior. |
| Events list and event workspace | Complete | Route/action gates use permission slugs; read-only option fetch and finance redaction behavior are covered by frontend/E2E tests. |
| Proposals | Complete | Queue reads, create CTA, and new proposal access were aligned with backend proposal/event permissions; E2E covers approver and wildcard cases. |
| Profit reports | Complete | Report reader access supports explicit, global wildcard, and module wildcard permissions; tests cover authorized and denied states. |
| Payroll archive | Complete | Read users can view allowed payroll data; write-only actions such as new payout, draft edits, restore, trash, and permanent delete are hidden without `payroll:write`; E2E covers read-only behavior. |
| Event types and trash | Complete | Trash listing is read-gated; delete/restore/permanent-delete controls require `events:delete`; E2E covers read-only trash access. |
| Assets/settings/admin inventory | Complete | Audited as aligned with backend route middleware and existing permission slug gates; no source-backed mismatch remained after #74/#75. |
| `ForbiddenState` | Complete | Default copy is capability-based and localized; page-specific descriptions are allowed only where deliberately supplied by the page. |
| Sidebar/popout UI note | Complete | No #73 blocker remained after audit; broad hover/style refactors are outside the closed RBAC issue unless a new UI issue is opened. |

## Final Verification Evidence

| Phase | Commands / checks | Result |
| :--- | :--- | :--- |
| #25 final PR | `bun run test`, `bun run lint`, `bun run build`, `bun run test:e2e` | Passed before PR #71 merge; Playwright passed 10/10 on port 3101. |
| #2 final PR | Targeted event lifecycle, seed parity, lint/build/test checks recorded in PR #72 | Passed before PR #72 merge and issue close. |
| #73 PR 1 | `cd frontend; bun run test`, `bun run lint`, `bun run build`, `bun run test:e2e`; root `bun run test`, `bun run lint`, `bun run build`; `git diff --check` | Passed before PR #74 merge. |
| #73 PR 2 | `cd frontend; bun run test`, `bun run lint`, `bun run build`, targeted Playwright access tests; root `bun run test`, `bun run lint`, `bun run build`; `git diff --check` | Passed before PR #75 merge. |
| Final tracker cleanup | Confirmed GitHub #2 and #73 are closed; removed stale unresolved tracker language. | Docs-only cleanup covered by this final PR. |

## Final Cleanup Checklist

- [x] Re-read required context: `project-context.md`, AGENTS/RULES instructions, senior review prompt, and frontend design skill guidance.
- [x] Confirm GitHub issue #2 is closed.
- [x] Confirm GitHub issue #73 is closed.
- [x] Remove stale unresolved tracker markers such as audit-needed, improvement-candidate, and in-progress rows.
- [x] Compact completed phase detail into short issue and evidence ledgers.
- [x] Preserve future-scope caveats only where GitHub issue #2 explicitly records them as non-blocking.

## Next Backlog Plan From 2026-06-28 Codebase Review

Reminder for the next agent/session: before coding, re-read `project-context.md`, `RULES.md`, AGENTS instructions, `docs/SENIOR_ISSUE_REVIEW_PROMPT.md`, and, for any UI work, `.agents/skills/enforce_senior_frontend_engineering_and_anti_slop_design_systems/SKILL.md`. For database/auth/RLS/user work, also apply the Supabase skill checklist. Branch from latest `main` per issue unless continuing an existing issue branch; do not merge PRs without explicit user authorization.

| Phase | GitHub issue | Current evidence from code review | Implementation plan | Rules / QA required | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| A | [#77 Reference data setup pages and sidebar grouping](https://github.com/LeulTew/dreamlux-erp/issues/77) | Existing backend routes include `backend/src/routes/departments.ts`, `offices.ts`, `positions.ts`, `salary-levels.ts`, `event-types.ts`; sidebar grouping lives in `frontend/src/lib/sidebar-nav.ts`. SRD clues in `DreamLux_SRD_v1.0.docx` and searchable `DreamLux_SRD.txt`. | Build/verify simple table CRUD pages for setup/reference doctypes, group them coherently in sidebar/settings/HR, assign permission gates for admin/ops/HR roles, and avoid duplicating pages already complete. | Senior frontend skill, `docs/SENIOR_ISSUE_REVIEW_PROMPT.md`, SRD source doc, Bun tests, frontend responsiveness down to 320px. | [Completed (PR #88)](https://github.com/LeulTew/dreamlux-erp/pull/88). |
| B | [#78 Proposal creator attribution across queue and detail](https://github.com/LeulTew/dreamlux-erp/issues/78) | `backend/src/routes/events/proposals.ts` now joins proposer/approver display metadata; proposal queue/detail now show Proposed by with missing-user fallback. | PR #89 implements backend metadata aliases, frontend queue/detail display, typed API fields, backend proposal tests, Playwright desktop/mobile coverage, and permission-cache test isolation fixes. | Verified locally: `bun run test`, backend `bun test`, backend/frontend lint and builds, and targeted proposal E2E passed. | Complete in PR #89; awaiting clean CI/merge. |
| C | [#79 Unified trash and restore for events, proposals, and setup records](https://github.com/LeulTew/dreamlux-erp/issues/79) | Events soft-delete in `backend/src/routes/events.ts`; no clear event trash/restore/permanent UI. Proposals filter `deleted_at IS NULL` but no trash management. Event types/salary/assets/payroll already have patterns. | Add event/proposal trash list, restore, permanent delete where safe; audit #77 setup doctypes for useful trash behavior; add audit logs and permission-aware UI. | Senior review prompt for BOLA/BFLA/data integrity; tests for deleted exclusion, trash inclusion, restore, hard-delete blocking. | Open / planned. |
| D | [#80 Seeded admin and user credentials parity](https://github.com/LeulTew/dreamlux-erp/issues/80) | Live DB check found `acc`, `ceo`, `driver`, `eventmgr`, `inv`, `ops` authenticate with `Password123`, but `admin` does not. `backend/src/db/seeds_dreamlux.sql` seeds only core non-admin users; `docs/TEST_CREDENTIALS.md` lists admin/driver. | Make documented dev/test users real and reproducible; fix admin bootstrap parity without secrets; confirm driver maps to a real driver employee; update docs/tests. | Supabase/auth security checklist, no hashes/secrets in commits, auth and driver ownership tests. | Open / planned. |
| E | [#81 Notification center, routing matrix, and permission-safe delivery](https://github.com/LeulTew/dreamlux-erp/issues/81) | No full notification routes/pages found. `docs/issues/story_1_ui_revamp.md` has old concept. `frontend/src/components/PayrollReminder.tsx` directly calls `Notification.requestPermission()`. | Design notification tables/service, routing matrix, API, dropdown inbox, full page, read/archive/preferences, and permission-safe deep links. Replace surprise browser permission with pre-prompt UX. | Senior frontend skill; consider `impeccable` shaping; backend security review; matrix/inbox/E2E tests. | Open / planned; large feature. |
| F | [#82 Record activity timeline and audit drawer](https://github.com/LeulTew/dreamlux-erp/issues/82) | `event_logs` and `event_proposal_logs` exist; proposal detail has audit logs; no shared drawer/timeline for events/assets/employees/settings. | Define shared activity feed, normalize existing logs, join actor username/full name, redact sensitive fields, add drawer/below-record timeline. | Senior review prompt for audit/PII; frontend skill; tests for ordering, redaction, actor fallback. | Open / planned. |
| G | [#83 Security posture status page with OWASP/CVE tracking](https://github.com/LeulTew/dreamlux-erp/issues/83) | Security docs exist (`docs/SENIOR_ISSUE_REVIEW_PROMPT.md`, `docs/FINAL_SRD_AUDIT_REPORT.md`, `docs/CODEX_AUDIT_REPORT.md`); no in-app settings security status page/dropdown found. | Add settings-level hidden/collapsible posture page for admin/security users, statuses for OWASP/API/CVE/dependency/RLS/audit coverage, links to docs/issues. | Security review; no env/secrets exposure; permission tests. | Open / planned. |
| H | [#84 PWA installability, offline shell, and notification readiness](https://github.com/LeulTew/dreamlux-erp/issues/84) | No manifest/service worker/PWA config found; `frontend/public` has default assets. Browser notifications need pre-prompt alignment. | Add manifest/icons/theme, safe service worker cache strategy, offline fallback, install UX, and notification readiness without caching sensitive authenticated API responses. | Senior frontend skill, security review, Playwright PWA/offline smoke, build verification. | Open / planned. |
| I | [#85 HR dashboard for workforce, payroll, and staffing readiness](https://github.com/LeulTew/dreamlux-erp/issues/85) | HR/payroll pages and backend routes exist, but no dedicated HR dashboard found. | Add permission-aware HR dashboard with workforce/payroll/staffing readiness metrics, exception tables, payroll redaction, Amharic/empty states. | Senior frontend skill, payroll/security review, SRD salary anchors only for salary tests. | Open / planned. |
| J | [#86 Custom role manager UX guardrails and auditability](https://github.com/LeulTew/dreamlux-erp/issues/86) | Backend custom role APIs and tests exist in `backend/src/routes/users.ts` and `backend/src/__tests__/rbac-cache-guardrails.test.ts`; frontend UI exists in `frontend/src/app/settings/permissions/page.tsx`. | Do not rebuild role system; enhance UX with grouping/search/diff preview, dangerous permission guardrails, audit/activity entries, mobile cleanup. | #24/#25 RBAC rules, senior review prompt, frontend skill, admin E2E tests. | Open / planned enhancement. |
| K | [#87 Pagination inventory and unbounded-list hardening](https://github.com/LeulTew/dreamlux-erp/issues/87) | Pagination found in dashboard/events/proposals/assets/trash/history/low-stock/location/reconcile/salary/profit/payroll/payment-detail/expense-approval/event-types; shared `frontend/src/components/PaginationControls.tsx`. | Confirm inventory on latest `main`, audit server-side pagination/limits/indexes, add pagination to any unbounded high-growth page, document behavior. | Senior review prompt performance checks; frontend skill if UI touched; endpoint limit tests and E2E smoke. | Open / planned enhancement. |

## Created Issue Map

| Issue | Title | Priority | Classification |
| :--- | :--- | :--- | :--- |
| [#77](https://github.com/LeulTew/dreamlux-erp/issues/77) | Reference data setup pages and sidebar grouping | P1 | Antigravity (UI) |
| [#78](https://github.com/LeulTew/dreamlux-erp/issues/78) | Proposal creator attribution across queue and detail | P1 | Codex (Logic) |
| [#79](https://github.com/LeulTew/dreamlux-erp/issues/79) | Unified trash and restore for events, proposals, and setup records | P1 | Codex (Logic) |
| [#80](https://github.com/LeulTew/dreamlux-erp/issues/80) | Seeded admin and user credentials parity with real user accounts | P1 | Codex (Logic) |
| [#81](https://github.com/LeulTew/dreamlux-erp/issues/81) | Notification center, routing matrix, and permission-safe delivery | P1 | Antigravity (UI) |
| [#82](https://github.com/LeulTew/dreamlux-erp/issues/82) | Record activity timeline and audit drawer | P1 | Antigravity (UI) |
| [#83](https://github.com/LeulTew/dreamlux-erp/issues/83) | Security posture status page with OWASP/CVE tracking | P2 | Antigravity (UI) |
| [#84](https://github.com/LeulTew/dreamlux-erp/issues/84) | PWA installability, offline shell, and notification readiness | P2 | Codex (Logic) |
| [#85](https://github.com/LeulTew/dreamlux-erp/issues/85) | HR dashboard for workforce, payroll, and staffing readiness | P2 | Antigravity (UI) |
| [#86](https://github.com/LeulTew/dreamlux-erp/issues/86) | Custom role manager UX guardrails and auditability | P2 | Antigravity (UI) |
| [#87](https://github.com/LeulTew/dreamlux-erp/issues/87) | Pagination inventory and unbounded-list hardening | P2 | Codex (Logic) |
