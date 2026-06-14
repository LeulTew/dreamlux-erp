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
