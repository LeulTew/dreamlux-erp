# DreamLux UX / Event Lifecycle Tracking

Local tracking note. This file is intentionally maintained for agent continuity and zero-hallucination handoff context.

## Required Context For Every Session

| Source | Must use for |
| :--- | :--- |
| `project-context.md` | Architecture, modules, active issue map, known caveats, and DreamLux domain boundaries. |
| `RULES.md` | Bun-only workflow, GitHub issue/branch/PR rules, secrets checks, senior diff review, and merge discipline. |
| AGENTS prompt rules | Local safety, no destructive git, UI quality rules, and tracked/untracked work separation. |
| `docs/SENIOR_ISSUE_REVIEW_PROMPT.md` | Completion/security/performance/test review before claiming an issue is complete. |

## Current Status

| Item | Status | Notes |
| :--- | :--- | :--- |
| Active branch | `main` | PR #72 merged and local `main` fast-forwarded. |
| #25 UX polish | Closed | PR #71 merged; final E2E portability evidence posted on #25. |
| #2 Core Event Lifecycle | Closed | PR #72 merged; issue body checkboxes are complete and GitHub issue #2 is closed. |
| Worktree policy | Intentional dirty files only | Do not overwrite unrelated changes. This file is tracked even though `.gitignore` also lists it. |

## Issue #25 Completed Phase Ledger

| Phase | Branch / PR | Result | Compressed evidence |
| :--- | :--- | :--- | :--- |
| Phase 1 Button System | PR #61 | Merged | Button variants, states, mobile tap targets, icon labels, lint/build/tests. |
| Cleanup | PR #62 | Merged | Removed temp artifacts, cleaned backend settings payload typing, full validation. |
| Phase 2 Sortable Tables | PR #63 | Merged | Shared sortable headers, sort query preservation, backend allowlists, table tests. |
| Phase 3 Status Badges | PR #64 | Merged | Semantic badge mapping, compact mode, contrast/i18n coverage. |
| Phase 4 Expense Approval | PR #65 | Merged | Paginated pending/history queues, filters, approval/rejection tests, bilingual UI. |
| Phase 5 Mobile/i18n/a11y | PR #66 | Merged | Permission-aware navigation/shells, role-specific controls, mobile and Amharic checks. |
| Phase 6 E2E/Redaction | PR #67 | Merged | Route guard regression, report redaction, mobile E2E coverage. |
| Fix 1 Offline/sidebar cleanup | PR #68 | Merged | Preserved offline queue utility; removed synced sidebar indicator and styling regressions. |
| Fix 2 Sort validation | PR #69 | Merged | Expanded pagination/sort validation and fixed table sort regressions. |
| Phase 7 Backend hardening | PR #70 | Merged | Offline sync queue tests, state transition integrity, RBAC cache listener, strict form normalization. |
| E2E portability follow-up | PR #71 | Merged | Playwright uses port 3101 and deterministic mobile layout assertions; final #25 comment records 100% E2E. |

## Issue #25 Final Review Targets

| Area | Target | Current evidence |
| :--- | :---: | :--- |
| Completion | 100% | Issue #25 body is checked; final follow-up removes last local E2E caveat. |
| Security | 100% | Backend permission slugs, field redaction, direct URL blocked states, strict validation, transition guards, and RBAC invalidation tests. |
| Unit/integration | 100% | Prior post-merge `bun run test`: backend 292 passing; frontend 20 files / 84 passing. Re-run before PR merge. |
| Lint/build | 100% | Prior post-merge `bun run lint` and `bun run build` passed. Re-run before PR merge. |
| E2E / Playwright | 100% | `bun run test:e2e` passed: 10/10 Playwright tests on port 3101 with deterministic mobile layout assertions. |

## Issue #25 Follow-Up Checklist

- [x] Create branch `feature/25-e2e-playwright-portability`.
- [x] Change Playwright dev server/base URL from `3100` to `3101` to avoid local port conflict.
- [x] Replace mobile screenshot snapshot assertions with deterministic visibility, shell, no-horizontal-scroll, and bounding-box containment assertions.
- [x] Remove obsolete Linux screenshot baseline PNGs after removing snapshot assertions.
- [x] Run `bun run test:e2e` - passed, 10/10 Playwright tests.
- [x] Run `bun run lint` - passed.
- [x] Run `bun run build` - passed.
- [x] Run `bun run test` - passed, backend 292 tests and frontend 21 files / 88 tests.
- [x] Fix inherited Phase 7 frontend lint errors in `frontend/src/lib/sync-queue.test.ts` without changing production sync queue behavior.
- [x] Inspect `git diff` for scope, secrets, generated files, and regressions.
- [x] Commit with prefix message: `test(ux): make Playwright access checks portable`.
- [x] Push branch.
- [x] Create PR with issue link, checklist, verification, and senior review notes: PR #71.
- [x] Verify GitHub Actions: `backend-test` and `frontend-build` passed.
- [x] Merge PR after checks are clean.
- [x] Pull fast-forward `main`.
- [x] Confirm #25 remains closed with final 100% E2E comment: https://github.com/LeulTew/dreamlux-erp/issues/25#issuecomment-4821090727.

