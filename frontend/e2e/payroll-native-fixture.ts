import { expect, type BrowserContext, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fulfillJson } from "./helpers";

const execute = promisify(execFile);
export const plannerId = "23900000-0000-4000-8000-000000000006";
export const leaderId = "23900000-0000-4000-8000-000000000007";
const levelId = "23900000-0000-4000-8000-000000000005";
const eventTypeId = "23900000-0000-4000-8000-000000000008";
const trainingTypeId = "23900000-0000-4000-8000-000000000009";

type State = {
  runs: Array<{ id: string; status: string; total: string; employees: number }>;
  audits: number; lines: number; event_lines: number;
};
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function state(value: unknown): value is State {
  return record(value) && Array.isArray(value.runs)
    && value.runs.every((run: unknown) => record(run) && typeof run.id === "string"
      && typeof run.status === "string" && typeof run.total === "string"
      && /^-?\d+(?:\.\d+)?$/.test(run.total) && typeof run.employees === "number")
    && ["audits", "lines", "event_lines"].every((key) => typeof value[key] === "number");
}
export async function control(action: "reset" | "change-source" | "reject-employee-inserts" | "clear-fault" | "state" | "preview-roster" | "empty-roster") {
  const script = process.env.DREAMLUX_PAYROLL_CONTROL_SCRIPT;
  if (!script) throw new Error("The explicit local payroll control script is missing");
  const result = await execute(process.env.DREAMLUX_BUN_PATH ?? "bun", ["--no-env-file", script, action], {
    encoding: "utf8", timeout: 20_000, maxBuffer: 128_000,
  });
  const parsed: unknown = JSON.parse(result.stdout);
  if (!state(parsed)) throw new Error("The independent database oracle returned malformed state");
  return parsed;
}

