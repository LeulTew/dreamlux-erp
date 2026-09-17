import { expect, test, type Locator, type Page } from "@playwright/test";
import { control, installPayrollFixture, openPayrollRun } from "./payroll-native-fixture";

test.skip(!process.env.DREAMLUX_NATIVE_BROWSER_DESCRIPTOR || !process.env.DREAMLUX_PAYROLL_CONTROL_SCRIPT,
  "Requires the independently attested DreamLux native browser fixture");

const noPayroll = { runs: [], audits: 0, lines: 0, event_lines: 0 };

async function preview(page: Page) {
  const trigger = page.getByRole("button", { name: "Preview", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Payroll preview", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function assertResult(dialog: Locator, total = "17,000.00") {
  await expect(dialog.getByText("Calculated total", { exact: true }).locator("..")).toContainText(`${total} ETB`);
  await expect(dialog.getByText("Calculated period:", { exact: false })).toContainText("2026-04-08 – 2026-04-14 (Weekly)");
}

async function assertReachable(button: Locator) {
  await button.scrollIntoViewIfNeeded();
  const bounds = await button.boundingBox();
  if (!bounds) throw new Error("The preview control has no rendered bounds");
  expect(bounds.width).toBeGreaterThanOrEqual(48);
  expect(bounds.height).toBeGreaterThanOrEqual(48);
  expect(await button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    return [[x, y], [x, rect.top + 2], [x, rect.bottom - 2], [rect.left + 2, y], [rect.right - 2, y]]
      .every(([left, top]) => element.contains(document.elementFromPoint(left, top)));
  })).toBe(true);
}

test.beforeEach(async () => { await control("reset"); });

test("Preview displays actual server identities, period and amounts without saving", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated browser base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  try {
    await openPayrollRun(page);
    const dialog = await preview(page);
    await assertResult(dialog);
    await expect(dialog.getByText("QA-239-PLANNER", { exact: true })).toBeVisible();
    await expect(dialog.getByText("QA-239-LEADER", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Verified commissions", { exact: true }).locator("..")).toContainText("2,500.00 ETB");
    await expect(dialog.getByRole("button", { name: /Save|Finalize/ })).toHaveCount(0);
    expect(await control("state")).toEqual(noPayroll);
    await dialog.getByRole("button", { name: "Close preview", exact: true }).last().click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Preview", exact: true })).toBeFocused();
    await expect(page.getByText("Setup totals are estimates. Use Preview to review the server calculation before saving.")).toBeVisible();
    expect(fixture.writes).toEqual(["POST /api/payroll/preview"]);
  } finally {
    fixture.assertClean();
  }
});

test("a refresh uses current database inputs without publishing or rewriting setup", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated browser base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  try {
    await openPayrollRun(page);
    const dialog = await preview(page);
    await assertResult(dialog);
    await control("change-source");
    await dialog.getByRole("button", { name: "Refresh preview" }).click();
    await assertResult(dialog, "2,000.00");
    expect(await control("state")).toEqual(noPayroll);
    await dialog.getByRole("button", { name: "Close preview", exact: true }).last().click();
    await expect(page.getByText("Grand Total Disbursement (estimate)", { exact: true }).locator("..")).toContainText("17,000");
    expect(fixture.writes).toEqual(["POST /api/payroll/preview", "POST /api/payroll/preview"]);
  } finally {
    fixture.assertClean();
  }
});

