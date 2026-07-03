import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const LEDGER_BASE = {
  overheads: [],
  total: 0,
  page: 1,
  limit: 25,
  totalPages: 1,
};



const PENDING_OVERHEAD = {
  id: "oh-e2e-1",
  expense_month: "2026-05-01",
  due_date: "2026-05-15",
  category: "Office Rent",
  payee: "Abebe Plaza",
  scope: "Office",
  shared_with: null,
  payment_kind: "overhead",
  employee_id: null,
  is_recurring: false,
  amount: 8000,
  notes: "Office rental expense",
  status: "Pending",
  rejected_reason: null,
  created_by: "user-e2e",
  created_at: "2026-05-01T10:00:00Z",
};

test.describe("Issue 110 Overhead Register Page Flow", () => {
  test("Accountant records an overhead, Owner approves and closes the month", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: ["finance:overheads:read", "finance:overheads:write", "finance:overheads:approve"],
    });
    await mockCommonShellData(page);

    let hasOverhead = false;
    let isApproved = false;
    let isMonthClosed = false;

    // Intercept overheads list
    await page.route((url) => url.pathname === "/finance/overheads" && url.searchParams.has("month"), (route) => {
      if (!hasOverhead) {
        return fulfillJson(route, LEDGER_BASE);
      }
      const url = new URL(route.request().url());
      const month = url.searchParams.get("month") || "2026-07";
      return fulfillJson(route, {
        overheads: [
          {
            ...PENDING_OVERHEAD,
            expense_month: `${month}-01`,
            status: isApproved ? "Approved" : "Pending",
          },
        ],
        total: 1,
        page: 1,
        limit: 25,
        totalPages: 1,
      });
    });

    // Intercept summary
    await page.route((url) => url.pathname === "/finance/overheads/summary", (route) => {
      const url = new URL(route.request().url());
      const month = url.searchParams.get("month") || "2026-07";
      console.log(`[E2E Mock] Summary API requested for month ${month}. isMonthClosed = ${isMonthClosed}`);
      return fulfillJson(route, {
        month,
        closed: isMonthClosed,
        closure: isMonthClosed ? { closed_at: "2026-06-01T00:00:00Z", closed_by_username: "owner" } : null,
        blocks: {
          officeStaff: 0,
          storeStaff: 0,
          shared: 0,
          rentalAndOther: hasOverhead ? 8000 : 0,
        },
        totals: {
          subtotalMonthly: hasOverhead ? 8000 : 0,
          staffPayments: 0,
          nonPayrollOverhead: hasOverhead ? 8000 : 0,
          pendingExposure: hasOverhead && !isApproved ? 8000 : 0,
        },
      });
    });

    // Intercept create API
    await page.route((url) => url.pathname === "/finance/overheads" && !url.searchParams.has("month"), (route) => {
      if (route.request().method() === "POST") {
        hasOverhead = true;
        console.log("[E2E Mock] Create Overhead API called!");
        return fulfillJson(route, PENDING_OVERHEAD);
      }
      return route.continue();
    });

    // Intercept approve API
    await page.route((url) => url.pathname.endsWith("/approve"), (route) => {
      isApproved = true;
      console.log("[E2E Mock] Approve Overhead API called!");
      return fulfillJson(route, { success: true });
    });

    // Intercept close month API
    await page.route((url) => url.pathname.endsWith("/close"), (route) => {
      isMonthClosed = true;
      console.log("[E2E Mock] Close Month API called!");
      return fulfillJson(route, { success: true });
    });

    // 1. Visit Overheads register page
    await page.goto("/hr/finance/overheads");
    await expect(page.getByRole("heading", { name: "Overhead Register" })).toBeVisible();

    // 2. Open Add Expense form
    await page.getByRole("button", { name: "Add Expense" }).click();
    await page.locator('input[type="number"]').fill("8000");
    await page.getByPlaceholder("e.g. Office Depot").fill("Abebe Plaza");
    await page.locator('input[type="month"]').fill("2026-05");
    await page.getByRole("button", { name: "Save Expense" }).click();

    // Verify it appears in ledger
    await expect(page.getByText("Abebe Plaza")).toBeVisible();
    await expect(page.getByText("Pending")).toBeVisible();

    // 3. Approve it
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved")).toBeVisible();

    // 4. Close the month
    await page.getByRole("button", { name: "Close Month" }).click();
    await expect(page.getByText("This month is closed for edits.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Expense" })).toBeDisabled();
  });
});
