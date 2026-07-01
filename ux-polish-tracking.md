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

| Phase | GitHub issue | Evidence from artifacts/code | Implementation outline | Required QA / review | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| L | [#106 Storekeeper allocation dispatch checklist and departure notifications](https://github.com/LeulTew/dreamlux-erp/issues/106) | User storekeeper story; `event_allocations` exists in `backend/src/db/schema.sql`; allocation create/delete exists in `backend/src/routes/events.ts`; event workspace shows allocations but no dispatch checklist/departure completion. | Add inventory/storekeeper dispatch queue grouped by event, event dispatch detail with per-allocation checkboxes, transaction-backed `departed_at`, activity log, and Event Manager notification. | Backend BOLA/BFLA, inventory integrity, double-submit race tests, frontend disabled-state tests, Playwright storekeeper-to-event-manager flow. | Open / planned. |
| M | [#107 Clarify proposal commission amount field and derived team totals](https://github.com/LeulTew/dreamlux-erp/issues/107) | Screenshot circles Amount for `4 x 3000`; `backend/src/routes/events/proposals.ts` and `frontend/src/app/events/proposals/new/page.tsx` derive team total but still expose editable Amount. | Decide and implement explicit semantics: calculated read-only total or clearly labeled manual override/additional cost. Keep backend/frontend math identical. | Financial formula tests, proposal unit/integration tests, Playwright proposal creation with `4 x 3000 = 12000`, no approval/conversion regression. | Open / planned. |
| N | [#108 Validate fuel cost preview units and vehicle consumption formula](https://github.com/LeulTew/dreamlux-erp/issues/108) | Screenshot shows `12 km`, `169 ETB/L`, `ETB 446.16`; schema labels `fuel_consumption_rate` as L/km; frontend/backend both multiply distance by rate by fuel price. | Confirm unit, fix labels/ranges/migration if rates use km/L or L/100km, and centralize formula if practical. | Backend formula and trip expense tests, frontend preview tests, driver ownership and completed-event lock tests, Playwright trip log smoke. | Open / planned. |
| O | [#109 Weekly and monthly Hisab rollup with non-event operational expenses](https://github.com/LeulTew/dreamlux-erp/issues/109) | Workbook `HISAB WEEKLY MONTHLY` has weekly event blocks, transport/rental/other/labour categories, grand total, event income, event profit, and non-event weekly expenses. | Add finance/Hisab periods, weekly/monthly rollups, approved event expense pull-through, non-event operational expense CRUD/approval, export/print. | Finance RBAC, approved-only math, no duplicate counting, server pagination, audit logs, E2E Accountant/Owner flow. | Open / planned. |
| P | [#110 Monthly overhead and shared operating expense register](https://github.com/LeulTew/dreamlux-erp/issues/110) | Workbook `MONTHLY WECHI` and `monthly total expense` show demoz, nedaj, bet wechi, car rental, sticker, seasonal/ekub, office/store payments, shared with Koti, rent, wifi, utilities, boost. | Add monthly overhead register with categories, payee/vendor/person, branch/store/office scope, recurrence, status, approval/close behavior, and payroll double-count guard. | Finance RBAC, approval lock, monthly grouping, no payroll double count, activity logs, E2E overhead approve flow. | Open / planned. |
| Q | [#111 Capital investment and asset purchase register](https://github.com/LeulTew/dreamlux-erp/issues/111) | Workbook `INVESTMENT` lists washing machine, fabric/twill/cherek, fixtures/hardware, and total investment. | Add capital investment register with optional asset link, quantity/unit/unit cost/total/vendor/date, capex classification, export. | Capex vs opex separation, financial redaction, linked asset tests, audit logs, E2E investment entry. | Open / planned. |
| R | [#112 Complete monthly net profit statement with overhead and investments](https://github.com/LeulTew/dreamlux-erp/issues/112) | Final screenshot flags monthly net profit complete deductions as missing; current event profit reports are event-focused. | Build owner/accountant monthly statement combining event revenue/approved expenses, non-event Hisab, overhead, payroll treatment, shared expenses, and investment treatment with drill-downs. | No double counting, approved-only math, closed-period snapshot decision, export accuracy, BOLA/redaction, performance limits. | Open / planned; depends on #109-#111. |
| S | [#113 Legacy Hisab workbook import and reconciliation mapper](https://github.com/LeulTew/dreamlux-erp/issues/113) | Workbook has four known sheet layouts and formulas; migration from Excel will otherwise require manual re-entry. | Add `.xlsx` import preview/mapping for known Hisab layout, formula-total mismatch detection, unmatched event/category resolution, transactional commit, duplicate import protection. | Parser fixture tests, rollback tests, finance RBAC, no uploaded workbook data in logs/git, Playwright import preview flow. | Open / planned; best after #109-#111 data models exist. |

## Next-Agent Notes

- New labels created for this backlog: `area:finance`, `area:inventory`, and `area:proposals`.
- Code paths already reviewed for the new issues: `backend/src/db/schema.sql`, `backend/src/routes/events.ts`, `backend/src/routes/events/proposals.ts`, `frontend/src/app/events/[id]/page.tsx`, `frontend/src/app/events/proposals/new/page.tsx`, `frontend/src/app/hr/reports/profit/page.tsx`.
- Do not implement product code from this tracker alone; open the linked GitHub issue, read its body/checklist, and follow the issue/branch/PR workflow in `RULES.md`.
