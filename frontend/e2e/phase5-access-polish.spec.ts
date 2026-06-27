import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

test.describe("Phase 5 access and UX polish", () => {
  test("keeps inventory forbidden state inside the authenticated app shell", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: [] });
    await mockCommonShellData(page);

    await page.goto("/assets");

    await expect(page.getByText("Forbidden: Insufficient privileges")).toBeVisible();
    await expect(page.getByText("Only authorized personnel can access inventory management.")).toBeVisible();
    await expect(page.getByRole("button", { name: /search/i })).toBeVisible();
  });

  test("does not fetch mutation-only event option lists for read-only event users", async ({ page }) => {
    const optionListRequests: string[] = [];

    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read"] });
    await mockCommonShellData(page);

    await page.route("http://localhost:4000/events/event-e2e/workspace", (route) =>
      fulfillJson(route, {
        event: {
          id: "event-e2e",
          name: "Read Only Gala",
          client_name: "Dream Lux",
          venue_location: "Addis Hall",
          status: "Planned",
          start_date: "2026-07-01",
          end_date: "2026-07-01",
          contract_price: 150000,
          estimated_design_cost: 20000,
        },
        allocations: [],
        checklist: [],
        assignments: [],
        vehicleAssignments: [],
        expenses: [],
        trips: [],
      }),
    );

    await page.route("http://localhost:4000/events/event-e2e/profit", (route) =>
      fulfillJson(route, {
        revenue: 0,
        approved_expenses: 0,
        pending_expenses: 0,
        net_profit: 0,
        margin_percentage: 0,
      }),
    );

    await page.route("http://localhost:4000/events/event-e2e/assignments/available-employees", (route) => {
      optionListRequests.push(route.request().url());
      return fulfillJson(route, []);
    });
    await page.route("http://localhost:4000/events/event-e2e/assignments/available-vehicles", (route) => {
      optionListRequests.push(route.request().url());
      return fulfillJson(route, []);
    });
    await page.route("http://localhost:4000/assets?**", (route) => {
      optionListRequests.push(route.request().url());
      return fulfillJson(route, { items: [], total: 0, page: 1, limit: 30 });
    });

    await page.goto("/events/event-e2e");

    await expect(page.getByText("Read Only Gala")).toBeVisible();
    await page.waitForTimeout(500);
    expect(optionListRequests).toEqual([]);
  });

  test("toast pause/resume and action controls are keyboard accessible", async ({ page }) => {
    await page.goto("/test-support/toast");
    await page.getByRole("button", { name: "Show toast" }).click();

    await expect(page.getByText("Inventory saved")).toBeVisible();
    const pauseButton = page.getByRole("button", { name: "Pause notification countdown" });
    await expect(pauseButton).toBeVisible();

    await pauseButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Resume notification countdown" })).toBeVisible();

    await page.getByRole("button", { name: "Review" }).click();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("toast-e2e-action")))
      .toBe("reviewed");
  });

  test("inventory access state remains readable at 320px mobile width with screenshot", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: [] });
    await mockCommonShellData(page);

    await page.goto("/assets");

    await expect(page.getByText("Forbidden: Insufficient privileges")).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
    await expect(page).toHaveScreenshot("inventory-forbidden-320px.png", { maxDiffPixelRatio: 0.05 });
  });

  test("inventory access state remains readable at 390px mobile width with screenshot", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: [] });
    await mockCommonShellData(page);

    await page.goto("/assets");

    await expect(page.getByText("Forbidden: Insufficient privileges")).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
    await expect(page).toHaveScreenshot("inventory-forbidden-390px.png", { maxDiffPixelRatio: 0.05 });
  });
});
