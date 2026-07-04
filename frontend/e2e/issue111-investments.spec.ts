import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const LEDGER_BASE = {
  investments: [],
  total: 0,
  page: 1,
  limit: 25,
  totalPages: 1,
};

const MOCK_INVESTMENT = {
  id: "inv-e2e-1",
  purchase_date: "2026-06-10",
  item_name: "Industrial Fabric Machine",
  category: "Equipment",
  quantity: 2,
  unit: "pcs",
  unit_cost: 25000,
  total_cost: 50000,
  vendor: "Twill Machinery",
  notes: "Washing machine fabric upgrade",
  capex_classification: "Capital Asset",
  asset_id: "asset-e2e-1",
  asset_name: "Twill Loom",
  creates_inventory_stock: true,
  status: "Pending",
  rejected_reason: null,
  created_by: "user-e2e",
  created_at: "2026-06-10T12:00:00Z",
};

test.describe("Issue 111 Capital Investments Page Flow", () => {
  test("Accountant records investment, links asset, Owner approves & exports capex", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: ["finance:investments:read", "finance:investments:write", "finance:investments:approve"],
    });
    await mockCommonShellData(page);

    let hasInvestment = false;
    let isApproved = false;

    // Intercept inventory items lookup for Select dropdown
    await page.route((url) => url.pathname === "/assets" && url.searchParams.get("page") === "1", (route) => {
      return fulfillJson(route, {
        items: [{ id: "asset-e2e-1", name: "Twill Loom", quantity: 5, unit_of_measurement: "pcs" }],
        total: 1,
        page: 1,
        limit: 100,
        totalPages: 1,
      });
    });

    // Intercept investments list
    await page.route((url) => url.pathname === "/finance/investments" && url.searchParams.has("page"), (route) => {
      if (!hasInvestment) {
        return fulfillJson(route, LEDGER_BASE);
      }
      return fulfillJson(route, {
        investments: [
          {
            ...MOCK_INVESTMENT,
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
    await page.route((url) => url.pathname === "/finance/investments/summary", (route) => {
      return fulfillJson(route, {
        totals: {
          approvedTotal: isApproved ? 50000 : 0,
          pendingTotal: !isApproved && hasInvestment ? 50000 : 0,
          pendingCount: !isApproved && hasInvestment ? 1 : 0,
          linkedCount: hasInvestment ? 1 : 0,
          unlinkedCount: 0,
        },
        byCategory: isApproved ? [{ category: "Equipment", amount: 50000 }] : [],
        byClassification: isApproved ? [{ capex_classification: "Capital Asset", amount: 50000 }] : [],
      });
    });

    // Intercept create API
    await page.route((url) => url.pathname === "/finance/investments" && !url.searchParams.has("page"), (route) => {
      if (route.request().method() === "POST") {
        hasInvestment = true;
        return fulfillJson(route, { investment: MOCK_INVESTMENT });
      }
      return route.continue();
    });

    // Intercept approve API
    await page.route((url) => url.pathname.endsWith("/approve"), (route) => {
      isApproved = true;
      return fulfillJson(route, { investment: { ...MOCK_INVESTMENT, status: "Approved" } });
    });

    // Visit page
    await page.goto("/hr/finance/investments");
    await expect(page.getByRole("heading", { name: "Capital Register" })).toBeVisible();

    // Fill and submit Create Form
    await page.getByRole("button", { name: "Add Investment" }).click();
    await page.getByLabel("Item Name").fill("Industrial Fabric Machine");
    await page.getByLabel("Quantity").fill("2");
    await page.getByLabel("Unit", { exact: true }).fill("pcs");
    await page.getByLabel("Unit Cost (ETB)").fill("25000");
    await page.getByLabel("Vendor").fill("Twill Machinery");
    await page.getByLabel("Notes").fill("Washing machine fabric upgrade");

    // Check creates stock and select asset link
    await page.getByLabel("Creates Stock?").check();
    await page.getByTestId("linked-asset-select").getByRole("button").first().click();
    await page.getByRole("button", { name: "Twill Loom (5 pcs)" }).click();

    await page.getByRole("button", { name: "Save Investment" }).click();

    // Verify it is listed in the ledger
    await expect(page.getByText("Industrial Fabric Machine")).toBeVisible();
    await expect(page.getByText("Pending", { exact: true })).toBeVisible();

    // Owner approves it
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();

    let exportRequestedWithAuth = false;
    await page.route((url) => url.pathname === "/finance/investments/export", (route) => {
      exportRequestedWithAuth = route.request().headers().authorization?.startsWith("Bearer ") ?? false;
      return route.fulfill({
        status: 200,
        contentType: "text/csv",
        body: "item_name,total_cost\nIndustrial Fabric Machine,50000\n",
      });
    });

    // Verify export uses the authenticated axios client instead of a naked link.
    await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
    await page.getByRole("button", { name: "CSV" }).click();
    await expect.poll(() => exportRequestedWithAuth).toBe(true);
    await expect(page.getByRole("button", { name: "XLSX" })).toBeVisible();
  });

  test("Non-finance users are denied access and shown ForbiddenState", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: [] }); // Gating check
    await mockCommonShellData(page);

    await page.goto("/hr/finance/investments");
    await expect(page.getByText(/forbidden/i)).toBeVisible();
  });
});
