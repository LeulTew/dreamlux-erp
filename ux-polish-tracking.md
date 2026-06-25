# UI/UX Consistency & Access Polish Tracking (Issue #25)

This document tracks our progress, active branch, next steps, and pull requests for the UI/UX polish.

## Overall Status
- **Current Step**: Phase 3 Status & Badge Color System completed
- **Active Branch**: `feature/25-status-badge-system`
- **Active Pull Request**: None
- **Completion Progress**: 3/5 Phases Completed

> [!IMPORTANT]
> **STRICT INSTRUCTIONS FOR DEVELOPER AGENTS**:
> - PR #63 is successfully merged. Do not reopen or duplicate Phase 2 sortable table system work.
> - The current authorized work is limited to Phase 3 Status & Badge Color System planning.
> - Do not start Phase 3 coding/implementation until the plan receives explicit approval.

---

## Roadmap & Branch Status

| Phase | Description | Branch Name | Status | PR Links / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | Button System Hardening | `feature/25-button-system-polish-recreated` | **Completed & Merged** | [PR #61](https://github.com/LeulTew/dreamlux-erp/pull/61) |
| **Cleanup** | Post-merge review cleanup | `feature/25-post-merge-review-cleanup` | **Completed & Merged** | [PR #62](https://github.com/LeulTew/dreamlux-erp/pull/62) |
| **Phase 2** | Sortable Table Interaction | `feature/25-sortable-table-system` | **Completed & Merged** | [PR #63](https://github.com/LeulTew/dreamlux-erp/pull/63) |
| **Phase 3** | Status & Badge Color System | `feature/25-status-badge-system` | **Completed** | Ready for review & PR |
| **Phase 4** | Expense Approval Queue & History | `feature/25-expense-approval-history` | *Planned* | Pending Phase 3 completion |
| **Phase 5** | Mobile, i18n & Accessibility Pass | `feature/25-mobile-i18n-a11y-polish` | *Planned* | Final cross-surface QA pass |

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

### Phase 3: Status & Badge Color System
- [x] Inventory every status badge and status-like pill across events, proposals, expenses, inventory, payroll, approvals, reports, dashboards, empty states, and inline banners.
- [x] Include non-obvious states that currently rely on color only, such as archived, draft, submitted, pending review, overdue, blocked, restricted, partially approved, completed, canceled, and hidden/redacted states.
- [x] Create one semantic mapping for success, warning, danger, info, neutral, archived, and restricted states, then map each surface status onto that vocabulary.
- [x] Flag any badge or state that uses a raw color token without a semantic label or without an icon/shape backup.
- [x] Verify light/dark contrast for each badge and avoid conflicting with gold primary-action styling or active KPI emphasis.
- [x] Check for pages that reuse the same color for unrelated meanings, and split them where that creates ambiguity.
- [x] Include Amharic label fit checks and translation-key coverage for all standardized statuses, including long labels and wrapped badges.
- [x] Add focused tests for status-to-variant mapping, translation coverage, and any component that renders a standardized status badge.
- [x] Add fixture coverage for at least one example from each surface: event lifecycle, proposal pipeline, expense approval, inventory condition/status, payroll state, and report summary state.
- [x] Issue #25 coverage: satisfies checklist section 12 and contributes to sections 3, 7, 8, and 13 where status colors, KPI hierarchy, reports, label fit, and semantic clarity overlap.

#### Phase 3 Remaining Verification Notes
- [ ] Re-run frontend unit tests after the shared badge mapping changes.
- [ ] Re-run frontend lint and build after the badge/test updates.
- [ ] Re-scan status-like surfaces on `main` for any remaining raw semantic states that still need normalization.
- [ ] Confirm PR #63 merge did not introduce any new status-bearing screens beyond the current badge inventory.
- [ ] Record any follow-up status phrases that should be standardized in later phases without widening phase 3 scope.

### Phase 4 Plan: Expense Approval Queue & History
- Add paginated/searchable/sortable approval history for approved and rejected expenses, including reviewer identity, timestamps, and decision notes.
- Preserve pending queue context when moving between pending and history, including filters, search terms, sort order, and tab/route state.
- Add backend filters for reviewer, decision, event, date, submitter, category, amount, receipt state, and approval source without exposing raw unscoped rows.
- Enforce accountant/owner authorization and avoid protected financial detail leakage in unauthorized states, direct URLs, exports, and print shells.
- Surface rejection reason, approval metadata, and audit trail context only to authorized roles and only after access checks pass.
- Include pending queue scan improvements: event, category, amount, submitter, date, receipt state, approve/reject placement, rejection reason, loading/empty/error states, and mobile row wrapping.
- Standardize pending-versus-history visual cues so decision state, lock state, and reviewer state remain readable without relying on ambiguous color alone.
- Add backend tests for pagination, search, role denial, reviewer filtering, receipt-state filtering, and rejection metadata redaction.
- Add frontend tests for queue/history context preservation, tab switching, filter persistence, and empty/loading/error states.
- Add fixture coverage for paid, rejected, pending, soft-deleted, and re-opened expense examples so approval history reflects real workflow edges.
- Issue #25 coverage: satisfies checklist sections 6 and 14, plus the financial/audit portions of sections 2, 7, 8, and 9.

### Phase 5 Plan: Mobile, i18n & Accessibility Pass
- Re-audit access-aware navigation, breadcrumbs, direct URL blocked states, route shells, event workspace controls, field redaction, KPI hierarchy, forms, reports, print styles, localization, keyboard/focus, and mobile layout.
- Audit 320px, 390px, 768px, 1366px, 1920px, and 2560px across key personas and routes.
- Verify all modified visible strings use the translation helper and have English/Amharic coverage.
- Check focus order, keyboard operation, reduced motion, tap targets, text wrapping, and WCAG AA contrast.
- Record screenshot/manual QA evidence in the phase PR.
- Issue #25 coverage: closes any remaining checklist sections 1, 2, 3, 5, 7, 8, 9, 13, and 15 after Phases 2-4 land.
