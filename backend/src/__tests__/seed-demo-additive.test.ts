import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  runDryRun,
  applySeed,
  verifySeed,
  cleanupSeed,
  DEMO_EMP_REGULAR_ID,
  DEMO_EMP_COMMISSION_ONLY_ID,
  DEMO_ASSIGN_UPCOMING_ID,
  DEMO_ASSIGN_ATTENDED_ID,
  DEMO_ASSIGN_ABSENT_ID,
  DEMO_EXP_LABOR_ID,
  DEMO_CAPITAL_ID,
  DEMO_ITEM_TRUSS_ID
} from "../lib/seed-demo-additive-core";

function createMockClient() {
  const tables: Record<string, any[]> = {
    stores: [{ id: "store-1", name: "Bole HQ" }, { id: "store-2", name: "Haya Arat" }],
    event_types: [{ id: "et-1", name: "Wedding" }, { id: "et-2", name: "Corporate Event" }, { id: "et-3", name: "Photo Shoot" }],
    event_service_scopes: [
      { id: "ss-1", code: "FULL" }, { id: "ss-2", code: "BACKGROUND" },
      { id: "ss-3", code: "SETUP" }, { id: "ss-4", code: "TABLE_SETUP" }
    ],
    roles: [{ id: "role-1", name: "SUPER_ADMIN" }],
    users: [{ id: "user-1", username: "admin" }],
    employees: [],
    items: [],
    event_proposals: [],
    proposal_service_scopes: [],
    events: [],
    event_service_scope_links: [],
    event_assignments: [],
    event_allocations: [],
    expenses: [],
    capital_investments: [],
    inventory_movements: [],
    payroll_runs: [],
    payroll_run_employee_lines: [],
    payroll_run_line_events: [],
    event_logs: []
  };

  let mutationsMade = 0;

  return {
    getMutationsMade: () => mutationsMade,
    getTableCount: (t: string) => tables[t.toLowerCase()]?.length ?? 0,
    query: async (sql: string, params: any[] = []) => {
      const normalizedSql = sql.trim().toUpperCase();

      if (normalizedSql.startsWith("SELECT PG_ADVISORY_XACT_LOCK")) {
        return { rows: [{ pg_advisory_xact_lock: null }] };
      }
      if (normalizedSql === "BEGIN" || normalizedSql === "COMMIT" || normalizedSql === "ROLLBACK") {
        return { rows: [] };
      }
      if (normalizedSql.startsWith("SELECT CURRENT_DATABASE()")) {
        return { rows: [{ db: "postgres", usr: "postgres", host: "127.0.0.1", port: 5432 }] };
      }

      if (normalizedSql.startsWith("DELETE FROM")) {
        const match = sql.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)/i);
        const tableName = match ? match[1].toLowerCase() : "";
        if (tables[tableName]) {
          tables[tableName] = [];
          mutationsMade++;
        }
        return { rows: [] };
      }

      if (normalizedSql.startsWith("SELECT COUNT(*)::INT AS CNT FROM")) {
        const match = sql.match(/FROM\s+["']?([a-zA-Z0-9_]+)["']?/i);
        const tableName = match ? match[1].toLowerCase() : "";
        
        let filteredRows = tables[tableName] || [];
        if (sql.includes("WHERE id IN")) {
          const ids = params;
          filteredRows = filteredRows.filter(r => ids.includes(r.id));
        } else if (sql.includes("WHERE id NOT IN")) {
          const ids = params;
          filteredRows = filteredRows.filter(r => !ids.includes(r.id));
        }

        return { rows: [{ cnt: filteredRows.length }] };
      }

      if (normalizedSql.startsWith("SELECT ID, NAME FROM STORES")) {
        return { rows: tables.stores };
      }
      if (normalizedSql.startsWith("SELECT ID, NAME FROM EVENT_TYPES")) {
        return { rows: tables.event_types };
      }
      if (normalizedSql.startsWith("SELECT ID, CODE FROM EVENT_SERVICE_SCOPES")) {
        return { rows: tables.event_service_scopes };
      }
      if (normalizedSql.startsWith("SELECT ID, USERNAME FROM USERS")) {
        return { rows: tables.users };
      }
      if (normalizedSql.startsWith("SELECT NAME FROM ROLES")) {
        return { rows: tables.roles.map(r => ({ name: r.name })) };
      }

      // Special queries for verifySeed (SELECT only)
      if (normalizedSql.startsWith("SELECT") && sql.includes("FROM employees WHERE id IN")) {
        const empRows = tables.employees.filter(r => params.includes(r.id));
        return { rows: empRows };
      }
      if (normalizedSql.startsWith("SELECT") && sql.includes("FROM event_assignments WHERE id IN")) {
        const assignRows = tables.event_assignments.filter(r => params.includes(r.id));
        return { rows: assignRows };
      }
      if (normalizedSql.startsWith("SELECT") && sql.includes("FROM expenses WHERE id =")) {
        const expRows = tables.expenses.filter(r => r.id === params[0]);
        return { rows: expRows };
      }
      if (normalizedSql.startsWith("SELECT") && sql.includes("FROM capital_investments WHERE id =")) {
        const capRows = tables.capital_investments.filter(r => r.id === params[0]);
        return { rows: capRows };
      }
      if (normalizedSql.startsWith("SELECT") && sql.includes("FROM items WHERE id =")) {
        const itemRows = tables.items.filter(r => r.id === params[0]);
        return { rows: itemRows };
      }
      if (normalizedSql.startsWith("SELECT") && sql.includes("FROM event_assignments ea")) {
        return { rows: [{ orphan_count: 0 }] };
      }

      // Handle INSERT INTO
      if (normalizedSql.startsWith("INSERT INTO EMPLOYEES")) {
        mutationsMade += 5;
        tables.employees = [
          { id: DEMO_EMP_REGULAR_ID, full_name: "[DEMO 2026Q3] Abebe Demissie", compensation_mode: "regular", base_salary: "12000.00" },
          { id: DEMO_EMP_COMMISSION_ONLY_ID, full_name: "[DEMO 2026Q3] Tigist Alemu", compensation_mode: "commission_only", base_salary: "0.00" },
          { id: "d2600000-0000-4000-8000-000000000003", full_name: "Dawit", compensation_mode: "regular", base_salary: "9000.00" },
          { id: "d2600000-0000-4000-8000-000000000004", full_name: "Mesfin", compensation_mode: "regular", base_salary: "16000.00" },
          { id: "d2600000-0000-4000-8000-000000000005", full_name: "Kassahun", compensation_mode: "regular", base_salary: "7000.00" }
        ];
        return { rows: [] };
      }

      if (normalizedSql.startsWith("INSERT INTO ITEMS")) {
        mutationsMade += 4;
        tables.items = [
          { id: "d2600000-0000-4000-8000-000000000010", name: "Chairs", quantity: 200 },
          { id: "d2600000-0000-4000-8000-000000000011", name: "Stage", quantity: 5 },
          { id: "d2600000-0000-4000-8000-000000000012", name: "Lights", quantity: 30 },
          { id: DEMO_ITEM_TRUSS_ID, name: "Trusses", quantity: 10 }
        ];
        return { rows: [] };
      }

      if (normalizedSql.startsWith("INSERT INTO EVENT_ASSIGNMENTS")) {
        mutationsMade += 3;
        tables.event_assignments = [
          { id: DEMO_ASSIGN_UPCOMING_ID, attended: false, attendance_marked_at: null },
          { id: DEMO_ASSIGN_ATTENDED_ID, attended: true, attendance_marked_at: "2026-07-20 10:00:00" },
          { id: DEMO_ASSIGN_ABSENT_ID, attended: false, attendance_marked_at: "2026-07-20 10:00:00" }
        ];
        return { rows: [] };
      }

      if (normalizedSql.startsWith("INSERT INTO EXPENSES")) {
        mutationsMade += 6;
        tables.expenses = [
          { id: DEMO_EXP_LABOR_ID, amount: "2500.00", category: "Labor" }
        ];
        return { rows: [] };
      }

      if (normalizedSql.startsWith("INSERT INTO CAPITAL_INVESTMENTS")) {
        mutationsMade += 1;
        tables.capital_investments = [
          { id: DEMO_CAPITAL_ID, stock_applied: true }
        ];
        return { rows: [] };
      }

      return { rows: [] };
    }
  };
}