test("a genuine empty result is separate from failed and malformed read responses", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated browser base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  fixture.allowHttpError(503, "/api/payroll/preview");
  let attempts = 0;
  await page.route("**/api/payroll/preview", async (route) => {
    attempts += 1;
    if (attempts === 1) return route.fulfill({ status: 503, json: { error: "Synthetic preview unavailable" } });
    const actual = await route.fetch();
    expect(actual.status()).toBe(200);
    if (attempts === 2) return route.fulfill({ response: actual, json: { total_payroll_value: 0 } });
    return route.fulfill({ response: actual });
  });
  try {
    await openPayrollRun(page);
    const dialog = await preview(page);
    await expect(dialog.getByRole("alert")).toContainText("Synthetic preview unavailable");
    expect(attempts).toBe(1);
    await expect(dialog.getByText("Calculated total", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Retry preview" }).click();
    await expect(dialog.getByRole("alert")).toContainText("could not be verified");
    expect(attempts).toBe(2);
    await control("empty-roster");
    await dialog.getByRole("button", { name: "Retry preview" }).click();
    await expect(dialog.getByText("No employees were returned for this preview.")).toBeVisible();
    await assertResult(dialog, "0.00");
    expect(attempts).toBe(3);
    expect(await control("state")).toEqual(noPayroll);
  } finally {
    fixture.assertClean();
  }
});

test("the complete 250-person preview is paged without losing identities or full totals", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated browser base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  try {
    await control("preview-roster");
    await openPayrollRun(page);
    const dialog = await preview(page);
    await assertResult(dialog, "3,613,000.00");
    await expect(dialog.getByText("Employees returned by the server:", { exact: false })).toContainText("250");
    const rows = dialog.getByRole("list", { name: "Employee amounts" }).getByRole("listitem")
      .or(dialog.getByRole("table", { name: "Employee amounts" }).locator("tbody tr"));
    await expect(rows).toHaveCount(10);
    const initialCode = await rows.first().innerText();
    await dialog.getByRole("button", { name: "Next employees" }).click();
    await expect(dialog.getByText("Page 2 / 25", { exact: true })).toBeVisible();
    await expect(rows.first()).not.toHaveText(initialCode);
    for (let pageNumber = 3; pageNumber <= 25; pageNumber += 1) {
      await dialog.getByRole("button", { name: "Next employees" }).click();
      await expect(dialog.getByText(`Page ${pageNumber} / 25`, { exact: true })).toBeVisible();
    }
    await expect(rows).toHaveCount(10);
    await expect(dialog.getByRole("button", { name: "Next employees" })).toBeDisabled();
    await assertResult(dialog, "3,613,000.00");
    expect(fixture.writes).toEqual(["POST /api/payroll/preview"]);
    expect(await control("state")).toEqual(noPayroll);
  } finally {
    fixture.assertClean();
  }
});

test("the calculated period comes from the actual server rather than a local relabel", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated browser base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  await page.route("**/api/payroll/preview", async (route) => {
    const input: unknown = route.request().postDataJSON();
    if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("Unexpected preview request shape");
    const actual = await route.fetch({ postData: {
      ...input, period_kind: "range", period_start: "2026-04-02", period_end: "2026-04-28",
    } });
    expect(actual.status()).toBe(200);
    await route.fulfill({ response: actual });
  });
  try {
    await openPayrollRun(page);
    const dialog = await preview(page);
    await expect(dialog.getByText("Calculated period:", { exact: false })).toContainText("2026-04-02 – 2026-04-28 (Custom range)");
    await expect(dialog.getByText("The server used a different period from the setup. Review the dates before saving.")).toBeVisible();
    await expect(dialog.getByText("Requested period:", { exact: false })).toContainText("2026-04-08 – 2026-04-14 (Weekly)");
    expect(await control("state")).toEqual(noPayroll);
  } finally {
    fixture.assertClean();
  }
});

test("read permission removal hides cached amounts when current grants refresh", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated browser base URL");
  await page.clock.install();
  const fixture = await installPayrollFixture(context, page, baseURL);
  for (const path of ["/api/payroll/runs", "/api/payroll/settings", "/api/payroll/eligible-commissions"]) {
    fixture.allowHttpError(403, path);
  }
  try {
    await openPayrollRun(page);
    const dialog = await preview(page);
    await assertResult(dialog);
    await fixture.setPayrollRead(false);
    await page.clock.fastForward(300_100);
    const refreshed = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/permissions");
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    const permissions = await refreshed;
    expect(permissions.status()).toBe(200);
    expect((await permissions.json()).permission_slugs).not.toContain("payroll:read");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Preview requires payroll read permission.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview", exact: true })).toBeDisabled();
    await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
    expect(await control("state")).toEqual(noPayroll);
  } finally {
    await fixture.setPayrollRead(true);
    fixture.assertClean();
  }
});

