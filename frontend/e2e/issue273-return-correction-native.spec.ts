import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fulfillJson } from "./helpers";
import { installSyntheticRealtime } from "./payroll-native-fixture";

const execute = promisify(execFile);
const itemId = "27300000-0000-4000-8000-000000000010";
const eventId = "27300000-0000-4000-8000-000000000011";
const otherEventId = "27300000-0000-4000-8000-000000000012";
const allocationId = "27300000-0000-4000-8000-000000000013";
const receiptId = "27300000-0000-4000-8000-000000000014";
const correctionPath = `/api/events/returns/${receiptId}/corrections`;

type State = {
  owned: number; good: number; lost: number; status: string; outstanding: number; available: number;
  original_good: number; receipts: number; corrections: number; movements: number; audits: number;
};
const initial: State = {
  owned: 10, good: 10, lost: 0, status: "Returned", outstanding: 0, available: 10,
  original_good: 10, receipts: 1, corrections: 0, movements: 0, audits: 0,
};
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function control(action: "reset" | "state"): Promise<State> {
  const script = process.env.DREAMLUX_EQUIPMENT_RETURN_CONTROL_SCRIPT;
  const bun = process.env.DREAMLUX_BUN_PATH;
  if (!script || !bun) throw new Error("Return browser QA requires the independent SQL observer");
  const result = await execute(bun, ["--no-env-file", script, action], { encoding: "utf8", timeout: 15_000, maxBuffer: 128_000 });
  const value: unknown = JSON.parse(result.stdout);
  if (!record(value) || Object.keys(initial).some((key) => typeof value[key] !== typeof initial[key as keyof State])) {
    throw new Error("The independent return observer returned malformed state");
  }
  return value as State;
}

async function prepare(context: BrowserContext, page: Page, baseURL: string | undefined) {
  if (baseURL !== "http://127.0.0.1:3126") throw new Error("Unexpected return browser origin");
  const path = process.env.DREAMLUX_EQUIPMENT_BROWSER_DESCRIPTOR;
  if (!path) throw new Error("Missing owned equipment provider descriptor");
  const descriptor: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!record(descriptor) || descriptor.purpose !== "dreamlux-equipment-259" || descriptor.apiOrigin !== "http://127.0.0.1:5326"
    || typeof descriptor.writerCookie !== "string" || typeof descriptor.database !== "string"
    || !/^dreamlux_ephemeral_equipment_259_[a-f0-9]{12}$/.test(descriptor.database)) {
    throw new Error("Return browser descriptor does not identify the owned fixture");
  }
  await context.addCookies(descriptor.writerCookie.split("; ").map((part) => {
    const separator = part.indexOf("=");
    if (separator < 1) throw new Error("Malformed synthetic return cookie");
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
      unexpected.push("Nonlocal return browser request");
      return route.abort("blockedbyclient");
    }
    if (!url.pathname.startsWith("/api/") || /^\/api\/(?:assets|auth|events)(?:\/|$)/.test(url.pathname)) return route.continue();
    const reads: Record<string, unknown> = {
      "/api/offices": [], "/api/offices/all": [],
      "/api/api/notifications": { notifications: [], total: 0 },
      "/api/api/notifications/unread-count": { count: 0 },
    };
    if (request.method() === "GET" && Object.hasOwn(reads, url.pathname)) return fulfillJson(route, reads[url.pathname]);
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  expect(await control("reset")).toEqual(initial);
  const document = await page.goto(`/assets/returns?event=${eventId}`);
  expect(document?.headers()["content-type"]).toContain("text/html");
  await expect(page.getByRole("heading", { name: "Synthetic returned event", exact: true })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Original synthetic receipt" })).toBeVisible();
  return { unexpected, consoleErrors };
}

async function api(page: Page, method: string, path: string, payload?: Record<string, unknown>) {
  return page.evaluate(async ({ method, path, payload }) => {
    const response = await fetch(path, {
      method, headers: { "Content-Type": "application/json" },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }, { method, path, payload });
}

test("persists corrections from the real browser and continues the existing rendered return workflow", async ({ context, page, baseURL }) => {
  const evidence = await prepare(context, page, baseURL);
  const loss = await api(page, "POST", correctionPath, {
    good_delta: -1, lost_delta: 1, reason: "Synthetic browser loss correction", idempotency_key: "browser-loss",
  });
  expect(loss.status).toBe(201);
  expect(await control("state")).toEqual({
    ...initial, owned: 9, good: 9, lost: 1, available: 9, corrections: 1, movements: 1, audits: 1,
  });
  const reopened = await api(page, "POST", correctionPath, {
    good_delta: -1, reason: "Synthetic browser reopened custody", idempotency_key: "browser-reopen",
  });
  expect(reopened.status).toBe(201);
  const assets = await api(page, "GET", "/api/assets");
  expect(assets.status).toBe(200);
  expect(assets.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: itemId, available_quantity: 8 })]));
  await page.reload();
  await expect(page.getByText("1 of 10 outstanding", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Original synthetic receipt" })).toBeVisible();
  await page.locator(`input[id="good-${allocationId}"]`).fill("1");
  await page.locator(`input[id="notes-${allocationId}"]`).fill("Synthetic final return");
  const recorded = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/events/${eventId}/allocations/${allocationId}/returns`
    && response.request().method() === "POST");
  await page.getByRole("button", { name: "Record return", exact: true }).click();
  expect((await recorded).status()).toBe(201);
  await expect(page.getByRole("listitem").filter({ hasText: "Synthetic final return" })).toBeVisible();
  expect(await control("state")).toEqual({
    ...initial, owned: 9, good: 9, lost: 1, available: 9, receipts: 2, corrections: 2, movements: 1, audits: 2,
  });
  expect(evidence.unexpected).toEqual([]);
  expect(evidence.consoleErrors).toEqual([]);
});

test("exposes a real reserved-capacity conflict without replaying or changing return evidence", async ({ context, page, baseURL }) => {
  const evidence = await prepare(context, page, baseURL);
  expect((await api(page, "POST", `/api/events/${otherEventId}/allocations`, { item_id: itemId, quantity_allocated: 10 })).status).toBe(201);
  const before = await control("state");
  expect(before).toEqual({ ...initial, available: 0 });
  let attempts = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === correctionPath && request.method() === "POST") attempts += 1;
  });
  const rejected = await api(page, "POST", correctionPath, {
    good_delta: -1, lost_delta: 1, reason: "Synthetic reserved correction", idempotency_key: "browser-conflict",
  });
  expect(rejected).toMatchObject({ status: 409, body: { error: "Correction would consume stock already reserved for events" } });
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Original synthetic receipt" })).toBeVisible();
  const assets = await api(page, "GET", "/api/assets");
  expect(assets.status).toBe(200);
  expect(assets.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: itemId, available_quantity: 0 })]));
  expect(await control("state")).toEqual(before);
  expect(attempts).toBe(1);
  expect(evidence.unexpected).toEqual([]);
  expect(evidence.consoleErrors.filter((entry) => !(entry.url === `${baseURL}${correctionPath}`
    && /^Failed to load resource: the server responded with a status of 409\b/.test(entry.text)))).toEqual([]);
});
