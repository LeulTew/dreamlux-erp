# UI/UX Consistency & Access Polish Tracking (Issue #25)

This document tracks our progress, active branch, next steps, and pull requests for the UI/UX polish.

## Overall Status
- **Current Step**: Phase 6 E2E Regression, Report Redaction & Snapshots
- **Active Branch**: `main`
- **Active Pull Request**: None
- **Completion Progress**: 5/6 Phases Completed

> [!NOTE]
> **Temp/scratch cleanup**: Confirmed no temp JS/TS files exist in the repository. All scratch artifacts are outside the repo. Worktree is clean on `main`.

---

## Roadmap & Branch Status

| Phase | Description | Branch Name | Status | PR Links / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | Button System Hardening | `feature/25-button-system-polish-recreated` | **Completed & Merged** | [PR #61](https://github.com/LeulTew/dreamlux-erp/pull/61) |
| **Cleanup** | Post-merge review cleanup | `feature/25-post-merge-review-cleanup` | **Completed & Merged** | [PR #62](https://github.com/LeulTew/dreamlux-erp/pull/62) |
| **Phase 2** | Sortable Table Interaction | `feature/25-sortable-table-system` | **Completed & Merged** | [PR #63](https://github.com/LeulTew/dreamlux-erp/pull/63) |
| **Phase 3** | Status & Badge Color System | `feature/25-status-badge-system` | **Completed & Merged** | [PR #64](https://github.com/LeulTew/dreamlux-erp/pull/64) — badge system, compact mode, center-align fix |
| **Phase 4** | Expense Approval Queue & History | `feature/25-expense-approval-history` | **Completed & Merged** | [PR #65](https://github.com/LeulTew/dreamlux-erp/pull/65) |
| **Phase 5** | Mobile, i18n & Accessibility Pass | `feature/25-mobile-i18n-a11y-polish` | **Completed & Merged** | [PR #66](https://github.com/LeulTew/dreamlux-erp/pull/66) |
| **Phase 6** | E2E Regression, Report Redaction & Snapshots | `feature/25-e2e-regression-snapshots` | **Planned** | Backend regression, snapshots & final issue signoff |

---

## Detailed Progress Log

### Phase 1: Button System Hardening
- [x] Create branch `feature/25-button-system-polish-recreated`
- [x] Audit and replace raw `<button>` HTML elements with `<Button>` component or styled Tailwind classes.
- [x] Standardize variants (default, outline, secondary, ghost, destructive, link) and sizes (xs, sm, default, lg, icon).
- [x] Ensure proper states: default, hover, focus-visible, active, disabled, loading.
- [x] Fix touch targets on mobile (min 48px where practical).
- [x] Add accessible tooltip/label support for icon-only buttons.
- [x] Verify `frontend` build, lint, and tests pass.
- [x] Commit & push branch, create PR placeholder.

### Post-Merge Review Cleanup
- [x] Confirm PR #61 is merged into `main`.
- [x] Remove temporary PR body files from the repository.
- [x] Type backend settings update payload without `any`.
- [x] Re-run full repo lint, tests, and build after cleanup.
- [x] Create and merge a focused cleanup PR after CI passes.

### Phase 2 Plan: Sortable Table Interaction
- [x] Add backend sort-field allowlist coverage for `GET /employees`.
- [x] Add backend sort-field allowlist coverage for `GET /payroll/runs`.
- [x] Add backend tests for malicious/unsupported employee and payroll run sort fields.
- [x] Remove stale temp PR body artifact unrelated to the active Phase 2 branch.
- [x] Run backend targeted tests once Bun is available in the local environment.
- [x] Run full backend `bun test`, `bun run lint`, and `bun run build`.
- [x] Run full frontend `bun test`, `bun run lint`, and `bun run build` after frontend table work lands.
- [x] Verify GitHub Actions checks on the Phase 2 PR.
- [x] Build a shared `SortableTableHeader`/header-cell pattern that can be reused by page tables and TanStack tables without changing unrelated row rendering.
- [x] Start with the surfaces already carrying sort state or table density: Events list, Employees list/report, Assets list/report, Payroll history, and profit/report tables where sorting is already meaningful.
- [x] Preserve current filters, search, saved views, pagination, and URL query parameters when sort changes.
- [x] Keep server-side sorting for paginated or large datasets; only use client-side sorting when the dataset is already bounded in memory.
- [x] Keep backend allowlists explicit for every sortable column to avoid SQL injection or accidental sort exposure on finance data.
- [x] Add unit tests for sort-state transitions, accessibility labels, and query-param preservation.
- [x] Add integration tests for at least one backend endpoint with allowed/disallowed sort fields.
- [x] Add frontend component tests for the reusable header and one representative table page.
- [x] Add Playwright/e2e coverage / manual QA verification for desktop and mobile flows that changes sort and preserves filters/pagination.
- [x] Add mock data / unit test fixtures to prove stable ordering and no reset of search/filter state.
- [x] Issue #25 coverage: satisfies checklist section 11 and supports section 5 table responsiveness without taking on badge/history/mobile scope.

### Phase 3: Status & Badge Color System — ✅ Completed & Merged (PR #64)
- [x] Inventory every status badge and status-like pill across events, proposals, expenses, inventory, payroll, approvals, reports, dashboards, empty states, and inline banners.
- [x] Include non-obvious states that currently rely on color only, such as archived, draft, submitted, pending review, overdue, blocked, restricted, partially approved, completed, canceled, and hidden/redacted states.
- [x] Create one semantic mapping for success, warning, danger, info, neutral, archived, and restricted states, then map each surface status onto that vocabulary.
- [x] Flag any badge or state that uses a raw color token without a semantic label or without an icon/shape backup.
- [x] Verify light/dark contrast for each badge and avoid conflicting with gold primary-action styling or active KPI emphasis.
- [x] Check for pages that reuse the same color for unrelated meanings, and split them where that creates ambiguity.
- [x] Include Amharic label fit checks and translation-key coverage for all standardized statuses, including long labels and wrapped badges.
- [x] Add focused tests for status-to-variant mapping, translation coverage, and any component that renders a standardized status badge.
- [x] Add fixture coverage for at least one example from each surface: event lifecycle, proposal pipeline, expense approval, inventory condition/status, payroll state, and report summary state.
- [x] Status badge compact on medium screens (text hidden md, shown lg).
- [x] Status column centered in Events and Proposals tables (fix: commit `c61a175`).
- [x] Issue #25 coverage: satisfies checklist section 12 and contributes to sections 3, 7, 8, and 13 where status colors, KPI hierarchy, reports, label fit, and semantic clarity overlap.

### Phase 4: Expense Approval Queue & History — ✅ PR #65 Created (Draft)
- [x] Upgrade `GET /events/expenses/pending` to server-side paginated (`page`, `limit`, `search`, `category`, `date_from`, `date_to`, `amount_min`, `amount_max`)
- [x] Return `{ data, total, page, totalPages }` from pending endpoint (not raw array)
- [x] Add new `GET /events/expenses/history` endpoint (Approved + Rejected, same auth guard)
- [x] History supports server-side: `page`, `limit`, `search`, `category`, `status`, `reviewer` search, `date_from`, `date_to`, `amount_min`, `amount_max`
- [x] History sort allowlist: `amount`, `created_at`, `approved_at`, `category`, `event_name`
- [x] Join `approved_by_name` from users table on history endpoint
- [x] Backend tests: 403 for non-accountant on both endpoints
- [x] Backend tests: pagination, category filter, status filter for history
- [x] Backend tests: `Pending` rows never appear in history response
- [x] Update `getPendingEventExpenses(params)` to accept filter/page params
- [x] Add `getExpenseHistory(params)` calling new history endpoint
- [x] Add `PaginatedExpenseResponse` type to `types.ts`
- [x] Add two-tab layout: "Pending Queue" and "History"
- [x] Tab state driven by `?tab=history` URL query param
- [x] Pending tab: search bar + category dropdown + date-range + amount-range filters, all URL-param driven
- [x] History tab: same filters + status dropdown (`Approved` / `Rejected`) + reviewer search
- [x] Filters preserved when switching between tabs
- [x] Server-side pagination with `PaginationControls` on both tabs
- [x] History tab uses sortable table layout (`SortableHeader`) with columns: Event, Category, Amount, Submitter, Reviewer, Decision (StatusBadge), Date Reviewed, Reason
- [x] Pending tab: card layout retained and improved (show date submitted, receipt indicator)
- [x] Empty, loading, error states for both tabs (no protected data flash on error)
- [x] Full bilingual translations (English + Amharic) for all new strings
- [x] Frontend tests: tab renders by default (Pending), switches on URL param
- [x] Frontend tests: filters update API query params
- [x] Frontend tests: approve/reject actions call correct mutations
- [x] Frontend tests: reject without reason shows toast error, blocks mutation
- [x] Frontend tests: empty state, loading skeleton render correctly
- [x] Frontend tests: bilingual rendering with `lang=am`
- [x] `bun run lint` — 0 errors
- [x] `bun run build` — builds clean
- [x] `bun run test` — all tests pass
- [x] Manual: approve expense → moves from Pending to History as `Approved`
- [x] Manual: reject with reason → moves to History as `Rejected` with reason shown
- [x] Manual: reject without reason → toast fires, no mutation
- [x] Manual: non-accountant redirect tested
- [x] Manual: 320px mobile layout readable
- [x] Create PR using template and reference Issue #25
- [x] Tick §6 and §14 checkboxes on Issue #25 after PR is merged

### Phase 5: Mobile, i18n & Accessibility Pass — ✅ Completed & Merged (PR #66)
- [x] Re-audit access-aware navigation, breadcrumbs, direct URL blocked states, route shells, event workspace controls, field redaction, KPI hierarchy, forms, reports, print styles, localization, keyboard/focus, and mobile layout.
- [x] Audit 320px, 390px, 768px, 1024px, 1366px, 1920px, and 2560px across key personas and routes.
- [x] Verify all modified visible strings use the translation helper and have English/Amharic coverage.
- [x] Check focus order, keyboard operation, reduced motion, tap targets, text wrapping, and WCAG AA contrast.
- [x] Add frontend regression tests for access-aware sidebar filtering and empty group suppression.
- [x] Add frontend regression tests for shell-state redaction.
- [x] Add UI tests for event workspace control visibility by role and field permission.
- [x] Add Amharic overflow checks for long labels in sidebars, tabs, tables, and action buttons.

### Phase 6 Plan: E2E Regression, Report Redaction & Snapshots
- [ ] Add backend regression tests for permission-aware navigation, route guards, and direct URL blocked states.
- [ ] Add UI tests for report/print redaction states and hidden KPI shells.
- [ ] Add responsive snapshot coverage for 320px and 390px mobile layouts.
- [ ] Record screenshot/manual QA evidence in the phase PR.
- [ ] Issue #25 coverage: closes the remaining checklist sections 1, 2, 3, 5, 7, 8, 9, 13, and 15 after final regression suites land.
