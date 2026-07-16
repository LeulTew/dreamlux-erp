\set ON_ERROR_STOP on

SELECT c.relname,
       c.relrowsecurity AS rls,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
FROM pg_class c
WHERE c.relname IN (
  'inventory_movements',
  'event_return_receipts',
  'inventory_condition_resolutions',
  'event_return_corrections'
)
ORDER BY 1;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_inventory_movements_source_id',
    'idx_event_allocations_open_returns',
    'idx_event_return_receipts_event_history',
    'uq_event_return_corrections_idem',
    'idx_event_return_corrections_allocation'
  )
ORDER BY 1;

SELECT tgname
FROM pg_trigger
WHERE tgname IN (
  'trg_inventory_movements_append_only',
  'trg_event_return_receipts_immutable',
  'trg_condition_resolutions_immutable',
  'trg_event_return_corrections_immutable'
)
ORDER BY 1;

SELECT proname, proconfig
FROM pg_proc
WHERE proname IN ('prevent_inventory_movement_mutation', 'prevent_return_audit_mutation')
ORDER BY 1;

SELECT COALESCE(
  (SELECT source_id::text FROM inventory_movements LIMIT 1),
  gen_random_uuid()::text
) AS movement_source_id \gset

EXPLAIN (COSTS OFF)
SELECT * FROM inventory_movements
WHERE source_id = :'movement_source_id'::uuid
ORDER BY created_at DESC;

SET enable_seqscan = off;
EXPLAIN (COSTS OFF)
SELECT event_id, item_id, quantity_allocated
FROM event_allocations
WHERE departed_at IS NOT NULL AND status <> 'Returned'
ORDER BY event_id;
RESET enable_seqscan;
