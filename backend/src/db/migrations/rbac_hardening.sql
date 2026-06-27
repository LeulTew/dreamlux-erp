-- RBAC Hardening: Professional Roles & Permissions System
-- Run: bun run src/db/migrate-rbac.ts

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Ensure roles table has JSON permissions for legacy JWT compatibility
ALTER TABLE roles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';

-- 2. Ensure permission catalog tables
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

-- 3. Seed permissions
INSERT INTO permissions (slug, description) VALUES
    ('assets:read', 'Can view asset lists and details'),
    ('assets:write', 'Can create and edit assets'),
    ('assets:delete', 'Can soft-delete assets'),
    ('assets:reconcile', 'Can perform monthly quantity audits'),
    ('users:manage', 'Can manage user accounts and roles'),
    ('settings:write', 'Can update system settings'),
    ('hr:read', 'Can view HR records'),
    ('hr:write', 'Can create and modify HR records'),
    ('departments:manage', 'Can manage departments'),
    ('salary-levels:manage', 'Can manage salary levels'),
    ('payroll:read', 'Can view payroll runs and payroll exports'),
    ('payroll:write', 'Can create and update payroll runs'),
    ('events:read', 'Can view events and event types'),
    ('events:write', 'Can create and update events and event types'),
    ('events:delete', 'Can delete, restore, and permanently remove events or event types'),
    ('events:override_completed', 'Can modify completed events and restricted status transitions'),
    ('event_allocations:write', 'Can create and release event inventory allocations'),
    ('event_checklist:write', 'Can create and update event checklist items'),
    ('event_assignments:write', 'Can assign employees to events and manage attendance'),
    ('vehicle_assignments:write', 'Can assign vehicles and drivers to events'),
    ('exports:read', 'Can export inventory, employee, and payroll data'),
    ('reports:profit:read', 'Can view profit and profitability reports'),
    ('trips:create', 'Can create event trip logs and generated fuel expenses'),
    ('expenses:write', 'Can create manual event expenses'),
    ('expenses:labor_generate', 'Can generate labor expenses from attended event assignments'),
    ('expenses:approve', 'Can approve expenses'),
    ('approvals:history:read', 'Can view approval history')
ON CONFLICT (slug) DO NOTHING;

-- 4. Seed/normalize roles
INSERT INTO roles (name, description, permissions) VALUES
    ('SUPER_ADMIN', 'Full system access', '{"all": true}'),
    ('admin', 'Full system access', '{"all": true}'),
    ('INVENTORY_CONTROLLER', 'Inventory management and auditing', '{"assets": ["read", "write", "reconcile", "delete"]}'),
    ('inventory_controller', 'Inventory management and auditing', '{"assets": ["read", "write", "reconcile", "delete"]}'),
    ('SYSTEM_MANAGER', 'Can manage users and settings', '{"users": ["manage"], "settings": ["write"]}'),
    ('system_manager', 'Can manage users and settings', '{"users": ["manage"], "settings": ["write"]}'),
    ('viewer', 'Read-only access to assets', '{"assets": ["read"]}'),
    ('SALES_REP', 'Read-only inventory access', '{"assets": ["read"]}'),
    ('HR_MANAGER', 'Can manage employees and departments', '{"hr": ["read", "write"]}'),
    ('OWNER', 'Business owner with full system access', '{"all": true}'),
    ('OPS_MANAGER', 'Can manage event operations', '{"events": ["read", "write", "delete"], "assets": ["read"]}'),
    ('EVENT_MANAGER', 'Can manage assigned event operations', '{"events": ["read", "write"], "assets": ["read"]}'),
    ('INVENTORY_OFFICER', 'Can manage inventory operations', '{"assets": ["read", "write", "reconcile"]}'),
    ('ACCOUNTANT', 'Can manage payroll, approvals, and profitability reports', '{"payroll": ["read", "write"], "reports": ["profit:read"]}'),
    ('DRIVER', 'Can view assigned events and log trips', '{"events": ["read"], "trips": ["create"]}')
