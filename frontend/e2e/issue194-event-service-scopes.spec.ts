import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

test.describe("Issue 194 multi-select event service scopes full lifecycle", () => {
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

    // Mock catalog service scopes endpoint
    await page.route("**/service-scopes", (route) =>
      fulfillJson(route, {
        service_scopes: [
          { id: "scope-full", code: "FULL", name_en: "Full Event Management", name_am: "ሙሉ የዝግጅት አመራር", display_order: 1, is_active: true },
          { id: "scope-bg", code: "BACKGROUND", name_en: "Background Setup Only", name_am: "የጀርባ ዲዛይን ብቻ", display_order: 2, is_active: true },
          { id: "scope-setup", code: "SETUP", name_en: "Setup & Logistics", name_am: "የዝግጅት ዕቃዎች ዝግጅት", display_order: 3, is_active: true },
        ],
      })
    );

    // Mock event types catalog
    await page.route("**/event-types", (route) =>
      fulfillJson(route, [
        { id: "et-wedding", name: "Wedding", event_name: "Wedding", description: "Wedding celebrations" },
      ])
    );
  });

  test("full lifecycle: proposal creation with service scopes -> proposal detail -> event workspace -> profit report", async ({ page }) => {
    // 1. Proposal creation with multi-select service scopes
    await page.route("**/events/proposals", (route) => {
      if (route.request().method() === "POST") {
        const postData = JSON.parse(route.request().postData() || "{}");
        expect(postData.service_scope_ids).toContain("scope-full");
        expect(postData.service_scope_ids).toContain("scope-setup");
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
              { id: "scope-full", code: "FULL", name_en: "Full Event Management", name_am: "ሙሉ የዝግጅት አመራር" },
              { id: "scope-setup", code: "SETUP", name_en: "Setup & Logistics", name_am: "የዝግጅት ዕቃዎች ዝግጅት" },
            ],
          },
        });
      }
      return fulfillJson(route, { proposals: [], total: 0 });
    });

    await page.goto("http://localhost:3000/events/proposals/new");
    await expect(page.locator("h1")).toContainText(/Proposal/i);

    // Fill form fields
    await page.locator('input[name="name"]').fill("Grand Sheraton Wedding");
    await page.locator('input[name="client_name"]').fill("Abebe Kebede");
    await page.locator('input[name="venue_location"]').fill("Sheraton Addis");
    await page.locator('input[name="requested_budget"]').fill("300000");

    // Open ServiceScopeSelect combobox
    const scopeCombobox = page.locator('div[role="combobox"]').first();
    await scopeCombobox.click();
    await expect(page.locator('div[role="listbox"]')).toBeVisible();

    // Select "Full Event Management" and "Setup & Logistics"
    await page.locator('div[role="option"]:has-text("Full Event Management")').click();
    await page.locator('div[role="option"]:has-text("Setup & Logistics")').click();

    // Verify badges appear in trigger
    await expect(page.locator('span:has-text("Full Event Management")')).toBeVisible();
    await expect(page.locator('span:has-text("Setup & Logistics")')).toBeVisible();

    // 2. Proposal detail view mock
    await page.route("**/events/proposals/prop-194", (route) =>
      fulfillJson(route, {
        proposal: {
          id: "prop-194",
          name: "Grand Sheraton Wedding",
          client_name: "Abebe Kebede",
          status: "Approved",
          requested_budget: 300000,
          requested_start_date: "2026-09-15",
          requested_end_date: "2026-09-16",
          venue_location: "Sheraton Addis",
          cost_breakdown: {},
          service_scopes: [
            { id: "scope-full", code: "FULL", name_en: "Full Event Management", name_am: "ሙሉ የዝግጅት አመራር" },
            { id: "scope-setup", code: "SETUP", name_en: "Setup & Logistics", name_am: "የዝግጅት ዕቃዎች ዝግጅት" },
          ],
        },
        logs: [],
      })
    );

    await page.goto("http://localhost:3000/events/proposals/prop-194");
    await expect(page.locator("h1")).toContainText("Grand Sheraton Wedding");
    await expect(page.locator('span:has-text("Full Event Management")')).toBeVisible();
    await expect(page.locator('span:has-text("Setup & Logistics")')).toBeVisible();

    // 3. Event Workspace view mock with copied service scopes
    await page.route("**/events/workspace/evt-194", (route) =>
      fulfillJson(route, {
        event: {
          id: "evt-194",
          name: "Grand Sheraton Wedding Event",
          client_name: "Abebe Kebede",
          status: "Planned",
          start_date: "2026-09-15",
          end_date: "2026-09-16",
          venue_location: "Sheraton Addis",
          contract_price: 300000,
          service_scopes: [
            { id: "scope-full", code: "FULL", name_en: "Full Event Management", name_am: "ሙሉ የዝግጅት አመራር" },
            { id: "scope-setup", code: "SETUP", name_en: "Setup & Logistics", name_am: "የዝግጅት ዕቃዎች ዝግጅት" },
          ],
        },
        allocations: [],
        checklist: [],
        assignments: [],
        vehicleAssignments: [],
        expenses: [],
        trips: [],
      })
    );

    await page.goto("http://localhost:3000/events/evt-194");
    await expect(page.locator("h1")).toContainText("Grand Sheraton Wedding Event");
    await expect(page.locator('span:has-text("Full Event Management")')).toBeVisible();

    // 4. Profit Analytics Report mock displaying service scope badges
    await page.route("**/events/reports/profit**", (route) =>
      fulfillJson(route, {
        events: [
          {
            event_id: "evt-194",
            event_name: "Grand Sheraton Wedding Event",
            client_name: "Abebe Kebede",
            venue_location: "Sheraton Addis",
            event_type_name: "Wedding",
            start_date: "2026-09-15",
            status: "Planned",
            revenue: 300000,
            approved_expenses: 50000,
            net_profit: 250000,
            margin_percentage: 83.3,
            service_scopes: [
              { id: "scope-full", code: "FULL", name_en: "Full Event Management", name_am: "ሙሉ የዝግጅት አመራር" },
              { id: "scope-setup", code: "SETUP", name_en: "Setup & Logistics", name_am: "የዝግጅት ዕቃዎች ዝግጅት" },
            ],
            service_scopes_str: "Full Event Management, Setup & Logistics",
          },
        ],
        summary: {
          totalEvents: 1,
          totalRevenue: 300000,
          totalExpenses: 50000,
          netProfit: 250000,
          profitMargin: 83.3,
          pendingExpenseExposure: 0,
        },
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
    await expect(page.locator("body")).toContainText("Grand Sheraton Wedding Event");
    await expect(page.locator("body")).toContainText("Full Event Management");
  });
});
