# [Story] Employee & Vehicle Schedules

**Issue ID**: `STORY-3`
**Epic Link**: `[EPIC-2](epic_2_event_management.md)`
**Labels**: `type:story`, `area:events`, `area:vehicles`, `priority:p1`

---

## User Story

As an Operations Manager, I want to assign employees and vehicles to events with conflict detection, so that teams and assets are not double-booked on overlapping event dates.

## Context

Managing logistics requires matching workers and drivers with trucks/cars. We need a system check that flags double-bookings on event days.

## Acceptance Criteria

- **Employee Assignment**:
  - Assign employees with a specific role for that event (e.g., Lead Decorator, Supervisor, Driver).
  - Validation: If employee is already assigned to another event on the same day(s), throw a conflict warning and block the assignment.
- **Vehicle fleet records**:
  - Store: Plate number, vehicle type (Truck, Van, Car), fuel consumption rate (liters/km), and assigned driver.
- **Conflict Checker**:
  - Real-time check run on frontend schedule selection and backed by database unique constraints/validation.

## Sub-Tasks

- [ ] Create `vehicles` and `event_assignments` tables in database.
- [ ] Implement backend API for checking employee/vehicle availability.
- [ ] Build employee scheduling grid showing availability status.
- [ ] Build Vehicle List and assignment interface.

## Verification Plan

### Automated
- Test suite verifying that overlapping event dates trigger conflict errors.

### Manual
- Create Event A and Event B on July 15, 2026. Assign employee "Abebe Girma" to Event A. Attempt to assign him to Event B and confirm it blocks the action.
