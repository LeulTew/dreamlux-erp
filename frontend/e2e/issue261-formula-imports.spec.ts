import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import type { HisabImportPreview } from "../src/lib/types";
import { fulfillJson, mockAuth, seedAuthenticatedSession } from "./helpers";
import { mockImportShellData } from "./imports-shell-fixture";

type Mode = "cached" | "missing" | "error" | "text";

async function workbookFixture(mode: Mode = "cached", mismatch = false) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("HISAB WEEKLY MONTHLY");
  sheet.addRow(["Date", "Description", "Amount"]);
  sheet.addRow(["2026-05-04", "Office lunch", 100]);
  const price: ExcelJS.CellValue = mode === "missing" ? { formula: "50*2" }
    : mode === "error" ? { formula: "1/0", result: { error: "#DIV/0!" } }
      : mode === "text" ? { formula: '"pending"', result: "pending" }
        : { formula: "50*2", result: 100 };
  sheet.addRow(["2026-05-05", "Office lunch", price]);
  sheet.addRow(["", "", { formula: "SUM(C2:C3)", result: mismatch ? 190 : 200 }]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const name = `synthetic-formula-${mode}.xlsx`;
  const rows: HisabImportPreview["rows"] = (mode === "cached" ? [2, 3] : [2]).map((rowNumber) => ({
    id: `HISAB_WEEKLY_MONTHLY:${rowNumber}:operational_expense`,
    sheet: "HISAB WEEKLY MONTHLY",
    rowNumber,
    kind: "operational_expense",
    date: `2026-05-0${rowNumber + 2}`,
    month: "2026-05",
    description: `2026-05-0${rowNumber + 2} | Office lunch | 100`,
    amount: 100,
    category: "Lunch",
    requiresResolution: [],
  }));
  const preview: HisabImportPreview = {
    workbookHash: createHash("sha256").update(buffer).digest("hex"),
    sourceFilename: name,
    layoutVersion: "legacy-hisab-v1",
    knownSheets: ["HISAB WEEKLY MONTHLY"],
    missingSheets: ["MONTHLY WECHI", "INVESTMENT", "monthly total expense"],
    rows,
    unmatched: [],
    formulaMismatches: mismatch ? [{
      sheet: "HISAB WEEKLY MONTHLY", rowNumber: 4, label: "Formula C4", expected: 200, actual: 190, delta: -10,
    }] : [],
    blockingErrors: mode === "cached" ? [] : [
      `HISAB WEEKLY MONTHLY!C3: ${mode === "text" ? "cached formula amount is not numeric" : "formula has no supported cached result"}. Recalculate the workbook and upload it again.`,
    ],
    warnings: [],
    summary: {
      totalRows: rows.length, eventExpenseRows: 0, operationalExpenseRows: rows.length,
      overheadRows: 0, investmentRows: 0, totalAmount: rows.length * 100,
    },
  };
  return { name, buffer, preview, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}

// Transport is mocked here; the native HTTP suite proves parser and database behavior.
async function openImport(page: Page, baseURL: string | undefined, fixture: Awaited<ReturnType<typeof workbookFixture>>) {
  if (!baseURL) throw new Error("The import browser fixture requires its owned app origin");
  const errors: string[] = [];
  const unexpected: string[] = [];
  const writes: unknown[] = [];
  const state = { fixture, acceptMismatches: false, uploads: 0 };
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL && !url.pathname.startsWith("/api/")) return route.continue();
    unexpected.push(`${route.request().method()} ${url.pathname}`);
    await route.abort();
  });
  await seedAuthenticatedSession(page);
  await mockAuth(page, { permissions: ["finance:imports:write"] });
  await mockImportShellData(page, baseURL, unexpected);
  await page.route((url) => url.pathname === "/api/finance/imports/hisab/preview", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(new URL(route.request().url()).search).toBe("");
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data;");
    const body = route.request().postDataBuffer();
    expect(body?.includes(Buffer.from('name="workbook"'))).toBe(true);
    expect(body?.includes(Buffer.from(`filename="${state.fixture.name}"`))).toBe(true);
    expect(body?.includes(state.fixture.buffer)).toBe(true);
    state.uploads += 1;
    await fulfillJson(route, state.fixture.preview);
  });
  await page.route((url) => url.pathname === "/api/finance/imports/hisab/commit", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(new URL(route.request().url()).search).toBe("");
    expect(state.fixture.preview.blockingErrors).toEqual([]);
    expect(state.fixture.preview.formulaMismatches.length === 0 || state.acceptMismatches).toBe(true);
    const body: unknown = route.request().postDataJSON();
    expect(body).toEqual({
      workbookHash: state.fixture.preview.workbookHash,
      sourceFilename: state.fixture.name,
      acceptFormulaMismatches: state.acceptMismatches,
      preview: state.fixture.preview,
      resolutions: { events: {}, categories: {} },
    });
    writes.push(body);
    await fulfillJson(route, {
      importId: "26100000-0000-4000-8000-000000000003",
      inserted: { eventExpenses: 0, operationalExpenses: 2, overheads: 0, investments: 0 },
    }, 201);
  });
  const response = await page.goto("/hr/finance/hisab/imports");
  expect(response?.headers()["content-type"]).toContain("text/html");
  await expect(page.locator("main h1")).toHaveText("Hisab Workbook Import");
  return {
    state, writes,
    async upload() {
      await page.locator('input[type="file"]').setInputFiles(state.fixture);
      await expect(page.getByRole("heading", { name: "Import Readiness", exact: true })).toBeVisible();
    },
    expectClean() {
      expect({ errors, unexpected }).toEqual({ errors: [], unexpected: [] });
    },
  };
}

