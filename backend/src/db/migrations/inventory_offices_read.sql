-- Issue #178: seed parity — inventory roles need offices:read so the
-- Add Item / Clone office picker can load store locations. The runtime
-- default role maps (backend/src/lib/permissions.ts) already include this
-- slug; this migration aligns the database-driven role_permissions rows.
-- Idempotent: safe to re-run.

INSERT INTO permissions (slug, description)
VALUES ('offices:read', 'View offices and store locations')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug = 'offices:read'
WHERE r.name IN ('INVENTORY_OFFICER', 'INVENTORY_CONTROLLER')
ON CONFLICT DO NOTHING;
