-- Issue #145: Grant EVENT_MANAGER the event inventory allocation permission so the
-- role can complete the allocate -> dispatch-check -> depart workflow in the event
-- workspace. The dispatch/allocation endpoints require `event_allocations:write`
-- (see backend/src/routes/events.ts canManageDispatch / allocation handlers).
--
-- Idempotent: safe to re-run. Mirrors the code-level default in
-- backend/src/lib/permissions.ts ROLE_PERMISSION_SEEDS.event_manager.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE UPPER(r.name) = 'EVENT_MANAGER'
  AND p.slug = 'event_allocations:write'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
