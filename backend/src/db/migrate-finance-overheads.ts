import { pool } from "./pool";
import * as fs from "fs";
import * as path from "path";

export async function migrateFinanceOverheads() {
  console.log("[Migration] Running finance overheads schema update...");
  const sqlPath = path.join(__dirname, "migrations", "finance_overheads.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("[Migration] Finance overhead tables and permissions updated successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Migration] Failed to run finance overheads migration:", error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrateFinanceOverheads()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
