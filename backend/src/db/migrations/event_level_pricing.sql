-- Add level-specific pricing to event types
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS prices_by_level JSONB DEFAULT '{}'::jsonb;

-- Ensure an index for performance if needed (though event_types is usually small)
CREATE INDEX IF NOT EXISTS idx_event_types_prices_by_level ON event_types USING gin(prices_by_level);

-- Normalize malformed values to a safe object.
UPDATE event_types
SET prices_by_level = '{}'::jsonb
WHERE prices_by_level IS NULL OR jsonb_typeof(prices_by_level) <> 'object';

-- Remap legacy keys (salary code/label) to salary level IDs.
-- Keep already-UUID keys untouched and preserve unknown keys to avoid data loss.
UPDATE event_types e
SET prices_by_level = COALESCE(
  (
    SELECT jsonb_object_agg(mapped_key, value)
    FROM (
      SELECT
        CASE
          WHEN kv.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN kv.key
          WHEN sl.id IS NOT NULL THEN sl.id::text
          ELSE kv.key
        END AS mapped_key,
        kv.value
      FROM jsonb_each(e.prices_by_level) kv(key, value)
      LEFT JOIN salary_levels sl ON sl.code = kv.key AND sl.deleted_at IS NULL
    ) mapped
  ),
  '{}'::jsonb
)
WHERE e.prices_by_level IS NOT NULL;
