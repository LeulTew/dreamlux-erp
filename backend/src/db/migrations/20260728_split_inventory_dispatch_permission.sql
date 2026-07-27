-- Issue #213: separate allocation authoring from warehouse dispatch custody.
-- Idempotent and intentionally removes the legacy authoring grant from the two
-- inventory roles; custom roles keep their explicitly configured grants.

BEGIN;

INSERT INTO permissions (slug, description) VALUES
  ('event_allocations:dispatch', 'Check and dispatch existing event inventory allocations')
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug = 'event_allocations:dispatch'
WHERE LOWER(r.name) IN ('inventory_officer', 'inventory_controller', 'ops_manager', 'event_manager')
ON CONFLICT DO NOTHING;

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND LOWER(r.name) IN ('inventory_officer', 'inventory_controller')
  AND p.slug = 'event_allocations:write';

COMMIT;
