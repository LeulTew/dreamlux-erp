import { expect, test as base } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";
import { installSyntheticRealtime } from "./payroll-native-fixture";
import { textAppearance } from "./visual-helpers";

const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
if (!["http://localhost:4000", "http://127.0.0.1:5326"].includes(apiOrigin)) {
  throw new Error("Equipment presentation QA requires its explicit synthetic API origin");
}
const itemId = "25900000-0000-4000-8000-000000000010";
const unusedId = "25900000-0000-4000-8000-000000000012";
const test = base.extend<{ isolatedBrowser: void }>({
  isolatedBrowser: [async ({ context, page, baseURL }, use) => {
    if (!baseURL || !["http://127.0.0.1:3101", "http://127.0.0.1:3126"].includes(baseURL)) {
      throw new Error("Equipment browser QA requires its explicit isolated UI");
    }
    const unexpected: string[] = [];
    await installSyntheticRealtime(context, baseURL, unexpected,
      baseURL.endsWith(":3101") ? "ws://127.0.0.1:54321" : "ws://127.0.0.1:54335");
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (![baseURL, apiOrigin].includes(url.origin)) {
        unexpected.push("Unconfigured browser destination");
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    page.on("pageerror", (error) => unexpected.push(error.message));
    await mockCommonShellData(page, apiOrigin);
    await mockCommonShellData(page, `${baseURL}/api`);
    await use();
    expect(unexpected).toEqual([]);
  }, { auto: true }],
});
const apiPath = (url: URL) => {
  const uiOrigin = test.info().project.use.baseURL;
  if (url.origin === uiOrigin && url.pathname.startsWith("/api/")) return url.pathname.slice(4);
  return url.origin === apiOrigin ? url.pathname.replace(/^\/api(?=\/)/, "") : null;
};
const historyMessage = "This item has operational history and cannot be permanently deleted. Keep it in trash or restore it.";
const item = {
  id: itemId, name: "Synthetic retained chair", quantity: 10, description: null,
  image_url: null, store: { id: itemId, name: "Synthetic store" },
  last_counted_at: null, last_counted_by: null, created_at: "2030-01-15", updated_at: "2030-01-15",
};

test.describe("DreamLux259 mocked equipment deletion presentation", () => {
  test("ordinary unused-trash cleanup still needs one deliberate confirmation", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["assets:read", "assets:delete"] });
    await page.route((url) => apiPath(url) === "/offices", (route) => fulfillJson(route, []));
    let deleted = false;
    let writes = 0;
    await page.route((url) => apiPath(url) === "/assets", (route) => fulfillJson(route, {
      items: deleted ? [] : [{ ...item, id: unusedId, name: "Synthetic unused display" }],
      total: deleted ? 0 : 1, page: 1, limit: 10,
    }));
    await page.route((url) => apiPath(url) === `/assets/${unusedId}/permanent`, async (route) => {
      expect(route.request().method()).toBe("DELETE");
      deleted = true;
      writes += 1;
      await fulfillJson(route, { success: true, permanently_deleted: true });
    });
    await page.goto("/assets/trash");
    await page.getByRole("button", { name: "Permanent Delete", exact: true }).filter({ visible: true }).click();
    const dialog = page.getByRole("dialog", { name: "Permanent Delete", exact: true });
    expect(writes).toBe(0);
    await dialog.getByRole("button", { name: "Confirm Delete", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Synthetic unused display", { exact: true })).toHaveCount(0);
    expect(writes).toBe(1);
  });

  test("keeps custody conflicts readable and preserves deliberate unused-trash cleanup", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["assets:read", "assets:delete", "assets:write"] });
    await page.route((url) => apiPath(url) === "/offices", (route) => fulfillJson(route, []));
    let deleted = false;
    let writes = 0;
    await page.route((url) => apiPath(url) === "/assets", async (route) => {
      expect(route.request().method()).toBe("GET");
      const query = new URL(route.request().url()).searchParams;
      if (query.get("trash") !== "true") return route.fallback();
      expect(query.get("status")).toBe("trash");
      expect(query.get("limit")).toBe("10");
      await fulfillJson(route, {
        items: deleted ? [item] : [item, { ...item, id: unusedId, name: "Synthetic unused display" }],
        total: deleted ? 1 : 2, page: 1, limit: 10,
      });
    });
    await page.route((url) => [`/assets/${itemId}/permanent`, `/assets/${unusedId}/permanent`].includes(apiPath(url) ?? ""), async (route) => {
      expect(route.request().method()).toBe("DELETE");
      expect(new URL(route.request().url()).search).toBe("");
      writes += 1;
      if (apiPath(new URL(route.request().url())) === `/assets/${itemId}/permanent`) {
        return fulfillJson(route, { error: historyMessage, code: "ITEM_HAS_HISTORY" }, 409);
      }
      deleted = true;
      return fulfillJson(route, { success: true, permanently_deleted: true });
    });
    const response = await page.goto("/assets/trash");
    expect(response?.headers()["content-type"]).toContain("text/html");
    const open = page.getByRole("button", { name: "Permanent Delete", exact: true }).filter({ visible: true });
    await open.first().click();
    const dialog = page.getByRole("dialog", { name: "Permanent Delete", exact: true });
    await dialog.getByRole("button", { name: "Confirm Delete", exact: true }).click();
    const notice = dialog.getByRole("alert");
    await expect(notice).toHaveText(historyMessage);
    await expect(page.getByText("Item permanently deleted", { exact: true })).toHaveCount(0);
    expect(writes).toBe(1);
    for (const width of [320, 375, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => innerWidth)).toBe(width);
      for (const dark of [false, true]) {
        await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
        await expect.poll(async () => (await textAppearance(notice)).ratio).toBeGreaterThanOrEqual(4.5);
        const confirm = dialog.getByRole("button", { name: "Confirm Delete", exact: true });
        await expect.poll(async () => (await textAppearance(confirm)).ratio).toBeGreaterThanOrEqual(4.5);
        const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
        for (const control of [confirm, cancel]) {
          const box = await control.boundingBox();
          expect(box!.height).toBeGreaterThanOrEqual(48);
          expect(box!.width).toBeGreaterThanOrEqual(48);
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width);
          await control.click({ trial: true });
        }
      }
    }
    await page.setViewportSize({ width: testInfo.project.name.includes("mobile") ? 320 : 1440, height: 900 });
    await dialog.screenshot({ path: testInfo.outputPath("retained-equipment-conflict.png"), animations: "disabled" });
    await page.evaluate(() => { localStorage.setItem("lang", "am"); window.dispatchEvent(new CustomEvent("lang-change")); });
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("የሥራ ታሪክ");
    await page.setViewportSize({ width: 320, height: 568 });
    const translatedDialog = page.getByRole("dialog");
    const closeConfirmation = translatedDialog.getByRole("button", { name: "ማረጋገጫውን ዝጋ", exact: true });
    await closeConfirmation.scrollIntoViewIfNeeded();
    await closeConfirmation.click({ trial: true });
    const closeBounds = await closeConfirmation.boundingBox();
    expect(closeBounds!.y).toBeGreaterThanOrEqual(0);
    expect(closeBounds!.y + closeBounds!.height).toBeLessThanOrEqual(568);
    await translatedDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.evaluate(() => { localStorage.setItem("lang", "en"); window.dispatchEvent(new CustomEvent("lang-change")); });
    await page.reload();
    await expect(page.getByText(item.name, { exact: true }).filter({ visible: true })).toBeVisible();
    expect(writes).toBe(1);
    await open.nth(1).click();
    await expect(dialog).toContainText("Synthetic unused display");
    await dialog.getByRole("button", { name: "Confirm Delete", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Synthetic unused display", { exact: true })).toHaveCount(0);
    await expect(page.getByText(item.name, { exact: true }).filter({ visible: true })).toBeVisible();
    expect(writes).toBe(2);
    expect(errors).toEqual([]);
  });

  test("a read-only actor cannot start a permanent deletion", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["assets:read"] });
    await page.route((url) => apiPath(url) === "/offices", (route) => fulfillJson(route, []));
    await page.route((url) => apiPath(url) === "/assets", (route) => fulfillJson(route, {
      items: [item], total: 1, page: 1, limit: 10,
    }));
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "DELETE") writes.push(request.url());
    });
    await page.goto("/assets/trash");
    await expect(page.getByText(item.name, { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Permanent Delete", exact: true })).toHaveCount(0);
    expect(writes).toEqual([]);
  });
});
