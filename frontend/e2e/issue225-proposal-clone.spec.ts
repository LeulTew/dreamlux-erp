import { expect, test as base, type Page } from "@playwright/test";
import type { EventProposal } from "../src/lib/types";
import {
  CLONE_SOURCE_ID, CLONE_CREATED_ID, CLONE_EVENT_TYPE_ID, cloneScopes,
  expectedClonePayload, proposalCloneSource,
} from "../src/__tests__/fixtures/proposal-clone";
import { fulfillJson } from "./helpers";

type CloneBrowser = {
  source: EventProposal;
  sourceRequests: number;
  failuresRemaining: number;
  holdSource: boolean;
  malformedSource: boolean;
  createBodies: Record<string, unknown>[];
  submitted: string[];
  releaseSource: () => Promise<void>;
};

const test = base.extend<{ cloneBrowser: CloneBrowser }>({
  cloneBrowser: [async ({ context, page, baseURL }, use, testInfo) => {
    const pageErrors: string[] = [];
    const consoleErrors: { text: string; url: string }[] = [];
    const warnings: string[] = [];
    const unexpected: string[] = [];
    const expectedFailures = new Set<string>();
    let created: EventProposal | undefined;
    let pendingReply: (() => Promise<void>) | undefined;
    const control: CloneBrowser = {
      source: proposalCloneSource(),
      sourceRequests: 0,
      failuresRemaining: 0,
      holdSource: false,
      malformedSource: false,
      createBodies: [],
      submitted: [],
      releaseSource: async () => {
        const reply = pendingReply;
        pendingReply = undefined;
        if (reply) await reply();
      },
    };
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push({ text: message.text(), url: message.location().url });
      if (message.type() === "warning") warnings.push(message.text());
    });
    await context.routeWebSocket("**/*", (socket) => {
      const url = new URL(socket.url());
      if (url.origin === baseURL?.replace("http:", "ws:") && url.pathname === "/_next/webpack-hmr") {
        socket.connectToServer();
        return;
      }
      if (url.origin !== "ws://127.0.0.1:54321" || url.pathname !== "/realtime/v1/websocket") {
        unexpected.push(`WebSocket ${url.origin}${url.pathname}`);
        void socket.close();
        return;
      }
      socket.onMessage((message) => {
        const [joinRef, ref, topic, event, payload] = JSON.parse(message.toString()) as [
          string | null, string, string, string,
          { config?: { postgres_changes?: Record<string, unknown>[] } },
        ];
        if (!["phx_join", "phx_leave", "heartbeat", "access_token"].includes(event)) {
          unexpected.push(`Realtime event ${event}`);
          return;
        }
        socket.send(JSON.stringify([joinRef, ref, topic, "phx_reply", {
          status: "ok",
          response: event === "phx_join"
            ? { postgres_changes: (payload.config?.postgres_changes ?? []).map((change, id) => ({ ...change, id })) }
            : {},
        }]));
      });
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== baseURL) {
        unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
        await route.abort("blockedbyclient");
        return;
      }
      if (!url.pathname.startsWith("/api/")) {
        await route.continue();
        return;
      }
      const path = url.pathname.slice("/api".length);
      if (path === `/events/proposals/${CLONE_SOURCE_ID}` && request.method() === "GET") {
        control.sourceRequests++;
        if (control.failuresRemaining > 0) {
          control.failuresRemaining--;
          expectedFailures.add(request.url());
          await fulfillJson(route, { error: "Synthetic source unavailable" }, 500);
        } else if (control.holdSource) {
          pendingReply = () => fulfillJson(route, { proposal: control.source, logs: [] });
        } else {
          await fulfillJson(route, control.malformedSource
            ? { proposal: { ...control.source, cost_breakdown: null }, logs: [] }
            : { proposal: control.source, logs: [] });
        }
        return;
      }
      if (path === "/events/proposals" && request.method() === "POST") {
        const body = request.postDataJSON();
        control.createBodies.push(body);
        created = {
          ...control.source, ...body, id: CLONE_CREATED_ID, status: "Draft",
          approved_by: null, approved_at: null, submitted_at: null, created_by: "clone-browser-writer",
        };
        await fulfillJson(route, { proposal: created });
        return;
      }
      if (path === `/events/proposals/${CLONE_CREATED_ID}` && request.method() === "GET" && created) {
        await fulfillJson(route, { proposal: created, logs: [] });
        return;
      }
      if (path === `/events/proposals/${CLONE_CREATED_ID}/submit` && request.method() === "POST" && created) {
        control.submitted.push(CLONE_CREATED_ID);
        created.status = "Submitted";
        await fulfillJson(route, { success: true });
        return;
      }
      const fixtures: Record<string, unknown> = {
        "/auth/me": { user: { id: "clone-browser-writer", username: "clone-reviewer", full_name: "Clone Reviewer", role: "REVIEWER", role_name: "Reviewer", roles: ["REVIEWER"], is_active: true } },
        "/auth/permissions": { user_id: "clone-browser-writer", role: "REVIEWER", roles: ["REVIEWER"], permission_slugs: ["events:proposals:write", "reports:profit:read"], is_superuser: false, catalog: [] },
        "/event-types": [{ id: CLONE_EVENT_TYPE_ID, event_name: "Anniversary" }],
        "/service-scopes": { service_scopes: cloneScopes },
        "/events/proposals": { proposals: [], total: 0, page: 1, limit: 20, totalPages: 1 },
        "/employees": { employees: [], total: 0, page: 1, limit: 5 },
        "/assets": { items: [], total: 0, page: 1, limit: 5 },
        "/events": { events: [], total: 0, page: 1, limit: 5 },
        "/salary-levels": [],
        "/payroll/runs": [],
        "/api/notifications": { notifications: [], total: 0 },
        "/api/notifications/unread-count": { count: 0 },
      };
      if (request.method() === "GET" && Object.prototype.hasOwnProperty.call(fixtures, path)) {
        await fulfillJson(route, fixtures[path]);
        return;
      }
      unexpected.push(`${request.method()} ${path}`);
      await route.abort("blockedbyclient");
    });
    await page.addInitScript(() => {
      localStorage.setItem("lang", "en");
      localStorage.setItem("theme", "light");
      localStorage.setItem("dreamlux_pwa_install_dismissed", "1");
    });
    await use(control);
    await control.releaseSource();
    const unexpectedConsoleErrors = consoleErrors.filter((error) =>
      !expectedFailures.has(error.url) || !/Failed to load resource:.*status of 500/.test(error.text));
    await testInfo.attach("clone-runtime", {
      body: JSON.stringify({ pageErrors, consoleErrors, warnings, unexpected, expectedFailures: [...expectedFailures] }),
      contentType: "application/json",
    });
    expect(pageErrors, "Actual browser runtime exceptions").toEqual([]);
    expect(unexpectedConsoleErrors, "Unexpected browser console errors").toEqual([]);
    expect(unexpected, "Unmocked API or non-local HTTP/WebSocket connections").toEqual([]);
  }, { auto: true }],
});

