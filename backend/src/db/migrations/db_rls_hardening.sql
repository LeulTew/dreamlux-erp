-- Issue #31: harden backend-owned public tables against direct Supabase Data API access.
--
-- DreamLux routes enforce authorization through the Express API. These tables are
-- backend-owned and should not be directly readable or writable by Supabase anon
-- or authenticated clients unless a later migration adds a deliberate policy.

DO $$
DECLARE
  protected_tables text[] := ARRAY[
    'app_settings',
    'categories',
    'departments',
    'employees',
    'event_allocations',
    'event_assignments',
    'event_checklist',
    'event_logs',
    'event_saved_views',
    'event_types',
    'events',
    'expenses',
    'field_permissions',
    'inventory_reconciliation_items',
    'inventory_reconciliation_legacy_deleted',
    'inventory_reconciliation_legacy_trash',
    'inventory_reconciliation_runs',
    'items',
    'payroll_run_employee_lines',
    'payroll_run_line_events',
    'payroll_runs',
    'permissions',
    'positions',
    'role_permissions',
    'roles',
    'salary_levels',
    'stores',
    'trips',
    'user_access_scopes',
    'users',
    'vehicle_assignments',
    'vehicles'
  ];
  table_name text;
  role_name text;
BEGIN
  FOREACH table_name IN ARRAY protected_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format(
            'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',
            table_name,
            role_name
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', role_name);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
        role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
        role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;
