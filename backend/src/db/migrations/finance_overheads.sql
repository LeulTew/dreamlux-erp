-- Issue #110: Monthly overhead and shared operating expense register.
--
-- Mirrors the workbook MONTHLY WECHI / monthly total expense sheets: monthly
-- overhead entries grouped by scope (Office/Store/Shared/General) with a
-- payroll double-count guard (staff payments are a distinct payment kind) and
-- month-closure locking.

CREATE TABLE IF NOT EXISTS public.finance_overhead_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_month DATE NOT NULL,
  due_date DATE DEFAULT NULL,
  category TEXT NOT NULL,
  payee TEXT DEFAULT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('Office', 'Store', 'Shared', 'General')) DEFAULT 'Office',
  shared_with TEXT DEFAULT NULL,
  payment_kind TEXT NOT NULL CHECK (payment_kind IN ('overhead', 'staff_payment')) DEFAULT 'overhead',
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  notes TEXT DEFAULT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
  rejected_reason TEXT DEFAULT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP DEFAULT NULL,
  deleted_at TIMESTAMP DEFAULT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.finance_overhead_expenses'::regclass
      AND conname = 'finance_overhead_expenses_kind_employee_check'
  ) THEN
    ALTER TABLE public.finance_overhead_expenses
      ADD CONSTRAINT finance_overhead_expenses_kind_employee_check
      CHECK (payment_kind = 'staff_payment' OR employee_id IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.finance_overhead_expenses'::regclass
      AND conname = 'finance_overhead_expenses_shared_scope_check'
  ) THEN
    ALTER TABLE public.finance_overhead_expenses
      ADD CONSTRAINT finance_overhead_expenses_shared_scope_check
      CHECK (scope = 'Shared' OR shared_with IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_finance_overheads_month
  ON public.finance_overhead_expenses(expense_month)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_finance_overheads_status_month
  ON public.finance_overhead_expenses(status, expense_month)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_finance_overheads_staff_employee_month
  ON public.finance_overhead_expenses(employee_id, expense_month)
  WHERE deleted_at IS NULL AND payment_kind = 'staff_payment' AND employee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.finance_overhead_month_closures (
  month DATE PRIMARY KEY,
  closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  closed_at TIMESTAMP DEFAULT NOW()
);

-- Backend-owned tables: block direct Supabase Data API access (project standard).
ALTER TABLE public.finance_overhead_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_overhead_month_closures ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['finance_overhead_expenses', 'finance_overhead_month_closures'] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', table_name, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Finance overhead permission catalog entries.
INSERT INTO permissions (slug, description) VALUES
  ('finance:overheads:read', 'View monthly overhead register and summaries'),
  ('finance:overheads:write', 'Create and update monthly overhead expenses'),
  ('finance:overheads:approve', 'Approve, reject, and close monthly overhead expenses')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('finance:overheads:read', 'finance:overheads:write', 'finance:overheads:approve')
WHERE LOWER(r.name) IN ('super_admin', 'admin', 'owner')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('finance:overheads:read', 'finance:overheads:write', 'finance:overheads:approve')
WHERE LOWER(r.name) IN ('accountant')
ON CONFLICT DO NOTHING;
