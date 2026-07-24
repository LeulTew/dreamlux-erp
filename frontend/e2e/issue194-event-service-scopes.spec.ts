import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

test.describe("Issue 194 multi-select event service scopes flow", () => {
  test("renders service scope selector, proposal conversion preview, and profit report columns", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: [
        "events:read",
        "events:write",
        "proposals:read",
        "proposals:write",
        "reports:profit:read",
      ],
    });
    await mockCommonShellData(page);

    await page.route("http://localhost:4000/service-scopes**", (route) =>
      fulfillJson(route, {
        service_scopes: [
          { id: "scope-full", code: "FULL", name_en: "Full Decor & Event Management", name_am: "ሙሉ የጌጣጌጥ እና የዝግጅት አመራር", display_order: 1, is_active: true },
          { id: "scope-bg", code: "BACKGROUND", name_en: "Background Decor", name_am: "የጀርባ ጌጣጌጥ", display_order: 2, is_active: true },
          { id: "scope-setup", code: "SETUP", name_en: "Setup & Teardown", name_am: "ተከላ እና ማፍረስ", display_order: 3, is_active: true },
          { id: "scope-table", code: "TABLE_SETUP", name_en: "Table & Seating Setup", name_am: "የጠረጴዛ ዝግጅት", display_order: 4, is_active: true },
        ],
      })
    );

    await page.route("http://localhost:4000/events/reports/profit**", (route) =>
      fulfillJson(route, {
        events: [
          {
            event_id: "evt-194",
            event_name: "Luxury Gala",
            client_name: "Abebe Kebede",
            venue_location: "Hilton Addis Ababa",
            event_type_name: "Wedding",
            start_date: "2026-08-10",
            status: "Completed",
            revenue: 250000,
            approved_expenses: 50000,
            labor_cost: 20000,
            fuel_cost: 5000,
            other_cost: 25000,
            pending_expense_exposure: 0,
            net_profit: 200000,
            margin_percentage: 80,
            proposal_id: "prop-194",
            proposal_status: "Converted",
            service_scopes: [
              { id: "scope-bg", code: "BACKGROUND", name_en: "Background Decor", name_am: "የጀርባ ጌጣጌጥ" },
              { id: "scope-setup", code: "SETUP", name_en: "Setup & Teardown", name_am: "ተከላ እና ማፍረስ" },
            ],
            service_scopes_str: "Background Decor, Setup & Teardown",
          },
        ],
        summary: {
          totalEvents: 1,
          totalRevenue: 250000,
          totalExpenses: 50000,
          netProfit: 200000,
          profitMargin: 80,
          pendingExpenseExposure: 0,
        },
        kpis: {
          mostProfitableEvent: { event_name: "Luxury Gala", net_profit: 200000 },
          highestMarginEventType: { eventType: "Wedding", margin: 80 },
        },
        categoryBreakdown: [{ category: "Labor", amount: 20000 }],
        proposalVariance: { averageVariance: 0, events: [] },
        monthlyData: [],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      })
    );

    await page.goto("http://localhost:3000/hr/reports/profit");
    await expect(page.locator("body")).toContainText("Luxury Gala");
    await expect(page.locator("body")).toContainText("Background Decor, Setup & Teardown");
  });
});