test.describe("formula import browser caller contracts", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.setViewportSize(testInfo.project.name === "mobile-chromium"
      ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  });

  test("shows both calculated/literal rows and sends their exact reviewed payload", async ({ page, baseURL }, testInfo) => {
    const harness = await openImport(page, baseURL, await workbookFixture());
    await harness.upload();
    await expect(page.getByText("Total Rows", { exact: true }).locator("..").locator("p").last()).toHaveText("2");
    await expect(page.getByText("Total Amount", { exact: true }).locator("..").locator("p").last()).toHaveText("200 ETB");
    await expect(page.locator("main tbody tr")).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath("formula-preview.png"), fullPage: true });
    const commit = page.getByRole("button", { name: "Commit Import", exact: true });
    await expect(commit).toBeEnabled();
    await commit.click();
    await expect(page.locator("main").getByRole("heading", { name: "Commit successful!", exact: true })).toBeVisible();
    expect(harness.state.uploads).toBe(1);
    expect(harness.writes).toHaveLength(1);
    harness.expectClean();
  });

  for (const mode of ["missing", "error", "text"] as const) {
    test(`keeps ${mode} cache errors blocking even after mismatch acceptance`, async ({ page, baseURL }) => {
      const fixture = await workbookFixture(mode, true);
      const harness = await openImport(page, baseURL, fixture);
      await harness.upload();
      await expect(page.getByText(fixture.preview.blockingErrors[0], { exact: true })).toBeVisible();
      await page.getByLabel("I have reviewed and accept these formula total mismatches", { exact: true }).check();
      await expect(page.getByRole("button", { name: "Commit Import", exact: true })).toBeDisabled();
      expect(harness.writes).toHaveLength(0);

      if (mode === "missing") {
        await page.getByRole("button", { name: "Clear", exact: true }).click();
        harness.state.fixture = await workbookFixture();
        await harness.upload();
        await expect(page.getByText(fixture.preview.blockingErrors[0], { exact: true })).toHaveCount(0);
        await page.getByRole("button", { name: "Commit Import", exact: true }).click();
        await expect(page.locator("main").getByRole("heading", { name: "Commit successful!", exact: true })).toBeVisible();
        expect(harness.state.uploads).toBe(2);
        expect(harness.writes).toHaveLength(1);
      }
      harness.expectClean();
    });
  }

  test("requires explicit subtotal review without adding the subtotal to the submitted rows", async ({ page, baseURL }) => {
    const harness = await openImport(page, baseURL, await workbookFixture("cached", true));
    await harness.upload();
    const commit = page.getByRole("button", { name: "Commit Import", exact: true });
    await expect(commit).toBeDisabled();
    await page.getByLabel("I have reviewed and accept these formula total mismatches", { exact: true }).check();
    harness.state.acceptMismatches = true;
    await expect(commit).toBeEnabled();
    await commit.click();
    await expect(page.locator("main").getByRole("heading", { name: "Commit successful!", exact: true })).toBeVisible();
    expect(harness.writes).toHaveLength(1);
    harness.expectClean();
  });
});
