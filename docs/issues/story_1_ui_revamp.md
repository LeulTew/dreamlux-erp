# [Story] UI & Contrast Revamp

**Issue ID**: `STORY-1`
**Epic Link**: `[EPIC-1](epic_1_dreamlux_rebrand.md)`
**Labels**: `type:story`, `area:rebranding`, `priority:p0`, `status:in-progress`

---

## User Story

As the Owner of Dream Lux, I want a premium and elegant user interface with clear contrast and elegant gold tones, so that the application represents our luxury event branding and remains highly accessible.

## Context

The current demo UI is generic and uses standard colors/borders. We need a modern, professional look that eliminates rounded pill styles and soft shadows, replacing them with crisp borders, minimal border-radius (6px-8px), elegant gold gradients, and strict WCAG contrast validation.

## Acceptance Criteria

- **Elegant Color Scheme**:
  - Gold accents (`#D4AF37`) used for key links, primary buttons, and borders.
  - Dark mode configured with deep charcoal/navy bases and gold/white text.
  - Tasteful gold gradients applied to main dashboard cards and login views.
- **Strict Visual Design Standards**:
  - No overly rounded corners (keep borders to standard `6px`-`8px` max).
  - Minimal to no box-shadows; use crisp `1px` high-contrast borders for separation.
  - Zero "AI slop" terminology, spaceship metaphors, or gamified layout blocks.
- **Contrast & Legibility (2026 Best Practices)**:
  - All text, icons, and SVG states (including active and hover indicators) must satisfy the WCAG AA minimum contrast ratio (4.5:1).
  - Hover states on lists and buttons must have a clear visual feedback state.

## Sub-Tasks

- [x] Modify `frontend/src/app/globals.css` with the gold/slate design system tokens.
- [x] Refactor `frontend/src/components/NavBar.tsx` to match the new contrast and typography layout.
- [x] Clean up pages to remove generic placeholders and align visual styling.
- [x] Implement bilingual support (Amharic & English) toggle in navigation.
- [/] Redesign desktop layout to float page content inside a curved inset card, and move settings into the account dropdown.
- [/] Document and architecture the scalable, role-specific action notification system.

## Verification Plan

### Automated
- Execute frontend compilation checks (`bun run build` in `frontend`).
- Run linter checks (`bun run lint`).

### Manual
- Inspect color contrast using browser accessibility tools.
- Verify desktop and mobile layouts down to 320px width.
- Check hover states on all menu items, tabs, and action items.

---

## Scalable Notification & Audit Log Specification

To support notifications that scale across any user-triggered actions and remain customizable based on individual user IDs and specific organizational roles, the system uses a dual-table schema in PostgreSQL with a publish-subscribe reactive event processor.

### 1. Database Schema

```sql
-- Centralized notification trigger record (one per system event)
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- 'payroll_created', 'asset_low_stock', 'employee_added', etc.
    action_url TEXT, -- Client routing path (e.g. '/assets/reconcile')
    triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    target_role TEXT, -- Filter for role-based broadcast (e.g. 'ACCOUNTANT')
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- User-specific notification inbox (handles read state per user)
CREATE TABLE notification_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false NOT NULL,
    read_at TIMESTAMPTZ,
    CONSTRAINT unique_user_notification UNIQUE(user_id, notification_id)
);

CREATE INDEX idx_notif_recipients_user ON notification_recipients(user_id) WHERE is_read = false;
```

### 2. Scalable Routing Logic

When an action is logged to the database (e.g. via audit log triggers), a database trigger or a backend service function handles routing:
1. **Direct Notification (User Specific)**: If the action targets a specific user (e.g. a manager requests an approval from a specific supervisor), the system inserts a record directly in `notification_recipients` for that `user_id`.
2. **Role-Based Broadcast (Role Specific)**: If the action targets a role (e.g. an expense report is submitted requiring review by any `ACCOUNTANT` or `SUPER_ADMIN`), the system queries active users belonging to the target role:
   ```sql
   INSERT INTO notification_recipients (notification_id, user_id)
   SELECT new_notification_id, u.id
   FROM profiles u
   WHERE u.role_name = target_role;
   ```
3. **Performance Optimization (Scale)**: Inboxes are queried on demand. Real-time updates are pushed via Supabase Realtime (WebSockets) listening to insertions on `notification_recipients` filtered by `user_id = auth.uid()`. This provides low-latency delivery while database queries remain efficient.

### 3. Audit Log Projection

All notifications are transient pointers derived from the permanent `audit_logs` table (the immutable ledger of record). This ensures the notification system can scale up without degrading audit compliance, and can easily rebuild notifications at any time by reading the audit trail.
