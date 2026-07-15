import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

test.describe("Issue 155 persisted list preferences", () => {
  test("hydrates Events preferences before the first list request", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read"] });
    await mockCommonShellData(page);

    await page.route("**/api/preferences/record-list/events", async (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, {
          preference: {
            record_type: "events",
            sort: { sortBy: "recent", sortOrder: "desc" },
            filters: { status: "Completed", dateRange: "all" },
            page_size: 20,
            visible_columns: [],
            density: null,
            active_tab: "all",
            updated_at: "2026-07-15T00:00:00Z",
          },
        });
      }
      return fulfillJson(route, { preference: {} });
    });

    const requests: URL[] = [];
    await page.route((url) => url.pathname === "/api/events" && url.searchParams.has("page"), async (route) => {
      requests.push(new URL(route.request().url()));
      return fulfillJson(route, { events: [], total: 0, page: 1, limit: 20, totalPages: 1 });
    });

    await page.goto("/events");
    await expect(page.getByText("No events found")).toBeVisible();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].searchParams.get("sortBy")).toBe("recent");
    expect(requests[0].searchParams.get("sortOrder")).toBe("desc");
    expect(requests[0].searchParams.get("status")).toBe("Completed");
    expect(requests[0].searchParams.get("limit")).toBe("20");
  });
});
