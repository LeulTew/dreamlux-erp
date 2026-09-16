import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import { attestDreamluxNativeTarget, dreamluxFixtureTarget } from "./dreamlux-native-target";

const TABLES = [
  "roles", "permissions", "role_permissions", "users", "stores", "departments",
  "positions", "salary_levels", "employees", "app_settings", "event_types",
  "payroll_runs", "payroll_run_employee_lines", "payroll_run_line_events",
  "payroll_audit_logs", "events", "event_assignments",
];
const INDEXES = [
  "idx_stores_name_unique", "idx_salary_levels_deleted_at", "idx_event_types_deleted_at",
  "idx_payroll_runs_status", "idx_payroll_runs_period", "idx_payroll_runs_deleted_at",
  "idx_payroll_runs_correction", "idx_payroll_run_employee_lines_run_id",
  "idx_payroll_run_line_events_employee_line_id", "idx_payroll_audit_logs_run_id",
  "idx_payroll_audit_logs_created_at", "idx_events_status", "idx_events_start_date",
  "idx_event_assignments_event", "idx_event_assignments_employee", "idx_event_assignments_employee_event",
];

export async function payrollFixtureDdl(): Promise<string> {
  const schema = await readFile(join(__dirname, "..", "schema.sql"), "utf8");
  const tables = TABLES.map((table) => {
    const matches = [...schema.matchAll(new RegExp(`^CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?^\\);`, "gm"))];
    if (matches.length !== 1) throw new Error(`Expected one reviewed DreamLux DDL definition for ${table}`);
    return matches[0][0];
  });
  const indexes = INDEXES.map((index) => {
    const matches = [...schema.matchAll(new RegExp(`^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS ${index}\\s[\\s\\S]*?;`, "gm"))];
    if (matches.length !== 1) throw new Error(`Expected one reviewed DreamLux index definition for ${index}`);
    return matches[0][0];
  });
  const activity = await readFile(join(__dirname, "..", "migrations", "activity_logs.sql"), "utf8");
  const activityDdl = [...activity.matchAll(/^(?:CREATE TABLE IF NOT EXISTS public\.activity_logs|CREATE INDEX IF NOT EXISTS idx_activity_logs_\w+|ALTER TABLE public\.activity_logs ENABLE ROW LEVEL SECURITY)[\s\S]*?;/gm)]
    .map(([statement]) => statement);
  if (activityDdl.length !== 4) throw new Error("Expected the reviewed activity table, indexes and RLS declaration");
  return ["CREATE EXTENSION IF NOT EXISTS pgcrypto;", ...tables, ...indexes, ...activityDdl].join("\n");
}

export async function createDreamluxPayrollFixture(adminUrl: string) {
  const adminTarget = attestDreamluxNativeTarget(adminUrl, "admin");
  const target = dreamluxFixtureTarget(adminUrl, `payroll_239_${randomBytes(6).toString("hex")}`);
  const ddl = await payrollFixtureDdl();
  const admin = new Client({ connectionString: adminTarget.href, ssl: { rejectUnauthorized: false } });
  const database = target.pathname.slice(1);
  await admin.connect();
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const client = new Client({ connectionString: target.href, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      await client.query(ddl);
    } finally {
      await client.end();
    }
  } catch (error) {
    if (created) {
      try {
        await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "DreamLux fixture setup and cleanup both failed", { cause: cleanupError });
      }
    }
    throw error;
  } finally {
    await admin.end();
  }
  return {
    url: target.href,
    async dispose() {
      attestDreamluxNativeTarget(target.href, "fixture");
      const cleanup = new Client({ connectionString: adminTarget.href, ssl: { rejectUnauthorized: false } });
      await cleanup.connect();
      try {
        await cleanup.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
