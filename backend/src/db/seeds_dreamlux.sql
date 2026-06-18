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

-- 6. Seed SRD Pay Grade Examples
-- Salary-related values are taken directly from DreamLux_SRD_v1.0.docx section 4.1.2.
INSERT INTO salary_levels (code, amount_etb, description, sort_order, is_active) VALUES
  ('GM-01', 70000.00, 'SRD starting salary: General Manager', 10, true),
  ('OM-01', 35000.00, 'SRD starting salary: Operations Manager', 20, true),
  ('PL-01', 14500.00, 'SRD starting salary: Planner', 30, true),
  ('SK-01', 10000.00, 'SRD starting salary: Store Keeper', 40, true),
  ('GL-01', 7000.00, 'SRD starting salary: Guard / Loader', 50, true)
ON CONFLICT (code) DO UPDATE SET
  amount_etb = EXCLUDED.amount_etb,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 7. Seed Sample Employees
INSERT INTO employees (full_name, employee_id, department, position, phone, email, base_salary, commission, salary_level, office_id, salary_level_id, gender, employment_type, group_name, bank_name, bank_account, hire_date, contract_status) VALUES
  ('Abebe Girma', 'EMP-2026-0001', 'Operations', 'Team Leader', '0912345678', 'abebe@dreamlux.com', 0.00, '2000 ETB per event + 500 ETB Training Bonus per attended session', 'GL-01', (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), (SELECT id FROM salary_levels WHERE code = 'GL-01'), 'Male', 'part-time', 'Redat', 'CBE', '1000301109559', '2026-06-01', 'Active'),
  ('Selam Bekele', 'EMP-2026-0002', 'Logistics', 'Driver', '0922334455', 'selam@dreamlux.com', 0.00, 'Driver base day rate + night shift premium per SRD; amount configurable by Accountant', NULL, (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), NULL, 'Female', 'full-time', 'Office', 'Abyssinia', '99887766', '2025-01-15', 'Active'),
  ('Tigist Haile', 'EMP-2026-0003', 'Events', 'Planner', '0933445566', 'tigist@dreamlux.com', 14500.00, 'Project commission', 'PL-01', (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), (SELECT id FROM salary_levels WHERE code = 'PL-01'), 'Female', 'full-time', 'Office', 'Zemen Bank', '11223344', '2025-05-10', 'Active'),
  ('Marta Tesfaye', 'EMP-2026-0004', 'Operations', 'Operations Manager', '0944556677', 'marta@dreamlux.com', 35000.00, 'N/A', 'OM-01', (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), (SELECT id FROM salary_levels WHERE code = 'OM-01'), 'Female', 'full-time', 'Office', 'Awash Bank', '44556677', '2024-09-01', 'Active'),
  ('Kebede Alemu', 'EMP-2026-0005', 'Store', 'Store Keeper', '0955667788', 'kebede@dreamlux.com', 10000.00, 'N/A', 'SK-01', (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), (SELECT id FROM salary_levels WHERE code = 'SK-01'), 'Male', 'full-time', 'Office', 'CBE', '2000401209660', '2025-03-20', 'Active'),
  ('Dawit Tadesse', 'EMP-2026-0006', 'Operations', 'Loader', '0966778899', 'dawit@dreamlux.com', 7000.00, 'Event support', 'GL-01', (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), (SELECT id FROM salary_levels WHERE code = 'GL-01'), 'Male', 'event-based', 'Redat', 'CBE', '2000401209771', '2026-02-01', 'Active'),
  ('Liya Getachew', 'EMP-2026-0007', 'Events', 'Decor Professional', '0977889900', 'liya@dreamlux.com', 0.00, 'Configurable per-event rate per SRD', NULL, (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), NULL, 'Female', 'event-based', 'Balemoya', 'Dashen Bank', '55667788', '2026-02-15', 'Active'),
  ('Noah Kassahun', 'EMP-2026-0008', 'Events', 'Assistant', '0988990011', 'noah@dreamlux.com', 0.00, 'Configurable per-event rate per SRD', NULL, (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), NULL, 'Male', 'event-based', 'Redat', 'Abyssinia', '66778899', '2026-03-01', 'Active'),
  ('Rahel Mekonnen', 'EMP-2026-0009', 'Events', 'Supervisor', '0999001122', 'rahel@dreamlux.com', 0.00, 'Configurable per-event rate per SRD', NULL, (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), NULL, 'Female', 'event-based', 'Supervisor', 'CBE', '2000401209882', '2026-03-05', 'Active'),
  ('Bereket Sime', 'EMP-2026-0010', 'Events', 'Assistant', '0910102030', 'bereket@dreamlux.com', 0.00, 'Configurable per-event rate per SRD', NULL, (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), NULL, 'Male', 'event-based', 'Redat', 'CBE', '2000401209993', '2026-03-10', 'Active')
