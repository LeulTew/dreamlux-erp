import { pool } from "./pool";
import * as fs from "fs";
import * as path from "path";

export async function migrateEventAssignmentAttendance() {
  console.log("[Migration] Running event assignment attendance default update (issue #197)...");
  const sqlPath = path.join(__dirname, "migrations", "event_assignment_attendance.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    const verification = await client.query(`
      SELECT column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'event_assignments' AND column_name = 'attended'
    `);
    const column = verification.rows[0];
    if (!column) {
      throw new Error("event_assignments.attended column is missing after migration");
    }
    // Postgres reports the default as the literal `false`.
    if (!String(column.column_default || "").toLowerCase().includes("false")) {
      throw new Error(`event_assignments.attended default is not FALSE (got: ${column.column_default})`);
    }
    if (column.is_nullable !== "NO") {
      throw new Error("event_assignments.attended is still nullable after migration");
    }
    await client.query("COMMIT");
    console.log("[Migration] event_assignments.attended now defaults to FALSE (NOT NULL). Historical rows preserved.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Migration] Failed to run event assignment attendance migration:", error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrateEventAssignmentAttendance()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
