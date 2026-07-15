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
    const verification = await client.query(`
      SELECT
        c.relrowsecurity AS rls_enabled,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'public.inventory_movements'::regclass
            AND tgname = 'trg_inventory_movements_append_only'
            AND NOT tgisinternal
        ) AS append_only_trigger,
        NOT EXISTS (
          SELECT 1
          FROM information_schema.role_table_grants
          WHERE table_schema = 'public'
            AND table_name = 'inventory_movements'
            AND grantee IN ('anon', 'authenticated')
        ) AS direct_grants_revoked
      FROM pg_class c
      WHERE c.oid = 'public.inventory_movements'::regclass
    `);
    const state = verification.rows[0];
    if (!state?.rls_enabled || !state?.append_only_trigger || !state?.direct_grants_revoked) {
      throw new Error("Inventory movement security verification failed");
    }
    await client.query("COMMIT");
    console.log("[Migration] Inventory movement ledger is append-only, RLS-enabled, and hidden from direct client roles.");
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
