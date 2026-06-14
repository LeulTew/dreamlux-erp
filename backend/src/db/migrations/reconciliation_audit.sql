-- Reconciliation audit trail tables
-- Run: bun run src/db/migrate-reconciliation-audit.ts

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
