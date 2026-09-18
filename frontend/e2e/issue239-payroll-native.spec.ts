import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { control, installPayrollFixture, openPayrollRun, saveDraft } from "./payroll-native-fixture";

test.skip(!process.env.DREAMLUX_NATIVE_BROWSER_DESCRIPTOR || !process.env.DREAMLUX_PAYROLL_CONTROL_SCRIPT,
  "Requires the independently attested DreamLux native browser fixture");

async function finalizeDetail(page: Page) {
  const completed = page.waitForResponse((response) => /\/api\/payroll\/runs\/[^/]+\/status$/.test(new URL(response.url()).pathname)
    && response.request().method() === "PATCH");
  await page.getByRole("button", { name: "Finalize Payout", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Finalization", exact: true }).click();
  expect((await completed).status()).toBe(200);
}

test.beforeEach(async () => { await control("reset"); });

test("normal draft save, history and detail agree with persisted salary and attendance", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated UI base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  try {
    await openPayrollRun(page);
    const id = await saveDraft(page);
    expect(await control("state")).toMatchObject({
      runs: [{ id, status: "draft", total: "17000.00", employees: 2 }],
      audits: 1, lines: 2, event_lines: 2,
    });
    await page.goto("/hr/payments");
    await page.locator(`a[href="/hr/payments/${id}"]`).first().click();
    await expect(page.getByText("Synthetic payroll planner", { exact: true })).toBeVisible();
    await expect(page.getByText(/17,000/).first()).toBeVisible();
    expect(fixture.writes).toEqual(["POST /api/payroll/drafts"]);
    await page.screenshot({ path: test.info().outputPath("payroll-detail.png"), fullPage: true });
    await writeFile(test.info().outputPath("payroll-detail.aria.txt"), await page.locator("body").ariaSnapshot());
  } finally {
    fixture.assertClean();
  }
});

test("detail finalization rebuilds changed sources and displays the actual persisted payout", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated UI base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  try {
    await openPayrollRun(page);
    const id = await saveDraft(page);
    await control("change-source");
    await page.goto(`/hr/payments/${id}`);
    await expect(page.getByText(/17,000/).first()).toBeVisible();
    await finalizeDetail(page);
    expect(await control("state")).toMatchObject({
      runs: [{ id, status: "finalized", total: "2000.00", employees: 2 }],
      audits: 2, lines: 2, event_lines: 1,
    });
    await expect(page.getByText(/2,000/).first()).toBeVisible();
    await expect(page.getByText(/17,000/)).toHaveCount(0);
  } finally {
    fixture.assertClean();
  }
});

test("failed draft replacement retains its data and permits deliberate recovery", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated UI base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  fixture.allowHttpError(500, "/api/payroll/drafts");
  try {
    await openPayrollRun(page);
    const id = await saveDraft(page);
    await control("reject-employee-inserts");
    const failed = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/payroll/drafts"
      && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    expect((await failed).status()).toBe(500);
    expect(await control("state")).toMatchObject({
      runs: [{ id, status: "draft", total: "17000.00", employees: 2 }],
      audits: 1, lines: 2, event_lines: 2,
    });
    await expect(page.getByRole("alert").filter({ hasText: "Payroll change" })).toContainText("retry manually");
    await expect(page.getByRole("button", { name: "Reload payroll" })).toHaveCount(0);
    await control("clear-fault");
    expect(await saveDraft(page)).toBe(id);
    expect(fixture.writes).toEqual([
      "POST /api/payroll/drafts", "POST /api/payroll/drafts", "POST /api/payroll/drafts",
    ]);
  } finally {
    await control("clear-fault");
    fixture.assertClean();
  }
});

