import { describe, expect, it } from "vitest";
import { findRunForPeriod, matchesPayrollPeriod, type PayrollRunLike } from "./payroll-period";

function mkRun(overrides: Partial<PayrollRunLike>): PayrollRunLike {
  return {
    id: "run-1",
    status: "DRAFT",
    year: 2026,
    month: 4,
    period_start: "2026-04-01",
    period_end: "2026-04-15",
    ...overrides,
  };
}

describe("payroll-period utils", () => {
  it("matches H1 run boundaries", () => {
    const run = mkRun({ period_start: "2026-04-01", period_end: "2026-04-15" });
    expect(matchesPayrollPeriod(run, 2026, 4, "h1")).toBe(true);
    expect(matchesPayrollPeriod(run, 2026, 4, "h2")).toBe(false);
  });

  it("matches H2 run boundaries", () => {
    const run = mkRun({ period_start: "2026-04-16", period_end: "2026-04-30" });
    expect(matchesPayrollPeriod(run, 2026, 4, "h2")).toBe(true);
    expect(matchesPayrollPeriod(run, 2026, 4, "h1")).toBe(false);
  });

  it("does not match a different month", () => {
    const run = mkRun({ month: 5, period_start: "2026-05-01", period_end: "2026-05-15" });
    expect(matchesPayrollPeriod(run, 2026, 4, "h1")).toBe(false);
  });

  it("finds finalized run for exact period", () => {
    const runs: PayrollRunLike[] = [
      mkRun({ id: "a", status: "DRAFT" }),
      mkRun({ id: "b", status: "FINALIZED", period_start: "2026-04-16", period_end: "2026-04-30" }),
    ];

    const found = findRunForPeriod(runs, "FINALIZED", 2026, 4, "h2");
    expect(found?.id).toBe("b");
  });
});
