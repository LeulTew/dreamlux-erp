# [Story] Core Event Lifecycle

**Issue ID**: `STORY-2`
**Epic Link**: `[EPIC-2](epic_2_event_management.md)`
**Labels**: `type:story`, `area:events`, `priority:p0`, `status:ready`

---

## User Story

As an Operations Manager, I want to create events with essential details (client, venue, date, price, type) and track them through their lifecycle (Planned → Ongoing → Completed), so that we can organize logistics and capture revenue data.

## Context

We need the basic tables and page layouts to support event creation. This forms the foundation of Pillar 3. Only the Owner and Accountant should be permitted to edit events after they are marked as "Completed".

## Acceptance Criteria

- **Database Structure**:
  - Create `events` table storing: ID, Name, Client ID, Event Type (Wedding, Graduation, Nikah, etc.), Start/End Dates, Start/End Times, Venue Location, Revenue (Contract Price), and Status (Planned, Ongoing, Completed).
  - Include event reconciliation log history (who updated what field and when).
- **Event Forms (SC-13)**:
  - Create dynamic entry form with validation.
  - Support multi-day event date ranges.
- **Access Restrictions**:
  - Event status transition: Planned → Ongoing → Completed.
  - If event is `Completed`, block non-admin/non-accountant edits on database level.

## Sub-Tasks

- [x] Write database migration to add `events` and `event_logs` tables.
- [x] Create backend API endpoints for event CRUD and status transitions.
- [x] Build the Event List (`/events`) page with status-colored tags.
- [x] Implement Create/Edit Event page in Next.js (`/events/create`).

## Verification Plan

### Automated
- Unit tests verifying event creation fields and date validations.
- Verify status transition rules (cannot revert Completed to Planned without Admin role).

### Manual
- Add a new multi-day event through the UI and verify it shows up on the dashboard list.
- Attempt to edit a completed event with an "Event Manager" login and check if it is blocked.
