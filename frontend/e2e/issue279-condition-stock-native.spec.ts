import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fulfillJson } from "./helpers";
import { installSyntheticRealtime } from "./payroll-native-fixture";
import { textAppearance } from "./visual-helpers";
import { conditionStockCopy } from "../src/lib/condition-stock-copy";
import { parseConditionResolution, type ConditionResolution } from "../src/lib/condition-stock";

const execute = promisify(execFile);
test.use({ timezoneId: "Africa/Addis_Ababa" });
const itemId = "27900000-abcd-4000-8000-000000000010";
const peerId = "27900000-abcd-4000-8000-000000000011";
const eventId = "27900000-abcd-4000-8000-000000000012";
const reuseId = "27900000-abcd-4000-8000-000000000013";
const overflowId = "27900000-abcd-4000-8000-000000000014";
const allocationId = "27900000-abcd-4000-8000-000000000015";
const resolutionPath = `/api/events/returns/items/${itemId}/condition-resolutions`;
type State = {
  item: { id: string; owned: number; damaged: number; repair: number; unit: string; store: string; metadata: string };
  peer: Record<string, unknown>; resolutions: Record<string, unknown>[]; peer_resolutions: unknown[];
  receipts: Record<string, unknown>[]; movements: Record<string, unknown>[]; reused: Record<string, unknown>[];
};
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
async function control(action: "reset" | "state" | "reader" | "reconciler" | "revoke" | "restore"): Promise<State> {
  const script = process.env.DREAMLUX_EQUIPMENT_CONDITION_CONTROL_SCRIPT;
  const bun = process.env.DREAMLUX_BUN_PATH;
  if (!script || !bun) throw new Error("The independent condition SQL observer is required");
  const response = await execute(bun, ["--no-env-file", script, action], { encoding: "utf8", timeout: 15_000, maxBuffer: 256_000 });
  const value: unknown = JSON.parse(response.stdout);
  if (!record(value) || !record(value.item) || value.item.id !== itemId || !record(value.peer) || value.peer.id !== peerId
    || !Array.isArray(value.resolutions) || !Array.isArray(value.receipts) || !Array.isArray(value.movements)
    || !Array.isArray(value.reused) || !Array.isArray(value.peer_resolutions)) throw new Error("Malformed independent condition observation");
  return value as State;
}
async function cookie(context: BrowserContext, baseURL: string, value: string) {
  await context.clearCookies();
  await context.addCookies(value.split("; ").map((part) => {
    const index = part.indexOf("=");
    if (index < 1) throw new Error("Malformed independently generated session");
    return { url: baseURL, name: part.slice(0, index), value: part.slice(index + 1), httpOnly: true, sameSite: "Lax" as const };
  }));
}
async function prepare(context: BrowserContext, page: Page, baseURL: string | undefined) {
  if (baseURL !== "http://127.0.0.1:3126") throw new Error("Condition QA must use the attested loopback UI");
  const path = process.env.DREAMLUX_EQUIPMENT_BROWSER_DESCRIPTOR;
  if (!path) throw new Error("The private equipment provider descriptor is required");
  const descriptor: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!record(descriptor) || descriptor.purpose !== "dreamlux-equipment-259"
    || descriptor.apiOrigin !== "http://127.0.0.1:5326" || typeof descriptor.database !== "string"
    || !/^dreamlux_ephemeral_equipment_259_[a-f0-9]{12}$/.test(descriptor.database)
    || typeof descriptor.writerCookie !== "string" || typeof descriptor.legacyCookie !== "string") throw new Error("Unowned condition provider");
  await cookie(context, baseURL, descriptor.writerCookie);
  await context.addInitScript(() => { localStorage.setItem("lang", "en"); localStorage.setItem("theme", "light"); });
  const unexpected: string[] = [];
  const consoleErrors: Array<{ text: string; url: string }> = [];
  page.on("pageerror", (error) => unexpected.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push({ text: message.text(), url: message.location().url }); });
  await installSyntheticRealtime(context, baseURL, unexpected);
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== baseURL) { unexpected.push("Nonlocal condition request"); return route.abort("blockedbyclient"); }
    if (!url.pathname.startsWith("/api/") || /^\/api\/(?:assets|auth|events)(?:\/|$)/.test(url.pathname)) return route.continue();
    const shellReads: Record<string, unknown> = {
      "/api/offices": [], "/api/offices/all": [],
      "/api/api/notifications": { notifications: [], total: 0 }, "/api/api/notifications/unread-count": { count: 0 },
    };
    if (request.method() === "GET" && Object.hasOwn(shellReads, url.pathname)) return fulfillJson(route, shellReads[url.pathname]);
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  return { legacyCookie: descriptor.legacyCookie, baseURL, unexpected, consoleErrors };
}

