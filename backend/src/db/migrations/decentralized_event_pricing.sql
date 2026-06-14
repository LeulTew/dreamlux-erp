-- 1. Add event_prices JSONB column to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS event_prices JSONB DEFAULT '{}'::jsonb;

-- 2. Remove legacy pricing columns from event_types
ALTER TABLE event_types DROP COLUMN IF EXISTS default_price_etb;
ALTER TABLE event_types DROP COLUMN IF EXISTS prices_by_level;

-- 3. Add salary_level_id column to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_level_id UUID REFERENCES salary_levels(id);

-- 4. Migrate existing TEXT salary_level to salary_level_id
UPDATE employees e
SET salary_level_id = sl.id
FROM salary_levels sl
WHERE e.salary_level = sl.code
  AND e.salary_level_id IS NULL;
