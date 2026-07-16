// One-off migration runner for inventory_offices_read.sql (issue #178).
// Usage: bun scripts/apply-inventory-offices-read.ts  (requires DATABASE_URL env)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../src/db/pool";

const sql = readFileSync(join(import.meta.dir, "../src/db/migrations/inventory_offices_read.sql"), "utf8");

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(sql);
  const check = await client.query(
    `SELECT r.name, COUNT(*) AS grants
     FROM role_permissions rp
     JOIN roles r ON r.id = rp.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE p.slug = 'offices:read' AND r.name IN ('INVENTORY_OFFICER','INVENTORY_CONTROLLER')
     GROUP BY r.name`,
  );
  await client.query("COMMIT");
  console.log("offices:read grants:", JSON.stringify(check.rows));
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
