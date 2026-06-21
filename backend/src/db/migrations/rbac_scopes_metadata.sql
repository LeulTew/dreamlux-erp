-- 1. Optional User Access Scopes Table (Gaps 1.5)
CREATE TABLE IF NOT EXISTS user_access_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    scope_type TEXT NOT NULL, -- e.g. 'branch', 'store', 'office', 'event-team'
    scope_id TEXT NOT NULL, -- UUID or simple string identifier
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_user_access_scopes_user_id
    ON user_access_scopes(user_id);

CREATE INDEX IF NOT EXISTS idx_user_access_scopes_scope
    ON user_access_scopes(scope_type, scope_id);

-- 2. Field Permissions Metadata Table (Gaps 1.6)
CREATE TABLE IF NOT EXISTS field_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    module TEXT NOT NULL, -- 'events', 'employees', 'payroll'
    field_name TEXT NOT NULL, -- 'contract_price', 'estimated_design_cost', 'phone', etc.
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (role_id, module, field_name)
);

CREATE INDEX IF NOT EXISTS idx_field_permissions_role_module
    ON field_permissions(role_id, module);

CREATE INDEX IF NOT EXISTS idx_field_permissions_module_field
    ON field_permissions(module, field_name);

-- 3. Seed Default Field Permissions matching current hardcoded redaction logic
-- For DRIVER role, hide sensitive event/department fields
INSERT INTO field_permissions (role_id, module, field_name, is_visible)
SELECT r.id, 'events', 'contract_price', FALSE
FROM roles r WHERE LOWER(r.name) IN ('driver', 'viewer', 'sales_rep')
ON CONFLICT (role_id, module, field_name) DO UPDATE SET is_visible = EXCLUDED.is_visible;

INSERT INTO field_permissions (role_id, module, field_name, is_visible)
SELECT r.id, 'events', 'estimated_design_cost', FALSE
FROM roles r WHERE LOWER(r.name) IN ('driver', 'viewer', 'sales_rep')
ON CONFLICT (role_id, module, field_name) DO UPDATE SET is_visible = EXCLUDED.is_visible;

-- For OPS_MANAGER / EVENT_MANAGER role, hide contract price
INSERT INTO field_permissions (role_id, module, field_name, is_visible)
SELECT r.id, 'events', 'contract_price', FALSE
FROM roles r WHERE LOWER(r.name) IN ('ops_manager', 'event_manager')
ON CONFLICT (role_id, module, field_name) DO UPDATE SET is_visible = EXCLUDED.is_visible;
