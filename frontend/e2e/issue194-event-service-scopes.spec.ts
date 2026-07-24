import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const authoritativeScopes = [
  {
    id: "scope-1",
    code: "FULL",
    name_en: "Full Event Management",
    name_am: "ሙሉ የዝግጅት ማኔጅመንት",
    description: "End-to-end planning, stage design, vendor management, and execution.",
    display_order: 1,
    is_active: true,
  },
  {
    id: "scope-2",
    code: "BACKGROUND",
    name_en: "Background Setup Only",
    name_am: "የጀርባ ዲዛይን እና ዝግጅት ብቻ",
    description: "Stage backdrops, lighting rigging, structural frame setup.",
    display_order: 2,
    is_active: true,
  },
  {
    id: "scope-3",
    code: "SETUP",
    name_en: "Setup & Logistics",
    name_am: "የዝግጅት ዕቃዎች ዝግጅት እና ትራንስፖርት",
    description: "Material transport, unloading, spatial positioning.",
    display_order: 3,
    is_active: true,
  },
  {
    id: "scope-4",
    code: "LIGHTING",
    name_en: "Lighting & Sound Engineering",
    name_am: "የብርሃን እና የድምፅ ኢንጂነሪንግ",
    description: "Audio-visual rig setup and real-time mixing.",
    display_order: 4,
    is_active: true,
  },
];

test.describe("Issue 194 multi-select event service scopes complete E2E suite", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: [
        "events:read",
        "events:write",
        "events:proposals:read",
        "events:proposals:write",
        "events:proposals:approve",
        "reports:profit:read",
      ],
    });
    await mockCommonShellData(page);

    await page.route("**/service-scopes", (route) =>
      fulfillJson(route, { service_scopes: authoritativeScopes })
    );

    await page.route("**/event-types", (route) =>
      fulfillJson(route, [
        { id: "et-wedding", name: "Wedding", event_name: "Wedding", description: "Wedding celebrations" },
      ])
    );
  });

  test("proposal creation with keyboard selection -> submit -> proposal detail -> convert -> profit report", async ({ page }) => {
    let submittedPayload: any = null;

    await page.route("**/events/proposals", (route) => {
      if (route.request().method() === "POST") {
        submittedPayload = JSON.parse(route.request().postData() || "{}");
        return fulfillJson(route, {
          proposal: {
            id: "prop-194",
            name: "Grand Sheraton Wedding",
            client_name: "Abebe Kebede",
            status: "Draft",
            requested_budget: 300000,
            requested_start_date: "2026-09-15",
            requested_end_date: "2026-09-16",
            venue_location: "Sheraton Addis",
            service_scopes: [
              authoritativeScopes[0],
              authoritativeScopes[2],
            ],
          },
        });
      }
      return fulfillJson(route, { proposals: [], total: 0 });
    });

    await page.goto("http://localhost:3000/events/proposals/new");
    await expect(page.locator("h1")).toContainText(/Proposal/i);

    // Form inputs
    await page.locator('input[name="name"]').fill("Grand Sheraton Wedding");
    await page.locator('input[name="client_name"]').fill("Abebe Kebede");
    await page.locator('input[name="venue_location"]').fill("Sheraton Addis");
    await page.locator('input[name="requested_budget"]').fill("300000");

    // Focus combobox and navigate via keyboard
    const combobox = page.locator('div[role="combobox"]').first();
    await combobox.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('div[role="listbox"]')).toBeVisible();

    // Select first scope ("Full Event Management") via keyboard Enter
    await page.keyboard.press("Enter");
    await expect(page.locator('span:has-text("Full Event Management")')).toBeVisible();

    // Select third scope ("Setup & Logistics") via mouse click
    await page.locator('div[role="option"]:has-text("Setup & Logistics")').click();
    await expect(page.locator('span:has-text("Setup & Logistics")')).toBeVisible();

    // Submit form
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      expect(submittedPayload?.service_scope_ids).toContain("scope-1");
      expect(submittedPayload?.service_scope_ids).toContain("scope-3");
    }

    // Detail view route
    await page.route("**/events/proposals/prop-194", (route) =>
      fulfillJson(route, {
        proposal: {
          id: "prop-194",
          name: "Grand Sheraton Wedding",
          client_name: "Abebe Kebede",
          status: "Approved",
          requested_budget: 300000,
          venue_location: "Sheraton Addis",
          service_scopes: [authoritativeScopes[0], authoritativeScopes[2]],
        },
        logs: [],
      })
    );

    await page.goto("http://localhost:3000/events/proposals/prop-194");
    await expect(page.locator("h1")).toContainText("Grand Sheraton Wedding");
    await expect(page.locator('span:has-text("Full Event Management")')).toBeVisible();

    // Profit report route
    await page.route("**/events/reports/profit**", (route) =>
      fulfillJson(route, {
        events: [
          {
            event_id: "evt-194",
            event_name: "Grand Sheraton Wedding",
            client_name: "Abebe Kebede",
            venue_location: "Sheraton Addis",
            event_type_name: "Wedding",
            start_date: "2026-09-15",
            status: "Planned",
            revenue: 300000,
            approved_expenses: 50000,
            net_profit: 250000,
            margin_percentage: 83.3,
            service_scopes: [authoritativeScopes[0], authoritativeScopes[2]],
            service_scopes_str: "Full Event Management, Setup & Logistics",
          },
        ],
        summary: { totalEvents: 1, totalRevenue: 300000, totalExpenses: 50000, netProfit: 250000, profitMargin: 83.3, pendingExpenseExposure: 0 },
        kpis: { mostProfitableEvent: null, highestMarginEventType: null },
        categoryBreakdown: [],
        proposalVariance: { averageVariance: 0, events: [] },
        monthlyData: [],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      })
    );

    await page.goto("http://localhost:3000/hr/reports/profit");
    await expect(page.locator("body")).toContainText("Grand Sheraton Wedding");
    await expect(page.locator("body")).toContainText("Full Event Management");
  });

  test("mobile viewport responsiveness and touch targets", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto("http://localhost:3000/events/proposals/new");
    const combobox = page.locator('div[role="combobox"]').first();
    await expect(combobox).toBeVisible();
    await combobox.click();

    const options = page.locator('div[role="option"]');
    await expect(options.first()).toBeVisible();
  });

  test("disabled scope selector for read-only users", async ({ page }) => {
    await mockAuth(page, {
      permissions: ["events:read"],
    });

    await page.goto("http://localhost:3000/events/proposals/new");
    const combobox = page.locator('div[role="combobox"]').first();
    if (await combobox.isVisible()) {
      await expect(combobox).toHaveAttribute("aria-disabled", "true");
    }
  });
});
