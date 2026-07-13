import { describe, it, expect } from "bun:test";
import {
  getMonthlyBounds,
  getHalfMonthBounds,
  getWeeklyBounds,
  getEthiopianMonthlyBounds,
  getEthiopianWeeklyBounds,
} from "./payroll-utils";

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

  it("should calculate weekly bounds correctly", () => {
    const bounds = getWeeklyBounds("2026-07-06");
    expect(bounds.start).toBe("2026-07-06");
    expect(bounds.end).toBe("2026-07-12");
  });

  it("should throw on invalid weekly start date", () => {
    expect(() => getWeeklyBounds("not-a-date")).toThrow("Invalid weekly payroll start date");
  });
});

describe("Ethiopian Calendar Payroll Utils", () => {
  it("should calculate Ethiopian monthly bounds for Meskerem (month 1)", () => {
    // Ethiopian 2018/1/1 = Gregorian 2025-09-11
    const bounds = getEthiopianMonthlyBounds(2018, 1);
    expect(bounds.start).toBe("2025-09-11");
    expect(bounds.end).toBe("2025-10-10");
  });

  it("should calculate Ethiopian monthly bounds for a mid-year month", () => {
    // Ethiopian 2018/6/1 (Yekatit) = Gregorian 2026-02-08
    const bounds = getEthiopianMonthlyBounds(2018, 6);
    expect(bounds.start).toBe("2026-02-08");
    expect(bounds.end).toBe("2026-03-09");
  });

  it("should handle Pagume (month 13) in a non-leap year (5 days)", () => {
    // Ethiopian 2018 % 4 = 2, so non-leap → Pagume has 5 days
    // Ethiopian 2018/13/1 = Gregorian 2026-09-06
    const bounds = getEthiopianMonthlyBounds(2018, 13);
    expect(bounds.start).toBe("2026-09-06");
    expect(bounds.end).toBe("2026-09-10");
  });

  it("should handle Pagume (month 13) in an Ethiopian leap year (6 days)", () => {
    // Ethiopian 2019 % 4 = 3, so leap → Pagume has 6 days
    // Ethiopian 2019/13/1 = Gregorian 2027-09-06
    const bounds = getEthiopianMonthlyBounds(2019, 13);
    expect(bounds.start).toBe("2027-09-06");
    expect(bounds.end).toBe("2027-09-11");
  });

  it("should calculate Ethiopian weekly bounds correctly", () => {
    // Ethiopian 2018/1/1 = Gregorian 2025-09-11, week ends 2025-09-17
    const bounds = getEthiopianWeeklyBounds(2018, 1, 1);
    expect(bounds.start).toBe("2025-09-11");
    expect(bounds.end).toBe("2025-09-17");
  });

  it("should calculate Ethiopian weekly bounds mid-month", () => {
    // Ethiopian 2018/1/15 = Gregorian 2025-09-25, week ends 2025-10-01
    const bounds = getEthiopianWeeklyBounds(2018, 1, 15);
    expect(bounds.start).toBe("2025-09-25");
    expect(bounds.end).toBe("2025-10-01");
  });
});
