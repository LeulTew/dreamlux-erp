import { expect, test, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fulfillJson } from "./helpers";
import { installSyntheticRealtime } from "./payroll-native-fixture";

const execute = promisify(execFile);
const retainedId = "25900000-0000-4000-8000-000000000010";
const unusedId = "25900000-0000-4000-8000-000000000012";
const apiOrigin = "http://127.0.0.1:5326";
type State = {
  retained: number; quantity: number | null; restored: boolean | null; unused: number;
  allocations: number; outstanding: number; deletion_audits: number;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function control(action: "reset" | "state"): Promise<State> {
  const script = process.env.DREAMLUX_EQUIPMENT_CONTROL_SCRIPT;
  const bun = process.env.DREAMLUX_BUN_PATH;
  if (!script || !bun) throw new Error("Equipment QA requires its explicit independent SQL control");
  const result = await execute(bun, ["--no-env-file", script, action], { encoding: "utf8", timeout: 15_000, maxBuffer: 128_000 });
  const value: unknown = JSON.parse(result.stdout);
  if (!record(value) || typeof value.retained !== "number" || typeof value.unused !== "number"
    || (value.quantity !== null && typeof value.quantity !== "number")
    || typeof value.allocations !== "number" || typeof value.outstanding !== "number"
    || typeof value.deletion_audits !== "number" || (value.restored !== null && typeof value.restored !== "boolean")) {
    throw new Error("The independent equipment SQL oracle returned malformed state");
  }
  return {
    retained: value.retained, quantity: value.quantity, restored: value.restored, unused: value.unused,
    allocations: value.allocations, outstanding: value.outstanding, deletion_audits: value.deletion_audits,
  };
}

async function openItemAction(page: Page, name: string, action: "Permanent Delete" | "Restore") {
  const label = page.getByText(name, { exact: true }).filter({ visible: true });
  await expect(label).toBeVisible();
  const row = label.locator("xpath=ancestor::*[self::tr or .//button[normalize-space(.)='Permanent Delete']][1]");
  await row.getByRole("button", { name: action, exact: true }).filter({ visible: true }).click();
}

test("retains dispatched custody, deletes unused trash, and preserves restoration through the actual API", async ({ context, page, baseURL }, testInfo) => {
  if (baseURL !== "http://127.0.0.1:3126") throw new Error("Unexpected native equipment browser origin");
  const path = process.env.DREAMLUX_EQUIPMENT_BROWSER_DESCRIPTOR;
  if (!path) throw new Error("Missing private equipment browser descriptor");
  const descriptor: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!record(descriptor) || descriptor.purpose !== "dreamlux-equipment-259" || descriptor.apiOrigin !== apiOrigin
    || typeof descriptor.writerCookie !== "string" || typeof descriptor.database !== "string"
    || !/^dreamlux_ephemeral_equipment_259_[a-f0-9]{12}$/.test(descriptor.database)) {
    throw new Error("Equipment browser descriptor does not match its synthetic fixture");
  }
  await context.addCookies(descriptor.writerCookie.split("; ").map((part) => {
    const separator = part.indexOf("=");
    if (separator < 1) throw new Error("Malformed synthetic equipment cookie");
    return { url: baseURL, name: part.slice(0, separator), value: part.slice(separator + 1), httpOnly: true, sameSite: "Lax" as const };
  }));
  await context.addInitScript(() => { localStorage.setItem("lang", "en"); localStorage.setItem("theme", "light"); });
  const unexpected: string[] = [];
  const consoleErrors: Array<{ text: string; url: string }> = [];
  page.on("pageerror", (error) => unexpected.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ text: message.text(), url: message.location().url });
  });
  await installSyntheticRealtime(context, baseURL, unexpected);
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== baseURL) {
      unexpected.push("Nonlocal equipment browser request");
      return route.abort("blockedbyclient");
    }
    if (!url.pathname.startsWith("/api/") || /^\/api\/(?:assets|auth)(?:\/|$)/.test(url.pathname)) return route.continue();
    const reads: Record<string, unknown> = {
      "/api/offices": [], "/api/offices/all": [],
      "/api/api/notifications": { notifications: [], total: 0 },
      "/api/api/notifications/unread-count": { count: 0 },
    };
    if (request.method() === "GET" && Object.hasOwn(reads, url.pathname)) return fulfillJson(route, reads[url.pathname]);
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  expect(await control("reset")).toEqual({ retained: 1, quantity: 10, restored: false, unused: 1, allocations: 1, outstanding: 10, deletion_audits: 0 });
  const document = await page.goto("/assets/trash");
  expect(document?.headers()["content-type"]).toContain("text/html");
  await openItemAction(page, "Synthetic retained chair", "Permanent Delete");
  const dialog = page.getByRole("dialog", { name: "Permanent Delete", exact: true });
  const blocked = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/assets/${retainedId}/permanent` && response.request().method() === "DELETE");
  await dialog.getByRole("button", { name: "Confirm Delete", exact: true }).click();
  const denied = await blocked;
  const afterDenial = await control("state");
  expect({ status: denied.status(), ...afterDenial }).toEqual({
    status: 409, retained: 1, quantity: 10, restored: false, unused: 1, allocations: 1, outstanding: 10, deletion_audits: 0,
  });
  expect(await denied.json()).toMatchObject({ code: "ITEM_HAS_HISTORY" });
  await expect(dialog.getByRole("alert")).toContainText("operational history");
  await dialog.screenshot({ path: testInfo.outputPath("native-retained-custody.png"), animations: "disabled" });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await openItemAction(page, "Synthetic unused display", "Permanent Delete");
  const removed = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/assets/${unusedId}/permanent` && response.request().method() === "DELETE");
  await dialog.getByRole("button", { name: "Confirm Delete", exact: true }).click();
  const receipt = await removed;
  expect(receipt.status()).toBe(200);
  expect(await receipt.json()).toEqual({ success: true, permanently_deleted: true });
  await expect(page.getByText("Synthetic unused display", { exact: true })).toHaveCount(0);
  expect(await control("state")).toEqual({ retained: 1, quantity: 10, restored: false, unused: 0, allocations: 1, outstanding: 10, deletion_audits: 1 });
  await openItemAction(page, "Synthetic retained chair", "Restore");
  const restoreDialog = page.getByRole("heading", { name: "Restore Item", exact: true }).locator("../..");
  await restoreDialog.getByRole("spinbutton").fill("10");
  const restored = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/assets/${retainedId}/recover` && response.request().method() === "POST");
  await restoreDialog.getByRole("button", { name: "Restore", exact: true }).click();
  expect((await restored).status()).toBe(200);
  await expect(page.getByText("Synthetic retained chair", { exact: true })).toHaveCount(0);
  const final = await control("state");
  expect(final).toEqual({ retained: 1, quantity: 10, restored: true, unused: 0, allocations: 1, outstanding: 10, deletion_audits: 1 });
  expect(unexpected).toEqual([]);
  expect(consoleErrors.filter((entry) => !(entry.url === `${baseURL}/api/assets/${retainedId}/permanent`
    && /^Failed to load resource: the server responded with a status of 409\b/.test(entry.text)))).toEqual([]);
  await testInfo.attach("independent SQL custody receipt", { body: JSON.stringify(final), contentType: "application/json" });
});