test("real condition stock preserves global reuse, identity, UTC cursors and deliberate recovery", async ({ context, page, baseURL }, info) => {
  const evidence = await prepare(context, page, baseURL);
  const initial = await control("reset");
  try {
  expect(initial.item).toMatchObject({ owned: 10, damaged: 0, repair: 0, unit: "sets", store: "Synthetic West location" });
  expect(initial.peer).toMatchObject({ quantity: 10, unavailable_damaged_quantity: 3, unavailable_repair_quantity: 1 });
  const documentResponse = await page.goto(`/assets/returns?event=${eventId}`);
  expect(documentResponse?.headers()["content-type"]).toContain("text/html");
  await expect(page.getByRole("heading", { name: "Synthetic condition return", exact: true })).toBeVisible();
  await page.locator(`[id="good-${allocationId}"]`).fill("2");
  await page.locator(`[id="damaged-${allocationId}"]`).fill("3");
  await page.locator(`[id="repair-${allocationId}"]`).fill("1");
  await page.locator(`[id="notes-${allocationId}"]`).fill("Synthetic actual unavailable return");
  const returned = page.waitForResponse((response) => response.request().method() === "POST"
    && new URL(response.url()).pathname === `/api/events/${eventId}/allocations/${allocationId}/returns`);
  await page.getByRole("button", { name: "Record return", exact: true }).click();
  expect((await returned).status()).toBe(201);
  const receiptState = await control("state");
  expect(receiptState.item).toMatchObject({ owned: 10, damaged: 3, repair: 1, metadata: "Good" });
  expect(receiptState.receipts).toHaveLength(1);
  await page.locator(`a[href="/assets/conditions?item=${itemId}"]`).click();
  const detail = page.getByRole("dialog", { name: "Condition stock", exact: true });
  await expect(detail.getByText("Location: Synthetic West location", { exact: true })).toBeVisible();
  await expect(detail.getByText("Unit: sets", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Close detail", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Condition stock", exact: true })).toBeFocused();
  const rows = page.getByRole("listitem").filter({ has: page.getByText("Synthetic same-name equipment", { exact: true }) });
  await expect(rows).toHaveCount(2);
  expect((await rows.allTextContents())[0]).not.toBe((await rows.allTextContents())[1]);
  const chosen = rows.filter({ hasText: itemId }).getByRole("button");
  await chosen.focus();
  await page.keyboard.press("Enter");
  await expect(detail.getByText(itemId, { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Close detail", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(chosen).toBeFocused();
  await page.keyboard.press("Enter");
  await detail.getByLabel("Quantity", { exact: true }).fill("2");
  const recovered = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === resolutionPath);
  await detail.getByRole("button", { name: "Record resolution", exact: true }).click();
  const recovery = await recovered;
  expect(recovery.status()).toBe(201);
  const first = parseConditionResolution((await recovery.json()).resolution);
  expect(first).toMatchObject({ item_id: itemId, source_condition: "damaged", outcome: "good", quantity: 2 });
  await expect(detail.getByText("Resolution recorded", { exact: true })).toBeVisible();
  const afterGood = await control("state");
  expect(afterGood.item).toMatchObject({ owned: 10, damaged: 1, repair: 1 });
  expect(afterGood.peer).toEqual(initial.peer);
  expect(afterGood.peer_resolutions).toEqual([]);
  const reuse = await page.request.post(`/api/events/${reuseId}/allocations`, { data: { item_id: itemId, quantity_allocated: 8 } });
  expect(reuse.status()).toBe(201);
  expect((await page.request.post(`/api/events/${overflowId}/allocations`, { data: { item_id: itemId, quantity_allocated: 1 } })).status()).toBe(400);
  await detail.getByRole("button", { name: "Start another resolution", exact: true }).click();
  await detail.getByLabel("Quantity", { exact: true }).fill("1");
  await detail.getByLabel("Outcome", { exact: true }).selectOption("lost");
  await detail.getByRole("button", { name: "Record resolution", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirm equipment loss", exact: true });
  await expect(confirmation.getByText(itemId, { exact: true })).toBeVisible();
  const lost = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === resolutionPath);
  await confirmation.getByRole("button", { name: "Confirm loss", exact: true }).click();
  expect((await lost).status()).toBe(201);
  await expect(detail.getByText("Resolution recorded", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Start another resolution", exact: true }).click();
  await detail.getByRole("link", { name: "View stock movements", exact: true }).click();
  const movement = page.getByRole("row").filter({ hasText: "Synthetic same-name equipment" });
  await expect(movement.getByText("-1 sets", { exact: true })).toHaveClass(/text-danger/);
  await expect(movement.getByText("Condition resolution", { exact: true })).toBeVisible();
  await page.goto(`/assets/conditions?item=${itemId.toUpperCase()}`);
  await expect(detail.getByText(itemId, { exact: true })).toBeVisible();
  await detail.getByLabel("Source condition", { exact: true }).selectOption("repair");
  await detail.getByLabel("Outcome", { exact: true }).selectOption("repair");
  await detail.getByLabel("Quantity", { exact: true }).fill("1");
  const writes: string[] = [];
  page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === resolutionPath) writes.push(request.postData() ?? ""); });
  let committed!: ConditionResolution;
  await page.route(`**${resolutionPath}`, async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    committed = parseConditionResolution((await response.json()).resolution);
    await route.abort("failed");
  });
  await detail.getByRole("button", { name: "Record resolution", exact: true }).click();
  await expect(detail.getByRole("button", { name: "Retry exact request", exact: true })).toBeVisible();
  await page.unroute(`**${resolutionPath}`);
  expect(writes).toHaveLength(1);
  expect(committed).toMatchObject({ item_id: itemId, quantity: 1, source_condition: "repair", outcome: "repair" });
  await context.setOffline(true);
  await detail.getByRole("button", { name: "Retry exact request", exact: true }).click();
  await expect(detail.getByText(conditionStockCopy("en").offline, { exact: true })).toBeVisible();
  await context.setOffline(false);
  await detail.getByRole("link", { name: "View stock movements", exact: true }).click();
  if (info.project.name === "mobile") await page.getByRole("button", { name: "Navigation", exact: true }).click();
  await page.getByRole("link", { name: "Condition stock", exact: true }).first().click();
  await page.getByRole("button", { name: conditionStockCopy("en").reviewRequest, exact: true }).click();
  await expect(detail.getByRole("button", { name: "Retry exact request", exact: true })).toBeVisible();
  await page.goto(`/assets/conditions?item=${itemId.toUpperCase()}`);
  await page.reload();
  await expect(detail.getByRole("button", { name: "Retry exact request", exact: true })).toBeVisible();
  await expect(detail.getByText(`Request identity: ${committed.idempotency_key}`, { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  await detail.getByRole("button", { name: "Check saved outcome", exact: true }).click();
  await expect(detail.getByText("Resolution recorded", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  const state = await control("state");
  expect(state.item).toMatchObject({ owned: 9, damaged: 0, repair: 1, metadata: "Good" });
  expect(state.peer).toEqual(initial.peer);
  expect(state.peer_resolutions).toEqual([]);
  expect(state.receipts).toEqual(receiptState.receipts);
  expect(state.resolutions).toHaveLength(3);
  expect(state.movements).toEqual([expect.objectContaining({ quantity_delta: -1, quantity_before: 10, quantity_after: 9 })]);
  expect(state.reused).toEqual([expect.objectContaining({ quantity_allocated: 8, status: "Reserved" })]);
  const recordedClock = new Intl.DateTimeFormat("en-ET", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })
    .format(new Date(committed.created_at!));
  await expect(detail.getByText(recordedClock, { exact: true }).first()).toBeVisible();
  const history = await page.request.get(`/api/events/returns/items/${itemId}/condition-stock`, { params: { limit: 1 } });
  expect(history.status()).toBe(200);
  const cursor = (await history.json()).next_cursor;
  expect(cursor.created_at).toMatch(/\.\d{6}Z$/);
  const offset = new Date(Date.parse(`${cursor.created_at.slice(0, 19)}Z`) + 10_800_000).toISOString().slice(0, 19)
    + cursor.created_at.slice(19, -1) + "+03:00";
  const pages = await Promise.all([cursor.created_at, offset].map((before_time) =>
    page.request.get(`/api/events/returns/items/${itemId}/condition-stock`, { params: { before_id: cursor.id, before_time } })));
  expect(pages.map((response) => response.status())).toEqual([200, 200]);
  expect(await pages[0].json()).toEqual(await pages[1].json());
  await info.attach("condition-independent-sql", { body: JSON.stringify(state), contentType: "application/json" });
  await detail.getByRole("button", { name: "Start another resolution", exact: true }).click();

  const viewports = info.project.name === "desktop" ? [320, 375, 768, 1280, 1920] : [320, 375, 390];
  const geometry = [];
  for (const lang of ["en", "am"]) {
    const copy = conditionStockCopy(lang);
    await page.evaluate((language) => { localStorage.setItem("lang", language); window.dispatchEvent(new CustomEvent("lang-change")); }, lang);
    const panel = page.getByRole("dialog", { name: copy.title, exact: true });
    await panel.getByLabel(copy.source, { exact: true }).selectOption("repair");
    await panel.getByLabel(copy.quantity, { exact: true }).fill("1");
    for (const dark of [false, true]) {
      await page.evaluate((value) => document.documentElement.classList.toggle("dark", value), dark);
      for (const width of viewports) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => innerWidth)).toBe(width);
        const measured = await panel.evaluate((element) => [...element.querySelectorAll<HTMLElement>("button,input,select,textarea,a")]
          .filter((control) => control.getClientRects().length > 0).map((control) => {
            control.scrollIntoView({ block: "center", inline: "nearest" });
            const box = control.getBoundingClientRect();
            return { label: control.getAttribute("aria-label") ?? control.textContent, x: box.x, y: box.y,
              width: box.width, height: box.height, right: box.right, bottom: box.bottom };
          }));
        for (const box of measured) {
          expect(box.width, String(box.label)).toBeGreaterThanOrEqual(48);
          expect(box.height, String(box.label)).toBeGreaterThanOrEqual(48);
          expect(box.x).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width);
          expect(box.y).toBeGreaterThanOrEqual(0); expect(box.bottom).toBeLessThanOrEqual(900);
        }
        const primary = panel.getByRole("button", { name: copy.resolve, exact: true });
        await expect(primary).toBeEnabled();
        if (width < 768) expect((await primary.boundingBox())!.y).toBeGreaterThanOrEqual(540);
        const identity = panel.locator("[data-condition-item-identity] p").first();
        await expect.poll(async () => {
          const appearance = await textAppearance(identity);
          return { contrast: appearance.ratio >= 4.5, theme: dark ? appearance.backgroundLuminance < 0.05 : appearance.backgroundLuminance > 0.8 };
        }).toEqual({ contrast: true, theme: true });
        await expect.poll(async () => (await textAppearance(primary)).ratio).toBeGreaterThanOrEqual(4.5);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        geometry.push({ lang, dark, width, measured, contrast: {
          primary: await textAppearance(primary), identity: await textAppearance(identity),
        } });
      }
      await panel.locator("[data-condition-detail-scroll]").evaluate((element) => { element.scrollTop = 0; });
      const screenshot = info.outputPath(`condition-${lang}-${dark ? "dark" : "light"}.png`);
      await page.screenshot({ path: screenshot, animations: "disabled" });
      await info.attach(`condition-${lang}-${dark ? "dark" : "light"}`, { path: screenshot, contentType: "image/png" });
    }
  }
  await info.attach("condition-reachability", { body: JSON.stringify(geometry), contentType: "application/json" });
  expect(evidence.unexpected).toEqual([]);
  expect(evidence.consoleErrors.filter((error) => !(error.url.endsWith(resolutionPath) && /ERR_FAILED/.test(error.text)))).toEqual([]);
  await page.evaluate(() => { localStorage.setItem("lang", "en"); window.dispatchEvent(new CustomEvent("lang-change")); document.documentElement.classList.remove("dark"); });
  await control("reader");
  await page.reload();
  await expect(detail.getByText(conditionStockCopy("en").readOnly, { exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Record resolution", exact: true })).toHaveCount(0);
  await control("reconciler");
  await page.reload();
  await expect(detail.getByText(itemId, { exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Record resolution", exact: true })).toBeVisible();
  await expect(detail.getByRole("link", { name: "View stock movements", exact: true })).toHaveCount(0);
  await detail.getByRole("button", { name: "Close detail", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { level: 1, name: "Condition stock", exact: true })).toBeFocused();
  if (info.project.name === "mobile") await page.getByRole("button", { name: "Navigation", exact: true }).click();
  await expect(page.getByRole("link", { name: "Condition stock", exact: true }).first()).toBeVisible();
  await control("revoke");
  await page.reload();
  await expect(page.getByText(conditionStockCopy("en").forbidden, { exact: true })).toBeVisible();
  expect((await page.request.get(`/api/events/returns/items/${itemId}/condition-stock`)).status()).toBe(403);
  await cookie(context, evidence.baseURL, evidence.legacyCookie);
  await page.reload();
  await expect(page.getByText(conditionStockCopy("en").identityUnavailable, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith("dreamlux-erp:condition-resolution:")))).toEqual([]);
  expect((await control("state")).resolutions).toHaveLength(3);
  expect(evidence.unexpected).toEqual([]);
  expect(evidence.consoleErrors.filter((error) => !(error.url.endsWith(resolutionPath) && /ERR_FAILED/.test(error.text)))).toEqual([]);
  } finally {
    await info.attach("condition-browser-errors", {
      body: JSON.stringify({ unexpected: evidence.unexpected, console: evidence.consoleErrors }),
      contentType: "application/json",
    });
    await control("restore");
  }
});
