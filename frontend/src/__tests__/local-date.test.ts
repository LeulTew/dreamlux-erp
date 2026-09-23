import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventDateRangeParams, localDateString, localMonthString } from "@/lib/local-date";

// Addis Ababa is UTC+3 with no DST: before 03:00 local, the UTC day is still yesterday.
const originalTimeZone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Africa/Addis_Ababa";
});
afterAll(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

describe("localDateString", () => {
  it("uses the local calendar day, not the UTC day", () => {
    const earlyMorning = new Date(2026, 4, 15, 1, 30);
    expect(earlyMorning.toISOString().slice(0, 10)).toBe("2026-05-14");
    expect(localDateString(earlyMorning)).toBe("2026-05-15");
    expect(localDateString(new Date(2026, 4, 1))).toBe("2026-05-01");
  });
});

describe("localMonthString", () => {
  it("uses the local month early on the 1st", () => {
    const firstOfMonth = new Date(2026, 4, 1, 0, 30);
    expect(firstOfMonth.toISOString().slice(0, 7)).toBe("2026-04");
    expect(localMonthString(firstOfMonth)).toBe("2026-05");
    expect(localMonthString(new Date(2027, 0, 1, 2, 59))).toBe("2027-01");
  });
});

describe("eventDateRangeParams", () => {
  it("covers the whole local month for this_month", () => {
    expect(eventDateRangeParams("this_month", new Date(2026, 4, 15, 1, 30))).toEqual({
      start_date: "2026-05-01",
      end_date: "2026-05-31",
    });
    expect(eventDateRangeParams("this_month", new Date(2028, 1, 10))).toEqual({
      start_date: "2028-02-01",
      end_date: "2028-02-29",
    });
  });

  it("crosses the year boundary for last_month", () => {
    expect(eventDateRangeParams("last_month", new Date(2026, 0, 1, 0, 15))).toEqual({
      start_date: "2025-12-01",
      end_date: "2025-12-31",
    });
    expect(eventDateRangeParams("last_month", new Date(2026, 2, 31, 2, 0))).toEqual({
      start_date: "2026-02-01",
      end_date: "2026-02-28",
    });
  });

  it("starts next_14 on the local day and spans month ends", () => {
    expect(eventDateRangeParams("next_14", new Date(2026, 4, 25, 2, 59))).toEqual({
      start_date: "2026-05-25",
      end_date: "2026-06-08",
    });
  });

  it("leaves unknown ranges unfiltered", () => {
    expect(eventDateRangeParams("all")).toEqual({ start_date: undefined, end_date: undefined });
  });
});