test("a malformed successful draft acknowledgement blocks every caller until actual reload", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated UI base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  let corrupted = false;
  await page.route("**/api/payroll/drafts", async (route) => {
    if (route.request().method() !== "POST" || corrupted) return route.fallback();
    const actual = await route.fetch();
    expect(actual.status()).toBe(201);
    corrupted = true;
    await route.fulfill({ response: actual, json: {} });
  });
  try {
    await openPayrollRun(page);
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Payroll change" })).toContainText("not confirmed");
    await expect(page.getByRole("button", { name: "Reload payroll" })).toBeFocused();
    const saved = await control("state");
    expect(saved.runs).toHaveLength(1);
    expect(saved.runs[0]).toMatchObject({ status: "draft", total: "17000.00" });
    await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Finalize Run", exact: true })).toBeDisabled();
    await page.locator('a[href="/hr/payments"]').filter({ visible: true }).first().click();
    await expect(page.getByRole("alert").filter({ hasText: "Payroll change" })).toContainText("not confirmed");
    expect(fixture.writes).toEqual(["POST /api/payroll/drafts"]);
    await page.getByRole("button", { name: "Reload payroll" }).click();
    await expect(page.getByRole("button", { name: "Reload payroll" })).toHaveCount(0);
    await expect(page.locator(`a[href="/hr/payments/${saved.runs[0].id}"]`).first()).toBeVisible();
  } finally {
    fixture.assertClean();
  }
});

test("a wrong-record status acknowledgement does not dismiss uncertainty after actual finalization", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated UI base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  try {
    await openPayrollRun(page);
    const id = await saveDraft(page);
    await page.goto(`/hr/payments/${id}`);
    await page.route(`**/api/payroll/runs/${id}/status`, async (route) => {
      const actual = await route.fetch();
      expect(actual.status()).toBe(200);
      await route.fulfill({
        response: actual,
        json: { id: "23900000-0000-4000-8000-000000000099", status: "FINALIZED" },
      });
    });
    await finalizeDetail(page);
    await expect(page.getByRole("alert").filter({ hasText: "Payroll change" })).toContainText("not confirmed");
    await expect(page.getByRole("button", { name: "Reload payroll" })).toBeFocused();
    expect((await control("state")).runs).toEqual([{ id, status: "finalized", total: "17000.00", employees: 2 }]);
    await expect(page.getByRole("button", { name: "Finalize Payout", exact: true })).toBeDisabled();
    expect(fixture.writes).toEqual(["POST /api/payroll/drafts", `PATCH /api/payroll/runs/${id}/status`]);
  } finally {
    fixture.assertClean();
  }
});

