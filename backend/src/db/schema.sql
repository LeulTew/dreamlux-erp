-- HR Pro Database Schema
-- Run: bun run db:migrate

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Roles for RBAC
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed default roles
INSERT INTO roles (name, description, permissions) VALUES
  ('SUPER_ADMIN', 'Full system access', '{"all": true}'),
  ('admin', 'Full system access', '{"all": true}'),
  ('INVENTORY_CONTROLLER', 'Can manage and audit inventory', '{"assets": ["read", "write", "reconcile", "delete"]}'),
  ('inventory_controller', 'Inventory management and auditing', '{"assets": ["read", "write", "reconcile", "delete"]}'),
  ('HR_MANAGER', 'Can manage employees and departments', '{"hr": ["read", "write"]}'),
  ('SYSTEM_MANAGER', 'Can manage users and settings', '{"users": ["manage"], "settings": ["write"]}'),
  ('system_manager', 'Can manage users and settings', '{"users": ["manage"], "settings": ["write"]}'),
  ('SALES_REP', 'Can view inventory but not modify', '{"assets": ["read"]}'),
  ('viewer', 'Read-only access to assets', '{"assets": ["read"]}'),
  ('OWNER', 'Business owner with full system access', '{"all": true}'),
  ('OPS_MANAGER', 'Can manage event operations', '{"events": ["read", "write", "delete"], "assets": ["read"]}'),
  ('EVENT_MANAGER', 'Can manage assigned event operations', '{"events": ["read", "write"], "assets": ["read"]}'),
  ('INVENTORY_OFFICER', 'Can manage inventory operations', '{"assets": ["read", "write", "reconcile"]}'),
  ('ACCOUNTANT', 'Can manage payroll, approvals, and profitability reports', '{"payroll": ["read", "write"], "reports": ["profit:read"]}'),
  ('DRIVER', 'Can view assigned events and log trips', '{"events": ["read"], "trips": ["create"]}')
ON CONFLICT (name) DO NOTHING;

-- 1b. Fine-grained permission catalog
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

INSERT INTO permissions (slug, description) VALUES
  ('assets:read', 'View inventory items and stats'),
  ('assets:write', 'Create and update inventory items'),
  ('assets:delete', 'Soft-delete inventory items'),
  ('assets:reconcile', 'Run inventory reconciliation updates'),
  ('users:manage', 'Manage users and role assignments'),
  ('settings:write', 'Manage system settings'),
  ('hr:read', 'View HR records'),
  ('hr:write', 'Create and update HR records'),
  ('departments:manage', 'Manage departments'),
  ('salary-levels:manage', 'Manage salary levels'),
  ('payroll:read', 'View payroll runs and payroll exports'),
  ('payroll:write', 'Create and update payroll runs'),
  ('events:read', 'View events, event types, and operational schedules'),
  ('events:write', 'Create and update events and event types'),
  ('events:delete', 'Delete, restore, and permanently remove events or event types'),
  ('events:override_completed', 'Modify completed events and restricted status transitions'),
  ('events:saved_views:share', 'Create and manage role or global saved event views'),
  ('events:proposals:write', 'Create and submit event intake profitability proposals'),
  ('events:proposals:approve', 'Approve, reject, cancel, and convert event intake proposals'),
  ('event_allocations:write', 'Create and release event inventory allocations'),
  ('event_checklist:write', 'Create and update event checklist items'),
  ('event_assignments:write', 'Assign employees to events and manage attendance'),
  ('vehicle_assignments:write', 'Assign vehicles and drivers to events'),
  ('exports:read', 'Export inventory, employee, and payroll data'),
  ('reports:profit:read', 'View profit and profitability reports'),
  ('trips:create', 'Create event trip logs and generated fuel expenses'),
  ('expenses:write', 'Create manual event expenses'),
  ('expenses:labor_generate', 'Generate labor expenses from attended event assignments'),
  ('expenses:approve', 'Approve expenses'),
  ('approvals:history:read', 'View approval history')
ON CONFLICT (slug) DO NOTHING;

-- Role-to-permission mappings
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
JOIN permissions p ON p.slug IN ('assets:read', 'events:read', 'events:write', 'events:delete', 'events:override_completed', 'events:saved_views:share', 'events:proposals:write', 'events:proposals:approve', 'event_allocations:write', 'event_checklist:write', 'event_assignments:write', 'vehicle_assignments:write', 'trips:create', 'expenses:write', 'expenses:labor_generate', 'exports:read', 'approvals:history:read')
WHERE LOWER(r.name) IN ('ops_manager')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('assets:read', 'events:read', 'events:write', 'events:proposals:write', 'event_checklist:write', 'event_assignments:write', 'vehicle_assignments:write', 'trips:create', 'expenses:write')
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

