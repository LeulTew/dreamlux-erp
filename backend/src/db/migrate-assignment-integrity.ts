import { getEnv } from "../lib/env";
import fs from "fs";
import path from "path";
import { createMigrationClient, migrationConnectionLabel } from "./migration-client";

async function runAssignmentIntegrityMigration() {
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

    const migrationPath = path.join(__dirname, "migrations", "assignment_integrity.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");

    console.log("Running assignment integrity migration...");
    await client.query(migrationSql);
    console.log("Assignment integrity migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runAssignmentIntegrityMigration();
