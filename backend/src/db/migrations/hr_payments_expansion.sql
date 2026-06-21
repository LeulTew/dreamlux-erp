-- Phase 4: HR Payments Run, Salary Settings, Event Types and Payroll History Expansion

-- 1. Salary Levels
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

-- 2. Event Types
CREATE TABLE IF NOT EXISTS event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  default_price_etb NUMERIC(15,2) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL
);

-- Seed default event types
INSERT INTO event_types (name, default_price_etb)
VALUES 
  ('Wedding', 5000.00),
  ('Mels', 2000.00),
  ('Birthday', 1500.00),
  ('Corporate Event', 3000.00),
  ('Photo Shoot', 1000.00)
ON CONFLICT (name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_event_types_deleted_at ON event_types(deleted_at);

-- 3. Payroll Runs
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

-- 4. Payroll Run Employee Lines
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

-- 5. Payroll Run Line Events
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

-- 5b. Payroll Audit Logs
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
