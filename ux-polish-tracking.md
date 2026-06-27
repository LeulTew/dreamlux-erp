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
| Active branch | `feature/2-event-lifecycle-reconcile` | Reconciliation branch for #2 checklist closeout. |
| #25 UX polish | Closed | PR #71 merged; final E2E portability evidence posted on #25. |
| #2 Core Event Lifecycle | In progress | GitHub automation reopened it because historical checklist boxes remain unchecked in the issue body. Treat it as a separate reconciliation/completion track. |
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
| E2E portability follow-up | TBD | In progress | Move Playwright off occupied port 3100 and replace OS-specific screenshot baselines with deterministic mobile layout assertions. |

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
- [ ] Commit with prefix message.
- [ ] Push branch.
- [ ] Create PR with issue link, checklist, verification, and senior review notes.
- [ ] Verify GitHub Actions.
- [ ] Merge PR after checks are clean.
- [ ] Pull fast-forward `main`.
- [ ] Confirm #25 remains closed or close it with final 100% E2E comment.

## Issue #2 Core Event Lifecycle Plan

Issue: https://github.com/LeulTew/dreamlux-erp/issues/2

Reason this remains open: the issue body still has unchecked checklist items. A previous reconciliation comment is here: https://github.com/LeulTew/dreamlux-erp/issues/2#issuecomment-4820820988, but automation reopened the issue because the body itself still contains unchecked boxes.

### Phase A: Reconcile Current Main Against #2 Body

| Checklist item | Current evidence | Status | Next action |
| :--- | :--- | :--- | :--- |
| Explicit package/design path | `package_design_notes`, `estimated_design_cost`, `PATCH /events/:id/design`, proposals conversion, imports, event detail UI. | Likely complete | Update #2 body checklist or PR docs with exact file/test references. |
| Client table planning | Snapshot fields exist; normalized clients table is not implemented. | Partially complete | Decide whether to document snapshot-only strategy or create a focused client CRM issue. |
| Completed-event guardrails | API lock, override permission, transition checks, audit tests exist. DB-level completed immutability trigger does not. | Partially complete | Document API-layer enforcement or implement DB trigger if product wants database-level guardrail. |
| Permission slug checks | `events:read`, `events:write`, `events:delete`, `events:override_completed` are used in backend/UI. | Likely complete | Add a focused #2 proof test if current tests do not directly assert read/write denial. |
| Stable detail payload | `GET /events/:id` and `/events/[id]` workspace exist. | Likely complete | Add/confirm contract-style backend test for shape stability. |
| Detail workspace | `/events/[id]` exists with operations, design, redaction-aware finance, and role-aware controls. | Complete | Reference #12/#25 PRs. |
| Package/design in create/edit | Detail workspace and proposals support design; compact create/edit drawer may not expose design directly. | Partially complete | Either add compact design field/placeholder to create/edit or update #2 to accept detail-workspace design editing. |
| Empty/loading/error and responsive/WCAG | #25 Phase 5/6 covers this broadly. | Likely complete | Attach evidence and E2E results after #25 portability PR merges. |
| Role alignment/redaction/audit/errors | Covered across #24/#25/#32/#33. | Likely complete | Add senior review matrix to #2 body/comment. |
| Permission/design/client tests/manual sample | Tests exist, but Hana & Daniel manual sample may not be documented as complete. | Partially complete | Run or document manual/sample-data verification, or add automated SRD sample test. |

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
| Issue body cleanup | [ ] Update #2 unchecked boxes to checked only where evidence supports it. [ ] Leave any true future scope as separate linked issues. |
| PR discipline | [ ] Use `feature/2-event-lifecycle-reconcile` only if code/tests/docs change outside this local tracker. [ ] PR must reference #2, include verification, and pass CI. |
| Final review | [ ] Apply `docs/SENIOR_ISSUE_REVIEW_PROMPT.md`. [ ] Run relevant unit/integration/e2e checks. [ ] Inspect diff for secrets/generated artifacts. |
| Closure | [ ] Close #2 only after its body no longer has unchecked checklist items or automation will reopen it again. |
