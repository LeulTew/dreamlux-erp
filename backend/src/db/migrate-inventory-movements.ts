import { pool } from "./pool";
import * as fs from "fs";
import * as path from "path";

export async function migrateInventoryMovements() {
  console.log("[Migration] Running inventory movements ledger update (issue #172)...");
  const sqlPath = path.join(__dirname, "migrations", "inventory_movements.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("[Migration] Inventory movements ledger and investment stock markers created successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Migration] Failed to run inventory movements migration:", error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrateInventoryMovements()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
