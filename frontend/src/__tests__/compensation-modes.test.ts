import { describe, expect, it } from "vitest";
import { mapEligibleCommissions, normalizeCompensationMode, resolvePayrollBaseSalary } from "@/lib/compensation";

describe("employee compensation modes", () => {
  it("defaults missing and unknown legacy values safely to regular", () => {
    expect(normalizeCompensationMode(undefined)).toBe("regular");
    expect(normalizeCompensationMode("legacy_salary")).toBe("regular");
    expect(normalizeCompensationMode("commission_only")).toBe("commission_only");
  });

  it("retains salary-level base pay for regular employees", () => {
    expect(resolvePayrollBaseSalary({ compensation_mode: "regular", base_salary: 5000 } as never, 7000)).toBe(7000);
  });

  it("forces commission-only base pay to zero regardless of stored salary", () => {
    expect(resolvePayrollBaseSalary({ compensation_mode: "commission_only", base_salary: 5000 } as never, 7000)).toBe(0);
  });

  it("maps verified attendance totals without recalculating assignment amounts", () => {
    expect(mapEligibleCommissions([
      { employee_id: "employee-1", event_type_id: "wedding", quantity: 2, commission_total: 3500 },
    ])).toEqual({
      "employee-1": [{
        event_type_id: "wedding",
        quantity: 2,
        price_override: 1750,
        override_reason: "Verified attended event assignments",
      }],
    });
  });
});