async function openClone(page: Page) {
  await page.goto(`/events/proposals/new?clone_from_id=${CLONE_SOURCE_ID}`);
}

async function expectBasics(page: Page) {
  await expect(page.getByPlaceholder("e.g. Annual Charity Gala")).toHaveValue(`${proposalCloneSource().name} (Copy)`);
  await expect(page.getByPlaceholder("e.g. Acme Corporation")).toHaveValue("Anniversary client");
  await expect(page.getByPlaceholder("0.00")).toHaveValue("50000");
  await expect(page.getByPlaceholder("Add design direction, theme ideas, or package details...")).toHaveValue("Gold fabric and warm lighting");
  await expect(page.locator('input[type="time"]').nth(0)).toHaveValue("00:00");
  await expect(page.locator('input[type="time"]').nth(1)).toHaveValue("23:45");
  await expect(page.getByRole("button", { name: "Remove Decoration", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Lighting", exact: true })).toBeVisible();
}

async function estimates(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  for (const label of ["Stage decor", "Existing fabric", "Decor crew", "Decor transport", "Consumables"]) {
    await expect(page.locator(`input[value="${label}"]`)).toHaveCount(1);
  }
}

test("Duplicate preserves canonical source fields and all controls in the saved draft", async ({ page, cloneBrowser }, testInfo) => {
  await page.goto(`/events/proposals/${CLONE_SOURCE_ID}`);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/events/proposals/new\\?clone_from_id=${CLONE_SOURCE_ID}$`));
  await expectBasics(page);
  await estimates(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("2026-10-10 00:00", { exact: true })).toBeVisible();
  await expect(page.getByText("2026-10-11 23:45", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create Draft", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/events/proposals/${CLONE_CREATED_ID}$`));
  expect(cloneBrowser.createBodies).toEqual([expectedClonePayload()]);
  expect(cloneBrowser.submitted).toEqual([]);
  expect(cloneBrowser.source).toEqual(proposalCloneSource());
  await testInfo.attach("canonical-created-payload", { body: JSON.stringify(cloneBrowser.createBodies[0]), contentType: "application/json" });
});

test("copied fields remain editable with Dream Lux scopes and submit through the existing workflow", async ({ page, cloneBrowser }) => {
  await openClone(page);
  await expectBasics(page);
  await page.getByPlaceholder("e.g. Annual Charity Gala").fill("Edited anniversary");
  await page.getByPlaceholder("Add design direction, theme ideas, or package details...").fill("Edited package notes");
  await page.getByRole("button", { name: "Remove Lighting", exact: true }).click();
  await estimates(page);
  await page.getByPlaceholder("People Count", { exact: true }).fill("5");
  await expect(page.locator('input[readonly][value="15000"]')).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Submit for Approval", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/events/proposals/${CLONE_CREATED_ID}$`));
  const expected = expectedClonePayload();
  expect(cloneBrowser.createBodies).toEqual([{
    ...expected, name: "Edited anniversary", package_design_notes: "Edited package notes",
    service_scope_ids: ["scope-decoration"],
    cost_breakdown: { ...expected.cost_breakdown, team: [{ ...expected.cost_breakdown.team![0], people_count: 5, amount: 15000 }] },
  }]);
  expect(cloneBrowser.submitted).toEqual([CLONE_CREATED_ID]);
});

test("source failures block editing/saving until explicit retry safely hydrates the form", async ({ page, cloneBrowser }) => {
  cloneBrowser.failuresRemaining = 1;
  await openClone(page);
  await expect(page.getByRole("alert").filter({ hasText: "Cannot duplicate proposal" })).toBeVisible();
  await expect(page.getByPlaceholder("e.g. Annual Charity Gala")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Draft", exact: true })).toHaveCount(0);
  expect(cloneBrowser.sourceRequests).toBe(1);
  expect(cloneBrowser.createBodies).toEqual([]);
  await page.getByRole("button", { name: /Retry source/ }).click();
  await expectBasics(page);
  expect(cloneBrowser.sourceRequests).toBe(2);
  await estimates(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Create Draft", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/events/proposals/${CLONE_CREATED_ID}$`));
  expect(cloneBrowser.createBodies).toEqual([expectedClonePayload()]);
});

test("pending clone cannot be edited and cancellation prevents a late source from creating a draft", async ({ page, cloneBrowser }) => {
  cloneBrowser.holdSource = true;
  await openClone(page);
  await expect(page.getByRole("status").filter({ hasText: "Loading source proposal" })).toBeVisible();
  await expect.poll(() => cloneBrowser.sourceRequests).toBe(1);
  await expect(page.getByPlaceholder("e.g. Annual Charity Gala")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/events\/proposals$/);
  await cloneBrowser.releaseSource();
  await expect(page.getByPlaceholder("e.g. Annual Charity Gala")).toHaveCount(0);
  expect(cloneBrowser.createBodies).toEqual([]);
  expect(cloneBrowser.submitted).toEqual([]);
});

test("malformed canonical responses stay blocked instead of falling through to a partial draft", async ({ page, cloneBrowser }) => {
  cloneBrowser.malformedSource = true;
  await openClone(page);
  await expect(page.getByRole("alert").filter({ hasText: "Cannot duplicate proposal" })).toBeVisible();
  await expect(page.getByPlaceholder("e.g. Annual Charity Gala")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Draft", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit for Approval", exact: true })).toHaveCount(0);
  expect(cloneBrowser.createBodies).toEqual([]);
  expect(cloneBrowser.submitted).toEqual([]);
});
