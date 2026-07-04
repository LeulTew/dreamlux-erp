-- Issue #113: Legacy Hisab workbook import and reconciliation mapper.
-- Stores import metadata and source links only; uploaded workbook cell data is
-- parsed in memory and never persisted as raw workbook content.

CREATE TABLE IF NOT EXISTS public.finance_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workbook_hash TEXT NOT NULL UNIQUE,
  source_filename TEXT,
  layout_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Committed', 'Failed')) DEFAULT 'Committed',
  row_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  mismatch_count INTEGER NOT NULL DEFAULT 0 CHECK (mismatch_count >= 0),
  unmatched_count INTEGER NOT NULL DEFAULT 0 CHECK (unmatched_count >= 0),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_import_batches_created_at
  ON public.finance_import_batches(created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.finance_operational_expenses') IS NOT NULL THEN
    ALTER TABLE public.finance_operational_expenses
      ADD COLUMN IF NOT EXISTS source_import_id UUID REFERENCES public.finance_import_batches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_finance_opex_source_import
      ON public.finance_operational_expenses(source_import_id)
      WHERE source_import_id IS NOT NULL;
  END IF;

  IF to_regclass('public.finance_overhead_expenses') IS NOT NULL THEN
    ALTER TABLE public.finance_overhead_expenses
      ADD COLUMN IF NOT EXISTS source_import_id UUID REFERENCES public.finance_import_batches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_finance_overheads_source_import
      ON public.finance_overhead_expenses(source_import_id)
      WHERE source_import_id IS NOT NULL;
  END IF;

  IF to_regclass('public.capital_investments') IS NOT NULL THEN
    ALTER TABLE public.capital_investments
      ADD COLUMN IF NOT EXISTS source_import_id UUID REFERENCES public.finance_import_batches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_capital_investments_source_import
      ON public.capital_investments(source_import_id)
      WHERE source_import_id IS NOT NULL;
  END IF;

  IF to_regclass('public.expenses') IS NOT NULL THEN
    ALTER TABLE public.expenses
      ADD COLUMN IF NOT EXISTS source_import_id UUID REFERENCES public.finance_import_batches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_expenses_source_import
      ON public.expenses(source_import_id)
      WHERE source_import_id IS NOT NULL;
  END IF;
END $$;

ALTER TABLE public.finance_import_batches ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.finance_import_batches FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

INSERT INTO permissions (slug, description) VALUES
  ('finance:imports:write', 'Preview and commit legacy Hisab workbook imports')
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug = 'finance:imports:write'
WHERE LOWER(r.name) IN ('super_admin', 'admin', 'owner', 'accountant')
ON CONFLICT DO NOTHING;
