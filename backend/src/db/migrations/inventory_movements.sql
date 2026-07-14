-- Issue #172: Immutable inventory movement ledger + investment stock application.
--
-- Stock invariant (authoritative model, documented for #172/#173):
--   * items.quantity            = TOTAL OWNED stock for the item (integer count).
--   * event_allocations         derive AVAILABLE stock as
--                                 items.quantity - SUM(quantity_allocated WHERE status <> 'Returned').
--   * An approved stock-creating capital investment increases TOTAL OWNED stock
--     exactly once (one ledger row, one quantity update).
--   * Dispatch/return flows move stock between reserved/outstanding states and
--     must NOT additionally mutate items.quantity (no double counting).
--
-- Precision policy: items.quantity is INTEGER. Stock-creating investments must
-- therefore carry a whole-number quantity; fractional quantities are rejected at
-- validation and again at approval time (no implicit casts or rounding).
--
-- Idempotency: the UNIQUE (source_type, source_id) index guarantees at most one
-- movement per stock-creating investment at the database level, independent of
-- application-side status checks.

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  quantity_before INTEGER NOT NULL CHECK (quantity_before >= 0),
  quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  notes TEXT DEFAULT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_movements_source
  ON inventory_movements(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_item
  ON inventory_movements(item_id, created_at DESC);

-- Durable stock-application marker on the investment (queryability; the ledger
-- row remains the source of truth).
ALTER TABLE capital_investments
  ADD COLUMN IF NOT EXISTS stock_applied_at TIMESTAMP DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stock_applied_by UUID REFERENCES users(id) ON DELETE SET NULL;
