import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const ROLLUP_BASE = {
  period_type: "week",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  periods: [
    {
      period_start: "2026-05-04",
      period_end: "2026-05-10",
      label: "Week of 2026-05-04",
      events: [
        {
          event_id: "ev-1",
          event_name: "Hikma Full Package",
          event_date: "2026-05-04",
          period_start: "2026-05-04",
          income: 80000,
          transport: 5000,
          rental: 3000,
          labour: 12000,
          other: 2000,
          expense_total: 22000,
          profit: 58000,
        },
      ],
      eventTotals: { income: 80000, transport: 5000, rental: 3000, labour: 12000, other: 2000, expenses: 22000, profit: 58000 },
      operational: { byCategory: [] as Array<{ category: string; amount: number }>, total: 0, pendingExposure: 0 },
      net: 58000,
    },
  ],
  summary: {
    periodCount: 1,
    eventCount: 1,
    eventIncome: 80000,
    eventExpenses: 22000,
    eventProfit: 58000,
    operationalExpenses: 0,
    pendingOperationalExposure: 0,
    net: 58000,
  },
};

const PENDING_EXPENSE = {
  id: "opex-e2e-1",
  expense_date: "2026-05-04",
  category: "Office Lunch",
  amount: 1500,
  description: "Office lunch during Hikma install",
  status: "Pending",
  rejected_reason: null,
  created_by: "user-e2e",
  created_by_username: "phase5-e2e",
  approved_by: null,
  created_at: "2026-05-04T10:00:00Z",
  updated_at: "2026-05-04T10:00:00Z",
  approved_at: null,
};

test.describe("Issue 109 weekly/monthly Hisab rollup flow", () => {
  test("accountant records an operational expense, approves it, and the weekly net updates", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: ["finance:hisab:read", "finance:opex:write", "finance:opex:approve"],
    });
    await mockCommonShellData(page);

    let expenseCreated = false;
    let expenseApproved = false;

    await page.route("http://localhost:4000/finance/hisab?**", (route) => {
      if (!expenseApproved) {
        return fulfillJson(route, ROLLUP_BASE);
      }
      // After approval the weekly bucket carries the operational spend and reduced net.
      return fulfillJson(route, {
        ...ROLLUP_BASE,
        periods: [
          {
            ...ROLLUP_BASE.periods[0],
            operational: { byCategory: [{ category: "Office Lunch", amount: 1500 }], total: 1500, pendingExposure: 0 },
            net: 56500,
          },
        ],
        summary: { ...ROLLUP_BASE.summary, operationalExpenses: 1500, net: 56500 },
      });
    });

    await page.route("http://localhost:4000/finance/operational-expenses?**", (route) => {
      if (!expenseCreated) {
        return fulfillJson(route, { expenses: [], total: 0, page: 1, limit: 20, totalPages: 0 });
      }
      return fulfillJson(route, {
        expenses: [{ ...PENDING_EXPENSE, status: expenseApproved ? "Approved" : "Pending" }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    await page.route("http://localhost:4000/finance/operational-expenses", async (route) => {
      if (route.request().method() === "POST") {
        expenseCreated = true;
        await fulfillJson(route, { expense: PENDING_EXPENSE }, 201);
        return;
      }
      await route.fallback();
    });

    await page.route(`http://localhost:4000/finance/operational-expenses/${PENDING_EXPENSE.id}/approve`, async (route) => {
      expenseApproved = true;
      await fulfillJson(route, { expense: { ...PENDING_EXPENSE, status: "Approved" } });
    });

    await page.goto("/hr/finance/hisab");

    // Rollup renders the weekly event block with income and profit.
    await expect(page.getByText("Hisab Reports").first()).toBeVisible();
    await expect(page.getByText("Hikma Full Package")).toBeVisible();
    await expect(page.getByText("ETB 58,000.00").first()).toBeVisible();

    // Accountant opens the ledger and records a non-event operational expense.
    await page.getByRole("button", { name: "Operational Ledger" }).click();
    await page.getByRole("button", { name: "Add Expense" }).click();
    await page.getByRole("button", { name: "Office Lunch" }).click();
    await page.locator('input[type="number"]').fill("1500");
    await page.locator('input[type="text"]').last().fill("Office lunch during Hikma install");
    await page.getByRole("button", { name: "Save Expense" }).click();

    // The pending expense appears in the ledger.
    await expect(page.getByText("Office lunch during Hikma install")).toBeVisible();
    await expect(page.getByText("Pending").first()).toBeVisible();

    // Approver locks it in.
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved").first()).toBeVisible();

    // Back on the rollup, the weekly net reflects the approved operational spend.
    await page.getByRole("button", { name: "Rollup" }).click();
    await expect(page.getByText("ETB 56,500.00").first()).toBeVisible();
    await expect(page.getByText("Non-Event Expenses")).toBeVisible();
  });

  test("read-only finance user sees the rollup without write controls", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["finance:hisab:read"] });
    await mockCommonShellData(page);

    await page.route("http://localhost:4000/finance/hisab?**", (route) => fulfillJson(route, ROLLUP_BASE));
    await page.route("http://localhost:4000/finance/operational-expenses?**", (route) =>
      fulfillJson(route, { expenses: [PENDING_EXPENSE], total: 1, page: 1, limit: 20, totalPages: 1 }),
    );

    await page.goto("/hr/finance/hisab");
    await expect(page.getByText("Hikma Full Package")).toBeVisible();

    await page.getByRole("button", { name: "Operational Ledger" }).click();
    await expect(page.getByText("Office lunch during Hikma install")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Expense" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  });

  test("non-finance user is denied access to the Hisab workspace", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read", "trips:create"] });
    await mockCommonShellData(page);

    await page.goto("/hr/finance/hisab");
    await expect(page.getByText("Forbidden: Insufficient privileges")).toBeVisible();
  });
});
