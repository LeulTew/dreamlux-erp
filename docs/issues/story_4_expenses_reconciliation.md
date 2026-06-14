# [Story] Expenses Entry & Approvals

**Issue ID**: `STORY-4`
**Epic Link**: `[EPIC-2](epic_2_event_management.md)`
**Labels**: `type:story`, `area:expenses`, `priority:p1`

---

## User Story

As an Event Manager, I want to log real-time expenses (fuel, labor, rentals, consumables) during an event, and as an Accountant, I want to approve them so that event costs are verified and locked.

## Context

Financial auditing requires that every cent spent on-site is logged, categorized, and approved. Fuel cost is calculated dynamically using distance (km) and consumption rates.

## Acceptance Criteria

- **Dynamic Fuel Calculation**:
  - Trip logs store: vehicle, destination, starting km, ending km.
  - Expense auto-populates: Fuel Cost = (Distance Traveled * Consumption Rate) * Fuel Price per Liter (set in system settings).
- **Ad-Hoc Expenses**:
  - Form to enter: Category (Consumables, Rental, Logistics, etc.), Amount, Description, and Receipt Image.
- **Approval Workflow**:
  - Submissions are marked `Pending`.
  - Accountant / Owner reviews a queue and marks them `Approved` or `Rejected` (with comment).
  - Approved expenses are locked.

## Sub-Tasks

- [ ] Create `expenses` and `trip_logs` tables in database.
- [ ] Implement fuel expense calculator helper.
- [ ] Build expense entry modal inside Event Details view.
- [ ] Build Accountant Expense Approval Queue page.

## Verification Plan

### Automated
- Test case verifying fuel cost calculation logic.
- Verify state change permissions (only Accountant/Owner can toggle Pending -> Approved).

### Manual
- Log a trip of 50 km for a vehicle with 0.1 liters/km rate (5 liters). If fuel price is 100 ETB, verify that 500 ETB fuel expense is added to the event.
- Approve a pending expense and verify it is locked for modification.
