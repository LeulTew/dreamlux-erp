-- Issue #106: storekeeper dispatch checklist and departure tracking

ALTER TABLE event_allocations
  ADD COLUMN IF NOT EXISTS dispatch_checked_at TIMESTAMP DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS dispatch_checked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS departed_at TIMESTAMP DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS departed_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_allocations_dispatch_queue
  ON event_allocations(event_id, departed_at, dispatch_checked_at)
  WHERE status <> 'Returned';
