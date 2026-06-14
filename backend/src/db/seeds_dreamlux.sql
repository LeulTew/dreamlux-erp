-- Dream Lux ERP Seed Data
-- Run after schema.sql is successfully executed

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Insert Dream Lux Custom Roles & Permissions
INSERT INTO roles (name, description, permissions) VALUES
  ('OWNER', 'Owner / CEO with full system controls and financial view permissions', '{"all": true}'),
  ('OPS_MANAGER', 'Operations Manager with operational, HR, and assignment permissions', '{"hr": ["read", "write"], "assets": ["read", "write"], "events": ["read", "write", "assign"]}'),
  ('ACCOUNTANT', 'Accountant with financial, payroll, and expense approval permissions', '{"hr": ["read", "write"], "payroll": ["read", "run"], "expenses": ["approve"], "reports": ["read"]}'),
  ('EVENT_MANAGER', 'Event Manager with event creation, team visibility, and expense logging permissions', '{"events": ["read", "write"], "expenses": ["write"]}'),
  ('INVENTORY_OFFICER', 'Inventory Officer with store management and recount permissions', '{"assets": ["read", "write", "reconcile"]}')
ON CONFLICT (name) DO NOTHING;

-- 2. Insert Permissions & Role Mappings
INSERT INTO permissions (slug, description) VALUES
  ('events:read', 'View events list and details'),
  ('events:write', 'Create and update events'),
  ('events:assign', 'Assign staff and vehicles to events'),
  ('expenses:write', 'Log event expenses'),
  ('expenses:approve', 'Approve pending event expenses'),
  ('reports:read', 'View financial and profit reports')
ON CONFLICT (slug) DO NOTHING;

-- Map permissions to roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'OWNER' ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.slug IN ('events:read', 'events:write', 'events:assign', 'expenses:write')
WHERE r.name = 'OPS_MANAGER' ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.slug IN ('events:read', 'expenses:approve', 'reports:read')
WHERE r.name = 'ACCOUNTANT' ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.slug IN ('events:read', 'events:write', 'expenses:write')
WHERE r.name = 'EVENT_MANAGER' ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.slug IN ('assets:read', 'assets:write', 'assets:reconcile')
WHERE r.name = 'INVENTORY_OFFICER' ON CONFLICT DO NOTHING;

-- 3. Insert Initial Users
-- Password is 'Password123' for all accounts
INSERT INTO users (username, password_hash, full_name, email, role_id, is_active) VALUES
  ('ceo', crypt('Password123', gen_salt('bf')), 'Dream Lux CEO', 'owner@dreamlux.com', (SELECT id FROM roles WHERE name = 'OWNER'), true),
  ('ops', crypt('Password123', gen_salt('bf')), 'Operations Manager', 'ops@dreamlux.com', (SELECT id FROM roles WHERE name = 'OPS_MANAGER'), true),
  ('acc', crypt('Password123', gen_salt('bf')), 'Senior Accountant', 'accountant@dreamlux.com', (SELECT id FROM roles WHERE name = 'ACCOUNTANT'), true),
  ('eventmgr', crypt('Password123', gen_salt('bf')), 'Event Manager', 'events@dreamlux.com', (SELECT id FROM roles WHERE name = 'EVENT_MANAGER'), true),
  ('inv', crypt('Password123', gen_salt('bf')), 'Inventory Officer', 'store@dreamlux.com', (SELECT id FROM roles WHERE name = 'INVENTORY_OFFICER'), true)
ON CONFLICT (username) DO NOTHING;

-- 4. Seed Store Locations
INSERT INTO stores (name, is_active) VALUES
  ('Addis Ababa Central Store', true),
  ('Bole Storage Depot', true)
ON CONFLICT (name) DO NOTHING;

-- 5. Seed Item Categories
INSERT INTO categories (name)
SELECT val.name FROM (
  VALUES 
    ('Fabrics / Runners'),
    ('Flowers / Decoratives'),
    ('Lighting & Electrical'),
    ('Boards & Frames'),
    ('Setup Items'),
    ('Machines & Tools'),
    ('Cleaning & Packing')
) val(name)
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE categories.name = val.name);

-- 6. Seed Salary Grade Levels
INSERT INTO salary_levels (code, amount_etb, description, sort_order, is_active) VALUES
  ('GM-01', 70000.00, 'General Manager starting base salary', 1, true),
  ('OM-01', 35000.00, 'Operations Manager starting base salary', 2, true),
  ('PL-01', 14500.00, 'Planner starting base salary', 3, true),
  ('SK-01', 10000.00, 'Store Keeper starting base salary', 4, true),
  ('GL-01', 7000.00, 'Guard / Loader starting base salary', 5, true)
ON CONFLICT (code) DO NOTHING;

-- 7. Seed Sample Employee
INSERT INTO employees (full_name, employee_id, department, position, phone, email, base_salary, commission, salary_level, office_id, salary_level_id) VALUES
  ('Abebe Girma', 'EMP-2026-0001', 'Operations', 'Team Leader', '0912345678', 'abebe@dreamlux.com', 0.00, '2000 ETB per event', 'GL-01', (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), (SELECT id FROM salary_levels WHERE code = 'GL-01'))
ON CONFLICT (employee_id) DO NOTHING;

-- 8. Seed Sample Inventory Items
INSERT INTO items (name, quantity, description, store_id, category_id, created_at, updated_at)
SELECT 'White Rose', 540, 'Premium fresh cut decorative rose', (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), (SELECT id FROM categories WHERE name = 'Flowers / Decoratives'), NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'White Rose');

INSERT INTO items (name, quantity, description, store_id, category_id, created_at, updated_at)
SELECT 'Peach Runner', 120, 'Golden peach runner fabric for guest tables', (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), (SELECT id FROM categories WHERE name = 'Fabrics / Runners'), NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Peach Runner');

-- 9. Seed Event Types
INSERT INTO event_types (name, default_price_etb, description, is_active) VALUES
  ('Wedding (Sereg)', 85000.00, 'Full wedding decoration package', true),
  ('Traditional (Shigla)', 65000.00, 'Traditional ceremony decoration', true),
  ('Graduation', 45000.00, 'Graduation banquet backdrop & layout', true),
  ('Nikah', 35000.00, 'Nikah ceremony setup', true),
  ('Corporate Event', 120000.00, 'Corporate gala or launch design', true)
ON CONFLICT (name) DO NOTHING;