ON CONFLICT (employee_id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  department = EXCLUDED.department,
  position = EXCLUDED.position,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  base_salary = EXCLUDED.base_salary,
  commission = EXCLUDED.commission,
  salary_level = EXCLUDED.salary_level,
  office_id = EXCLUDED.office_id,
  salary_level_id = EXCLUDED.salary_level_id,
  gender = EXCLUDED.gender,
  employment_type = EXCLUDED.employment_type,
  group_name = EXCLUDED.group_name,
  bank_name = EXCLUDED.bank_name,
  bank_account = EXCLUDED.bank_account,
  hire_date = EXCLUDED.hire_date,
  contract_status = EXCLUDED.contract_status,
  updated_at = NOW();

-- 8. Seed Sample Inventory Items
INSERT INTO items (name, quantity, description, store_id, category_id, type, color, unit_of_measurement, purchase_date, purchase_cost, condition_status, created_at, updated_at)
SELECT seed.name, seed.quantity, seed.description, (SELECT id FROM stores WHERE name = 'Addis Ababa Central Store'), (SELECT id FROM categories WHERE name = seed.category), seed.type, seed.color, seed.unit, seed.purchase_date::date, seed.purchase_cost, seed.condition_status, NOW(), NOW()
FROM (
  VALUES
    ('Peach Runner', 120, 'SRD fabrics/runners example', 'Fabrics / Runners', 'Runner', 'Peach', 'pcs', '2026-05-20', 180.00, 'Good'),
    ('Golden Runner', 80, 'SRD fabrics/runners example', 'Fabrics / Runners', 'Runner', 'Gold', 'pcs', '2026-05-20', 190.00, 'Good'),
    ('Blue Tuwill', 65, 'SRD fabrics/runners example', 'Fabrics / Runners', 'Fabric', 'Blue', 'pcs', '2026-05-21', 160.00, 'Good'),
    ('White Cherk', 95, 'SRD fabrics/runners example', 'Fabrics / Runners', 'Fabric', 'White', 'pcs', '2026-05-21', 150.00, 'Good'),
    ('Nuud Cherk', 75, 'SRD fabrics/runners example', 'Fabrics / Runners', 'Fabric', 'Nude', 'pcs', '2026-05-21', 150.00, 'Good'),
    ('Tiras', 50, 'SRD fabrics/runners example', 'Fabrics / Runners', 'Fabric', 'Mixed', 'pcs', '2026-05-22', 120.00, 'Good'),
    ('Napkins', 300, 'SRD fabrics/runners example', 'Fabrics / Runners', 'Napkin', 'White', 'pcs', '2026-05-22', 25.00, 'Good'),
    ('White Rose', 540, 'SRD sample inventory item: premium decorative rose', 'Flowers / Decoratives', 'Flower', 'White', 'pcs', '2026-06-10', 15.00, 'Good'),
    ('Nude Rose', 118, 'SRD flowers/decoratives example', 'Flowers / Decoratives', 'Flower', 'Nude', 'pcs', '2026-06-10', 15.00, 'Good'),
    ('Purple Rose', 109, 'SRD flowers/decoratives example', 'Flowers / Decoratives', 'Flower', 'Purple', 'pcs', '2026-06-10', 15.00, 'Good'),
    ('Golden Ketal', 90, 'SRD flowers/decoratives example', 'Flowers / Decoratives', 'Decorative', 'Gold', 'pcs', '2026-06-11', 35.00, 'Good'),
    ('Pink Orchid', 70, 'SRD flowers/decoratives example', 'Flowers / Decoratives', 'Flower', 'Pink', 'pcs', '2026-06-11', 45.00, 'Good'),
    ('Chandeliers', 18, 'SRD lighting/electrical example', 'Lighting & Electrical', 'Lighting', 'Gold', 'pcs', '2026-04-15', 2500.00, 'Good'),
    ('Sham New Big', 40, 'SRD lighting/electrical example', 'Lighting & Electrical', 'Candle', 'White', 'pcs', '2026-04-16', 80.00, 'Good'),
    ('Sham New Small', 75, 'SRD lighting/electrical example', 'Lighting & Electrical', 'Candle', 'White', 'pcs', '2026-04-16', 45.00, 'Good'),
    ('Vase Lights', 35, 'SRD lighting/electrical example', 'Lighting & Electrical', 'Lighting', 'Warm White', 'pcs', '2026-04-17', 300.00, 'Good'),
    ('Kichin Shama', 60, 'SRD lighting/electrical example', 'Lighting & Electrical', 'Candle', 'White', 'pcs', '2026-04-17', 55.00, 'Good'),
    ('Golden Chandler', 12, 'SRD lighting/electrical example', 'Lighting & Electrical', 'Lighting', 'Gold', 'pcs', '2026-04-18', 1800.00, 'Good'),
    ('Welcome Boards', 20, 'SRD boards/frames example', 'Boards & Frames', 'Board', 'Mixed', 'pcs', '2026-03-01', 950.00, 'Good'),
    ('Nikah Board', 8, 'SRD boards/frames example', 'Boards & Frames', 'Board', 'White', 'pcs', '2026-03-01', 1100.00, 'Good'),
    ('Dancee Flower', 14, 'SRD boards/frames example', 'Boards & Frames', 'Frame Decor', 'Mixed', 'pcs', '2026-03-02', 650.00, 'Good'),
    ('Stage', 6, 'SRD boards/frames example', 'Boards & Frames', 'Stage', 'Black', 'pcs', '2026-03-02', 6000.00, 'Good'),
    ('Background Brat', 10, 'SRD boards/frames example', 'Boards & Frames', 'Frame', 'Black', 'pcs', '2026-03-03', 1300.00, 'Good'),
    ('Frames', 40, 'SRD boards/frames example', 'Boards & Frames', 'Frame', 'Gold', 'pcs', '2026-03-03', 300.00, 'Good'),
    ('Sofas', 12, 'SRD setup items example', 'Setup Items', 'Furniture', 'Cream', 'pcs', '2026-02-10', 8000.00, 'Good'),
    ('Mirrors', 10, 'SRD setup items example', 'Setup Items', 'Mirror', 'Silver', 'pcs', '2026-02-10', 1500.00, 'Good'),
    ('Mize Tables', 16, 'SRD setup items example', 'Setup Items', 'Table', 'White', 'pcs', '2026-02-11', 2200.00, 'Good'),
    ('Mestawet', 25, 'SRD setup items example', 'Setup Items', 'Decorative', 'Glass', 'pcs', '2026-02-11', 400.00, 'Good'),
    ('Ashangulit', 45, 'SRD setup items example', 'Setup Items', 'Decorative', 'Mixed', 'pcs', '2026-02-12', 120.00, 'Good'),
    ('Sefed', 55, 'SRD setup items example', 'Setup Items', 'Basket', 'Natural', 'pcs', '2026-02-12', 90.00, 'Good'),
    ('Compressor', 3, 'SRD machines/tools example', 'Machines & Tools', 'Machine', 'Red', 'pcs', '2026-01-05', 12000.00, 'Good'),
    ('Washing Machine', 2, 'SRD machines/tools example', 'Machines & Tools', 'Machine', 'White', 'pcs', '2026-01-05', 30000.00, 'Good'),
    ('Glue Gun', 18, 'SRD machines/tools example', 'Machines & Tools', 'Tool', 'Black', 'pcs', '2026-01-06', 450.00, 'Good'),
    ('Balloon Pump', 8, 'SRD machines/tools example', 'Machines & Tools', 'Tool', 'Blue', 'pcs', '2026-01-06', 900.00, 'Good'),
    ('Cutter', 25, 'SRD machines/tools example', 'Machines & Tools', 'Tool', 'Mixed', 'pcs', '2026-01-07', 80.00, 'Good'),
    ('Scissors', 30, 'SRD machines/tools example', 'Machines & Tools', 'Tool', 'Silver', 'pcs', '2026-01-07', 75.00, 'Good'),
    ('Water Containers', 22, 'SRD cleaning/packing example', 'Cleaning & Packing', 'Container', 'Blue', 'pcs', '2026-01-20', 350.00, 'Good'),
    ('Mop', 18, 'SRD cleaning/packing example', 'Cleaning & Packing', 'Cleaning Tool', 'Mixed', 'pcs', '2026-01-20', 160.00, 'Good'),
    ('Broom', 20, 'SRD cleaning/packing example', 'Cleaning & Packing', 'Cleaning Tool', 'Natural', 'pcs', '2026-01-21', 120.00, 'Good'),
    ('Steel Boxes', 15, 'SRD cleaning/packing example', 'Cleaning & Packing', 'Packing Box', 'Steel', 'pcs', '2026-01-21', 900.00, 'Good'),
    ('Plastic Boxes', 35, 'SRD cleaning/packing example', 'Cleaning & Packing', 'Packing Box', 'Clear', 'pcs', '2026-01-22', 260.00, 'Good')
) AS seed(name, quantity, description, category, type, color, unit, purchase_date, purchase_cost, condition_status)
WHERE NOT EXISTS (SELECT 1 FROM items WHERE items.name = seed.name);

UPDATE items AS item
SET
  quantity = seed.quantity,
  description = seed.description,
  category_id = (SELECT id FROM categories WHERE name = seed.category),
  type = seed.type,
  color = seed.color,
  unit_of_measurement = seed.unit,
  purchase_date = seed.purchase_date::date,
  purchase_cost = seed.purchase_cost,
  condition_status = seed.condition_status,
  updated_at = NOW()
FROM (
  VALUES
    ('White Rose', 540, 'SRD sample inventory item: premium decorative rose', 'Flowers / Decoratives', 'Flower', 'White', 'pcs', '2026-06-10', 15.00, 'Good'),
    ('Nude Rose', 118, 'SRD flowers/decoratives example', 'Flowers / Decoratives', 'Flower', 'Nude', 'pcs', '2026-06-10', 15.00, 'Good'),
    ('Purple Rose', 109, 'SRD flowers/decoratives example', 'Flowers / Decoratives', 'Flower', 'Purple', 'pcs', '2026-06-10', 15.00, 'Good')
) AS seed(name, quantity, description, category, type, color, unit, purchase_date, purchase_cost, condition_status)
WHERE item.name = seed.name;

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
  ('AA-3-B98765', 'Isuzu FSR Medium Truck', 'Diesel', 0.22, 'Class 4, Exp: 2028', true),
  ('AA-3-C45678', 'Hyundai H1 Van', 'Diesel', 0.16, 'Class 3, Exp: 2029', true)
ON CONFLICT (plate_number) DO NOTHING;

-- 11. Seed Sample Event (Planned)
INSERT INTO events (name, client_name, client_phone, event_type_id, start_date, end_date, start_time, end_time, venue_location, contract_price, status, created_by)
SELECT 'Hana & Daniel Wedding', 'Hana Mohammed', '0911223344', (SELECT id FROM event_types WHERE name = 'Wedding (Sereg)'), '2026-07-15', '2026-07-15', '10:00:00', '18:00:00', 'Friendship International Hotel, Addis Ababa', 85000.00, 'Planned', (SELECT id FROM users WHERE username = 'ceo')
WHERE NOT EXISTS (
  SELECT 1
  FROM events
  WHERE name = 'Hana & Daniel Wedding'
    AND client_name = 'Hana Mohammed'
    AND start_date = '2026-07-15'
);

-- 12. Seed Sample Event Assignments
INSERT INTO event_assignments (event_id, employee_id, role, commission_amount, attended) VALUES
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), (SELECT id FROM employees WHERE employee_id = 'EMP-2026-0001'), 'Team Leader', 2000.00, true),
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), (SELECT id FROM employees WHERE employee_id = 'EMP-2026-0006'), 'Assistant', 0.00, true),
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), (SELECT id FROM employees WHERE employee_id = 'EMP-2026-0007'), 'Decor Professional', 0.00, true),
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), (SELECT id FROM employees WHERE employee_id = 'EMP-2026-0008'), 'Assistant', 0.00, true),
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), (SELECT id FROM employees WHERE employee_id = 'EMP-2026-0009'), 'Supervisor', 0.00, true),
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), (SELECT id FROM employees WHERE employee_id = 'EMP-2026-0010'), 'Assistant', 0.00, true),
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), (SELECT id FROM employees WHERE employee_id = 'EMP-2026-0003'), 'Event Manager', 0.00, true),
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), (SELECT id FROM employees WHERE employee_id = 'EMP-2026-0005'), 'Store Keeper', 0.00, true)
ON CONFLICT DO NOTHING;

