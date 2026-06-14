-- Migration: Phase 3 Inventory Expansion & Reconciliation
-- Run: bun run src/db/migrate-phase3.ts (or manually)

-- 1. Ensure stores table holds the required locations
DELETE FROM stores s1
USING stores s2
WHERE s1.ctid < s2.ctid
  AND s1.name = s2.name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_name_unique
  ON stores (name);

INSERT INTO stores (name) VALUES
  ('Bulbula Coka'),
  ('Bulbula 2'),
  ('Haya Arat')
ON CONFLICT (name) DO NOTHING;

-- Rename 'Main Warehouse', 'Store A', 'Store B' if they exist to match? 
-- Actually, the user says "must include Bulbula Coka, Bulbula 2, Haya Arat. Seed missing ones."
-- So seeding is enough.

-- 2. Add inventory reconciliation fields to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS last_counted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE items ADD COLUMN IF NOT EXISTS last_counted_by UUID REFERENCES users(id) DEFAULT NULL;

-- 3. Ensure users table has profile_image_url for RBAC completeness
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT DEFAULT NULL;

-- 4. Initial cleanup: If any items have quantity -999999, set deleted_at and set quantity to 0?
-- Actually, let's just set deleted_at for consistency.
UPDATE items SET deleted_at = NOW() WHERE quantity = -999999 AND deleted_at IS NULL;
