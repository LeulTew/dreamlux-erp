CREATE TABLE IF NOT EXISTS event_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  event_type_id UUID REFERENCES event_types(id) ON DELETE SET NULL,
  requested_budget NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  requested_start_date DATE,
  requested_end_date DATE,
  requested_start_time TIME,
  requested_end_time TIME,
  venue_location TEXT,
  notes TEXT,
  package_design_notes TEXT,
  cost_breakdown JSONB NOT NULL DEFAULT '{"design":[],"team":[],"trip":[],"other":[]}'::jsonb,
  estimated_design_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_team_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_trip_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_other_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_net_profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_margin_percentage NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected', 'Converted', 'Canceled')) DEFAULT 'Draft',
  rejection_reason TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  converted_event_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL,
  CONSTRAINT event_proposals_requested_date_check CHECK (
    requested_start_date IS NULL OR requested_end_date IS NULL OR requested_start_date <= requested_end_date
  )
);

CREATE TABLE IF NOT EXISTS event_proposal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES event_proposals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS event_proposal_id UUID REFERENCES event_proposals(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_proposals_converted_event_fk'
      AND conrelid = 'event_proposals'::regclass
  ) THEN
    ALTER TABLE event_proposals
      ADD CONSTRAINT event_proposals_converted_event_fk
      FOREIGN KEY (converted_event_id) REFERENCES events(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_proposals_status
  ON event_proposals(status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_proposals_created_by
  ON event_proposals(created_by)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_proposals_requested_start
  ON event_proposals(requested_start_date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_proposals_profit
  ON event_proposals(estimated_net_profit, estimated_margin_percentage)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_proposals_converted_event_unique
  ON event_proposals(converted_event_id)
  WHERE converted_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_event_proposal_unique
  ON events(event_proposal_id)
  WHERE event_proposal_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_proposal_logs_proposal_id
  ON event_proposal_logs(proposal_id);

ALTER TABLE event_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_proposal_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.event_proposals FROM %I', role_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.event_proposal_logs FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

INSERT INTO permissions (slug, description)
VALUES
  ('events:proposals:write', 'Create and submit event intake profitability proposals'),
  ('events:proposals:approve', 'Approve, reject, cancel, and convert event intake proposals')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug = 'events:proposals:write'
WHERE LOWER(r.name) IN ('owner', 'admin', 'super_admin', 'ops_manager', 'event_manager')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug = 'events:proposals:approve'
WHERE LOWER(r.name) IN ('owner', 'admin', 'super_admin', 'ops_manager')
ON CONFLICT DO NOTHING;
