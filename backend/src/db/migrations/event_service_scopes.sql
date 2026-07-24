-- Migration: Event Service Scopes catalog and proposal/event relationships

-- 1. Catalog table for event service scopes
CREATE TABLE IF NOT EXISTS event_service_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_am TEXT NOT NULL,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed initial service scope catalog idempotently
INSERT INTO event_service_scopes (code, name_en, name_am, display_order)
VALUES
  ('FULL', 'Full', 'ሙሉ', 1),
  ('BACKGROUND', 'Background', 'ባክግራውንድ', 2),
  ('SETUP', 'Setup', 'ሴታፕ', 3),
  ('TABLE_SETUP', 'Table Setup', 'ጠረጴዛ ሴታፕ', 4)
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_am = EXCLUDED.name_am,
  display_order = EXCLUDED.display_order;

CREATE INDEX IF NOT EXISTS idx_event_service_scopes_code ON event_service_scopes(code);

-- 2. Junction table for proposals to service scopes
CREATE TABLE IF NOT EXISTS proposal_service_scopes (
  proposal_id UUID NOT NULL REFERENCES event_proposals(id) ON DELETE CASCADE,
  service_scope_id UUID NOT NULL REFERENCES event_service_scopes(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (proposal_id, service_scope_id)
);

CREATE INDEX IF NOT EXISTS idx_proposal_service_scopes_scope_id ON proposal_service_scopes(service_scope_id);

-- 3. Junction table for events to service scopes
CREATE TABLE IF NOT EXISTS event_service_scope_links (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  service_scope_id UUID NOT NULL REFERENCES event_service_scopes(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (event_id, service_scope_id)
);

CREATE INDEX IF NOT EXISTS idx_event_service_scope_links_scope_id ON event_service_scope_links(service_scope_id);
