import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createDreamluxNativeFixture, reviewedSchemaTables } from "./dreamlux-native-fixture";

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
  const tables = reviewedSchemaTables(schema, TABLES);
  const indexes = INDEXES.map((index) => {
    const matches = [...schema.matchAll(new RegExp(`^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS ${index}\\s[\\s\\S]*?;`, "gm"))];
    if (matches.length !== 1) throw new Error(`Expected one reviewed DreamLux index definition for ${index}`);
    return matches[0][0];
  });
  const activity = await readFile(join(__dirname, "..", "migrations", "activity_logs.sql"), "utf8");
  const activityDdl = [...activity.matchAll(/^(?:CREATE TABLE IF NOT EXISTS public\.activity_logs|CREATE INDEX IF NOT EXISTS idx_activity_logs_\w+|ALTER TABLE public\.activity_logs ENABLE ROW LEVEL SECURITY)[\s\S]*?;/gm)]
    .map(([statement]) => statement);
  if (activityDdl.length !== 4) throw new Error("Expected the reviewed activity table, indexes and RLS declaration");
  const settings = await readFile(join(__dirname, "..", "migrate-settings.ts"), "utf8");
  const settingsColumns = [...settings.matchAll(/ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS (?:inventory_id_prefix|event_id_prefix) TEXT NOT NULL DEFAULT '(?:INV|EVT)';/g)]
    .map(([statement]) => statement);
  if (settingsColumns.length !== 2) throw new Error("Expected both reviewed settings prefix columns");
  return ["CREATE EXTENSION IF NOT EXISTS pgcrypto;", ...tables, ...indexes, ...activityDdl, ...settingsColumns].join("\n");
}

export async function createDreamluxPayrollFixture(adminUrl: string) {
  return createDreamluxNativeFixture(adminUrl, "payroll_239", await payrollFixtureDdl());
}