-- 13. Seed Vehicle Assignments
INSERT INTO vehicle_assignments (event_id, vehicle_id, driver_id, is_night_shift) VALUES
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), (SELECT id FROM vehicles WHERE plate_number = 'AA-3-A12345'), (SELECT id FROM employees WHERE employee_id = 'EMP-2026-0002'), false),
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), (SELECT id FROM vehicles WHERE plate_number = 'AA-3-B98765'), (SELECT id FROM employees WHERE employee_id = 'EMP-2026-0002'), false),
  ((SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), (SELECT id FROM vehicles WHERE plate_number = 'AA-3-C45678'), (SELECT id FROM employees WHERE employee_id = 'EMP-2026-0002'), false)
ON CONFLICT DO NOTHING;

-- 14. Seed Trip Logs (SRD sample fuel: 3 vehicles x 2 trips, total 3,200 ETB)
DELETE FROM trips t
USING vehicle_assignments va, events e
WHERE t.vehicle_assignment_id = va.id
  AND va.event_id = e.id
  AND e.name = 'Hana & Daniel Wedding'
  AND t.destination = 'Central Warehouse to Friendship Hotel'
  AND t.fuel_cost_etb = 320.00;

INSERT INTO trips (vehicle_assignment_id, destination, distance_km, fuel_liters_used, fuel_cost_etb)
SELECT
  (SELECT va.id
   FROM vehicle_assignments va
   JOIN vehicles v ON va.vehicle_id = v.id
   WHERE va.event_id = (SELECT id FROM events WHERE name = 'Hana & Daniel Wedding')
     AND v.plate_number = seed.plate_number),
  seed.destination,
  seed.distance_km,
  seed.fuel_liters_used,
  seed.fuel_cost_etb
