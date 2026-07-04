-- Issue #111: Capital investment and asset purchase register.
--
-- Tracks long-lived equipment, fabric, fixtures, hardware, and similar capex
-- separately from event expenses, Hisab operational expenses, and monthly
-- overhead. Optional item links document whether the investment created stock
-- or only records financial capex.

CREATE TABLE IF NOT EXISTS public.capital_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_date DATE NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Equipment', 'Fabric', 'Fixtures', 'Hardware', 'Vehicle', 'Store Buildout', 'Office Equipment', 'Other')),
  quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  unit_cost NUMERIC(12, 2) NOT NULL CHECK (unit_cost > 0),
  total_cost NUMERIC(12, 2) GENERATED ALWAYS AS (ROUND((quantity * unit_cost)::numeric, 2)) STORED,
  vendor TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  capex_classification TEXT NOT NULL CHECK (capex_classification IN ('Capital Asset', 'Inventory Asset', 'Leasehold Improvement', 'Fixture', 'Other Capex')) DEFAULT 'Capital Asset',
  asset_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  creates_inventory_stock BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
  rejected_reason TEXT DEFAULT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP DEFAULT NULL,
  deleted_at TIMESTAMP DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_capital_investments_purchase_date
  ON public.capital_investments(purchase_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_capital_investments_status_date
  ON public.capital_investments(status, purchase_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_capital_investments_category_date
  ON public.capital_investments(category, purchase_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_capital_investments_asset
  ON public.capital_investments(asset_id)
  WHERE deleted_at IS NULL AND asset_id IS NOT NULL;

ALTER TABLE public.capital_investments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.capital_investments FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

INSERT INTO permissions (slug, description) VALUES
  ('finance:investments:read', 'View capital investment register and summaries'),
  ('finance:investments:write', 'Create and update capital investment entries'),
  ('finance:investments:approve', 'Approve, reject, delete, and export capital investment entries')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('finance:investments:read', 'finance:investments:write', 'finance:investments:approve')
WHERE LOWER(r.name) IN ('super_admin', 'admin', 'owner', 'accountant')
ON CONFLICT DO NOTHING;
