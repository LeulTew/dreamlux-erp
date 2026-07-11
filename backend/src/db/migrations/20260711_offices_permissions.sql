-- Create offices permissions and map offices:read to inventory roles.

INSERT INTO permissions (slug, description) VALUES
  ('offices:read', 'View offices and store locations'),
  ('offices:manage', 'Manage offices and store locations')
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug = 'offices:read'
WHERE LOWER(r.name) IN ('inventory_officer', 'inventory_controller')
ON CONFLICT DO NOTHING;
