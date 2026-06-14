-- Performance hardening for inventory list/stats queries
-- Run: bun run src/db/migrate-performance.ts

CREATE INDEX IF NOT EXISTS idx_items_created_at_desc
  ON items (created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'items'
      AND column_name = 'deleted_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_items_store_created_active
      ON items (store_id, created_at DESC)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_items_deleted_at
      ON items (deleted_at);

    CREATE INDEX IF NOT EXISTS idx_items_low_stock_active
      ON items (quantity)
      WHERE deleted_at IS NULL AND quantity < 5;
  ELSE
    -- Legacy schemas use quantity=-999999 as soft-delete sentinel.
    CREATE INDEX IF NOT EXISTS idx_items_store_created_legacy_active
      ON items (store_id, created_at DESC)
      WHERE quantity <> -999999;

    CREATE INDEX IF NOT EXISTS idx_items_low_stock_legacy_active
      ON items (quantity)
      WHERE quantity <> -999999 AND quantity < 5;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'items'
      AND column_name = 'last_counted_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_items_last_counted_at
      ON items (last_counted_at DESC);
  END IF;
END $$;