FROM (
  VALUES
    ('AA-3-A12345', 'Central Store to Friendship Hotel - outbound', 25.00, 3.00, 400.00),
    ('AA-3-A12345', 'Friendship Hotel to Central Store - return', 25.00, 3.00, 400.00),
    ('AA-3-B98765', 'Bole Depot to Friendship Hotel - outbound', 30.00, 6.60, 800.00),
    ('AA-3-B98765', 'Friendship Hotel to Bole Depot - return', 30.00, 6.60, 800.00),
    ('AA-3-C45678', 'Crew pickup to Friendship Hotel - outbound', 25.00, 4.00, 400.00),
    ('AA-3-C45678', 'Friendship Hotel crew dropoff - return', 25.00, 4.00, 400.00)
) AS seed(plate_number, destination, distance_km, fuel_liters_used, fuel_cost_etb)
WHERE NOT EXISTS (
  SELECT 1
  FROM trips t
  JOIN vehicle_assignments va ON t.vehicle_assignment_id = va.id
  JOIN vehicles v ON va.vehicle_id = v.id
  WHERE va.event_id = (SELECT id FROM events WHERE name = 'Hana & Daniel Wedding')
    AND v.plate_number = seed.plate_number
    AND t.destination = seed.destination
);

-- 15. Seed Sample Expenses
DELETE FROM expenses exp
USING events e
WHERE exp.event_id = e.id
  AND e.name = 'Hana & Daniel Wedding'
  AND exp.description IN (
    'Fuel consumption auto-logged',
    'Event crew commission',
    'Extra floral pillars rental',
    'Water and daily event materials',
    'Extra loading taxi hire'
  );

