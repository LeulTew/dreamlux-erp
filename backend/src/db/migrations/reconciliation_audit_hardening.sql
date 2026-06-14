-- Reconciliation audit hardening for legacy/partial deployments
-- Run: bun run src/db/migrate-reconciliation-audit-hardening.ts

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS inventory_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID,
  initiated_by UUID,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP DEFAULT NOW(),
  item_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID,
  item_id UUID,
  previous_quantity INTEGER NOT NULL DEFAULT 0,
  counted_quantity INTEGER NOT NULL DEFAULT 0,
  delta INTEGER NOT NULL DEFAULT 0,
  counted_at TIMESTAMP DEFAULT NOW(),
  counted_by UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE IF EXISTS inventory_reconciliation_runs
  ADD COLUMN IF NOT EXISTS store_id UUID,
  ADD COLUMN IF NOT EXISTS initiated_by UUID,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS item_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

UPDATE inventory_reconciliation_runs
SET item_count = COALESCE(item_count, 0)
WHERE item_count IS NULL;

ALTER TABLE IF EXISTS inventory_reconciliation_runs
  ALTER COLUMN item_count SET DEFAULT 0,
  ALTER COLUMN item_count SET NOT NULL;

ALTER TABLE IF EXISTS inventory_reconciliation_items
  ADD COLUMN IF NOT EXISTS run_id UUID,
  ADD COLUMN IF NOT EXISTS item_id UUID,
  ADD COLUMN IF NOT EXISTS previous_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS counted_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delta INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS counted_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS counted_by UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

UPDATE inventory_reconciliation_items
SET
  previous_quantity = COALESCE(previous_quantity, 0),
  counted_quantity = COALESCE(counted_quantity, 0),
  delta = COALESCE(delta, COALESCE(counted_quantity, 0) - COALESCE(previous_quantity, 0))
WHERE
  previous_quantity IS NULL
  OR counted_quantity IS NULL
  OR delta IS NULL;

ALTER TABLE IF EXISTS inventory_reconciliation_items
  ALTER COLUMN previous_quantity SET DEFAULT 0,
  ALTER COLUMN counted_quantity SET DEFAULT 0,
  ALTER COLUMN delta SET DEFAULT 0,
  ALTER COLUMN previous_quantity SET NOT NULL,
  ALTER COLUMN counted_quantity SET NOT NULL,
  ALTER COLUMN delta SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recon_runs_started_at
  ON inventory_reconciliation_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_recon_runs_store_started_at
  ON inventory_reconciliation_runs (store_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_recon_items_run_id
  ON inventory_reconciliation_items (run_id);

CREATE INDEX IF NOT EXISTS idx_recon_items_item_id
  ON inventory_reconciliation_items (item_id);

CREATE INDEX IF NOT EXISTS idx_recon_items_counted_at
  ON inventory_reconciliation_items (counted_at DESC);
