import { describe, it, expect } from "vitest";
import { getPeriodTitle, isPayrollDay } from "./payroll-formatting";

describe("Payroll Formatting Utils", () => {
  it("should generate correct titles for different period types", () => {
    expect(getPeriodTitle(2026, 4, "full")).toBe("Payroll 2026-04");
    expect(getPeriodTitle(2026, 4, "h1")).toBe("Payroll 2026-04 H1");
    expect(getPeriodTitle(2026, 4, "h2")).toBe("Payroll 2026-04 H2");
  });

  it("should identify payroll days correctly", () => {
    expect(isPayrollDay(new Date("2026-04-01"))).toBe(true);
    expect(isPayrollDay(new Date("2026-04-15"))).toBe(true);
    expect(isPayrollDay(new Date("2026-04-30"))).toBe(true); // Last day of April
    expect(isPayrollDay(new Date("2026-04-16"))).toBe(false);
    expect(isPayrollDay(new Date("2024-02-29"))).toBe(true); // Leap year last day
  });
});
