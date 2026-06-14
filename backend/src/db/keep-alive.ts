/**
 * EL ERP — Database Keep-Alive Script
 * Pings the database to prevent Supabase from pausing the project.
 * Deployed as a Vercel Cron Job (see backend/vercel.json).
 *
 * Schedule: Every 5 days (Supabase pauses after 7 days of inactivity)
 */

import { getEnv } from "../lib/env";
import { createMigrationClient } from "./migration-client";

async function keepAlive() {
  const databaseUrl = getEnv("DATABASE_URL");
  if (!databaseUrl) {
    console.error("[keep-alive] DATABASE_URL not set, skipping.");
    return;
  }

  const client = createMigrationClient(databaseUrl);
  try {
    await client.connect();
    const { rows } = await client.query("SELECT NOW() AS ts, COUNT(*) AS employees FROM employees WHERE deleted_at IS NULL");
    console.log(`[keep-alive] ✓ DB alive at ${rows[0].ts} — ${rows[0].employees} active employees`);
  } catch (err) {
    console.error("[keep-alive] ✗ DB ping failed:", err);
    throw err;
  } finally {
    await client.end();
  }
}

keepAlive();
