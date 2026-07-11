-- Issue #129: allow storekeeper inventory roles to operate dispatch checklist/departure flows.

INSERT INTO permissions (slug, description) VALUES
  ('event_allocations:write', 'Create and release event inventory allocations')
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug = 'event_allocations:write'
WHERE LOWER(r.name) IN ('inventory_officer', 'inventory_controller')
ON CONFLICT DO NOTHING;

-- Keep the documented QA/deployment inventory controller alias usable even when
-- the deployment only runs migrations and not the full dev seed script.
INSERT INTO users (username, password_hash, full_name, email, role_id, is_active)
SELECT
  'inventory_user',
  crypt('Password123', gen_salt('bf')),
  'Inventory Controller',
  'inventory.controller@dreamlux.com',
  r.id,
  true
FROM roles r
WHERE r.name = 'INVENTORY_CONTROLLER'
ON CONFLICT (username) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  role_id = EXCLUDED.role_id,
  is_active = TRUE,
  updated_at = NOW();
