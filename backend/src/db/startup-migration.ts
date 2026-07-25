import { Client } from "pg";
import { getEnv } from "../lib/env";

export async function runStartupMigrations() {
  const databaseUrl = getEnv("DATABASE_URL");
  if (!databaseUrl) return;

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("[StartupMigration] Checking for missing payroll-support columns...");
    await client.connect();

    // Add event_prices column to employees
    await client.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS event_prices JSONB DEFAULT '{}'::jsonb;
    `);

    await client.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS compensation_mode TEXT;
      UPDATE employees SET compensation_mode = 'regular' WHERE compensation_mode IS NULL;
      ALTER TABLE employees ALTER COLUMN compensation_mode SET DEFAULT 'regular';
      ALTER TABLE employees ALTER COLUMN compensation_mode SET NOT NULL;
      DO $$ BEGIN
        ALTER TABLE employees ADD CONSTRAINT employees_compensation_mode_check
          CHECK (compensation_mode IN ('regular', 'commission_only'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      ALTER TABLE payroll_run_employee_lines ADD COLUMN IF NOT EXISTS compensation_mode_snapshot TEXT;
      UPDATE payroll_run_employee_lines SET compensation_mode_snapshot = 'regular'
        WHERE compensation_mode_snapshot IS NULL;
      ALTER TABLE payroll_run_employee_lines ALTER COLUMN compensation_mode_snapshot SET DEFAULT 'regular';
      ALTER TABLE payroll_run_employee_lines ALTER COLUMN compensation_mode_snapshot SET NOT NULL;
      DO $$ BEGIN
        ALTER TABLE payroll_run_employee_lines ADD CONSTRAINT payroll_lines_compensation_mode_check
          CHECK (compensation_mode_snapshot IN ('regular', 'commission_only'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // Add salary_level_id column to employees (new FK-based system)
    await client.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_level_id UUID REFERENCES salary_levels(id);
    `).catch(() => {
      // Ignore if salary_levels table doesn't exist yet
    });

    // Add inventory_id_prefix and event_id_prefix columns to app_settings
    await client.query(`
      ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS inventory_id_prefix TEXT NOT NULL DEFAULT 'INV';
    `);
    await client.query(`
      ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS event_id_prefix TEXT NOT NULL DEFAULT 'EVT';
    `);

    await client.query(`
      ALTER TABLE event_allocations
        ADD COLUMN IF NOT EXISTS dispatch_checked_at TIMESTAMP DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS dispatch_checked_by UUID REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS departed_at TIMESTAMP DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS departed_by UUID REFERENCES users(id) ON DELETE SET NULL;
    `).catch(() => {
      // Ignore if event_allocations has not been created yet.
    });

    // Issue #197: an assignment is a schedule, not a presence record. Flip the default so new
    // rows start attendance-unverified. Historical rows are deliberately NOT rewritten - see
    // migrations/event_assignment_attendance.sql for the full data policy. NULL is normalized
    // to FALSE because every financial query already excludes NULL, so it changes no money.
    await client.query(`
      ALTER TABLE event_assignments
        ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMP DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS attendance_marked_by UUID REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE event_assignments ALTER COLUMN attended SET DEFAULT FALSE;
      UPDATE event_assignments SET attended = FALSE WHERE attended IS NULL;
      ALTER TABLE event_assignments ALTER COLUMN attended SET NOT NULL;
    `).catch(() => {
      // Ignore if event_assignments has not been created yet.
    });

    // Add Event Service Scopes catalog and junction tables
    await client.query(`
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

      CREATE TABLE IF NOT EXISTS proposal_service_scopes (
        proposal_id UUID NOT NULL REFERENCES event_proposals(id) ON DELETE CASCADE,
        service_scope_id UUID NOT NULL REFERENCES event_service_scopes(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (proposal_id, service_scope_id)
      );

      CREATE TABLE IF NOT EXISTS event_service_scope_links (
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        service_scope_id UUID NOT NULL REFERENCES event_service_scopes(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (event_id, service_scope_id)
      );
    `).catch((err: any) => {
      console.warn("[StartupMigration] event_service_scopes init notice:", err.message);
    });

    console.log("[StartupMigration] Success: Schema is up to date.");
  } catch (err: any) {
    console.warn("[StartupMigration] Note: Automatic migration skip/fail:", err.message);
    // We don't exit process here because we want the server to start even if migrations are partially failed
    // (though the 500 might persist if this fails, but at least we tried from the server side)
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}
