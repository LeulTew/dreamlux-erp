-- Create notifications and preferences schema
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_display_name TEXT,
  actor_username TEXT,
  actor_type TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action_url TEXT,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS actor_display_name TEXT,
  ADD COLUMN IF NOT EXISTS actor_username TEXT,
  ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'user';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_actor_type_check'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_actor_type_check CHECK (actor_type IN ('user', 'system'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  categories JSONB NOT NULL DEFAULT '{"proposals": true, "events": true, "expenses": true, "payroll": true, "inventory": true, "employees": true, "users": true, "roles": true, "settings": true, "security": true}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.notification_preferences
  ALTER COLUMN categories SET DEFAULT '{"proposals": true, "events": true, "expenses": true, "payroll": true, "inventory": true, "employees": true, "users": true, "roles": true, "settings": true, "security": true}'::jsonb;

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read ON public.notifications(recipient_id, read_at) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON public.notifications(recipient_id, created_at DESC);

-- Enable RLS and revoke access from anon/authenticated roles to match security architecture
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.notifications FROM %I', role_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.notification_preferences FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
