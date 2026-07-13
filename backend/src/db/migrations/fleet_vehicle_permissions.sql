-- Issue #147: Fleet vehicle registry permissions.
-- Adds dedicated vehicle registry permission slugs and grants them to roles.
-- Idempotent: safe to re-run. Mirrors ROLE_PERMISSION_SEEDS in
-- backend/src/lib/permissions.ts (which also applies these as a runtime floor).

-- 1. Register the permission slugs.
INSERT INTO permissions (slug, description) VALUES
  ('vehicles:read', 'View the fleet vehicle registry'),
  ('vehicles:write', 'Create, update, archive, and restore fleet vehicles'),
  ('vehicles:delete', 'Permanently delete fleet vehicles without assignment history')
ON CONFLICT (slug) DO NOTHING;

-- 2. Grant to roles by normalized name.
--    ops_manager: full manage;  event_manager / inventory_*: read only.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE (
    (UPPER(r.name) = 'OPS_MANAGER' AND p.slug IN ('vehicles:read', 'vehicles:write', 'vehicles:delete'))
    OR (UPPER(r.name) = 'EVENT_MANAGER' AND p.slug = 'vehicles:read')
    OR (UPPER(r.name) = 'INVENTORY_CONTROLLER' AND p.slug = 'vehicles:read')
    OR (UPPER(r.name) = 'INVENTORY_OFFICER' AND p.slug = 'vehicles:read')
  )
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
