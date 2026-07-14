-- Issue #173: Dispatched-item return checklist and automatic inventory reallocation.
--
-- Stock invariant (extends the model documented in inventory_movements.sql):
--   * items.quantity                    = TOTAL OWNED GOOD stock.
--   * outstanding(allocation)           = quantity_allocated
--                                         - (returned_good + returned_damaged
--                                            + returned_lost + returned_repair)
--   * availability                      = items.quantity - SUM(outstanding)
--                                         over allocations with status <> 'Returned'.
--   * Recording a receipt:
--       - good quantities restore availability purely by shrinking outstanding
--         (items.quantity is NOT incremented — no double-credit).
--       - damaged / lost / under-repair quantities reduce items.quantity via an
--         immutable inventory_movements row (source_type 'event_return'), since
--         they are no longer owned good stock. Explicit later resolution (e.g.
--         repair completion) is a separate audited adjustment.
--   * An allocation becomes status = 'Returned' only when its dispatched
--     quantity is fully accounted for; at that point outstanding = 0, so the
--     transition never changes availability.
--
-- Receipts are immutable: corrections are compensating entries, never edits.

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
