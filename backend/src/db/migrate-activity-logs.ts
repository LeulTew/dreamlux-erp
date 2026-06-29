import { pool } from "./pool";
import * as fs from "fs";
import * as path from "path";

export async function migrateActivityLogs() {
  console.log("[Migration] Running activity logs schema update...");
  const sqlPath = path.join(__dirname, "migrations", "activity_logs.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("[Migration] Activity logs tables and schema updated successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Migration] Failed to run activity logs migration:", error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrateActivityLogs()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
