import { getEnv } from "../lib/env";
import fs from "fs";
import path from "path";
import { createMigrationClient, migrationConnectionLabel } from "./migration-client";

async function runMigration() {
  const backupUrl = getEnv("DATABASE_BACKUP_URL");
  const databaseUrl = backupUrl || getEnv("DATABASE_URL");
  if (!databaseUrl) {
    console.error("DATABASE_BACKUP_URL or DATABASE_URL is not set in environment variables");
    process.exit(1);
  }

  if (backupUrl) {
    console.log("Using DATABASE_BACKUP_URL for migration connection.");
  }

  const client = createMigrationClient(databaseUrl);

  try {
    console.log(`Connecting to database (${migrationConnectionLabel(databaseUrl)})...`);
    await client.connect();

    const migrationPath = path.join(__dirname, "migrations", "phase3_inventory_expansion.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");

    console.log("Running Phase 3 migrations...");
    await client.query(migrationSql);
    console.log("Phase 3 migrations completed successfully!");

  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
