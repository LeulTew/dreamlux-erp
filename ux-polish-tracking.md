# DreamLux ERP Local Tracking

Local continuity note for zero-hallucination agent handoff. This file is intentionally compact; GitHub issues and PRs are the durable source of truth.

## Required Context For Every Session

| Source | Must use for |
| :--- | :--- |
| `project-context.md` | Architecture, modules, active issue map, environment, and DreamLux domain boundaries. |
| `RULES.md` | Issue, branch, PR, merge, deploy, Bun-only workflow, secrets checks, and senior diff review. |
| AGENTS prompt rules | No destructive git, tracked/untracked work separation, UI quality constraints, and commit hygiene. |
| `.agents/skills/enforce_senior_frontend_engineering_and_anti_slop_design_systems/SKILL.md` | Required before frontend/UI implementation or UI review. |
| `docs/SENIOR_ISSUE_REVIEW_PROMPT.md` | Required before claiming production, finance, RBAC, payroll, inventory, or event work is complete. |
| `DreamLux_SRD_v1.0.docx` + `DreamLux_SRD.txt` | Product/SRD grounding; `.txt` is searchable companion, not a replacement for the `.docx`. |

## Completed Issue Ledger

| Issue | Scope | Closure evidence |
| :--- | :--- | :--- |
| [#25](https://github.com/LeulTew/dreamlux-erp/issues/25) | Permission-aware UX polish and E2E portability | PRs [#61](https://github.com/LeulTew/dreamlux-erp/pull/61)-[#71](https://github.com/LeulTew/dreamlux-erp/pull/71) merged; final comment recorded 100% E2E completion. |
| [#2](https://github.com/LeulTew/dreamlux-erp/issues/2) | Core event lifecycle reconciliation | [PR #72](https://github.com/LeulTew/dreamlux-erp/pull/72) merged; parent checklist reconciled and issue closed. |
| [#73](https://github.com/LeulTew/dreamlux-erp/issues/73) | Frontend RBAC audit and multi-role UX alignment | [PR #74](https://github.com/LeulTew/dreamlux-erp/pull/74) and [PR #75](https://github.com/LeulTew/dreamlux-erp/pull/75) merged; issue closed. |
| [#77](https://github.com/LeulTew/dreamlux-erp/issues/77) | Reference data setup pages and sidebar grouping | [PR #88](https://github.com/LeulTew/dreamlux-erp/pull/88) merged. |
| [#78](https://github.com/LeulTew/dreamlux-erp/issues/78) | Proposal creator attribution | [PR #89](https://github.com/LeulTew/dreamlux-erp/pull/89) merged. |
| [#79](https://github.com/LeulTew/dreamlux-erp/issues/79) | Unified trash and restore | [PR #90](https://github.com/LeulTew/dreamlux-erp/pull/90) merged; issue closed. |
| [#80](https://github.com/LeulTew/dreamlux-erp/issues/80) | Seeded admin/user credential parity | [PR #91](https://github.com/LeulTew/dreamlux-erp/pull/91) merged; docs/test plan updated. |
| [#81](https://github.com/LeulTew/dreamlux-erp/issues/81) | Notification center and permission-safe delivery | [PR #98](https://github.com/LeulTew/dreamlux-erp/pull/98) and follow-up main commits completed live notifications/toasts. |
| [#82](https://github.com/LeulTew/dreamlux-erp/issues/82) | Record activity timeline and audit drawer | [PR #99](https://github.com/LeulTew/dreamlux-erp/pull/99) merged. |
| [#83](https://github.com/LeulTew/dreamlux-erp/issues/83) | Security posture page | [PR #101](https://github.com/LeulTew/dreamlux-erp/pull/101) merged. |
| [#84](https://github.com/LeulTew/dreamlux-erp/issues/84) | PWA installability and offline shell | [PR #102](https://github.com/LeulTew/dreamlux-erp/pull/102) merged. |
| [#85](https://github.com/LeulTew/dreamlux-erp/issues/85) | HR dashboard | [PR #100](https://github.com/LeulTew/dreamlux-erp/pull/100) / [PR #103](https://github.com/LeulTew/dreamlux-erp/pull/103) completed. |
| [#86](https://github.com/LeulTew/dreamlux-erp/issues/86) | Custom role manager UX guardrails | [PR #104](https://github.com/LeulTew/dreamlux-erp/pull/104) merged. |
| [#87](https://github.com/LeulTew/dreamlux-erp/issues/87) | Pagination inventory and unbounded-list hardening | [PR #105](https://github.com/LeulTew/dreamlux-erp/pull/105) merged; issue closed. |
| [#93](https://github.com/LeulTew/dreamlux-erp/issues/93) | Record duplication flow | Closed by prior work; keep toast/sonner behavior intact in future UI work. |
| [#97](https://github.com/LeulTew/dreamlux-erp/issues/97) | Employee CRUD notifications and premium toast regression | Closed; notification/toast behavior is production-sensitive and must be regression-tested when touching global mutations. |
| [#106](https://github.com/LeulTew/dreamlux-erp/issues/106) | Storekeeper allocation dispatch checklist and departure notifications | [PR #114](https://github.com/LeulTew/dreamlux-erp/pull/114) merged; dispatch checklist, departure workflow, and mobile/desktop responsiveness verified. |
| [#107](https://github.com/LeulTew/dreamlux-erp/issues/107) | Clarify proposal commission amount field and derived team totals | [PR #115](https://github.com/LeulTew/dreamlux-erp/pull/115) merged; issue closed after read-only team labor amount total, backend normalization, matched frontend/backend math, and desktop/mobile Playwright verification. |
| [#110](https://github.com/LeulTew/dreamlux-erp/issues/110) | Monthly overhead and shared operating expense register | [PR #120](https://github.com/LeulTew/dreamlux-erp/pull/120) merged; monthly overhead register UI, filters, close/reopen, RBAC gates, payroll check, unit tests, and Playwright verification complete. |
| [#108](https://github.com/LeulTew/dreamlux-erp/issues/108) | Validate fuel cost preview units and vehicle consumption formula | [PR #116](https://github.com/LeulTew/dreamlux-erp/pull/116) merged; issue closed after L/km unit clarification, shared frontend/backend formula helpers, validation constraint, and desktop/mobile Playwright trip-log verification. |
| [#109](https://github.com/LeulTew/dreamlux-erp/issues/109) | Weekly and monthly Hisab rollup with non-event operational expenses | [PR #117](https://github.com/LeulTew/dreamlux-erp/pull/117), [PR #118](https://github.com/LeulTew/dreamlux-erp/pull/118), and [PR #119](https://github.com/LeulTew/dreamlux-erp/pull/119) merged; issue closed after finance_operational_expenses table + remote positive constraint migration, finance permission slugs, /finance rollup/ledger/export routes, /hr/finance/hisab page, custom CSS variables border-radius alignment, 19 backend + 6 UI tests, and 6/6 desktop/mobile Playwright scenarios. |
| [#111](https://github.com/LeulTew/dreamlux-erp/issues/111) | Capital investment and asset purchase register | [PR #121](https://github.com/LeulTew/dreamlux-erp/pull/121) merged; issue closed after capex schema/routes, permissions, asset linking, redaction, audit logs, export, UI, unit tests, and Playwright verification. |
| [#112](https://github.com/LeulTew/dreamlux-erp/issues/112) | Complete monthly net profit statement with overhead and investments | [PR #122](https://github.com/LeulTew/dreamlux-erp/pull/122) merged; issue checklist completed and closed after monthly net profit logic/UI, finance-only access, export, RLS review, full local suites, Playwright desktop/mobile flow, and GitHub CI passed. |


## 2026-07-01 Artifact Review

| Artifact | What was extracted | Notes / limitations |
| :--- | :--- | :--- |
| `C:\Users\USER-PC\Downloads\dream hisab sample format.xlsx` | Sheets: `HISAB WEEKLY MONTHLY` 557x16, `MONTHLY WECHI` 15x3, `INVESTMENT` 15x3, `monthly total expense` 38x15. Extracted weekly event cost categories, monthly overhead categories, investment purchases, and office/store/shared monthly payment blocks. | Read with bundled Python `openpyxl`; all four sheets were inspected for structure and representative rows. |
| `codex-clipboard-f8c6209d-9bb7-4bc9-83ec-0a3820c2d315.jpg` | Proposal Team & Labor estimator screenshot: commission line with 4 people at 3000 ETB and circled Amount field. | Led to issue #107; code shows backend/frontend currently use derived amount and explicit amount with `Math.max`. |
| `codex-clipboard-80dccf32-0c00-48b8-bd00-1a89eb272c03.jpg` | Event Trip Log screenshot: distance 12 km, fuel price 169 ETB/L, preview ETB 446.16. | Led to issue #108; code currently treats vehicle consumption as L/km. |
| `codex-clipboard-44c5d0dc-a6e6-46b0-832b-3f563e6583c1.jpg` | Gap map says built: per-event expense log, partial profit reports, payroll. Missing: weekly rollup, non-event expense log, fixed overhead module, investment register, complete monthly net profit deductions. | Led to issues #109-#113. |
| `audio_2026-07-01_10-52-04.ogg`, `audio_2026-07-01_10-52-10.ogg` | Files were found in Downloads. | No local transcription stack was available (`ffmpeg`, `openai`, `whisper`, `faster_whisper`, and `speech_recognition` absent). Do not claim transcript content unless a future agent transcribes them. The current issues rely on the user-provided prompt, screenshots, workbook, and code review. |

## Artifact-Backed Backlog Plan

Reminder: before coding any row below, branch from latest `main`, assign/move the issue to in progress, update the GitHub checklist as work proceeds, run Bun tests only, complete `docs/SENIOR_ISSUE_REVIEW_PROMPT.md`, and do not merge without explicit user authorization.

Issues [#106](https://github.com/LeulTew/dreamlux-erp/issues/106)-[#112](https://github.com/LeulTew/dreamlux-erp/issues/112) are complete and compacted into the Completed Issue Ledger above. Do not reopen this table for completed work unless a production regression is found.

| Phase | GitHub issue | Evidence from artifacts/code | Implementation outline | Required QA / review | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| S | [#113 Legacy Hisab workbook import and reconciliation mapper](https://github.com/LeulTew/dreamlux-erp/issues/113) | Workbook has four known sheet layouts and formulas; migration from Excel will otherwise require manual re-entry. | Add `.xlsx` import preview/mapping for known Hisab layout, formula-total mismatch detection, unmatched event/category resolution, transactional commit, duplicate import protection. | Parser fixture tests, rollback tests, finance RBAC, no uploaded workbook data in logs/git, Playwright import preview flow. | Backend PR [#123](https://github.com/LeulTew/dreamlux-erp/pull/123) opened as draft; UI/import preview flow still pending. |

## 2026-07-04 Deployed Cleanup Backlog

GitHub issue: [#124 UX/SYSTEM: deployed finance route, persisted list state, activity coverage, and UI consistency cleanup](https://github.com/LeulTew/dreamlux-erp/issues/124)

**Issue body draft:**

Production findings and polish gaps from deployed smoke review. Some observations may be stale deploy/parity issues, so verify before coding and keep the fixes scoped.

### Production symptoms to verify

- [ ] `https://dreamlux-erp.vercel.app/hr/finance/hisab` requests `/_rsc` for `/hr/finance` and returns 404. Confirm whether the parent route needs a route group/page fallback or whether this is a stale deployment artifact.
- [ ] Backend production returns 404 for `GET https://dreamlux-backend.vercel.app/finance/hisab?period_type=week&start_date=2026-01-01&end_date=2026-12-31`.
- [ ] Backend production returns 404 for `GET https://dreamlux-backend.vercel.app/finance/hisab?period_type=month&start_date=2026-01-01&end_date=2026-12-31`.
- [ ] Backend production returns 404 for `GET https://dreamlux-backend.vercel.app/finance/operational-expenses?page=1&limit=20&start_date=2026-01-01&end_date=2026-12-31`.
- [ ] Compare current `main` source, Vercel deployment commit, backend route mounting, and production health before assuming code is missing.

### Persisted per-user record state

- [ ] Add a design for Frappe-like remembered list state per user without making the app feel stale: sort, filters, page size, column density, visible columns, and last selected tab where appropriate.
- [ ] Do not store sensitive financial filters or cross-user state in browser-only storage as the durable source of truth. Prefer authenticated backend preferences with tenant/user scoping; use local cache only as a fast fallback.
- [ ] Evaluate whether existing infra is enough or whether a Vercel-friendly external cache is justified. Do not add Redis or a paid dependency unless it materially improves live state and the deployment supports it.
- [ ] Add `recent` sorting consistently across record pages. `recent` must consider last edited time, not only created time.
- [ ] Ensure every record model that participates in `recent` has a trustworthy `updated_at`/last edited source and that mutations update it reliably.
- [ ] Preserve live React Query/server-state behavior: preferences should remember UI state, not freeze record data.

### Activity coverage

- [ ] Add the activity/audit button to more record detail pages, including event workspace, payroll screens, finance records, and other record pages that already have audit/activity data.
- [ ] Use backend authorization as the source of truth. Frontend-hidden activity buttons are not sufficient.
- [ ] Ensure activity timelines do not leak financial/payroll details to roles without permission.

### Light mode and UI consistency cleanup

- [x] `/hr/expenses/approve?tab=history&sort_by=created_at&sort_order=desc`: fix light mode table header row color.
- [x] Fix light mode background colors for `Pending Queue`, `History`, and `Receipt`.
- [x] Fix `Receipt` radius to use the global custom radius tokens only.
- [x] `/events/proposals/new`: replace date/time and related inputs with existing global form components where available.
- [x] For proposal location, use the existing location/map pattern if the project already has one. If not, keep it as a clean named location field and do not introduce a speculative map dependency.
- [x] Fix proposal estimate field radii to follow global custom radius tokens only.
- [x] Fix mobile button sizing/wrapping so `< Back`, `Create Draft`, and `Submit For Approval` remain readable and professional on narrow screens.
- [x] When validation fails with `Estimate label is required`, return focus to the proposal form and visibly highlight the exact missing estimate field(s).
- [x] Add a restrained submit-for-approval animation/loading state that communicates progress without blocking accessibility.
- [x] Audit all gold-background buttons in light mode and ensure text/icons use white or another WCAG-compliant foreground. No gold background with black text unless contrast is proven and design-approved.
- [x] Enforce UI rules: global custom radius tokens only, no bare `rounded`, no hardcoded border radius, no bare hover utilities on mobile surfaces, 48px practical touch targets, no oversized report/PDF branding.

### Package and deployment cleanup

- [ ] Create an end-of-project dependency audit plan for production deployment. Keep Playwright/test tooling out of production runtime bundles while preserving CI/E2E capability.
- [ ] Verify dependencies are correctly split between runtime and dev/test usage. Do not remove tooling that CI or local QA still requires.
- [ ] Check Vercel build output for accidental test fixtures, uploaded workbook data, screenshots, traces, or large artifacts.

### Required QA and review

- [ ] Follow `RULES.md`, `.claude/rules/ui-design.md`, `.claude/rules/architecture.md`, `.claude/rules/tech-stack.md`, and `docs/SENIOR_ISSUE_REVIEW_PROMPT.md`.
- [ ] Add unit tests for persisted preference read/write/authorization, recent-sort semantics, updated-at behavior, and proposal validation focus/highlight behavior.
- [ ] Add backend integration tests for preference BOLA/BFLA, finance route availability, and activity redaction.
- [ ] Add frontend tests for light/dark expense approval styling states, proposal mobile button layout, gold-button foreground contrast classes, and global component usage where practical.
- [ ] Add Playwright coverage for Hisab production-equivalent route load, expenses approval light mode, proposal validation recovery, mobile proposal actions, and activity button visibility by role.
- [ ] Run `bun run lint`, `bun run build`, `bun run test`, backend tests/build, frontend tests/build, Playwright smoke, and `git diff --check`.
- [ ] Do not merge if GitHub CI is failing.

## Next-Agent Notes

- New labels created for this backlog: `area:finance`, `area:inventory`, and `area:proposals`.
- Code paths already reviewed for the new issues: `backend/src/db/schema.sql`, `backend/src/routes/events.ts`, `backend/src/routes/events/proposals.ts`, `frontend/src/app/events/[id]/page.tsx`, `frontend/src/app/events/proposals/new/page.tsx`, `frontend/src/app/hr/reports/profit/page.tsx`.
- Do not implement product code from this tracker alone; open the linked GitHub issue, read its body/checklist, and follow the issue/branch/PR workflow in `RULES.md`.

## Suggested Model Split

| Issue | Primary model | Secondary model | Notes |
| :--- | :--- | :--- | :--- |
| #106 | GPT 5.5 | Antigravity Gemini Flash 3.5 | Backend-first because of dispatch integrity, notifications, and auditability. |
| #107 | GPT 5.5 | Antigravity Gemini Flash 3.5 | Finance semantics and formula correctness first; UI wording second. |
| #108 | GPT 5.5 | Antigravity Gemini Flash 3.5 | Treat as a formula/rules issue with light UI label cleanup. |
| #109 | GPT 5.5 | Antigravity Gemini Flash 3.5 | Backend model and aggregation first; report UI after contracts stabilize. |
| #110 | GPT 5.5 | Antigravity Gemini Flash 3.5 | Finance data model and RBAC first; CRUD/table UX second. |
| #111 | GPT 5.5 | Antigravity Gemini Flash 3.5 | Backend schema and permissions first; asset/investment UX second. |
| #112 | GPT 5.5 | Antigravity Gemini Flash 3.5 | Highest financial correctness risk; use UI only after math is locked. |
| #113 | GPT 5.5 | Antigravity Gemini Flash 3.5 | Parser, transaction safety, and reconciliation rules should be backend-led. |
