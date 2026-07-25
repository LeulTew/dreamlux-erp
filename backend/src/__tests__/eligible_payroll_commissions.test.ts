import { describe, expect, test } from "bun:test";
import { ELIGIBLE_COMMISSIONS_SQL, mapEligibleCommissionRows } from "../lib/eligible-payroll-commissions";

describe("verified attendance payroll commission query", () => {
  test("uses one bounded grouped query and converts recorded totals to payroll input", () => {
    const lines = mapEligibleCommissionRows(
      [{ employee_id: "employee-1", event_type_id: "type-1", quantity: "2", commission_total: "3500.00" }],
      ["employee-1", "employee-2"],
    );

    expect(ELIGIBLE_COMMISSIONS_SQL).toContain("ea.attended IS TRUE");
    expect(ELIGIBLE_COMMISSIONS_SQL).toContain("COUNT(DISTINCT ea.event_id)");
    expect(ELIGIBLE_COMMISSIONS_SQL).toContain("e.start_date BETWEEN $1::date AND $2::date");
    expect(lines).toEqual([
      { employee_id: "employee-1", events: [{ event_type_id: "type-1", quantity: 2, price_override: 1750, override_reason: "Verified attended event assignments" }] },
      { employee_id: "employee-2", events: [] },
    ]);
  });

  test("rejects corrupt aggregates instead of generating invalid payroll", () => {
    expect(() => mapEligibleCommissionRows(
      [{ employee_id: "employee-1", event_type_id: "type-1", quantity: 0, commission_total: 100 }],
      ["employee-1"],
    )).toThrow("Invalid verified commission aggregate");
  });
});
