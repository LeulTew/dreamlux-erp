import { describe, it, expect } from "bun:test";
import { getMonthlyBounds, getHalfMonthBounds } from "./payroll-utils";

describe("Payroll Utils", () => {
  it("should calculate monthly bounds correctly", () => {
    const bounds = getMonthlyBounds(2026, 4); // April 2026
    expect(bounds.start).toBe("2026-04-01");
    expect(bounds.end).toBe("2026-04-30");
  });

  it("should calculate first half month bounds correctly", () => {
    const bounds = getHalfMonthBounds(2026, 4, false); // April 2026 1st half
    expect(bounds.start).toBe("2026-04-01");
    expect(bounds.end).toBe("2026-04-15");
  });

  it("should calculate second half month bounds correctly", () => {
    const bounds = getHalfMonthBounds(2026, 4, true); // April 2026 2nd half
    expect(bounds.start).toBe("2026-04-16");
    expect(bounds.end).toBe("2026-04-30");
  });

  it("should handle Leap Year February correctly", () => {
    const boundsFull = getMonthlyBounds(2024, 2);
    expect(boundsFull.end).toBe("2024-02-29");

    const boundsH2 = getHalfMonthBounds(2024, 2, true);
    expect(boundsH2.end).toBe("2024-02-29");
  });
});