INSERT INTO expenses (event_id, category, amount, description, status, created_by)
SELECT (SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), seed.category, seed.amount, seed.description, seed.status, (SELECT id FROM users WHERE username = 'ops')
FROM (
  VALUES
    ('Fuel', 3200.00, 'SRD sample: Fuel (3 vehicles x 2 trips)', 'Approved'),
    ('Labor', 18000.00, 'SRD sample: Labor (8 workers)', 'Pending'),
    ('Equipment Rental', 5000.00, 'SRD sample: Equipment Rental', 'Pending'),
    ('Consumables', 1500.00, 'SRD sample: Consumables', 'Pending'),
    ('Transportation', 2000.00, 'SRD sample: Transportation extra', 'Pending')
) AS seed(category, amount, description, status)
WHERE NOT EXISTS (
  SELECT 1
  FROM expenses exp
  WHERE exp.event_id = (SELECT id FROM events WHERE name = 'Hana & Daniel Wedding')
    AND exp.category = seed.category
    AND exp.description = seed.description
);

-- 16. Seed Workspace Allocations and Checklist
INSERT INTO event_allocations (event_id, item_id, quantity_allocated, status, notes, created_by)
SELECT (SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), (SELECT id FROM items WHERE name = 'White Rose'), 120, 'Reserved', 'SRD event workspace sample allocation', (SELECT id FROM users WHERE username = 'inv')
WHERE NOT EXISTS (
  SELECT 1
  FROM event_allocations
  WHERE event_id = (SELECT id FROM events WHERE name = 'Hana & Daniel Wedding')
    AND item_id = (SELECT id FROM items WHERE name = 'White Rose')
);

INSERT INTO event_checklist (event_id, title, status, due_date, owner_name, created_by)
SELECT (SELECT id FROM events WHERE name = 'Hana & Daniel Wedding'), seed.title, seed.status, seed.due_date::timestamp, seed.owner_name, (SELECT id FROM users WHERE username = 'eventmgr')
FROM (
  VALUES
    ('Confirm client package design', 'Done', '2026-07-10 10:00:00', 'Event Manager'),
    ('Reserve flowers and runners from central store', 'Todo', '2026-07-12 16:00:00', 'Store Keeper'),
    ('Assign event team and vehicles', 'Todo', '2026-07-13 12:00:00', 'Operations Manager'),
    ('Complete venue setup checklist', 'Todo', '2026-07-15 09:00:00', 'Supervisor')
) AS seed(title, status, due_date, owner_name)
WHERE NOT EXISTS (
  SELECT 1
  FROM event_checklist
  WHERE event_id = (SELECT id FROM events WHERE name = 'Hana & Daniel Wedding')
    AND title = seed.title
);
