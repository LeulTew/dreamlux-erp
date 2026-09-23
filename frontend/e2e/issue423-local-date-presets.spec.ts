import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

type RangeQuery = { start: string | null; end: string | null };

test.describe("event date presets use the local calendar day", () => {
  // UTC+3 with no DST: at 01:30 local the UTC day is still the previous day.
  test.use({ timezoneId: "Africa/Addis_Ababa" });

  test("queries whole local months and today's local date before 03:00", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-05-14T22:30:00Z"));
    await seedAuthenticatedSession(page);
    await mockCommonShellData(page);
    await mockAuth(page, { permissions: ["events:read"] });
    await page.route((url) => url.pathname === "/api/api/preferences/record-list/events", (route) => {
      const method = route.request().method();
      if (method === "PUT") return fulfillJson(route, { preference: route.request().postDataJSON() });
      return fulfillJson(route, { preference: null });
    });
    const queries: RangeQuery[] = [];
    await page.route((url) => url.pathname === "/api/events", (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const url = new URL(route.request().url());
      queries.push({ start: url.searchParams.get("start_date"), end: url.searchParams.get("end_date") });
      return fulfillJson(route, { events: [], total: 0, page: 1, limit: 20, totalPages: 1 });
    });

    await page.goto("/events?dateRange=all");
    await expect.poll(() => queries.length).toBeGreaterThan(0);
    expect(queries.at(-1)).toEqual({ start: null, end: null });

    const presets: Array<[string, string, RangeQuery]> = [
      ["This Month", "this_month", { start: "2026-05-01", end: "2026-05-31" }],
      ["Last Month", "last_month", { start: "2026-04-01", end: "2026-04-30" }],
      ["Next 14 Days", "next_14", { start: "2026-05-15", end: "2026-05-29" }],
    ];
    for (const [label, id, expected] of presets) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`dateRange=${id}`));
      await expect.poll(() => queries.at(-1)).toEqual(expected);
    }
  });

  test("asset history presets end on today's local date before 03:00", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-05-14T22:30:00Z"));
    await seedAuthenticatedSession(page);
    await mockCommonShellData(page);
    await mockAuth(page, { permissions: ["assets:read"] });
    await page.route((url) => url.pathname === "/api/offices", (route) => fulfillJson(route, []));
    const queries: RangeQuery[] = [];
    await page.route((url) => url.pathname === "/api/assets/history", (route) => {
      const url = new URL(route.request().url());
      queries.push({ start: url.searchParams.get("startDate"), end: url.searchParams.get("endDate") });
      return fulfillJson(route, { runs: [], total: 0, page: 1, limit: 10 });
    });

    await page.goto("/assets/history");
    await expect.poll(() => queries.length).toBeGreaterThan(0);
    expect(queries.at(-1)).toEqual({ start: null, end: null });

    let current = "All Time";
    const presets: Array<[string, RangeQuery]> = [
      ["Today", { start: "2026-05-15", end: "2026-05-15" }],
      ["Last 7 Days", { start: "2026-05-08", end: "2026-05-15" }],
      ["This Month", { start: "2026-05-01", end: "2026-05-15" }],
    ];
    for (const [label, expected] of presets) {
      // The closed picker shows the active preset; once open, the preset list follows the trigger.
      await page.getByRole("button", { name: current, exact: true }).first().click();
      await page.getByRole("button", { name: label, exact: true }).last().click();
      await expect.poll(() => queries.at(-1)).toEqual(expected);
      current = label;
    }
  });
});
