import { getEnv } from "../lib/env";
import fs from "fs";
import path from "path";
import { createMigrationClient, migrationConnectionLabel } from "./migration-client";

async function runNotificationsMigration() {
  const databaseUrl = getEnv("DATABASE_URL");
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set in environment variables");
    process.exit(1);
  }

  const client = createMigrationClient(databaseUrl);

  try {
    console.log(`Connecting to database (${migrationConnectionLabel(databaseUrl)})...`);
    await client.connect();

    const migrationPath = path.join(__dirname, "migrations", "notifications.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");

    console.log("Running notifications migration...");
    await client.query(migrationSql);
    console.log("Notifications migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runNotificationsMigration();
