import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockQuery = mock(async () => ({ rows: [] as any[] }));
mock.module("../db/pool", () => ({ pool: { query: mockQuery } }));

const { getAuthoritativePayrollInputLines } = await import("../lib/eligible-payroll-commissions");

beforeEach(() => mockQuery.mockReset());

describe("verified attendance payroll commission query", () => {
  test("uses one bounded grouped query and converts recorded totals to payroll input", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ employee_id: "employee-1", event_type_id: "type-1", quantity: "2", commission_total: "3500.00" }] });

    const lines = await getAuthoritativePayrollInputLines("2026-04-01", "2026-04-30", ["employee-1", "employee-2"]);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0] as unknown as [string, string[]];
    expect(sql).toContain("ea.attended IS TRUE");
    expect(sql).toContain("COUNT(DISTINCT ea.event_id)");
    expect(sql).toContain("e.start_date BETWEEN $1::date AND $2::date");
    expect(params).toEqual(["2026-04-01", "2026-04-30"]);
    expect(lines).toEqual([
      { employee_id: "employee-1", events: [{ event_type_id: "type-1", quantity: 2, price_override: 1750, override_reason: "Verified attended event assignments" }] },
      { employee_id: "employee-2", events: [] },
    ]);
  });

  test("rejects corrupt aggregates instead of generating invalid payroll", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ employee_id: "employee-1", event_type_id: "type-1", quantity: 0, commission_total: 100 }] });
    await expect(getAuthoritativePayrollInputLines("2026-04-01", "2026-04-30", ["employee-1"]))
      .rejects.toThrow("Invalid verified commission aggregate");
  });
});
