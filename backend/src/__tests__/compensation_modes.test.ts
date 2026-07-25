import { describe, expect, test } from "bun:test";
import { buildPayrollLines, toPayrollLinePayloads } from "../lib/payroll-generation";
import { employeeImportSchema } from "../lib/validation";

const eventType = { id: "event-1", name: "Wedding" };
const salaryLevel = { id: "level-1", code: "L1", amount_etb: 7000 };
const inputLine = {
  employee_id: "employee-1",
  events: [{ event_type_id: eventType.id, quantity: 2 }],
};

describe("employee compensation modes", () => {
  test("employee imports default legacy rows to regular and preserve commission-only rows", () => {
    const parsed = employeeImportSchema.parse({ rows: [
      { employee_id: "EMP-1", full_name: "Regular" },
      { employee_id: "EMP-2", full_name: "Event Worker", compensation_mode: "commission_only" },
    ] });

    expect(parsed.rows.map((row) => row.compensation_mode)).toEqual(["regular", "commission_only"]);
  });

  test("employee imports reject unknown modes and negative event rates", () => {
    expect(employeeImportSchema.safeParse({ rows: [
      { employee_id: "EMP-1", full_name: "Bad", compensation_mode: "salary_only" },
    ] }).success).toBe(false);
    expect(employeeImportSchema.safeParse({ rows: [
      { employee_id: "EMP-1", full_name: "Bad", event_prices: { wedding: -1 } },
    ] }).success).toBe(false);
  });

  test("regular employees receive salary-level base pay plus event commission", () => {
    const result = buildPayrollLines({
      employeeLineEvents: [inputLine],
      employees: [{
        id: "employee-1",
        full_name: "Regular Employee",
        salary_level: "L1",
        base_salary: 9000,
        compensation_mode: "regular",
        event_prices: { [eventType.id]: 1250 },
      }],
      eventTypes: [eventType],
      salaryLevels: [salaryLevel],
    });

    expect(result.lines[0].snapshot_base_salary).toBe(7000);
    expect(result.lines[0].total_events_value).toBe(2500);
    expect(result.lines[0].total_line_pay).toBe(9500);
    expect(result.lines[0].compensation_mode_snapshot).toBe("regular");
  });

  test("commission-only employees can never receive salary-level or employee base pay", () => {
    const result = buildPayrollLines({
      employeeLineEvents: [inputLine],
      employees: [{
        id: "employee-1",
        full_name: "Commission Employee",
        salary_level: "L1",
        base_salary: 9000,
        compensation_mode: "commission_only",
        event_prices: { [eventType.id]: 1250 },
      }],
      eventTypes: [eventType],
      salaryLevels: [salaryLevel],
    });

    expect(result.lines[0].snapshot_base_salary).toBe(0);
    expect(result.lines[0].total_events_value).toBe(2500);
    expect(result.lines[0].total_line_pay).toBe(2500);
    expect(result.totalPayrollValue).toBe(2500);
  });

  test("missing mode deliberately preserves legacy regular behavior", () => {
    const result = buildPayrollLines({
      employeeLineEvents: [{ employee_id: "employee-1", events: [] }],
      employees: [{ id: "employee-1", full_name: "Legacy", base_salary: 4000 }],
      eventTypes: [],
      salaryLevels: [],
    });

    expect(result.lines[0].compensation_mode_snapshot).toBe("regular");
    expect(result.lines[0].snapshot_base_salary).toBe(4000);
  });

  test("persisted payroll payload snapshots the applied mode and values", () => {
    const result = buildPayrollLines({
      employeeLineEvents: [inputLine],
      employees: [{
        id: "employee-1",
        full_name: "Commission Employee",
        compensation_mode: "commission_only",
        event_prices: { [eventType.id]: 500 },
      }],
      eventTypes: [eventType],
      salaryLevels: [],
    });

    expect(toPayrollLinePayloads("run-1", result.lines)[0]).toEqual(expect.objectContaining({
      compensation_mode_snapshot: "commission_only",
      base_salary_snapshot: 0,
      commission_total_snapshot: 1000,
      employee_total_snapshot: 1000,
    }));
  });
});
