import { pool } from "./pool";
import * as fs from "fs";
import * as path from "path";

export async function migrateCapitalInvestments() {
  console.log("[Migration] Running capital investments schema update...");
  const sqlPath = path.join(__dirname, "migrations", "capital_investments.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("[Migration] Capital investments table and permissions updated successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Migration] Failed to run capital investments migration:", error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrateCapitalInvestments()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
