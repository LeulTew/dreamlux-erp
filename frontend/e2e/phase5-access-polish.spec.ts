import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

test.describe("Phase 5 access and UX polish", () => {
  async function expectForbiddenMobileLayout(page: import("@playwright/test").Page, viewportWidth: number) {
    const forbiddenHeading = page.getByText("Forbidden: Insufficient privileges");
    const shell = page.locator("main").filter({ has: forbiddenHeading }).first();

    await expect(forbiddenHeading).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
    await expect(page.getByRole("button", { name: /search/i })).toBeVisible();
    await expect(shell).toBeVisible();
    await expect
      .poll(async () => {
        const box = await forbiddenHeading.boundingBox();
        return box ? box.x >= 0 && box.x + box.width <= viewportWidth : false;
      })
      .toBe(true);
  }

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

    await expectForbiddenMobileLayout(page, 320);
  });

  test("inventory access state remains readable at 390px mobile width with screenshot", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: [] });
    await mockCommonShellData(page);

    await page.goto("/assets");

    await expectForbiddenMobileLayout(page, 390);
  });

  test("event proposal queue denies users without proposal permissions before fetching data", async ({ page }) => {
    const proposalRequests: string[] = [];

    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read"] });
    await mockCommonShellData(page);
    await page.route("http://localhost:4000/events/proposals?**", (route) => {
      proposalRequests.push(route.request().url());
      return fulfillJson(route, { proposals: [], total: 0, page: 1, limit: 10, totalPages: 1 });
    });

    await page.goto("/events/proposals");

    await expect(page.getByText("Forbidden: Insufficient privileges")).toBeVisible();
    await expect(page.getByText("You need event proposal access permissions to view this content.")).toBeVisible();
    expect(proposalRequests).toEqual([]);
  });

  test("event proposal approvers can read the queue without seeing create actions", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:proposals:approve"] });
    await mockCommonShellData(page);
    await page.route("http://localhost:4000/events/proposals?**", (route) =>
      fulfillJson(route, {
        proposals: [
          {
            id: "proposal-e2e",
            name: "Approval Review Gala",
            client_name: "Dream Lux Client",
            client_phone: "+251911111111",
            requested_start_date: "2026-08-01",
            requested_budget: 100000,
            estimated_margin_percentage: 35,
            status: "Submitted",
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
    );

    await page.goto("/events/proposals");

    await expect(page.getByRole("link", { name: "Approval Review Gala" })).toBeVisible();
    await expect(page.getByRole("link", { name: /new proposal/i })).toHaveCount(0);
  });

  test("event module wildcard users can open proposal creation", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:*"] });
    await mockCommonShellData(page);

    await page.goto("/events/proposals/new");

    await expect(page.getByText("New Proposal Intake")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
  });
});