ON CONFLICT (name) DO NOTHING;

-- Upgrade legacy inventory permission payloads to assets namespace
UPDATE roles
SET permissions = '{"assets": ["read", "write", "reconcile", "delete"]}'::jsonb
WHERE LOWER(name) IN ('inventory_controller')
    AND (
        permissions IS NULL
        OR permissions = '{}'::jsonb
        OR permissions ? 'inventory'
    );

-- 5. Permission mappings
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON TRUE
WHERE LOWER(r.name) IN ('super_admin', 'admin', 'owner')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('assets:read', 'assets:write', 'assets:reconcile', 'assets:delete', 'exports:read')
WHERE LOWER(r.name) IN ('inventory_controller')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('users:manage', 'settings:write')
WHERE LOWER(r.name) IN ('system_manager')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('assets:read', 'events:read')
WHERE LOWER(r.name) IN ('viewer', 'sales_rep')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('hr:read', 'hr:write', 'departments:manage', 'salary-levels:manage', 'exports:read')
WHERE LOWER(r.name) IN ('hr_manager')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('assets:read', 'assets:write', 'assets:reconcile', 'exports:read')
WHERE LOWER(r.name) IN ('inventory_officer')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('assets:read', 'events:read', 'events:write', 'events:delete', 'events:override_completed', 'event_allocations:write', 'event_checklist:write', 'event_assignments:write', 'vehicle_assignments:write', 'trips:create', 'expenses:write', 'expenses:labor_generate', 'exports:read', 'approvals:history:read')
WHERE LOWER(r.name) IN ('ops_manager')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('assets:read', 'events:read', 'events:write', 'event_checklist:write', 'event_assignments:write', 'vehicle_assignments:write', 'trips:create', 'expenses:write')
WHERE LOWER(r.name) IN ('event_manager')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('payroll:read', 'payroll:write', 'exports:read', 'reports:profit:read', 'events:override_completed', 'expenses:write', 'expenses:labor_generate', 'expenses:approve', 'approvals:history:read')
WHERE LOWER(r.name) IN ('accountant')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('events:read', 'trips:create')
WHERE LOWER(r.name) IN ('driver')
ON CONFLICT DO NOTHING;

-- 6. Permission cache invalidation notifications
-- Backend instances LISTEN on this channel and clear in-memory permission caches
-- when role assignments or role permission mappings change.
CREATE OR REPLACE FUNCTION notify_permissions_changed()
RETURNS TRIGGER AS $$
DECLARE
    changed_user_id TEXT;
BEGIN
    IF TG_TABLE_NAME = 'users' THEN
        changed_user_id := COALESCE(NEW.id::TEXT, OLD.id::TEXT);
        PERFORM pg_notify(
            'dreamlux_permissions_changed',
            json_build_object('scope', 'user', 'userId', changed_user_id, 'reason', TG_TABLE_NAME || ':' || TG_OP)::TEXT
        );
    ELSE
        PERFORM pg_notify(
            'dreamlux_permissions_changed',
            json_build_object('scope', 'all', 'reason', TG_TABLE_NAME || ':' || TG_OP)::TEXT
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_user_permissions_changed ON users;
CREATE TRIGGER trg_notify_user_permissions_changed
AFTER INSERT OR UPDATE OF role_id, role_ids, is_active OR DELETE ON users
FOR EACH ROW
EXECUTE FUNCTION notify_permissions_changed();

DROP TRIGGER IF EXISTS trg_notify_roles_permissions_changed ON roles;
CREATE TRIGGER trg_notify_roles_permissions_changed
AFTER INSERT OR UPDATE OF name, permissions OR DELETE ON roles
FOR EACH ROW
EXECUTE FUNCTION notify_permissions_changed();

DROP TRIGGER IF EXISTS trg_notify_role_permissions_changed ON role_permissions;
CREATE TRIGGER trg_notify_role_permissions_changed
AFTER INSERT OR UPDATE OR DELETE ON role_permissions
FOR EACH ROW
EXECUTE FUNCTION notify_permissions_changed();
