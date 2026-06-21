import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const migrationSql = readFileSync(
  join(process.cwd(), "src/db/migrations/db_rls_hardening.sql"),
  "utf8",
);

const protectedTables = [
  "app_settings",
  "categories",
  "departments",
  "employees",
  "event_allocations",
  "event_assignments",
  "event_checklist",
  "event_logs",
  "event_proposal_logs",
  "event_proposals",
  "event_saved_views",
  "event_types",
  "events",
  "expenses",
  "field_permissions",
  "inventory_reconciliation_items",
  "inventory_reconciliation_legacy_deleted",
  "inventory_reconciliation_legacy_trash",
  "inventory_reconciliation_runs",
  "items",
  "payroll_run_employee_lines",
  "payroll_run_line_events",
  "payroll_runs",
  "permissions",
  "positions",
  "role_permissions",
  "roles",
  "salary_levels",
  "stores",
  "trips",
  "user_access_scopes",
  "users",
  "vehicle_assignments",
  "vehicles",
];

describe("DB RLS hardening migration", () => {
  test("covers every backend-owned table in the protected direct API set", () => {
    for (const table of protectedTables) {
      expect(migrationSql).toContain(`'${table}'`);
    }
  });

  test("enables RLS and revokes direct anon/authenticated grants", () => {
    expect(migrationSql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migrationSql).toContain("REVOKE ALL PRIVILEGES ON TABLE");
    expect(migrationSql).toContain("'anon'");
    expect(migrationSql).toContain("'authenticated'");
    expect(migrationSql).not.toMatch(/CREATE\s+POLICY/i);
    expect(migrationSql).not.toMatch(/GRANT\s+.*\s+TO\s+(anon|authenticated)/i);
  });
});
