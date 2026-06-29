-- Migration to add activity_logs table for Issue #82 Activity Timeline

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'event', 'proposal', 'asset', 'employee', 'payroll', 'user', 'role', 'settings'
  entity_id UUID NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'restore', 'approve', 'reject', 'convert', 'reconcile'
  field_changed TEXT, -- specific column name or nested key that was modified
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Optimize queries searching logs for a specific entity
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON public.activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Revoke public access to keep information secure
DO $$
DECLARE
  role_name RECORD;
BEGIN
  FOR role_name IN 
    SELECT rolname FROM pg_roles 
    WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.activity_logs FROM %I', role_name.rolname);
  END LOOP;
END $$;

-- Allow read permission for authenticated users (Express backend connects as superuser / pool owner, bypassing RLS where necessary, but we keep this standard for schema parity)
GRANT SELECT ON public.activity_logs TO authenticated;
