import { pool } from "./pool";
import * as fs from "fs";
import * as path from "path";

export async function migrateFinanceImports() {
  console.log("[Migration] Running finance imports schema update...");
  const sqlPath = path.join(__dirname, "migrations", "finance_imports.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("[Migration] Finance import batch schema and permissions updated successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Migration] Failed to run finance imports migration:", error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrateFinanceImports()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
