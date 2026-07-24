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
