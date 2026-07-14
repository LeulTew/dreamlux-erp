import { pool } from "./pool";
import * as fs from "fs";
import * as path from "path";

export async function migrateEventReturns() {
  console.log("[Migration] Running event returns schema update (issue #173)...");
  const sqlPath = path.join(__dirname, "migrations", "event_returns.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("[Migration] Event return receipts and allocation return accounting created successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Migration] Failed to run inventory movements migration:", error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrateEventReturns()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
