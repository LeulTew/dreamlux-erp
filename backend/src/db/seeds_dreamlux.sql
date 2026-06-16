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

-- 7. Seed Sample Employees
INSERT INTO employees (full_name, employee_id, department, position, phone, email, base_salary, commission, salary_level, office_id, salary_level_id, gender, employment_type, group_name, bank_name, bank_account, hire_date, contract_status) VALUES
  ('Abebe Girma', 'EMP-2026-0001', 'Operations', 'Team Leader', '0912345678', 'abebe@dreamlux.com', 0.00, '2000 ETB per event', 'GL-01', (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), (SELECT id FROM salary_levels WHERE code = 'GL-01'), 'Male', 'part-time', 'Redat', 'CBE', '1000301109559', '2026-06-01', 'Active'),
  ('Selam Bekele', 'EMP-2026-0002', 'Logistics', 'Driver', '0922334455', 'selam@dreamlux.com', 12000.00, 'Day rate', 'L2', (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), (SELECT id FROM salary_levels WHERE code = 'L2'), 'Female', 'full-time', 'Office', 'Abyssinia', '99887766', '2025-01-15', 'Active'),
  ('Tigist Haile', 'EMP-2026-0003', 'Events', 'Planner', '0933445566', 'tigist@dreamlux.com', 14500.00, 'Project commission', 'PL-01', (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), (SELECT id FROM salary_levels WHERE code = 'PL-01'), 'Female', 'full-time', 'Office', 'Zemen Bank', '11223344', '2025-05-10', 'Active')
ON CONFLICT (employee_id) DO NOTHING;

-- 8. Seed Sample Inventory Items
INSERT INTO items (name, quantity, description, store_id, category_id, type, color, unit_of_measurement, purchase_date, purchase_cost, condition_status, created_at, updated_at)
SELECT 'White Rose', 540, 'Premium fresh cut decorative rose', (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), (SELECT id FROM categories WHERE name = 'Flowers / Decoratives'), 'Flower', 'White', 'pcs', '2026-06-10', 15.00, 'Good', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'White Rose');

INSERT INTO items (name, quantity, description, store_id, category_id, type, color, unit_of_measurement, purchase_date, purchase_cost, condition_status, created_at, updated_at)
SELECT 'Peach Runner', 120, 'Golden peach runner fabric for guest tables', (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), (SELECT id FROM categories WHERE name = 'Fabrics / Runners'), 'Runner', 'Peach', 'pcs', '2026-05-20', 180.00, 'Good', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'Peach Runner');

-- 9. Seed Event Types
INSERT INTO event_types (name, default_price_etb, description, is_active) VALUES
  ('Wedding (Sereg)', 85000.00, 'Full wedding decoration package', true),
  ('Traditional (Shigla)', 65000.00, 'Traditional ceremony decoration', true),
  ('Graduation', 45000.00, 'Graduation banquet backdrop & layout', true),
  ('Nikah', 35000.00, 'Nikah ceremony setup', true),
  ('Corporate Event', 120000.00, 'Corporate gala or launch design', true)
ON CONFLICT (name) DO NOTHING;

-- 10. Seed Sample Vehicles
INSERT INTO vehicles (plate_number, vehicle_type, fuel_type, fuel_consumption_rate, driver_license_details, is_active) VALUES
  ('AA-3-A12345', 'Toyota Hilux Pickup', 'Diesel', 0.12, 'Class 3, Exp: 2029', true),
  ('AA-3-B98765', 'Isuzu FSR Medium Truck', 'Diesel', 0.22, 'Class 4, Exp: 2028', true)
ON CONFLICT (plate_number) DO NOTHING;

-- 11. Seed Sample Event (Planned)
INSERT INTO events (name, client_name, client_phone, event_type_id, start_date, end_date, start_time, end_time, venue_location, contract_price, status, created_by) VALUES
  ('Hana & Daniel Wedding', 'Hana Mohammed', '0911223344', (SELECT id FROM event_types WHERE name = 'Wedding (Sereg)'), '2026-07-15', '2026-07-15', '10:00:00', '18:00:00', 'Friendship International Hotel, Addis Ababa', 85000.00, 'Planned', (SELECT id FROM users WHERE username = 'ceo'))
ON CONFLICT DO NOTHING;

-- 12. Seed Sample Event Assignments
INSERT INTO event_assignments (event_id, employee_id, role, commission_amount, attended) VALUES
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), (SELECT id FROM employees WHERE employee_id = 'EMP-2026-0001'), 'Team Leader', 2000.00, true)
ON CONFLICT DO NOTHING;

-- 13. Seed Vehicle Assignments
INSERT INTO vehicle_assignments (event_id, vehicle_id, driver_id, is_night_shift) VALUES
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), (SELECT id FROM vehicles WHERE plate_number = 'AA-3-A12345'), (SELECT id FROM employees WHERE employee_id = 'EMP-2026-0002'), false)
ON CONFLICT DO NOTHING;

-- 14. Seed Trip Logs (Trip 1)
INSERT INTO trips (vehicle_assignment_id, destination, distance_km, fuel_liters_used, fuel_cost_etb) VALUES
  ((SELECT id FROM vehicle_assignments WHERE event_id = (SELECT id FROM events WHERE name = 'Hana & Daniel Wedding') AND vehicle_id = (SELECT id FROM vehicles WHERE plate_number = 'AA-3-A12345')), 'Central Warehouse to Friendship Hotel', 25.0, 3.0, 320.00)
ON CONFLICT DO NOTHING;

-- 15. Seed Sample Expenses
INSERT INTO expenses (event_id, category, amount, description, status, created_by) VALUES
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), 'Fuel', 3200.00, 'Fuel consumption auto-logged', 'Approved', (SELECT id FROM users WHERE username = 'ops')),
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), 'Labor', 18000.00, 'Event crew commission', 'Pending', (SELECT id FROM users WHERE username = 'ops')),
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), 'Equipment Rental', 5000.00, 'Extra floral pillars rental', 'Pending', (SELECT id FROM users WHERE username = 'ops')),
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), 'Consumables', 1500.00, 'Water and daily event materials', 'Pending', (SELECT id FROM users WHERE username = 'ops')),
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), 'Transportation', 2000.00, 'Extra loading taxi hire', 'Pending', (SELECT id FROM users WHERE username = 'ops'))
ON CONFLICT DO NOTHING;

