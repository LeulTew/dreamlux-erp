-- Issue #173: Dispatched-item return checklist and automatic inventory reallocation.
--
-- Stock invariant (extends the model documented in inventory_movements.sql):
--   * items.quantity                    = TOTAL OWNED stock.
--   * unavailable damaged/repair stock  = owned but not allocatable.
--   * outstanding(allocation)           = quantity_allocated
--                                         - (returned_good + returned_damaged
--                                            + returned_lost + returned_repair)
--   * availability                      = items.quantity - SUM(outstanding)
--                                         over allocations with status <> 'Returned'.
--   * Recording a receipt:
--       - good quantities restore availability purely by shrinking outstanding
--         (items.quantity is NOT incremented — no double-credit).
--       - damaged / under-repair quantities remain owned and move into explicit
--         unavailable balances; only confirmed loss reduces items.quantity.
--   * An allocation becomes status = 'Returned' only when its dispatched
--     quantity is fully accounted for; at that point outstanding = 0, so the
--     transition never changes availability.
--
-- Receipts are immutable: corrections are compensating entries, never edits.

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS unavailable_damaged_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unavailable_repair_quantity INTEGER NOT NULL DEFAULT 0;

ALTER TABLE items DROP CONSTRAINT IF EXISTS chk_items_condition_quantities;
ALTER TABLE items ADD CONSTRAINT chk_items_condition_quantities CHECK (
  unavailable_damaged_quantity >= 0
  AND unavailable_repair_quantity >= 0
  AND unavailable_damaged_quantity + unavailable_repair_quantity <= quantity
);

-- Per-allocation running return accounting + finalization metadata.
ALTER TABLE event_allocations
  ADD COLUMN IF NOT EXISTS returned_good_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_damaged_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_lost_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_repair_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMP DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS returned_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Accounted totals can never exceed the dispatched quantity (DB-level guard
-- against concurrent over-returns, independent of application locks).
ALTER TABLE event_allocations DROP CONSTRAINT IF EXISTS chk_event_allocations_return_totals;
ALTER TABLE event_allocations ADD CONSTRAINT chk_event_allocations_return_totals CHECK (
  returned_good_quantity >= 0
  AND returned_damaged_quantity >= 0
  AND returned_lost_quantity >= 0
  AND returned_repair_quantity >= 0
  AND (returned_good_quantity + returned_damaged_quantity
       + returned_lost_quantity + returned_repair_quantity) <= quantity_allocated
);

-- Immutable per-allocation return receipt lines.
CREATE TABLE IF NOT EXISTS event_return_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id UUID NOT NULL REFERENCES event_allocations(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  good_quantity INTEGER NOT NULL DEFAULT 0 CHECK (good_quantity >= 0),
  damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  lost_quantity INTEGER NOT NULL DEFAULT 0 CHECK (lost_quantity >= 0),
  repair_quantity INTEGER NOT NULL DEFAULT 0 CHECK (repair_quantity >= 0),
  outstanding_before INTEGER NOT NULL CHECK (outstanding_before >= 0),
  outstanding_after INTEGER NOT NULL CHECK (outstanding_after >= 0),
  notes TEXT DEFAULT NULL,
  idempotency_key TEXT DEFAULT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (good_quantity + damaged_quantity + lost_quantity + repair_quantity > 0)
);

CREATE TABLE IF NOT EXISTS inventory_condition_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  source_condition TEXT NOT NULL CHECK (source_condition IN ('damaged', 'repair')),
  outcome TEXT NOT NULL CHECK (outcome IN ('good', 'damaged', 'repair', 'lost')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  notes TEXT DEFAULT NULL,
  idempotency_key TEXT DEFAULT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_condition_resolution_idem
  ON inventory_condition_resolutions(item_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_condition_resolutions_item
  ON inventory_condition_resolutions(item_id, created_at DESC);

-- Retry safety: the same client-supplied idempotency key can only ever create
-- one receipt for an allocation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_return_receipts_idem
  ON event_return_receipts(allocation_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_return_receipts_allocation
  ON event_return_receipts(allocation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_return_receipts_event
  ON event_return_receipts(event_id, created_at DESC);

-- Return queue access path: departed, not fully reconciled.
CREATE INDEX IF NOT EXISTS idx_event_allocations_return_queue
  ON event_allocations(event_id)
  WHERE departed_at IS NOT NULL AND status <> 'Returned';

CREATE OR REPLACE FUNCTION prevent_return_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'return audit records are append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_event_return_receipts_immutable ON event_return_receipts;
CREATE TRIGGER trg_event_return_receipts_immutable
  BEFORE UPDATE OR DELETE ON event_return_receipts
  FOR EACH ROW EXECUTE FUNCTION prevent_return_audit_mutation();
DROP TRIGGER IF EXISTS trg_condition_resolutions_immutable ON inventory_condition_resolutions;
CREATE TRIGGER trg_condition_resolutions_immutable
  BEFORE UPDATE OR DELETE ON inventory_condition_resolutions
  FOR EACH ROW EXECUTE FUNCTION prevent_return_audit_mutation();

ALTER TABLE event_return_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_condition_resolutions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE event_return_receipts, inventory_condition_resolutions FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE event_return_receipts, inventory_condition_resolutions FROM authenticated;
  END IF;
END $$;
REVOKE ALL ON FUNCTION prevent_return_audit_mutation() FROM PUBLIC;
