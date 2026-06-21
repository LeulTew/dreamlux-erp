-- Migration for DB Field Parity & Pillar 3 Event Management Core Tables
-- Run to upgrade schema to support full SRD Phase 1 features

-- 1. Extend Employees Table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type TEXT CHECK (employment_type IN ('full-time', 'part-time', 'event-based')) DEFAULT 'full-time';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS group_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_status TEXT CHECK (contract_status IN ('Active', 'Suspended', 'Expired')) DEFAULT 'Active';

-- 2. Extend Items (Inventory) Table
ALTER TABLE items ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS unit_of_measurement TEXT DEFAULT 'pcs';
ALTER TABLE items ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS purchase_cost NUMERIC(12, 2);
ALTER TABLE items ADD COLUMN IF NOT EXISTS condition_status TEXT CHECK (condition_status IN ('Good', 'Damaged', 'Under Repair')) DEFAULT 'Good';

-- 3. Create Vehicles Table
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

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_vehicles_deleted_at ON vehicles(deleted_at);

-- 4. Create Event Assignments Table (links employees to events)
CREATE TABLE IF NOT EXISTS event_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- e.g. Event Manager, Supervisor, Team Leader, etc.
  commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  attended BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (event_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_event_assignments_event ON event_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_assignments_employee ON event_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_event_assignments_employee_event ON event_assignments(employee_id, event_id);

-- 5. Create Vehicle Assignments Table (links vehicles/drivers to events)
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

-- 6. Create Trips Table (tracks mileage and fuel for vehicle assignments)
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

-- 7. Create Expenses Table (logs event expenses for approval)
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_auto_labor_once_per_event
  ON expenses(event_id)
  WHERE category = 'Labor'
    AND description = 'Auto-generated labor cost from attended event assignments'
    AND status != 'Rejected';
