import { expect, test, type Page } from "@playwright/test";
import type { MonthlyNetProfitStatement } from "../src/lib/types";
import { fulfillJson, mockAuth, seedAuthenticatedSession } from "./helpers";
import { mockImportShellData } from "./imports-shell-fixture";

type Language = "en" | "am";
const destinations = [
  {
    query: "Net Profit", path: "/hr/finance/hisab/net-profit", permission: "finance:hisab:read",
    label: { en: "Net Profit", am: "የተጣራ ትርፍ" },
    heading: { en: "Net Profit Statement", am: "የተጣራ ትርፍ መግለጫ" },
  },
  {
    query: "Hisab Import", path: "/hr/finance/hisab/imports", permission: "finance:imports:write",
    label: { en: "Hisab Import", am: "የሂሳብ ማስገቢያ" },
    heading: { en: "Hisab Workbook Import", am: "የሂሳብ ዎርክቡክ ማስገቢያ" },
  },
];

function statement(month: string): MonthlyNetProfitStatement {
  return {
    month,
    period: { start_date: `${month}-01`, end_date: `${month}-28`, closed: false, closure: null, snapshot_policy: "Synthetic live statement for navigation verification." },
    treatment: { investments: "shown_below_operating_profit", payroll: "no_finalized_payroll_staff_payment_overheads_included" },
    totals: {
      eventRevenue: 0, approvedEventExpenses: 0, eventGrossProfit: 0,
      operationalExpenses: 0, overheadExpenses: 0, payrollExpenses: 0,
      operatingProfit: 0, approvedInvestments: 0, netAfterInvestments: 0,
      pendingExposure: 0, marginPercentage: 0,
    },
    counts: { events: 0, payrollRuns: 0, payrollEmployeeLines: 0, investmentRows: 0 },
    breakdowns: {
      eventExpensesByCategory: [], operationalExpensesByCategory: [], overheadByScope: [], investmentsByCategory: [],
      payroll: { amount: 0, finalizedRunCount: 0, employeeLineCount: 0, staffPaymentOverheadIncluded: 0, staffPaymentOverheadExcluded: 0, nonPayrollOverhead: 0 },
    },
    drilldowns: { events: [], payrollRuns: [], investments: [] },
  };
}

async function setup(page: Page, origin: string | undefined, lang: Language, permissions: string[]) {
  if (!origin) throw new Error("Finance navigation requires its owned application origin");
  const errors: string[] = [];
  const unexpected: string[] = [];
  const reads: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && !url.pathname.startsWith("/api/")) return route.continue();
    unexpected.push(`${route.request().method()} ${url.pathname}`);
    await route.abort();
  });
  await seedAuthenticatedSession(page);
  await page.addInitScript((language) => {
    localStorage.setItem("lang", language);
    localStorage.setItem("theme", "light");
  }, lang);
  await mockAuth(page, { permissions: ["salary-levels:manage", ...permissions] });
  await mockImportShellData(page, origin, unexpected);
  await page.route((url) => url.pathname === "/api/finance/reports/monthly-net-profit", async (route) => {
    expect(route.request().method()).toBe("GET");
    const url = new URL(route.request().url());
    const month = url.searchParams.get("month");
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Unexpected statement month");
    expect(url.searchParams.get("include_investments_in_net")).toBe("false");
    reads.push(month);
    await fulfillJson(route, statement(month));
  });
  const loaded = await page.goto("/hr/salary-levels");
  expect(loaded?.headers()["content-type"]).toContain("text/html");
  await expect(page.locator("main h1")).toHaveText(lang === "en" ? "Salary Settings" : "የደሞዝ ቅንጅቶች");
  return {
    reads,
    async search(query: string, touch = false) {
      if (touch) await page.getByTitle("Search (Ctrl+K)", { exact: true }).click();
      else await page.keyboard.press("Control+k");
      const input = page.getByPlaceholder(lang === "en" ? "Search pages, tools or settings..." : "ገጾችን፣ ዕቃዎችን ወይም ቅንብሮችን ይፈልጉ...");
      await expect(input).toBeFocused();
      await input.fill(query);
      return input;
    },
    expectClean() {
      expect({ errors, unexpected }).toEqual({ errors: [], unexpected: [] });
    },
  };
}

