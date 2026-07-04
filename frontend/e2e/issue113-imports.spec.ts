import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const PREVIEW_MOCK = {
  workbookHash: "a50f26f0435696e3b8f9ce0b8b1a2f65b2e79ce78a389d6a93626429353f6294",
  sourceFilename: "hisab-june.xlsx",
  layoutVersion: "legacy-hisab-v1",
  knownSheets: ["HISAB WEEKLY MONTHLY", "INVESTMENT"],
  missingSheets: ["MONTHLY WECHI"],
  rows: [
    {
      id: "row-1",
      sheet: "HISAB WEEKLY MONTHLY",
      rowNumber: 10,
      kind: "operational_expense",
      date: "2026-06-01",
      month: "2026-06",
      description: "Office Internet Utilities",
      amount: 1500,
      category: "Utilities",
      requiresResolution: [],
    },
    {
      id: "row-2",
      sheet: "HISAB WEEKLY MONTHLY",
      rowNumber: 11,
      kind: "event_expense",
      date: "2026-06-02",
      month: "2026-06",
      description: "Flowers and Stage Decor",
      amount: 25000,
      category: "Consumables",
      requiresResolution: [{ kind: "event", value: "Wedding Celebration" }],
    },
  ],
  unmatched: [{ kind: "event", value: "Wedding Celebration" }],
  formulaMismatches: [
    {
      sheet: "HISAB WEEKLY MONTHLY",
      rowNumber: 100,
      label: "Grand Total Mismatch",
      expected: 26500,
      actual: 26400,
      delta: -100,
    },
  ],
  blockingErrors: [],
  warnings: ["Missing sheet: MONTHLY WECHI"],
  summary: {
    totalRows: 2,
    eventExpenseRows: 1,
    operationalExpenseRows: 1,
    overheadRows: 0,
    investmentRows: 0,
    totalAmount: 26500,
  },
  duplicate: null,
};

const EVENTS_LOOKUP = {
  events: [
    { id: "evt-e2e-111", name: "Wedding Celebration", event_id_display: "EVT-2026-001" },
    { id: "evt-e2e-222", name: "Corporate Launch", event_id_display: "EVT-2026-002" },
  ],
  total: 2,
  page: 1,
  limit: 100,
  totalPages: 1,
};

const COMMIT_SUCCESS_MOCK = {
  importId: "import-batch-12345",
  inserted: {
    eventExpenses: 1,
    operationalExpenses: 1,
    overheads: 0,
    investments: 0,
  },
};

test.describe("Issue 113 Hisab Workbook Import E2E", () => {
  test("Accountant uploads workbook, resolves unmatched event, reviews formula mismatches, and commits successfully", async ({
    page,
  }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: ["finance:imports:write"],
    });
    await mockCommonShellData(page);

    // Mock preview endpoints
    await page.route(
      (url) => url.pathname === "/finance/imports/hisab/preview",
      (route) => fulfillJson(route, PREVIEW_MOCK)
    );

    // Mock events lookup endpoint
    await page.route(
      (url) => url.pathname === "/events",
      (route) => fulfillJson(route, EVENTS_LOOKUP)
    );

    // Mock commit endpoint
    await page.route(
      (url) => url.pathname === "/finance/imports/hisab/commit",
      (route) => fulfillJson(route, COMMIT_SUCCESS_MOCK)
    );

    await page.goto("/hr/finance/imports");
    await expect(page.locator("main h1")).toContainText("Hisab Workbook Import");

    // Simulating workbook file upload
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("text=Select Workbook").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "hisab-june.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("dummy content"),
    });

    // Check stats are rendered after parsing
    await expect(page.locator("text=Total Rows")).toBeVisible();
    await expect(page.locator("text=Total Amount")).toBeVisible();
    await expect(page.locator("text=26,500").first()).toBeVisible();

    // Verify unmatched resolution section is displayed
    await expect(page.locator("text=Resolve Unmatched Items")).toBeVisible();

    // The commit button should be disabled initially
    const commitBtn = page.locator("button:has-text('Commit Import')");
    await expect(commitBtn).toBeDisabled();

    // Resolve the unmatched event
    await page.locator("button:has-text('Choose Event')").click();
    await page.locator("div.max-h-60 button:has-text('Wedding Celebration')").click();

    // Review and accept formula mismatches checkbox
    await page.locator("text=I have reviewed and accept").click();

    // Commit button should now be enabled
    await expect(commitBtn).toBeEnabled();

    // Click commit and verify successful result message
    await commitBtn.click();
    await expect(page.locator("text=Commit successful!").first()).toBeVisible();
    await expect(page.locator("text=Successfully imported:")).toBeVisible();
  });

  test("Unauthorized user cannot access imports page and sees Forbidden screen", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: ["finance:hisab:read"], // No imports write permission
    });
    await mockCommonShellData(page);

    await page.goto("/hr/finance/imports");
    await expect(page.locator("text=Forbidden")).toBeVisible();
  });
});
