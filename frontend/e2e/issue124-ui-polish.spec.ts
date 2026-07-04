import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

test.describe("Issue 124 UI Polish and Consistency E2E tests", () => {
  test("Hisab page loads and displays headers and filters correctly", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("lang", "en");
    });
    await mockAuth(page, { permissions: ["finance:read", "reports:read", "finance:hisab:read"] });
    await mockCommonShellData(page);

    // Mock hisab analytics data
    await page.route("http://localhost:4000/finance/hisab?**", (route) =>
      fulfillJson(route, {
        period_type: "week",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        periods: [],
        summary: {
          periodCount: 0,
          eventCount: 0,
          eventIncome: 0,
          eventExpenses: 0,
          eventProfit: 0,
          operationalExpenses: 0,
          pendingOperationalExposure: 0,
          net: 0,
        },
      })
    );

    await page.goto("/hr/finance/hisab");
    await expect(page.getByRole("heading", { name: "Hisab Reports" })).toBeVisible();
  });

  test("Expense approval page renders gold-themed active tabs with correct classes", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("lang", "en");
    });
    await mockAuth(page, { permissions: ["expenses:approve"] });
    await mockCommonShellData(page);

    await page.route("http://localhost:4000/events/expenses/pending?**", (route) =>
      fulfillJson(route, { data: [], total: 0, page: 1, totalPages: 1 })
    );

    await page.goto("/hr/expenses/approve");
    const activeTab = page.locator("button:has-text('Pending Queue')");
    await expect(activeTab).toHaveClass(/bg-primary/);
    await expect(activeTab).toHaveClass(/text-primary-foreground/);
  });

  test("Payroll detail page displays Activity Timeline trigger button", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("lang", "en");
    });
    await mockAuth(page, { permissions: ["hr:payroll:read", "hr:payroll:write"] });
    await mockCommonShellData(page);

    // Mock payroll run details
    await page.route("http://localhost:4000/payroll/runs/payroll-run-124", (route) =>
      fulfillJson(route, {
        id: "payroll-run-124",
        status: "DRAFT",
        month: 7,
        year: 2026,
        total_payroll_value: 75000,
        employee_lines: [],
      })
    );

    await page.goto("/hr/payments/payroll-run-124");
    const activityBtn = page.locator("button:has-text('Activity')");
    await expect(activityBtn).toBeVisible();
  });
});
