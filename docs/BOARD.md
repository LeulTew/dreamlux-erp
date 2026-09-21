# Dream Lux ERP Project Board

This document represents the project board mapping our user stories, tasks, and research. You can click on the linked issue titles to view the complete details and acceptance criteria.

---

## Board Configuration

- **Target Release**: Phase 1: Rebranded Event ERP MVP
- **Scrum Master**: Antigravity AI Delivery Agent
- **Key Epics**:
  - `EPIC-1`: [Dream Lux Rebranding & Styling](issues/epic_1_dreamlux_rebrand.md)
  - `EPIC-2`: [Pillar 3: Event Management](issues/epic_2_event_management.md)

---

## Sprint Board Columns

| Inbox (Backlog)                                                                                  | Ready (To Do)                                                                                    | In Progress | Review | QA  | Done                                               |
| :----------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- | :---------- | :----- | :-- | :------------------------------------------------- |
| [STORY-3: Employee & Vehicle Schedules](issues/story_3_employee_vehicle.md) <br> `priority:p1`    |                                                                                                  | [ISSUE-143: Remove localStorage JWT](issues/issue_143_localStorage_JWT_removal.md) <br> `priority:p0`            |        |     | [TASK-0: Base Setup & Spec Cleaning] `priority:p0` <br> [STORY-1: UI & Contrast Revamp (GH-#1)](https://github.com/LeulTew/dreamlux-erp/issues/1) <br> `priority:p0` <br> [STORY-2: Core Event Lifecycle (GH-#2)](https://github.com/LeulTew/dreamlux-erp/issues/2) <br> `priority:p0` |
| [STORY-4: Expenses Entry & Approvals](issues/story_4_expenses_reconciliation.md) <br> `priority:p1` |                                                                                                  |             |        |     |                                                    |
| [STORY-5: Event Profitability Reports](issues/story_5_profitability_reports.md) <br> `priority:p1` |                                                                                                  |             |        |     |                                                    |

---

## Functionality audit tracking

[Issue #268: Restore atomic condition resolutions](https://github.com/LeulTew/dreamlux-erp/issues/268)
holds the current implementation status, acceptance evidence, and postmerge
verification for unavailable equipment stock.

[Issue #273: Return correction integrity and availability parity](https://github.com/LeulTew/dreamlux-erp/issues/273)
tracks the source-only correction repair and its independent native/browser
evidence. [The correction contract](return-correction-parity.md) preserves
DreamLux's global reservation policy and documents unconfirmed-commit recovery.
Merge and all live release steps remain separate review gates.

## Active Label Legend

- `type:epic`: Large features spanning multiple milestones.
- `type:story`: End-user vertical slices.
- `type:task`: Pure engineering or configuration setups.
- `priority:p0`: Critical path; blocks MVP launch.
- `priority:p1`: High value; post-MVP target.
- `priority:p2`: Desirable; backlogged.
- `area:rebranding`: UI theme, gold palette, styling layout, contrast checks.
- `area:events`: Event models, multi-day scheduling, conflict detection.
- `area:vehicles`: Vehicle fleet inventory, fuel tracking logs.
- `area:expenses`: Ad-hoc expense logging, approval queues.
- `area:reports`: Profitability dashboards, exports.