test.describe("Issue 265 independent finance search destinations", () => {
  for (const lang of ["en", "am"] as const) {
    for (const destination of destinations) {
      test(`${lang} search opens the implemented ${destination.query} page`, async ({ page, baseURL }, testInfo) => {
        const touch = testInfo.project.name === "mobile-chromium";
        const harness = await setup(page, baseURL, lang, ["finance:hisab:read", "finance:imports:write"]);
        const input = await harness.search(destination.query, touch);
        const result = page.getByRole("button", { name: new RegExp(`^${destination.label[lang]}\\s`) });
        await expect(input.locator("..").locator("..").getByRole("button")).toHaveCount(1);
        await expect(result).toBeVisible();
        if (touch) await result.click();
        else await input.press("Enter");
        await expect(page).toHaveURL(`${baseURL}${destination.path}`);
        await expect(page.getByRole("heading", { level: 1, name: destination.heading[lang], exact: true })).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Breadcrumb" }).locator('[aria-current="page"]')).toHaveText(destination.label[lang]);
        if (destination.permission === "finance:hisab:read") await expect.poll(() => harness.reads.length).toBeGreaterThan(0);
        const reloaded = await page.reload();
        expect(reloaded?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1, name: destination.heading[lang], exact: true })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("finance-destination.png"), fullPage: false });
        harness.expectClean();
      });
    }
  }

  test("preserves an already-valid search navigation control", async ({ page, baseURL }) => {
    const harness = await setup(page, baseURL, "en", ["finance:imports:write"]);
    await page.goto("/hr/finance/hisab/imports");
    await expect(page.locator("main h1")).toHaveText("Hisab Workbook Import");
    const input = await harness.search("Salary Levels");
    await expect(input.locator("..").locator("..").getByRole("button")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Salary Levels\s/ })).toBeVisible();
    await input.press("Enter");
    await expect(page).toHaveURL(`${baseURL}/hr/salary-levels`);
    await expect(page.locator("main h1")).toHaveText("Salary Settings");
    harness.expectClean();
  });

  for (const destination of destinations) {
    test(`does not grant ${destination.query} through search`, async ({ page, baseURL }) => {
      const other = destinations.find((entry) => entry.permission !== destination.permission);
      if (!other) throw new Error("Missing independent permission control");
      const harness = await setup(page, baseURL, "en", [other.permission]);
      const input = await harness.search(destination.query);
      await expect(page.getByRole("button", { name: new RegExp(`^${destination.label.en}\\s`) })).toHaveCount(0);
      await input.fill(other.query);
      await expect(page.getByRole("button", { name: new RegExp(`^${other.label.en}\\s`) })).toBeVisible();
      await input.press("Escape");
      await page.goto(destination.path);
      await expect(page.getByText(/^Forbidden/).first()).toBeVisible();
      if (destination.permission === "finance:hisab:read") expect(harness.reads).toEqual([]);
      harness.expectClean();
    });
  }

  test("keeps finance results reachable at narrow and desktop widths", async ({ page, baseURL }, testInfo) => {
    const harness = await setup(page, baseURL, "en", ["finance:hisab:read", "finance:imports:write"]);
    const widths = testInfo.project.name === "mobile-chromium" ? [320, 375, 768] : [1280, 1920];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const input = await harness.search("Finance", true);
      for (const destination of destinations) {
        const result = page.getByRole("button", { name: new RegExp(`^${destination.label.en}\\s`) });
        await expect(result).toBeVisible();
        const box = await result.boundingBox();
        if (!box) throw new Error("Visible finance result has no bounds");
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(900);
        expect(box.height).toBeGreaterThanOrEqual(48);
      }
      await input.press("Escape");
    }
    harness.expectClean();
  });
});
