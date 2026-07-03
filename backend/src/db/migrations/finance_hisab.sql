-- Issue #109: Weekly/monthly Hisab rollup — non-event operational expense ledger.
--
-- Event-side Hisab math is computed live from events/expenses (approved-only), so the
-- only new storage is the non-event operational expense table plus its permissions.

CREATE TABLE IF NOT EXISTS public.finance_operational_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date DATE NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
  rejected_reason TEXT DEFAULT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP DEFAULT NULL,
  deleted_at TIMESTAMP DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_opex_date
  ON public.finance_operational_expenses(expense_date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_finance_opex_status_date
  ON public.finance_operational_expenses(status, expense_date)
  WHERE deleted_at IS NULL;

-- Backend-owned table: block direct Supabase Data API access (project standard).
ALTER TABLE public.finance_operational_expenses ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.finance_operational_expenses FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;

-- Finance permission catalog entries.
INSERT INTO permissions (slug, description) VALUES
  ('finance:hisab:read', 'View weekly/monthly Hisab rollups and operational expense ledger'),
  ('finance:opex:write', 'Create and update non-event operational expenses'),
  ('finance:opex:approve', 'Approve or reject non-event operational expenses')
ON CONFLICT (slug) DO NOTHING;

-- Superuser-style roles receive every permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('finance:hisab:read', 'finance:opex:write', 'finance:opex:approve')
WHERE LOWER(r.name) IN ('super_admin', 'admin', 'owner')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('finance:hisab:read', 'finance:opex:write', 'finance:opex:approve')
WHERE LOWER(r.name) IN ('accountant')
ON CONFLICT DO NOTHING;