## Issue #2 Core Event Lifecycle Plan

Issue: https://github.com/LeulTew/dreamlux-erp/issues/2

Final status: closed after PR #72. The issue body now has all checklist boxes checked, so automation should not reopen it.

### Phase A: Reconcile Current Main Against #2 Body

| Checklist item | Current evidence | Status | Next action |
| :--- | :--- | :--- | :--- |
| Explicit package/design path | `package_design_notes`, `estimated_design_cost`, `PATCH /events/:id/design`, proposals conversion, imports, event detail UI. | Complete | Checked in #2 body; PR #72 references B2 evidence. |
| Client table planning | Snapshot fields exist; normalized clients table is future separate CRM scope if product requires it. | Complete | Checked in #2 body as documented planning decision. |
| Completed-event guardrails | API lock, override permission, transition checks, audit tests exist; Express is sole DB accessor after RLS hardening. | Complete | Checked in #2 body as API-layer enforcement decision. |
| Permission slug checks | `events:read`, `events:write`, `events:delete`, `events:override_completed` are used; PR #72 adds read-denial tests for list/detail/workspace. | Complete | Merged in PR #72. |
| Stable detail payload | `GET /events/:id` and `/events/[id]` workspace exist; workspace shape covers team, vehicles, inventory, expenses, and profitability integrations. | Complete | Checked in #2 body. |
| Detail workspace | `/events/[id]` exists with operations, design, redaction-aware finance, and role-aware controls. | Complete | Reference #12/#25 PRs. |
| Package/design in create/edit | Detail workspace and proposals support design; compact drawer intentionally owns core event details only. | Complete | Checked in #2 body as accepted workflow. |
| Empty/loading/error and responsive/WCAG | #25 Phase 5/6 and PR #71 E2E portability cover this. | Complete | #25 final E2E comment and PR #72 reference evidence. |
| Role alignment/redaction/audit/errors | Covered across #24/#25/#32/#33 plus PR #72 read permission hardening. | Complete | Checked in #2 body. |
| Permission/design/client tests/manual sample | Tests cover permissions/design; Hana & Daniel sample is asserted in `srd-seed-parity.test.ts`. | Complete | Merged in PR #72. |

### Phase B: Minimal Code/Test Gaps To Close #2 Cleanly

| Phase | Goal | Checklist |
| :--- | :--- | :--- |
| B1 Permission proof | Make #2 permission completion undeniable. | [x] Inspected `backend/src/__tests__/events.test.ts` for explicit `events:read`/`events:write` denial tests. [x] Added missing focused read-denial tests for list/detail/workspace routes. [x] Confirmed direct API denial does not rely on frontend gating. Evidence: `bun test backend/src/__tests__/events.test.ts` passed 99 tests. |
| B2 Package/design proof | Resolve create/edit vs detail-workspace ambiguity. | [x] Inspected `frontend/src/components/EditEventSheet.tsx` and `frontend/src/app/events/[id]/page.tsx`. [x] Documented intended workflow: compact drawer owns core schedule/client/status; detail workspace owns design package editing via `DesignPackagePanel`. [x] Confirmed backend `PATCH /events/:id/design` tests cover update and low-privilege denial. |
| B3 Client strategy | Close normalized client-table ambiguity. | [x] Confirmed current Phase 1 implementation preserves `client_name` / `client_phone` snapshots across schema, API, imports/exports, proposals, list/detail UI, and SRD seed. [x] Decision: normalized CRM/client registry is future separate scope, not a blocker for #2 closeout. |
| B4 Completed-event guardrail | Resolve DB-level guardrail checkbox. | [x] Confirmed current API/business layer enforces completed-event lock, `events:override_completed`, sequential status transitions, labor generation idempotency, and audit logs. [x] Decision: DB trigger is not necessary for #2 because Express is the sole database accessor and #31 already hardened direct client access/RLS; open a future issue only if product requires DB-level immutability. |
| B5 SRD sample verification | Make manual verification durable. | [x] Used Hana & Daniel Wedding sample from #2/SRD seed. [x] Added automated seed parity assertions for event, schedule, status, checklist, vehicle assignments, and allocation workspace data. [x] Evidence: `cd backend && bun test src/__tests__/srd-seed-parity.test.ts` passed 5 tests / 79 assertions. |

### Phase C: GitHub Closeout For #2

| Step | Checklist |
| :--- | :--- |
| Issue body cleanup | [x] Updated #2 unchecked boxes to checked where evidence supports it. [x] Left normalized client CRM and DB-level immutability trigger as future separate scope only if product explicitly requests it. |
| PR discipline | [x] Used `feature/2-event-lifecycle-reconcile`. [x] PR #72 referenced #2, included verification, and passed CI. |
| Final review | [x] Applied `docs/SENIOR_ISSUE_REVIEW_PROMPT.md`. [x] Ran targeted unit/integration/e2e checks. [x] Inspected diff for secrets/generated artifacts. |
| Closure | [x] Closed #2 after its body no longer had unchecked checklist items; GitHub issue #2 is currently closed. |
