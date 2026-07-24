import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const MOCK_PROFIT_REPORT = {
  summary: {
    totalEvents: 2,
    totalRevenue: 150000.0,
    totalExpenses: 30000.0,
    netProfit: 120000.0,
    profitMargin: 80.0,
    pendingExpenseExposure: 0,
  },
  categoryBreakdown: [
    { category: "Labor", amount: 23000.0 },
    { category: "Fuel", amount: 7000.0 },
  ],
  monthlyData: [
    { month: "2026-06", eventCount: 2, revenue: 150000.0, expenses: 30000.0, profit: 120000.0, margin: 80.0 },
  ],
  eventTypePerformance: [
    { eventType: "Gala", eventCount: 1, revenue: 100000.0, expenses: 20000.0, netProfit: 80000.0, averageMargin: 80.0 },
  ],
  kpis: {
    mostProfitableEvent: {
      event_id: "event-1",
      event_name: "Gala at Hilton",
      venue_location: "Hilton Addis Ababa",
      net_profit: 80000.0,
    },
    mostProfitableEventType: { eventType: "Gala", eventCount: 1, revenue: 100000.0, expenses: 20000.0, netProfit: 80000.0, averageMargin: 80.0 },
    highestMarginEventType: { eventType: "Gala", eventCount: 1, revenue: 100000.0, expenses: 20000.0, netProfit: 80000.0, averageMargin: 80.0 },
    lowestMarginEvent: null,
    pendingExpenseExposure: 0,
    proposalConversionRate: 50.0,
  },
  proposalVariance: {
    events: [
      {
        eventId: "event-1",
        eventName: "Gala at Hilton",
        proposalId: "prop-1",
        estimatedNetProfit: 75000.0,
        actualNetProfit: 80000.0,
        variance: 5000.0,
      },
    ],
    averageVariance: 5000.0,
  },
  events: [
    {
      event_id: "event-1",
      event_name: "Gala at Hilton",
      event_type_name: "Gala",
      event_type_id: "type-gala",
      venue_location: "Hilton Addis Ababa",
      start_date: "2026-06-10",
      status: "Completed",
      revenue: 100000.0,
      approved_expenses: 20000.0,
      labor_cost: 15000.0,
      fuel_cost: 5000.0,
      other_cost: 0,
      pending_expense_exposure: 0,
      net_profit: 80000.0,
      margin_percentage: 80.0,
      proposal_id: "prop-1",
      proposal_status: "Approved",
      estimated_total_cost: 25000.0,
      estimated_net_profit: 75000.0,
      estimated_profit_variance: 5000.0,
    },
    {
      event_id: "event-2",
      event_name: "Private Dinner",
      event_type_name: null,
      event_type_id: null,
      venue_location: null,
      start_date: "2026-06-15",
      status: "Completed",
      revenue: 50000.0,
      approved_expenses: 10000.0,
      labor_cost: 8000.0,
      fuel_cost: 2000.0,
      other_cost: 0,
      pending_expense_exposure: 0,
      net_profit: 40000.0,
      margin_percentage: 80.0,
      proposal_id: null,
      proposal_status: null,
      estimated_total_cost: 0,
      estimated_net_profit: 0,
      estimated_profit_variance: null,
    },
  ],
  total: 2,
  page: 1,
  limit: 10,
  totalPages: 1,
};

test.describe("Issue #193 — Profit Report Event Venue & Address E2E Coverage", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockCommonShellData(page);
    await mockAuth(page, {
      permission_slugs: ["reports:profit:read"],
    });

    await page.route("**/events/reports/profit*", (route) => {
      fulfillJson(route, MOCK_PROFIT_REPORT);
    });

    await page.route("**/hr/event-types*", (route) => {
      fulfillJson(route, [{ id: "type-gala", event_name: "Gala" }]);
    });
    await page.route("**/event-types*", (route) => {
      fulfillJson(route, [{ id: "type-gala", event_name: "Gala" }]);
    });
  });

  test("renders Events tab with venue location and missing venue fallbacks", async ({ page }) => {
    await page.goto("/hr/reports/profit");

    await expect(page.getByRole("heading", { name: /Financial Dashboard & Reports/i })).toBeVisible();

    const eventsTab = page.getByRole("tab", { name: "Events", exact: true });
    await expect(eventsTab).toBeVisible();
    await eventsTab.click();

    // Verify event row content (visible elements across desktop and mobile)
    await expect(page.locator("text=Gala at Hilton >> visible=true").first()).toBeVisible();
    await expect(page.locator("text=Hilton Addis Ababa >> visible=true").first()).toBeVisible();

    // Verify missing venue fallback "Not recorded"
    await expect(page.locator("text=Not recorded >> visible=true").first()).toBeVisible();

    // Open mobile bottom sheet if on mobile viewport to verify category detail
    const privateDinnerCard = page.locator("text=Private Dinner >> visible=true").first();
    const isMobileView = (await page.viewportSize()?.width || 1024) < 768;
    if (isMobileView) {
      await privateDinnerCard.click();
    }

    // Verify missing category fallback "Uncategorized"
    await expect(page.locator("text=Uncategorized >> visible=true").first()).toBeVisible();
  });
});