export async function installPayrollFixture(context: BrowserContext, page: Page, baseURL: string, reader = false, theme: "light" | "dark" = "light", language: "en" | "am" = "en") {
  if (baseURL !== "http://127.0.0.1:3126") throw new Error("Unexpected DreamLux browser target");
  const descriptorPath = process.env.DREAMLUX_NATIVE_BROWSER_DESCRIPTOR;
  if (!descriptorPath) throw new Error("The private native browser descriptor is missing");
  const descriptor: unknown = JSON.parse(await readFile(descriptorPath, "utf8"));
  if (!record(descriptor) || descriptor.apiOrigin !== "http://127.0.0.1:5326"
    || typeof descriptor.writerCookie !== "string" || typeof descriptor.readerCookie !== "string"
    || typeof descriptor.shutdownKey !== "string" || !/^[a-f0-9]{48}$/.test(descriptor.shutdownKey)
    || typeof descriptor.database !== "string" || !/^dreamlux_ephemeral_payroll_239_[a-f0-9]{12}$/.test(descriptor.database)) {
    throw new Error("The private browser fixture does not match the attested synthetic target");
  }
  const cookie = reader ? descriptor.readerCookie : descriptor.writerCookie;
  const shutdownKey = descriptor.shutdownKey;
  await context.addCookies(cookie.split("; ").map((part) => {
    const separator = part.indexOf("=");
    if (separator < 1) throw new Error("Malformed synthetic session cookie");
    return { url: baseURL, name: part.slice(0, separator), value: part.slice(separator + 1), httpOnly: true, sameSite: "Lax" as const };
  }));
  await context.addInitScript(({ theme, language }) => {
    localStorage.setItem("lang", language);
    localStorage.setItem("theme", theme);
  }, { theme, language });
  const unexpected: string[] = [];
  const errors: string[] = [];
  const consoleErrors: Array<{ text: string; url: string }> = [];
  const expectedHttpErrors = new Set<string>();
  const writes: string[] = [];
  const observe = (target: Page) => {
    target.on("pageerror", (error) => errors.push(error.message));
    target.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push({ text: message.text(), url: message.location().url });
    });
  };
  observe(page);
  context.on("page", observe);
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === baseURL && url.pathname.startsWith("/api/payroll/") && request.method() !== "GET") {
      writes.push(`${request.method()} ${url.pathname}`);
    }
  });
  let preference: Record<string, unknown> = {
    record_type: "payroll", sort: null, filters: {}, pageSize: null,
    visibleColumns: [], density: null, activeTab: null, updated_at: null,
  };
  await context.routeWebSocket("**/*", (socket) => {
    const url = new URL(socket.url());
    if (url.origin === baseURL.replace("http:", "ws:") && url.pathname === "/_next/webpack-hmr") {
      socket.connectToServer();
      return;
    }
    if (url.origin !== "ws://127.0.0.1:54335" || url.pathname !== "/realtime/v1/websocket") {
      unexpected.push("Unconfigured WebSocket");
      void socket.close();
      return;
    }
    socket.onMessage((message) => {
      const parsed: unknown = JSON.parse(message.toString());
      if (!Array.isArray(parsed) || parsed.length !== 5) throw new Error("Unexpected synthetic realtime envelope");
      const [joinRef, ref, topic, event, payload] = parsed;
      if (!["phx_join", "phx_leave", "heartbeat", "access_token"].includes(event)) {
        unexpected.push("Unconfigured realtime event");
        return;
      }
      const changes = record(payload) && record(payload.config) && Array.isArray(payload.config.postgres_changes)
        ? payload.config.postgres_changes : [];
      const response = event === "phx_join" ? { postgres_changes: changes.map((change: unknown, id: number) => {
        if (!record(change)) throw new Error("Malformed synthetic realtime subscription");
        return { ...change, id };
      }) } : {};
      socket.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response }]));
    });
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== baseURL) {
      unexpected.push("Nonlocal browser request");
      return route.abort("blockedbyclient");
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.startsWith("/api/payroll/") || url.pathname.startsWith("/api/auth/")) {
      return route.continue();
    }
    if (url.pathname === "/api/api/preferences/record-list/payroll") {
      if (request.method() === "GET") return fulfillJson(route, { preference });
      if (request.method() === "PUT") {
        const body: unknown = request.postDataJSON();
        if (!record(body)) throw new Error("Unexpected list-preference payload");
        expect(body.pageSize === 8 && record(body.sort) && record(body.filters)).toBe(true);
        preference = { ...preference, ...body, updated_at: "2026-04-10T12:00:00Z" };
        return fulfillJson(route, { preference });
      }
    }
    if (request.method() === "GET" && url.pathname === "/api/employees") {
      expect(url.searchParams.get("page")).toBe("1");
      expect(url.searchParams.get("limit")).toBe("5000");
      expect(url.searchParams.get("status")).toBe("active");
      return fulfillJson(route, { employees: [
        { id: plannerId, employee_id: "QA-239-PLANNER", full_name: "Synthetic payroll planner", salary_level: "QA-PLANNER-239", base_salary: 10000, compensation_mode: "regular", event_prices: {} },
        { id: leaderId, employee_id: "QA-239-LEADER", full_name: "Synthetic payroll team leader", salary_level: "QA-PLANNER-239", base_salary: 10000, compensation_mode: "commission_only", event_prices: {} },
      ], total: 2, page: 1, limit: 5000 });
    }
    const reads: Record<string, unknown> = {
      "/api/stores": [], "/api/offices": [], "/api/offices/all": [], "/api/departments": [],
      "/api/salary-levels": [{ id: levelId, level_name: "QA-PLANNER-239", base_salary: 14500 }],
      "/api/event-types": [
        { id: eventTypeId, event_name: "Synthetic event 239", default_price: 0 },
        { id: trainingTypeId, event_name: "Synthetic training 239", default_price: 0 },
      ],
      "/api/api/notifications": { notifications: [], total: 0 },
      "/api/api/notifications/unread-count": { count: 0 },
    };
    if (request.method() === "GET" && Object.hasOwn(reads, url.pathname)) return fulfillJson(route, reads[url.pathname]);
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  return {
    writes,
    async setPayrollRead(enabled: boolean) {
      const response = await context.request.post("http://127.0.0.1:5326/__qa/payroll-read", {
        headers: { "x-dreamlux-fixture-key": shutdownKey },
        data: { enabled },
      });
      expect(response.status()).toBe(204);
    },
    allowHttpError(status: number, path: string) {
      expectedHttpErrors.add(`${status} ${path}`);
    },
    assertClean() {
      expect(unexpected).toEqual([]);
      expect(errors).toEqual([]);
      const unexpectedConsole = consoleErrors.filter((message) => {
        const status = /Failed to load resource: the server responded with a status of (\d+)/.exec(message.text)?.[1];
        if (!status || !message.url.startsWith(baseURL)) return true;
        return !expectedHttpErrors.has(`${status} ${new URL(message.url).pathname}`);
      });
      expect(unexpectedConsole).toEqual([]);
    },
  };
}

export async function openPayrollRun(page: Page) {
  const response = await page.goto("/hr/payments/run?date=2026-04&period_type=w2");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toContain("text/html");
  await expect(page.getByText("Synthetic payroll planner", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeEnabled();
  await expect(page.getByText(/\b17,000(?:\.00)?\b/).first()).toBeVisible();
}

export async function saveDraft(page: Page) {
  const saved = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/payroll/drafts"
    && response.request().method() === "POST");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const payload: unknown = await response.json();
  if (!record(payload) || typeof payload.id !== "string") throw new Error("Missing actual saved draft ID");
  await expect(page.getByText("Draft saved", { exact: true }).filter({ visible: true }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeEnabled();
  return payload.id;
}
