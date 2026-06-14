# [Story] Event Profitability Reports

**Issue ID**: `STORY-5`
**Epic Link**: `[EPIC-2](epic_2_event_management.md)`
**Labels**: `type:story`, `area:reports`, `priority:p1`

---

## User Story

As the Owner, I want to view the event profitability report and financial dashboard, so that I can see the net profit per event, month, and year.

## Context

Only the Owner and Accountant roles have access to financial summaries. Other roles should get an access denied message if they try to view financial dashboards.

## Acceptance Criteria

- **Financial Dashboard (SC-02/SC-19)**:
  - View total revenues, total approved expenses, and net profit margins.
  - Interactive charts (using Chart.js or Recharts) showing trends over time.
- **Role-Based Access Control**:
  - Secure page and API endpoints. Non-permitted roles must not see the data.
- **Export Options**:
  - Export event profit statements as formatted PDF branded with the Dream Lux logo.

## Sub-Tasks

- [ ] Write backend API for monthly/yearly financial reporting.
- [ ] Build financial dashboard charts and filters.
- [ ] Implement PDF export wrapper with branding.
- [ ] Secure frontend routes with high-contrast warning overlays for non-permitted users.

## Verification Plan

### Automated
- API route tests checking that unauthorized roles get HTTP 403 Forbidden.

### Manual
- Log in as "Inventory Officer" and try to access `/reports/financial`. Confirm it redirects or shows an "Access Denied" screen.
- Log in as "Owner", open an event profitability view, and click "Export PDF". Verify the generated file features the Dream Lux branding and accurate sums.
