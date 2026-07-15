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
    const verification = await client.query(`
      SELECT
        (SELECT relrowsecurity FROM pg_class WHERE oid = 'event_return_receipts'::regclass) AS receipts_rls,
        (SELECT relrowsecurity FROM pg_class WHERE oid = 'inventory_condition_resolutions'::regclass) AS resolutions_rls,
        EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_event_return_receipts_immutable' AND NOT tgisinternal) AS receipts_immutable,
        EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_condition_resolutions_immutable' AND NOT tgisinternal) AS resolutions_immutable,
        CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
          THEN NOT has_table_privilege('anon', 'event_return_receipts', 'SELECT')
          ELSE true END AS anon_denied
    `);
    const checks = verification.rows[0];
    if (!checks.receipts_rls || !checks.resolutions_rls || !checks.receipts_immutable || !checks.resolutions_immutable || !checks.anon_denied) {
      throw new Error("Event returns security verification failed");
    }
    await client.query("COMMIT");
    console.log("[Migration] Event return receipts and allocation return accounting created successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Migration] Failed to run event returns migration:", error);
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
