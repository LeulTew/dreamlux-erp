CREATE TABLE IF NOT EXISTS event_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('personal', 'role', 'global')) DEFAULT 'personal',
  role_name TEXT DEFAULT NULL,
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  filters JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort JSONB DEFAULT NULL,
  page_size INTEGER NOT NULL DEFAULT 20 CHECK (page_size BETWEEN 1 AND 100),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL,
  CONSTRAINT event_saved_views_scope_target_check CHECK (
    (scope = 'personal' AND user_id IS NOT NULL AND role_name IS NULL)
    OR (scope = 'role' AND user_id IS NULL AND role_name IS NOT NULL)
    OR (scope = 'global' AND user_id IS NULL AND role_name IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_event_saved_views_user
  ON event_saved_views(user_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_saved_views_scope
  ON event_saved_views(scope, role_name)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_saved_views_default_personal
  ON event_saved_views(user_id)
  WHERE deleted_at IS NULL AND is_default = TRUE AND scope = 'personal';
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_saved_views_default_role
  ON event_saved_views(LOWER(role_name))
  WHERE deleted_at IS NULL AND is_default = TRUE AND scope = 'role';
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_saved_views_default_global
  ON event_saved_views((scope))
  WHERE deleted_at IS NULL AND is_default = TRUE AND scope = 'global';

ALTER TABLE event_saved_views ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.event_saved_views FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;

INSERT INTO permissions (slug, description)
VALUES ('events:saved_views:share', 'Create and manage role or global saved event views')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug = 'events:saved_views:share'
WHERE LOWER(r.name) IN ('owner', 'admin', 'super_admin', 'ops_manager')
ON CONFLICT DO NOTHING;