test("a denied refresh never keeps an older successful amount visible", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated browser base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  fixture.allowHttpError(403, "/api/payroll/preview");
  try {
    await openPayrollRun(page);
    const dialog = await preview(page);
    await assertResult(dialog);
    await fixture.setPayrollRead(false);
    await dialog.getByRole("button", { name: "Refresh preview" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Payroll read permission is required");
    await expect(dialog.getByText("Calculated total", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("QA-239-PLANNER", { exact: true })).toHaveCount(0);
    expect(await control("state")).toEqual(noPayroll);
  } finally {
    await fixture.setPayrollRead(true);
    fixture.assertClean();
  }
});

test("keyboard and mobile preview controls remain reachable through loading and complete results", async ({ page, context, baseURL }, info) => {
  if (!baseURL) throw new Error("Missing isolated browser base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/payroll/preview", async (route) => {
    const actual = await route.fetch();
    await gate;
    await route.fulfill({ response: actual });
  });
  try {
    if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
    await openPayrollRun(page);
    const trigger = page.getByRole("button", { name: "Preview", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Payroll preview", exact: true });
    await expect(dialog.getByText("Calculating payroll preview...")).toBeVisible();
    const close = dialog.getByRole("button", { name: "Close preview", exact: true }).first();
    await assertReachable(close);
    const loadingBounds = await close.boundingBox();
    release();
    await assertResult(dialog);
    await assertReachable(close);
    const readyBounds = await close.boundingBox();
    if (!loadingBounds || !readyBounds) throw new Error("Missing stable preview close bounds");
    expect(Math.abs(loadingBounds.x - readyBounds.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(loadingBounds.y - readyBounds.y)).toBeLessThanOrEqual(1);
    await assertReachable(dialog.getByRole("button", { name: "Close preview", exact: true }).last());
    await close.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Close preview", exact: true }).last()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    if (info.project.name === "mobile") {
      const reopened = await preview(page);
      await assertResult(reopened);
      const handle = reopened.locator('[data-slot="payroll-preview-handle"]');
      await handle.click({ trial: true });
      const bounds = await handle.boundingBox();
      if (!bounds) throw new Error("Missing actionable mobile preview handle");
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + 90, { steps: 6 });
      await page.mouse.up();
      await expect(reopened).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
    expect(await control("state")).toEqual(noPayroll);
  } finally {
    release();
    fixture.assertClean();
  }
});

test("closing a pending preview prevents its late result replacing a new request", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated browser base URL");
  const fixture = await installPayrollFixture(context, page, baseURL);
  let release!: () => void;
  let handled!: () => void;
  let firstReceived = false;
  let requests = 0;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const completed = new Promise<void>((resolve) => { handled = resolve; });
  await page.route("**/api/payroll/preview", async (route) => {
    requests += 1;
    const actual = await route.fetch();
    expect(actual.status()).toBe(200);
    if (requests !== 1) return route.fulfill({ response: actual });
    firstReceived = true;
    try {
      await gate;
      await route.fulfill({ response: actual });
    } finally {
      handled();
    }
  });
  try {
    await openPayrollRun(page);
    const first = await preview(page);
    await expect.poll(() => firstReceived).toBe(true);
    await expect(first.getByText("Calculating payroll preview...")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(first).toHaveCount(0);
    await control("change-source");
    const next = await preview(page);
    await assertResult(next, "2,000.00");
    release();
    await completed;
    await assertResult(next, "2,000.00");
    await expect(next.getByText("17,000.00 ETB", { exact: true })).toHaveCount(0);
    expect(requests).toBe(2);
    expect(await control("state")).toEqual(noPayroll);
  } finally {
    release();
    if (firstReceived) await completed;
    fixture.assertClean();
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`preview controls and text remain usable in ${theme} responsive layouts`, async ({ page, context, baseURL }, info) => {
    if (!baseURL) throw new Error("Missing isolated browser base URL");
    const fixture = await installPayrollFixture(context, page, baseURL, false, theme);
    try {
      for (const width of info.project.name === "mobile" ? [320, 375, 390] : [768, 1280, 1920]) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await openPayrollRun(page);
        const dialog = await preview(page);
        await assertResult(dialog);
        await expect(dialog).toHaveCSS("opacity", "1");
        const metrics = await dialog.evaluate((element) => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Cannot measure preview text contrast");
          const color = (value: string) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = value;
            ctx.fillRect(0, 0, 1, 1);
            return [...ctx.getImageData(0, 0, 1, 1).data];
          };
          const luminance = (channels: number[]) => channels.slice(0, 3)
            .map((channel) => channel / 255)
            .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
            .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
          const contrasts = [...element.querySelectorAll("p,th,td,button,h2,span")]
            .filter((node) => !node.closest("button:disabled") && [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()))
            .map((node) => {
              let background: Element | null = node;
              while (background && color(getComputedStyle(background).backgroundColor)[3] !== 255) background = background.parentElement;
              if (!background) throw new Error("Preview text has no opaque backing surface");
              const ink = luminance(color(getComputedStyle(node).color));
              const paper = luminance(color(getComputedStyle(background).backgroundColor));
              return (Math.max(ink, paper) + 0.05) / (Math.min(ink, paper) + 0.05);
            });
          const bounds = element.getBoundingClientRect();
          return {
            minimumContrast: Math.min(...contrasts),
            left: bounds.left, right: bounds.right, bottom: bounds.bottom,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
            dark: document.documentElement.classList.contains("dark"),
          };
        });
        expect(metrics.dark).toBe(theme === "dark");
        expect(metrics.viewportWidth).toBe(width);
        expect(metrics.documentWidth).toBeLessThanOrEqual(width);
        expect(metrics.left).toBeGreaterThanOrEqual(0);
        expect(metrics.right).toBeLessThanOrEqual(width);
        expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight);
        expect(metrics.minimumContrast).toBeGreaterThanOrEqual(4.5);
        await assertReachable(dialog.getByRole("button", { name: "Close preview", exact: true }).first());
        await assertReachable(dialog.getByRole("button", { name: "Close preview", exact: true }).last());
        await assertReachable(dialog.getByRole("button", { name: "Refresh preview" }));
        await page.screenshot({ path: info.outputPath(`preview-${theme}-${width}.png`) });
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
      }
      expect(await control("state")).toEqual(noPayroll);
    } finally {
      fixture.assertClean();
    }
  });
}

test("Amharic preview remains read-only with reachable close and refresh controls", async ({ page, context, baseURL }, info) => {
  if (!baseURL) throw new Error("Missing isolated browser base URL");
  const fixture = await installPayrollFixture(context, page, baseURL, false, "light", "am");
  try {
    if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/hr/payments/run?date=2026-04&period_type=w2");
    const trigger = page.getByRole("button", { name: "ቅድመ-ዕይታ", exact: true });
    await expect(trigger).toBeEnabled();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "የክፍያ ቅድመ እይታ", exact: true });
    await expect(dialog).toContainText("17,000.00");
    await expect(dialog.getByText("QA-239-PLANNER", { exact: true })).toBeVisible();
    await assertReachable(dialog.getByRole("button", { name: "ቅድመ እይታን ዝጋ", exact: true }).first());
    await assertReachable(dialog.getByRole("button", { name: "ቅድመ እይታን ዝጋ", exact: true }).last());
    await assertReachable(dialog.getByRole("button", { name: "ቅድመ እይታን አድስ", exact: true }));
    await page.screenshot({ path: info.outputPath("preview-amharic.png") });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    expect(await control("state")).toEqual(noPayroll);
  } finally {
    fixture.assertClean();
  }
});
