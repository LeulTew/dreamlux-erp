-- Migration to add events and event_logs tables for Pillar 3 Event Management

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  event_type_id UUID REFERENCES event_types(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  venue_location TEXT NOT NULL,
  contract_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL CHECK (status IN ('Planned', 'Ongoing', 'Completed')) DEFAULT 'Planned',
  package_design_notes TEXT,
  estimated_design_cost NUMERIC(12, 2) DEFAULT 0.00,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMP DEFAULT NOW()
);

-- Design fields on events table (in case events table already exists from a previous run)
ALTER TABLE events ADD COLUMN IF NOT EXISTS package_design_notes TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS estimated_design_cost NUMERIC(12, 2) DEFAULT 0.00;

-- Inventory Allocations
CREATE TABLE IF NOT EXISTS event_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity_allocated INTEGER NOT NULL CHECK (quantity_allocated > 0),
  status TEXT NOT NULL CHECK (status IN ('Reserved', 'Pulled', 'Returned')) DEFAULT 'Reserved',
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Operational Checklist
CREATE TABLE IF NOT EXISTS event_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Todo', 'Done')) DEFAULT 'Todo',
  due_date TIMESTAMP DEFAULT NULL,
  owner_name TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_event_logs_event_id ON event_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_event_allocations_event ON event_allocations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_allocations_item ON event_allocations(item_id);
CREATE INDEX IF NOT EXISTS idx_event_checklist_event ON event_checklist(event_id);
