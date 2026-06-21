## Summary

This PR implements the remaining frontend/UI requirements for Issue #33 of `dreamlux-erp` (Advanced Event List, Intake Proposal, & Profit Report UI). Key visual and functional deliverables include:
- **Events List Toolbar & Advanced Filter Drawer**: A single unified, responsive toolbar featuring compact search, saved view selector (personal/role/global dropdown actions), quick interval filters, and advanced filters builder inside a responsive bottom sheet (mobile) / right drawer (desktop) using the shared `ResponsiveDrawer` component.
- **Guided Import Wizard**: A multi-step interactive modal wizard supporting templates download, client-side validation, server-side previewing with row-error highlights, and batch commits.
- **Role-Safe profit/operational columns**: Hides or renders lock icons (`[🔒 Restricted]`) on event financial fields if the user lacks `reports:profit:read` permission.
- **Event Intake & Proposal Management**:
  - Proposal pipeline queue page with KPI summary cards.
  - Three-step progressive form wizard with live calculations (Design, Team, Trip, Other cost estimators) and a sticky live margin risk warning banner.
  - Detailed proposal workspace with estimate sheets, status actions (Submit, Approve, Reject modal, and Convert modal with status transition logs).
- **Profit Analytics Dashboard**: Refactored dashboard with Monthly, Event Type, Category Cost, and Proposal Variance tabs, direct drill-downs, and Excel/CSV export features.
- **Print Layout Style Sheets**: Tailored print-friendly layouts removing navigation chrome for high-fidelity PDF output.
- **Localization**: Symmetrical English/Amharic translations for all newly added UI text.

## Linked Issue

Closes #33

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [x] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Database migration (introduces schema alterations or indexes)
- [ ] Documentation update

## Verification & QA

- [x] Code compiles without TypeScript errors (`bun run build` or equivalent)
- [x] Linter passes without warnings or errors (`bun run lint`)
- [x] Unit tests pass successfully (`bun test`)
- [ ] Dry-run migration performed locally (for schema changes)

### Visual Evidence (for UI changes)
- Verified viewport sizing down to 320px for the Events List, Proposals list/form/workspace, and Profit Reports page.
- Checked Amharic text overflow protection.
- Print stylesheet verified for events proposal invoice style sheets and profitability drilldowns.

## Data / Migration Notes
N/A (Uses existing merged backend endpoints)

## Deployment Notes
N/A

## AI Usage & Self-Audit

- Were any AI prompts modified? No.
- Did you follow the codebase structure rules in `.github/ai_templates/agent_structure.md`? Yes.
- Did you verify that tap targets are at least 48px high on mobile views? Yes.
