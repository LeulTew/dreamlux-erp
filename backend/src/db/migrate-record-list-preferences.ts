import fs from "fs";
import path from "path";
import { getEnv } from "../lib/env";
import { createMigrationClient, migrationConnectionLabel } from "./migration-client";

async function migrateRecordListPreferences() {
  const backupUrl = getEnv("DATABASE_BACKUP_URL");
  const databaseUrl = backupUrl || getEnv("DATABASE_URL");
  if (!databaseUrl) {
    console.error("DATABASE_BACKUP_URL or DATABASE_URL is not set in environment variables");
    process.exit(1);
  }

  const client = createMigrationClient(databaseUrl);
  try {
    console.log(`Connecting to database (${migrationConnectionLabel(databaseUrl)})...`);
    await client.connect();
    const migrationPath = path.join(__dirname, "migrations", "record_list_preferences.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    await client.query(sql);
    console.log("Record list preferences migration completed successfully.");
  } catch (error) {
    console.error("Record list preferences migration failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrateRecordListPreferences();
