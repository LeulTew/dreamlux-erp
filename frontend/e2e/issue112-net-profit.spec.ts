import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const MOCK_STATEMENT = {
  month: "2026-05",
  period: {
    start_date: "2026-05-01",
    end_date: "2026-05-31",
    closed: false,
    closure: null,
    snapshot_policy: "Snapshot policy mock",
  },
  treatment: {
    investments: "shown_below_operating_profit",
    payroll: "no_finalized_payroll_staff_payment_overheads_included",
  },
  totals: {
    eventRevenue: 250000,
    approvedEventExpenses: 90000,
    eventGrossProfit: 160000,
    operationalExpenses: 30000,
    overheadExpenses: 15000,
    payrollExpenses: 0,
    operatingProfit: 115000,
    approvedInvestments: 20000,
    netAfterInvestments: 115000,
    pendingExposure: 5000,
    marginPercentage: 46,
  },
  counts: {
    events: 4,
    payrollRuns: 0,
    payrollEmployeeLines: 0,
    investmentRows: 1,
  },
  breakdowns: {
    eventExpensesByCategory: [{ category: "Hardware", amount: 90000, count: 2 }],
    operationalExpensesByCategory: [{ category: "Office rent", amount: 30000, pendingAmount: 0, count: 1 }],
    overheadByScope: [{ scope: "office", payment_kind: "staff_payment", amount: 15000, pendingAmount: 0, count: 1 }],
    investmentsByCategory: [{ category: "Equipment", amount: 20000, pendingAmount: 0, count: 1 }],
    payroll: {
      amount: 0,
      finalizedRunCount: 0,
      employeeLineCount: 0,
      staffPaymentOverheadIncluded: 15000,
      staffPaymentOverheadExcluded: 0,
      nonPayrollOverhead: 0,
    },
  },
  drilldowns: {
    events: [
      {
        id: "evt-e2e-1",
        name: "Mock E2E Event",
        start_date: "2026-05-10",
        revenue: 250000,
        approvedExpenses: 90000,
        pendingExpenses: 5000,
        netProfit: 160000,
      },
    ],
    payrollRuns: [],
    investments: [
      {
        id: "inv-e2e-1",
        item_name: "MacBook Pro",
        category: "Equipment",
        purchase_date: "2026-05-15",
        quantity: 1,
        unit: "pcs",
        unit_cost: 20000,
        total_cost: 20000,
        vendor: "Apple",
        capex_classification: "Capital Asset",
        asset_id: null,
      },
    ],
  },
};

test.describe("Issue 112 Net Profit Page Flow", () => {
  test("Owner/Accountant checks monthly profit statements, toggles investments, views drilldowns", async ({
    page,
  }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: ["reports:profit:read", "finance:hisab:read"],
    });
    await mockCommonShellData(page);

    await page.route(
      (url) => url.pathname === "/finance/reports/monthly-net-profit",
      (route) => {
        const u = new URL(route.request().url());
        const inc = u.searchParams.get("include_investments_in_net") === "true";
        const netAfterInvestments = inc
          ? MOCK_STATEMENT.totals.operatingProfit - MOCK_STATEMENT.totals.approvedInvestments
          : MOCK_STATEMENT.totals.operatingProfit;

        return fulfillJson(route, {
          ...MOCK_STATEMENT,
          totals: {
            ...MOCK_STATEMENT.totals,
            netAfterInvestments,
          },
          treatment: {
            ...MOCK_STATEMENT.treatment,
            investments: inc ? "deducted_below_operating_profit" : "shown_below_operating_profit",
          },
        });
      }
    );

    await page.route(
      (url) => url.pathname === "/finance/reports/monthly-net-profit/export",
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "text/csv",
          body: "Month,Section,Source ID,Name,Date,Amount,Revenue\n",
        });
      }
    );

    await page.goto("/hr/finance/net-profit");

    await expect(page.getByText(/250[\s,]000/).first()).toBeVisible();
    await expect(page.getByText(/160[\s,]000/).first()).toBeVisible();

    const toggle = page.locator("#include-investments-toggle");
    await toggle.click();

    await expect(page.getByText(/95[\s,]000/).first()).toBeVisible();

    await page.getByRole("button", { name: /events/i }).click();
    await expect(page.getByText("Mock E2E Event")).toBeVisible();
  });

  test("Event Manager/Driver is denied access", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: ["events:read", "inventory:read"],
    });
    await mockCommonShellData(page);

    await page.goto("/hr/finance/net-profit");
    await expect(page.getByText(/forbidden/i)).toBeVisible();
  });

  test("Reports Profit Read-only user is denied access", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: ["reports:profit:read"], // has reports:profit:read but not finance:hisab:read
    });
    await mockCommonShellData(page);

    await page.goto("/hr/finance/net-profit");
    await expect(page.getByText(/forbidden/i)).toBeVisible();
  });
});
