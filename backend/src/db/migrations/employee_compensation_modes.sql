-- Issue #195: canonical employee compensation modes and immutable payroll snapshots.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS compensation_mode TEXT;
UPDATE employees SET compensation_mode = 'regular' WHERE compensation_mode IS NULL;
ALTER TABLE employees ALTER COLUMN compensation_mode SET DEFAULT 'regular';
ALTER TABLE employees ALTER COLUMN compensation_mode SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT employees_compensation_mode_check
    CHECK (compensation_mode IN ('regular', 'commission_only'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE payroll_run_employee_lines ADD COLUMN IF NOT EXISTS compensation_mode_snapshot TEXT;
UPDATE payroll_run_employee_lines SET compensation_mode_snapshot = 'regular'
WHERE compensation_mode_snapshot IS NULL;
ALTER TABLE payroll_run_employee_lines ALTER COLUMN compensation_mode_snapshot SET DEFAULT 'regular';
ALTER TABLE payroll_run_employee_lines ALTER COLUMN compensation_mode_snapshot SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE payroll_run_employee_lines ADD CONSTRAINT payroll_lines_compensation_mode_check
    CHECK (compensation_mode_snapshot IN ('regular', 'commission_only'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
