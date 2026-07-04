CREATE TABLE IF NOT EXISTS public.record_list_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,
  sort JSONB,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  page_size INTEGER CHECK (page_size IS NULL OR (page_size >= 1 AND page_size <= 200)),
  visible_columns TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  density TEXT CHECK (density IS NULL OR density IN ('compact', 'comfortable', 'spacious')),
  active_tab TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT record_list_preferences_record_type_check CHECK (record_type ~ '^[A-Za-z0-9:_-]{1,80}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_record_list_preferences_user_record
  ON public.record_list_preferences(user_id, record_type);

CREATE INDEX IF NOT EXISTS idx_record_list_preferences_updated_at
  ON public.record_list_preferences(updated_at DESC);

ALTER TABLE public.record_list_preferences ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.record_list_preferences FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