test("history does not claim permanent deletion from an empty acknowledgement", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated UI base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  try {
    await openPayrollRun(page);
    const id = await saveDraft(page);
    await page.goto("/hr/payments");
    await page.getByRole("button", { name: "Move to Trash", exact: true }).click();
    const trashed = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/payroll/runs/${id}/status`
      && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "Confirm Delete", exact: true }).click();
    expect((await trashed).status()).toBe(200);
    await page.getByRole("button", { name: "Trash", exact: true }).click();
    await expect(page.getByRole("button", { name: "Delete Permanently", exact: true })).toBeEnabled();
    await page.route(`**/api/payroll/runs/${id}/permanent`, async (route) => {
      const actual = await route.fetch();
      expect(actual.status()).toBe(200);
      await route.fulfill({ response: actual, json: {} });
    });
    await page.getByRole("button", { name: "Delete Permanently", exact: true }).click();
    await page.getByRole("button", { name: "Confirm Delete", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Payroll change" })).toContainText("not confirmed");
    await expect(page.getByRole("button", { name: "Reload payroll" })).toBeFocused();
    expect((await control("state")).runs).toEqual([]);
    await expect(page.getByRole("button", { name: "Delete Permanently", exact: true })).toBeDisabled();
  } finally {
    fixture.assertClean();
  }
});

test("an unclassified HTTP500 after a committed draft requires reload rather than retry", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated UI base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  fixture.allowHttpError(500, "/api/payroll/drafts");
  await page.route("**/api/payroll/drafts", async (route) => {
    const actual = await route.fetch();
    expect(actual.status()).toBe(201);
    await route.fulfill({ status: 500, contentType: "text/html", body: "<html><body>Synthetic gateway error</body></html>" });
  });
  try {
    await openPayrollRun(page);
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Payroll change" })).toContainText("not confirmed");
    await expect(page.getByRole("button", { name: "Reload payroll" })).toBeFocused();
    await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeDisabled();
    expect((await control("state")).runs).toEqual([expect.objectContaining({ status: "draft", total: "17000.00" })]);
    expect(fixture.writes).toEqual(["POST /api/payroll/drafts"]);
  } finally {
    fixture.assertClean();
  }
});

test("read-only payroll users cannot initiate a new payout", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated UI base URL");
  const fixture = await installPayrollFixture(context, page, baseURL, true);
  try {
    await page.goto("/hr/payments/run?date=2026-04&period_type=w2");
    await expect(page.getByRole("heading", { name: /forbidden|privileges|permission|access denied/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Finalize Run", exact: true })).toHaveCount(0);
    expect((await control("state")).runs).toEqual([]);
    expect(fixture.writes).toEqual([]);
  } finally {
    fixture.assertClean();
  }
});

test("a pending receipt remains exclusive across client navigation and completes without a stuck guard", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated UI base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  let release!: () => void;
  let handled!: () => void;
  let intercepted = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const completed = new Promise<void>((resolve) => { handled = resolve; });
  await page.route("**/api/payroll/drafts", async (route) => {
    const actual = await route.fetch();
    expect(actual.status()).toBe(201);
    intercepted = true;
    try {
      await gate;
      await route.fulfill({ response: actual });
    } finally {
      handled();
    }
  });

  try {
    await openPayrollRun(page);
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect.poll(() => intercepted).toBe(true);
    await expect(page.getByRole("button", { name: /^(?:Save Draft|Saving\.\.\.)$/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Finalize Run", exact: true })).toBeDisabled();
    await page.locator('a[href="/hr/payments"]').filter({ visible: true }).first().click();
    const newPayout = page.getByRole("button", { name: "New Payout", exact: true })
      .or(page.getByRole("link", { name: "New Payout", exact: true })).first();
    await expect(newPayout).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: "Updating payroll" })).toBeVisible();
    release();
    await completed;
    await expect(page.getByRole("status").filter({ hasText: "Updating payroll" })).toHaveCount(0);
    expect((await control("state")).runs).toEqual([expect.objectContaining({ status: "draft", total: "17000.00" })]);
    expect(fixture.writes).toEqual(["POST /api/payroll/drafts"]);
  } finally {
    release();
    if (intercepted) await completed;
    fixture.assertClean();
  }
});

test("a late trash receipt cannot redirect a different current payroll record", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated UI base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  let release!: () => void;
  let handled!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const completion = new Promise<void>((resolve) => { handled = resolve; });
  let intercepted = false;
  try {
    await openPayrollRun(page);
    const firstId = await saveDraft(page);
    await page.goto(`/hr/payments/${firstId}`);
    await finalizeDetail(page);
    await expect(page.getByRole("button", { name: "Move to Trash", exact: true })).toBeEnabled();
    const secondResponse = await context.request.post(`${baseURL}/api/payroll/drafts`, {
      data: { month: 5, year: 2026, period_kind: "weekly", period_start: "2026-05-08", period_end: "2026-05-14" },
    });
    expect(secondResponse.status()).toBe(201);
    const second: { id: string; status: string } = await secondResponse.json();
    expect(second.id).not.toBe(firstId);
    expect(second.status).toBe("DRAFT");
    await page.goto("/hr/payments");
    await page.evaluate(() => { document.documentElement.dataset.payrollContext = "same-document"; });
    await page.locator(`a[href="/hr/payments/${firstId}"]`).first().click();
    await expect(page).toHaveURL(`${baseURL}/hr/payments/${firstId}`);
    await expect(page.getByRole("heading", { name: "Payroll Run Detail", exact: true })).toBeVisible();
    await page.route(`**/api/payroll/runs/${firstId}/status`, async (route) => {
      expect(route.request().method()).toBe("PATCH");
      expect(route.request().postDataJSON()).toEqual({ status: "TRASH" });
      const actual = await route.fetch();
      expect(actual.status()).toBe(200);
      intercepted = true;
      try {
        await gate;
        await route.fulfill({ response: actual });
      } finally { handled(); }
    });
    await page.getByRole("button", { name: "Move to Trash", exact: true }).click();
    await page.getByRole("button", { name: "Confirm Delete", exact: true }).click();
    await expect.poll(() => intercepted).toBe(true);
    await page.goBack();
    await expect(page).toHaveURL(`${baseURL}/hr/payments`);
    await page.locator(`a[href="/hr/payments/${second.id}"]`).first().click();
    await expect(page).toHaveURL(`${baseURL}/hr/payments/${second.id}`);
    expect(await page.locator("html").getAttribute("data-payroll-context")).toBe("same-document");
    release();
    await completion;
    await expect(page.getByRole("status").filter({ hasText: "Updating payroll" })).toHaveCount(0);
    await page.getByRole("button", { name: "Finalize Payout", exact: true }).click({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Confirm Finalization", exact: true })).toBeVisible();
    await expect(page).toHaveURL(`${baseURL}/hr/payments/${second.id}`);
    const state = await control("state");
    expect(state.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: firstId, status: "trashed" }),
      expect.objectContaining({ id: second.id, status: "draft" }),
    ]));
    expect(fixture.writes.filter((write) => write === `PATCH /api/payroll/runs/${firstId}/status`)).toHaveLength(2);
    expect(fixture.writes).not.toContain(`PATCH /api/payroll/runs/${second.id}/status`);
  } finally {
    release();
    if (intercepted) await completion;
    fixture.assertClean();
  }
});

test("a completed old-period draft does not mark a newer setup as saved", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated UI base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  let release!: () => void;
  let handled!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const completion = new Promise<void>((resolve) => { handled = resolve; });
  let intercepted = false;
  await page.route("**/api/payroll/drafts", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      period_start: "2026-04-08", period_end: "2026-04-14",
    });
    const actual = await route.fetch();
    expect(actual.status()).toBe(201);
    intercepted = true;
    try {
      await gate;
      await route.fulfill({ response: actual });
    } finally { handled(); }
  });
  try {
    await openPayrollRun(page);
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect.poll(() => intercepted).toBe(true);
    await page.locator('input[type="month"]').fill("2026-05");
    await expect(page.locator('input[type="month"]')).toHaveValue("2026-05");
    await expect(page.getByText(/^Saved \d/)).toHaveCount(0);
    release();
    await completion;
    await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeEnabled();
    await expect(page.getByText("Not saved yet", { exact: true })).toBeVisible();
    await expect(page.locator('input[type="month"]')).toHaveValue("2026-05");
    expect((await control("state")).runs).toEqual([
      expect.objectContaining({ status: "draft", total: "17000.00" }),
    ]);
    expect(fixture.writes).toEqual(["POST /api/payroll/drafts"]);
  } finally {
    release();
    if (intercepted) await completion;
    fixture.assertClean();
  }
});

test("offline submission settles visibly and reconnecting never dispatches it", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated UI base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  fixture.allowOfflineFailure("/api/payroll/drafts");
  let offline = false;
  let liveSubmissions = 0;
  await page.route("**/api/payroll/drafts", async (route) => {
    if (offline) return route.abort("internetdisconnected");
    liveSubmissions += 1;
    return route.fallback();
  });
  try {
    await openPayrollRun(page);
    await page.waitForLoadState("networkidle");
    offline = true;
    fixture.setOfflineTestWindow(true);
    await context.setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect.soft(page.getByRole("alert").filter({ hasText: "Payroll change" }),
      "Offline submission must settle visibly before reconnection").toBeVisible();
    offline = false;
    await context.setOffline(false);
    fixture.setOfflineTestWindow(false);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
    await expect(page.getByRole("status").filter({ hasText: "Updating payroll" })).toHaveCount(0);
    expect((await control("state")).runs).toEqual([]);
    expect(liveSubmissions).toBe(0);
    const reload = page.getByRole("button", { name: "Reload payroll" });
    if (await reload.count()) await reload.click();
    await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeEnabled();
    await saveDraft(page);
    expect(liveSubmissions).toBe(1);
    expect((await control("state")).runs).toEqual([
      expect.objectContaining({ status: "draft", total: "17000.00" }),
    ]);
  } finally {
    offline = false;
    await context.setOffline(false);
    fixture.setOfflineTestWindow(false);
    fixture.assertClean();
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`uncertain recovery remains reachable and readable in ${theme} layouts`, async ({ page, context, baseURL }, testInfo) => {
    if (!baseURL) throw new Error("Missing isolated UI base URL");
    const fixture = await installPayrollFixture(context, page, baseURL, false, theme);
    await page.route("**/api/payroll/drafts", async (route) => {
      const actual = await route.fetch();
      expect(actual.status()).toBe(201);
      await route.fulfill({ response: actual, json: {} });
    });
    try {
      for (const width of testInfo.project.name === "mobile" ? [320, 375, 390] : [768, 1280, 1920]) {
        await control("reset");
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await openPayrollRun(page);
        await page.getByRole("button", { name: "Save Draft", exact: true }).click();
        const notice = page.getByRole("alert").filter({ hasText: "Payroll change" });
        const reload = page.getByRole("button", { name: "Reload payroll" });
        await expect(notice).toContainText("not confirmed");
        await expect(reload).toBeFocused();
        const metrics = await notice.evaluate((element) => {
          const button = element.querySelector("button");
          if (!button) throw new Error("Missing actual recovery action");
          const bounds = button.getBoundingClientRect();
          const centerX = bounds.left + bounds.width / 2;
          const centerY = bounds.top + bounds.height / 2;
          const unobscured = [
            [centerX, centerY], [centerX, bounds.top + 2], [centerX, bounds.bottom - 2],
            [bounds.left + 2, centerY], [bounds.right - 2, centerY],
          ].every(([x, y]) => button.contains(document.elementFromPoint(x, y)));
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Cannot measure rendered colors");
          const rgba = (color: string) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            return [...ctx.getImageData(0, 0, 1, 1).data];
          };
          const luminance = (color: number[]) => color.slice(0, 3)
            .map((channel) => channel / 255)
            .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
            .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
          const background = rgba(getComputedStyle(element).backgroundColor);
          const backdrop = luminance(background);
          const contrasts = [...element.querySelectorAll("p,button")].map((node) => {
            const ink = luminance(rgba(getComputedStyle(node).color));
            return (Math.max(ink, backdrop) + 0.05) / (Math.min(ink, backdrop) + 0.05);
          });
          const opacity = [];
          for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
            opacity.push(Number(getComputedStyle(ancestor).opacity));
          }
          return {
            left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
            width: bounds.width, height: bounds.height, viewport: window.innerWidth,
            viewportHeight: window.innerHeight, documentWidth: document.documentElement.scrollWidth,
            alpha: background[3], contrast: Math.min(...contrasts), opacity, unobscured,
            dark: document.documentElement.classList.contains("dark"),
          };
        });
        expect(metrics.dark).toBe(theme === "dark");
        expect(metrics.viewport).toBe(width);
        expect(metrics.documentWidth).toBeLessThanOrEqual(width);
        expect(metrics.left).toBeGreaterThanOrEqual(0);
        expect(metrics.right).toBeLessThanOrEqual(width);
        expect(metrics.top).toBeGreaterThanOrEqual(0);
        expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight);
        expect(metrics.width).toBeGreaterThanOrEqual(48);
        expect(metrics.height).toBeGreaterThanOrEqual(48);
        expect(metrics.unobscured).toBe(true);
        expect(metrics.alpha).toBe(255);
        expect(metrics.opacity.every((value) => value === 1)).toBe(true);
        expect(metrics.contrast).toBeGreaterThanOrEqual(4.5);
        await page.screenshot({ path: testInfo.outputPath(`recovery-${theme}-${width}.png`) });
      }
    } finally {
      fixture.assertClean();
    }
  });
}