-- 2. App Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  role_id UUID REFERENCES roles(id),
  profile_image_url TEXT DEFAULT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL
);

-- 3. Stores (Offices/Locations)
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- Ensure idempotent location seeding works on upgraded schemas too.
DELETE FROM stores s1
USING stores s2
WHERE s1.ctid < s2.ctid
  AND s1.name = s2.name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_name_unique
  ON stores (name);

-- Seed default stores
INSERT INTO stores (name) VALUES
  ('Bulbula Coka'),
  ('Bulbula 2'),
  ('Haya Arat')
ON CONFLICT (name) DO NOTHING;

-- 4. Categories (hidden – future use)
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

-- Seed a default category (hidden)
INSERT INTO categories (name) VALUES ('General')
ON CONFLICT DO NOTHING;

-- 5. Items (Inventory)
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  store_id UUID REFERENCES stores(id),
  category_id UUID REFERENCES categories(id),
  image_key TEXT,
  last_counted_at TIMESTAMP DEFAULT NULL,
  last_counted_by UUID REFERENCES users(id) DEFAULT NULL,
  type TEXT,
  color TEXT,
  unit_of_measurement TEXT DEFAULT 'pcs',
  purchase_date DATE,
  purchase_cost NUMERIC(12, 2),
  condition_status TEXT CHECK (condition_status IN ('Good', 'Damaged', 'Under Repair')) DEFAULT 'Good',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_created_at_desc
  ON items (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_items_store_created_active
  ON items (store_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_items_deleted_at
  ON items (deleted_at);

CREATE INDEX IF NOT EXISTS idx_items_low_stock_active
  ON items (quantity)
  WHERE deleted_at IS NULL AND quantity < 5;

CREATE INDEX IF NOT EXISTS idx_items_last_counted_at
  ON items (last_counted_at DESC);

CREATE TABLE IF NOT EXISTS inventory_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP DEFAULT NOW(),
  item_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES inventory_reconciliation_runs(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  previous_quantity INTEGER NOT NULL,
  counted_quantity INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  counted_at TIMESTAMP DEFAULT NOW(),
  counted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recon_runs_started_at
  ON inventory_reconciliation_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_recon_runs_store_started_at
  ON inventory_reconciliation_runs (store_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_recon_items_run_id
  ON inventory_reconciliation_items (run_id);

CREATE INDEX IF NOT EXISTS idx_recon_items_item_id
  ON inventory_reconciliation_items (item_id);

-- 6. Departments
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. Positions
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed default positions
INSERT INTO positions (name) VALUES
  ('Manager'),
  ('Developer'),
  ('Sales Representative'),
  ('Accountant'),
  ('HR Specialist')
ON CONFLICT (name) DO NOTHING;

-- 10. Salary Levels
CREATE TABLE IF NOT EXISTS salary_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  amount_etb NUMERIC(15,2) NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL
);

-- Seed default levels if table is empty
INSERT INTO salary_levels (code, amount_etb, sort_order)
VALUES
  ('L1', 5000.00, 1),
  ('L2', 7000.00, 2),
  ('L3', 9000.00, 3),
  ('L4', 12000.00, 4)
ON CONFLICT (code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_salary_levels_deleted_at ON salary_levels(deleted_at);

-- 8. Employees
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  employee_id TEXT UNIQUE NOT NULL,
  department TEXT,
  position TEXT,
  phone TEXT,
  email TEXT,
  id_card_front_key TEXT,
  id_card_back_key TEXT,
  profile_photo_key TEXT,
  base_salary NUMERIC(15,2) DEFAULT 0,
  commission TEXT, -- Level 1, 2, 3, 4
  salary_level TEXT, -- Level 1, 2, 3, 4 (optional)
  gender TEXT,
  employment_type TEXT CHECK (employment_type IN ('full-time', 'part-time', 'event-based')) DEFAULT 'full-time',
  group_name TEXT,
  bank_name TEXT,
  bank_account TEXT,
  hire_date DATE,
  contract_status TEXT CHECK (contract_status IN ('Active', 'Suspended', 'Expired')) DEFAULT 'Active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL,
  department_id UUID,
  office_id UUID REFERENCES stores(id),
  salary_level_id UUID REFERENCES salary_levels(id),
  event_prices JSONB DEFAULT '{}'::jsonb
);

-- 9. App Settings (global)
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  employee_id_prefix TEXT NOT NULL DEFAULT 'EMP',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed default settings
INSERT INTO app_settings (id, employee_id_prefix) VALUES (1, 'EMP')
ON CONFLICT DO NOTHING;

-- 11. Event Types
CREATE TABLE IF NOT EXISTS event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  default_price_etb NUMERIC(15,2) NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL
);

-- Seed default event types
INSERT INTO event_types (name)
VALUES
  ('Wedding'),
  ('Mels'),
  ('Birthday'),
  ('Corporate Event'),
  ('Photo Shoot')
ON CONFLICT (name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_event_types_deleted_at ON event_types(deleted_at);

-- 12. Payroll Runs
CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  period_kind TEXT NOT NULL, -- month|range|preset
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft|finalized|flagged_wrong|trashed
  finalized_at TIMESTAMP DEFAULT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  correction_of_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  correction_reason TEXT,
  notes TEXT,
  include_images_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_deleted_at ON payroll_runs(deleted_at);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_correction ON payroll_runs(correction_of_run_id);

-- 13. Payroll Run Employee Lines
CREATE TABLE IF NOT EXISTS payroll_run_employee_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  employee_code_snapshot TEXT,
  employee_name_snapshot TEXT,
  salary_level_snapshot TEXT,
  base_salary_snapshot NUMERIC(15,2) DEFAULT 0,
  commission_total_snapshot NUMERIC(15,2) DEFAULT 0,
  employee_total_snapshot NUMERIC(15,2) DEFAULT 0,
  office_snapshot TEXT,
  department_snapshot TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_run_employee_lines_run_id ON payroll_run_employee_lines(run_id);

-- 14. Payroll Run Line Events
CREATE TABLE IF NOT EXISTS payroll_run_line_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_line_id UUID NOT NULL REFERENCES payroll_run_employee_lines(id) ON DELETE CASCADE,
  event_type_id UUID REFERENCES event_types(id) ON DELETE SET NULL,
  event_name_snapshot TEXT NOT NULL,
  unit_price_snapshot NUMERIC(15,2) NOT NULL,
  quantity NUMERIC(10,2) DEFAULT 1,
  line_total_snapshot NUMERIC(15,2) NOT NULL,
  override_price_etb NUMERIC(15,2),
  override_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_run_line_events_employee_line_id ON payroll_run_line_events(employee_line_id);

-- 14b. Payroll Audit Logs
CREATE TABLE IF NOT EXISTS payroll_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  status_snapshot TEXT,
  employee_count INTEGER NOT NULL DEFAULT 0,
  total_payroll_snapshot NUMERIC(12, 2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_audit_logs_run_id ON payroll_audit_logs(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_logs_created_at ON payroll_audit_logs(created_at);

-- 14.5 Events and Event Logs
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  event_type_id UUID REFERENCES event_types(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  venue_location TEXT NOT NULL,
  contract_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL CHECK (status IN ('Planned', 'Ongoing', 'Completed')) DEFAULT 'Planned',
  package_design_notes TEXT,
  estimated_design_cost NUMERIC(12, 2) DEFAULT 0.00,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_event_logs_event_id ON event_logs(event_id);

CREATE TABLE IF NOT EXISTS event_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  event_type_id UUID REFERENCES event_types(id) ON DELETE SET NULL,
  requested_budget NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  requested_start_date DATE,
  requested_end_date DATE,
  requested_start_time TIME,
  requested_end_time TIME,
  venue_location TEXT,
  notes TEXT,
  package_design_notes TEXT,
  cost_breakdown JSONB NOT NULL DEFAULT '{"design":[],"team":[],"trip":[],"other":[]}'::jsonb,
  estimated_design_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_team_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_trip_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_other_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_net_profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_margin_percentage NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected', 'Converted', 'Canceled')) DEFAULT 'Draft',
  rejection_reason TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  converted_event_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL,
  CONSTRAINT event_proposals_requested_date_check CHECK (
    requested_start_date IS NULL OR requested_end_date IS NULL OR requested_start_date <= requested_end_date
  )
);

CREATE TABLE IF NOT EXISTS event_proposal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES event_proposals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS event_proposal_id UUID REFERENCES event_proposals(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_proposals_converted_event_fk'
      AND conrelid = 'event_proposals'::regclass
  ) THEN
    ALTER TABLE event_proposals
      ADD CONSTRAINT event_proposals_converted_event_fk
      FOREIGN KEY (converted_event_id) REFERENCES events(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_proposals_status
  ON event_proposals(status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_proposals_created_by
  ON event_proposals(created_by)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_proposals_requested_start
  ON event_proposals(requested_start_date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_proposals_profit
  ON event_proposals(estimated_net_profit, estimated_margin_percentage)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_proposals_converted_event_unique
  ON event_proposals(converted_event_id)
  WHERE converted_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_event_proposal_unique
  ON events(event_proposal_id)
  WHERE event_proposal_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_proposal_logs_proposal_id
  ON event_proposal_logs(proposal_id);

CREATE TABLE IF NOT EXISTS event_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('personal', 'role', 'global')) DEFAULT 'personal',
  role_name TEXT DEFAULT NULL,
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  filters JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort JSONB DEFAULT NULL,
  page_size INTEGER NOT NULL DEFAULT 20 CHECK (page_size BETWEEN 1 AND 100),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL,
  CONSTRAINT event_saved_views_scope_target_check CHECK (
    (scope = 'personal' AND user_id IS NOT NULL AND role_name IS NULL)
    OR (scope = 'role' AND user_id IS NULL AND role_name IS NOT NULL)
    OR (scope = 'global' AND user_id IS NULL AND role_name IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_event_saved_views_user
  ON event_saved_views(user_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_saved_views_scope
  ON event_saved_views(scope, role_name)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_saved_views_default_personal
  ON event_saved_views(user_id)
  WHERE deleted_at IS NULL AND is_default = TRUE AND scope = 'personal';
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_saved_views_default_role
  ON event_saved_views(LOWER(role_name))
  WHERE deleted_at IS NULL AND is_default = TRUE AND scope = 'role';
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_saved_views_default_global
  ON event_saved_views((scope))
  WHERE deleted_at IS NULL AND is_default = TRUE AND scope = 'global';

-- 15. Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number TEXT UNIQUE NOT NULL,
  vehicle_type TEXT NOT NULL,
  fuel_type TEXT NOT NULL,
  fuel_consumption_rate NUMERIC(6, 2) NOT NULL, -- liters per km
  driver_license_details TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicles_deleted_at ON vehicles(deleted_at);

-- 16. Event Assignments (links employees to events)
CREATE TABLE IF NOT EXISTS event_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  attended BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (event_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_event_assignments_event ON event_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_assignments_employee ON event_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_event_assignments_employee_event ON event_assignments(employee_id, event_id);

-- 17. Vehicle Assignments (links vehicles/drivers to events)
CREATE TABLE IF NOT EXISTS vehicle_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  is_night_shift BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (event_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_event ON vehicle_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_vehicle ON vehicle_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_vehicle_event ON vehicle_assignments(vehicle_id, event_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_driver
  ON vehicle_assignments(driver_id)
  WHERE driver_id IS NOT NULL;

-- 18. Trips (tracks fuel and distance per vehicle assignment)
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_assignment_id UUID NOT NULL REFERENCES vehicle_assignments(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  distance_km NUMERIC(8, 2) NOT NULL,
  fuel_liters_used NUMERIC(8, 2) NOT NULL,
  fuel_cost_etb NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_assignment ON trips(vehicle_assignment_id);

-- 19. Expenses (event expenses logged for Accountant approval)
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('Fuel', 'Labor', 'Transportation', 'Equipment Rental', 'Consumables', 'Other')),
  amount NUMERIC(12, 2) NOT NULL,
  description TEXT NOT NULL,
  receipt_image_key TEXT DEFAULT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
  rejected_reason TEXT DEFAULT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_event ON expenses(event_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_event_status_category ON expenses(event_id, status, category);

-- 20. Event Allocations (inventory allocated to events)
CREATE TABLE IF NOT EXISTS event_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity_allocated INTEGER NOT NULL CHECK (quantity_allocated > 0),
  status TEXT NOT NULL CHECK (status IN ('Reserved', 'Pulled', 'Returned')) DEFAULT 'Reserved',
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_allocations_event ON event_allocations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_allocations_item ON event_allocations(item_id);
CREATE INDEX IF NOT EXISTS idx_event_allocations_active_item
  ON event_allocations(item_id, status)
  WHERE status <> 'Returned';

-- 21. Event Checklist (operational task list)
CREATE TABLE IF NOT EXISTS event_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Todo', 'Done')) DEFAULT 'Todo',
  due_date TIMESTAMP DEFAULT NULL,
  owner_name TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_checklist_event ON event_checklist(event_id);