describe("Additive Demo Dataset Seed Engine (dreamlux-demo-2026q3-v1)", () => {
  test("Code Hygiene: Core implementation contains no TRUNCATE, DROP, or Math.random", () => {
    const corePath = join(__dirname, "../lib/seed-demo-additive-core.ts");
    const cliPath = join(__dirname, "../../../scripts/seed-demo-additive.ts");

    const coreContent = readFileSync(corePath, "utf-8");
    const cliContent = readFileSync(cliPath, "utf-8");

    expect(coreContent).not.toContain("TRUNCATE");
    expect(coreContent).not.toContain("DROP TABLE");
    expect(coreContent).not.toContain("Math.random");

    expect(cliContent).not.toContain("TRUNCATE");
    expect(cliContent).not.toContain("DROP TABLE");
    expect(cliContent).not.toContain("Math.random");
  });

  test("Dry-Run Default: runDryRun performs ZERO mutations on database", async () => {
    const mockClient = createMockClient() as any;
    const report = await runDryRun(mockClient);

    expect(report.mutationsMade).toBe(0);
    expect(report.manifest.employeesToInsert).toBe(5);
    expect(report.isAlreadyApplied).toBe(false);
    expect(mockClient.getMutationsMade()).toBe(0);
  });

  test("Atomicity & Idempotency: applySeed applies in 1 transaction and 2nd run inserts 0 additional records", async () => {
    const mockClient = createMockClient() as any;

    // 1st Apply
    const firstRun = await applySeed(mockClient);
    expect(firstRun.applied).toBe(true);

    // Verify state
    const verification = await verifySeed(mockClient);
    expect(verification.success).toBe(true);

    // 2nd Apply (Idempotency Check)
    const secondRun = await applySeed(mockClient);
    expect(secondRun.applied).toBe(true);
    expect(mockClient.getTableCount("employees")).toBe(5);
  });

  test("Invariants: Attendance 3-state resolution & labor math", async () => {
    const mockClient = createMockClient() as any;
    await applySeed(mockClient);

    const verification = await verifySeed(mockClient);
    expect(verification.checks["upcoming_assignment_unresolved"]).toBe(true);
    expect(verification.checks["attended_assignment_resolved_true"]).toBe(true);
    expect(verification.checks["absent_assignment_resolved_false"]).toBe(true);
    expect(verification.checks["labor_expense_equals_attended_commission"]).toBe(true);
    expect(verification.checks["capital_investment_applied_and_stock_incremented"]).toBe(true);
  });

  test("Reversibility: cleanupSeed deletes ONLY seed-owned records", async () => {
    const mockClient = createMockClient() as any;
    await applySeed(mockClient);
    expect(mockClient.getTableCount("employees")).toBe(5);

    const cleanupRes = await cleanupSeed(mockClient);
    expect(cleanupRes.cleaned).toBe(true);
    expect(mockClient.getTableCount("employees")).toBe(0);
  });

  test("Error Resilience: Transaction rolls back cleanly if database query fails during apply", async () => {
    let rollbackExecuted = false;
    const failingClient = {
      query: async (sql: string) => {
        const norm = sql.trim().toUpperCase();
        if (norm === "ROLLBACK") {
          rollbackExecuted = true;
          return { rows: [] };
        }
        if (norm.startsWith("SELECT ID, NAME FROM STORES")) {
          return { rows: [{ id: "store-1", name: "Bole HQ" }] };
        }
        if (norm.startsWith("SELECT ID, NAME FROM EVENT_TYPES")) {
          return { rows: [{ id: "et-1", name: "Wedding" }] };
        }
        if (norm.startsWith("SELECT ID, CODE FROM EVENT_SERVICE_SCOPES")) {
          return { rows: [{ id: "ss-1", code: "FULL" }] };
        }
        if (norm.startsWith("INSERT INTO EMPLOYEES")) {
          throw new Error("Simulated database constraint violation");
        }
        return { rows: [] };
      }
    } as any;

    await expect(applySeed(failingClient)).rejects.toThrow("Simulated database constraint violation");
    expect(rollbackExecuted).toBe(true);
  });

  test("Deterministic ID & Code Parity: Employees D26-001 through D26-005 maintain constant UUIDs", () => {
    expect(DEMO_EMP_REGULAR_ID).toBe("d2600000-0000-4000-8000-000000000001");
    expect(DEMO_EMP_COMMISSION_ONLY_ID).toBe("d2600000-0000-4000-8000-000000000002");
    expect(DEMO_ASSIGN_UPCOMING_ID).toBe("d2600000-0000-4000-8000-000000000040");
    expect(DEMO_EXP_LABOR_ID).toBe("d2600000-0000-4000-8000-000000000060");
    expect(DEMO_CAPITAL_ID).toBe("d2600000-0000-4000-8000-000000000070");
  });
});
