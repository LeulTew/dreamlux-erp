import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import type { Employee } from "../src/lib/types";

const departmentId = "23400000-0000-4000-8000-000000000002";
const officeId = "23400000-0000-4000-8000-000000000003";
const eventTypeId = "23400000-0000-4000-8000-000000000005";
const addedDepartmentId = "23400000-0000-4000-8000-000000000006";
const employee: Employee = {
  id: "23400000-0000-4000-8000-000000000001",
  employee_id: "SYN-234", full_name: "Synthetic Drawer Employee",
  department: "Synthetic Operations", department_id: departmentId,
  office: "Synthetic Office", office_id: officeId,
  salary_level: "L1", compensation_mode: "regular", base_salary: 2400,
  phone: "0911111111", email: "drawer@example.invalid", event_prices: { [eventTypeId]: 120 },
  position: null, commission: null, commission_type: null,
  id_card_front_url: null, id_card_back_url: null, profile_photo_url: null,
  gender: null, employment_type: null, group_name: null, bank_name: null, bank_account: null,
  hire_date: null, contract_status: null, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
};

const states = new WeakMap<Page, Awaited<ReturnType<typeof fixture>>>();

async function fixture(page: Page, baseURL: string | undefined) {
  if (!baseURL || new URL(baseURL).hostname !== "127.0.0.1") throw new Error("Use the owned local drawer server");
  const employeeAttempts: { query: Record<string, string>; request: Request }[] = [];
  const state = {
    record: { ...employee }, deleted: false, denied: false, holdDelete: false,
    releaseDelete: undefined as (() => void) | undefined,
    writes: [] as { method: string; path: string; payload: Record<string, string> }[],
    employeeAttempts,
    get employeeReads() {
      // Development Strict Mode aborts its mount probe; keep it in the raw evidence.
      return employeeAttempts.filter(({ request }) => request.failure()?.errorText !== "net::ERR_ABORTED").map(({ query }) => query);
    },
    activity: [] as { path: string; query: Record<string, string> }[],
    unexpected: [] as string[], errors: [] as string[],
  };
  const departments = [{ id: departmentId, name: "Synthetic Operations" }];
  states.set(page, state);
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("lang", "en");
    localStorage.setItem("user", JSON.stringify({ full_name: "Synthetic HR Operator", role_name: "Owner" }));
  });
  await page.routeWebSocket("**/*", (socket) => {
    const url = new URL(socket.url());
    if (url.origin === baseURL.replace("http:", "ws:") && url.pathname === "/_next/webpack-hmr") {
      socket.connectToServer();
      return;
    }
    if (url.origin !== "ws://127.0.0.1:54321" || url.pathname !== "/realtime/v1/websocket") {
      state.unexpected.push(`websocket:${url.origin}${url.pathname}`);
      void socket.close();
      return;
    }
    socket.onMessage((message) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(message.toString()) as [
        string | null, string, string, string, { config?: { postgres_changes?: Record<string, unknown>[] } },
      ];
      const response = event === "phx_join"
        ? { postgres_changes: (payload.config?.postgres_changes ?? []).map((change, id) => ({ ...change, id })) }
        : {};
      socket.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response }]));
    });
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.origin !== baseURL) {
      state.unexpected.push(`nonlocal:${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.startsWith("/api/api/preferences/")) return json({ preference: null });
    if (url.pathname === "/api/departments" && request.method() === "POST") {
      const payload: { name: string } = request.postDataJSON();
      const created = { id: addedDepartmentId, name: payload.name };
      state.writes.push({ method: "POST", path: url.pathname, payload });
      departments.push(created);
      return json(created, 201);
    }
    if (url.pathname === `/api/employees/${employee.id}` && request.method() === "PATCH") {
      const contentType = request.headers()["content-type"] ?? "";
      const payload: Record<string, string> = contentType.includes("multipart/form-data")
        ? Object.fromEntries(Array.from((request.postData() ?? "").matchAll(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n--/g),
          (match) => [match[1], match[2]]))
        : request.postDataJSON();
      state.writes.push({ method: "PATCH", path: url.pathname, payload });
      state.record = { ...state.record, ...payload,
        event_prices: payload.event_prices ? JSON.parse(payload.event_prices) : state.record.event_prices };
      return json(state.record);
    }
    if (url.pathname === `/api/employees/${employee.id}` && request.method() === "DELETE") {
      state.writes.push({ method: "DELETE", path: url.pathname, payload: {} });
      if (state.holdDelete) await new Promise<void>((resolve) => { state.releaseDelete = resolve; });
      state.deleted = true;
      return json({ success: true });
    }
    if (url.pathname === "/api/api/activity") {
      state.activity.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
      return json({ activity: [{
        id: "activity-234", entity_type: "employee", entity_id: employee.id, user_id: "synthetic-234",
        username: "synthetic-234", full_name: "Synthetic HR Operator", action: "update",
        field_changed: "department", old_value: "Synthetic Previous", new_value: "Synthetic Operations",
        note: "Synthetic history only", source_route: "employees", created_at: "2026-09-01T00:00:00Z",
      }], page: 1, limit: 100, hasMore: false });
    }
    if (url.pathname === "/api/employees") employeeAttempts.push({ query: Object.fromEntries(url.searchParams), request });
    const reads: Record<string, unknown> = {
      "/api/auth/me": { user: { id: "synthetic-234", username: "synthetic-234", full_name: "Synthetic HR Operator", role: "Owner", roles: ["Owner"], is_active: true } },
      "/api/auth/permissions": { permission_slugs: state.denied ? [] : ["hr:read", "hr:write"], is_superuser: false, catalog: [] },
      "/api/employees": { employees: state.deleted ? [] : [state.record], total: state.deleted ? 0 : 1,
        page: Number(url.searchParams.get("page") ?? 1), limit: Number(url.searchParams.get("limit") ?? 10) },
      [`/api/employees/${employee.id}`]: state.record,
      "/api/departments": departments,
      "/api/stores": [{ id: officeId, name: "Synthetic Office" }],
      "/api/offices": [], "/api/offices/all": [],
      "/api/salary-levels": [{ id: "salary-234", level_name: "L1", base_salary: 2400 }],
      "/api/event-types": [{ id: eventTypeId, event_name: "Synthetic Event" }],
      "/api/api/notifications": { notifications: [], total: 0 },
      "/api/api/notifications/unread-count": { count: 0 },
      "/api/settings/public": { company_name: "Dream Lux ERP" },
    };
    if (request.method() === "GET" && Object.hasOwn(reads, url.pathname)) return json(reads[url.pathname]);
    state.unexpected.push(`${request.method()}:${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  return state;
}

async function activate(control: Locator, touch: boolean) {
  if (touch) await control.tap();
  else await control.click();
}

async function openEmployee(page: Page, mobile: boolean) {
  await page.goto("/");
  const opener = mobile
    ? page.getByRole("button", { name: "Edit Employee", exact: true })
    : page.getByRole("button", { name: employee.full_name, exact: true });
  await expect(opener).toBeVisible();
  if (mobile) await page.getByRole("heading", { name: employee.full_name, exact: true }).tap();
  else {
    await opener.focus();
    await page.keyboard.press("Enter");
  }
  await expect(page.getByText("Edit Employee", { exact: true })).toBeVisible();
  return opener;
}

test.beforeEach(async ({ page, baseURL, isMobile }) => {
  await fixture(page, baseURL);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(isMobile);
});
test.afterEach(async ({ page }, info) => {
  const state = states.get(page);
  if (!state) return;
  state.releaseDelete?.();
  await info.attach("synthetic-requests", {
    body: JSON.stringify({ writes: state.writes, activity: state.activity, employeeReads: state.employeeReads,
      employeeAttempts: state.employeeAttempts.map(({ query, request }) => ({ query, failure: request.failure()?.errorText ?? null })),
      unexpected: state.unexpected, errors: state.errors }, null, 2),
    contentType: "application/json",
  });
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("controlled external close removes the still-mounted drawer without a user callback", async ({ page, isMobile }) => {
  await page.goto("/test-support/drawer");
  await activate(page.getByRole("button", { name: "Open controlled drawer" }), isMobile);
  const draft = page.getByRole("textbox", { name: "Fixture draft" });
  await expect(draft).toBeVisible();
  await draft.fill("External-close synthetic draft");
  await test.info().attach("before-external-close", { body: await page.screenshot(), contentType: "image/png" });
  await activate(page.getByRole("button", { name: "External close", exact: true }), isMobile);
  await expect(draft).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("User close callbacks: 0");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
});

test("user exit, reopen during exit and unmount leave no stale callbacks or lock", async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/test-support/drawer");
  const open = page.getByRole("button", { name: "Open controlled drawer" });
  await activate(open, isMobile);
  await activate(page.getByRole("button", { name: "Close drawer", exact: true }), isMobile);
  await expect(page.getByRole("status")).toHaveText("User close callbacks: 1");
  await expect(open).toBeFocused();
  await activate(open, isMobile);
  await page.getByRole("button", { name: "Schedule reopen" }).evaluate((trigger) => {
    if (!(trigger instanceof HTMLButtonElement)) throw new Error("Missing fixture schedule control");
    trigger.click();
    const close = document.querySelector('[data-drawer-panel] button[aria-label="Close drawer"]');
    if (!(close instanceof HTMLButtonElement)) throw new Error("Missing real drawer close control");
    close.click();
  });
  await expect(page.getByRole("textbox", { name: "Fixture draft" })).toBeVisible();
  await page.waitForTimeout(900); // Outlast the interrupted spring's callback, not just its first frame.
  await expect(page.getByRole("status", { includeHidden: true })).toHaveText("User close callbacks: 1");
  await page.getByRole("button", { name: "Schedule unmount" }).evaluate((trigger) => {
    if (!(trigger instanceof HTMLButtonElement)) throw new Error("Missing fixture schedule control");
    trigger.click();
    const close = document.querySelector('[data-drawer-panel] button[aria-label="Close drawer"]');
    if (!(close instanceof HTMLButtonElement)) throw new Error("Missing real drawer close control");
    close.click();
  });
  await expect(page.getByRole("textbox", { name: "Fixture draft" })).toHaveCount(0);
  await page.waitForTimeout(900);
  await expect(page.getByRole("status")).toHaveText("User close callbacks: 1");
  await expect.poll(() => page.evaluate(() => document.body.hasAttribute("data-scroll-locked"))).toBe(false);
});

test("keyboard modal, sibling activity and delete Escape preserve draft and opener", async ({ page, isMobile }) => {
  const opener = await openEmployee(page, isMobile);
  const dialog = page.getByRole("dialog", { name: "Edit Employee", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close drawer" })).toBeFocused();
  const draft = dialog.locator('input[type="text"]').first();
  await draft.fill("Unsaved synthetic correction");
  const activity = dialog.getByRole("button", { name: "Activity", exact: true });
  await activate(activity, isMobile);
  const timeline = page.getByRole("dialog", { name: "Activity Timeline" });
  await expect(timeline.getByText("Synthetic history only")).toBeVisible();
  await expect(timeline.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(activity).toBeFocused();
  await expect(draft).toHaveValue("Unsaved synthetic correction");
  expect(states.get(page)?.activity).toEqual([{ path: "/api/api/activity",
    query: { entity_type: "employee", entity_id: employee.id, page: "1", limit: "100" } }]);
  const remove = dialog.getByRole("button", { name: "Delete", exact: true });
  await activate(remove, isMobile);
  await expect(page.getByRole("dialog", { name: "Delete Record" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(remove).toBeFocused();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
  await test.info().attach("nested-workflow-return", { body: await page.screenshot(), contentType: "image/png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  expect(states.get(page)?.writes).toEqual([]);
});

test("inline department Escape and normal save preserve the actual employee payload", async ({ page, isMobile }) => {
  await openEmployee(page, isMobile);
  const dialog = page.getByRole("dialog", { name: "Edit Employee" });
  const draft = dialog.locator('input[type="text"]').first();
  await draft.fill("Saved Synthetic Employee");
  const add = dialog.getByRole("button", { name: "Add Department", exact: true });
  await activate(add, isMobile);
  const input = dialog.getByPlaceholder("New Department Name");
  await input.fill("Discarded child draft");
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(add).toBeFocused();
  await expect(draft).toHaveValue("Saved Synthetic Employee");
  await activate(add, isMobile);
  await input.fill("Another child draft");
  await dialog.getByRole("button", { name: "Add", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(add).toBeFocused();
  await activate(add, isMobile);
  await input.fill("Synthetic New Department");
  await page.keyboard.press("Enter");
  await expect(input).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Department" })).toHaveText("Synthetic New Department");
  await activate(dialog.getByRole("button", { name: "Save Changes" }), isMobile);
  await expect(dialog).toHaveCount(0);
  expect(states.get(page)?.writes).toEqual([
    { method: "POST", path: "/api/departments", payload: { name: "Synthetic New Department" } },
    { method: "PATCH", path: `/api/employees/${employee.id}`, payload: {
      full_name: "Saved Synthetic Employee", employee_id: "SYN-234",
      department_id: addedDepartmentId, office_id: officeId,
      phone: "0911111111", email: "drawer@example.invalid", salary_level: "L1",
      compensation_mode: "regular", event_prices: JSON.stringify({ [eventTypeId]: 120 }),
    } },
  ]);
});

test("pending destructive action cannot Escape or dismiss its parent and submits once", async ({ page, isMobile }) => {
  const state = states.get(page)!;
  state.holdDelete = true;
  await openEmployee(page, isMobile);
  await activate(page.getByRole("dialog", { name: "Edit Employee" }).getByRole("button", { name: "Delete", exact: true }), isMobile);
  const confirmation = page.getByRole("dialog", { name: "Delete Record" });
  await activate(confirmation.getByRole("button", { name: "Confirm Delete" }), isMobile);
  await expect(confirmation.getByRole("button", { name: "Deleting..." })).toBeDisabled();
  await expect(confirmation.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(confirmation.getByRole("button", { name: "Close confirmation" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.locator("[data-confirmation-backdrop]").click({ position: { x: 8, y: 8 } });
  await expect(confirmation).toBeVisible();
  expect(state.writes).toEqual([{ method: "DELETE", path: `/api/employees/${employee.id}`, payload: {} }]);
  state.releaseDelete?.();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.hasAttribute("data-scroll-locked"))).toBe(false);
});

test("Select keeps native option and Add New activation and first-Escape priority", async ({ page, isMobile }) => {
  await page.goto("/test-support/drawer");
  await activate(page.getByRole("button", { name: "Open controlled drawer" }), isMobile);
  const close = page.getByRole("button", { name: "Close drawer" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "External close", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  const choice = page.getByRole("combobox", { name: "Fixture choice" });
  await activate(choice, isMobile);
  const second = page.getByRole("option", { name: "Second choice" });
  if (isMobile) await second.tap();
  else {
    await second.focus();
    await page.keyboard.press("Enter");
  }
  await expect(choice).toHaveText("Second choice");
  await activate(choice, isMobile);
  const add = page.getByRole("button", { name: "Add fixture choice" });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(choice).toHaveAttribute("aria-expanded", "false");
  await activate(choice, isMobile);
  await page.getByPlaceholder("Search...", { exact: true }).fill("First");
  await page.keyboard.press("Escape");
  await expect(choice).toBeFocused();
  await expect(page.getByRole("dialog", { name: "Controlled drawer" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Selected choice: two; added: 1")).toBeVisible();
});

test("the preserved staff-payment portal owns its focus and first Escape inside the drawer", async ({ page, isMobile }) => {
  await page.goto("/test-support/drawer");
  await activate(page.getByRole("button", { name: "Open controlled drawer" }), isMobile);
  await activate(page.getByRole("button", { name: "Show staff picker" }), isMobile);
  const picker = page.getByRole("combobox", { name: "Employee Link" });
  await expect(picker).toBeEnabled();
  await activate(picker, isMobile);
  const option = page.getByRole("option", { name: `${employee.full_name} (${employee.employee_id})`, exact: true });
  await expect(option).toBeVisible();
  expect(await option.evaluate((element) => element.closest("[data-drawer-panel]") === null)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(picker).toBeFocused();
  await expect(page.getByRole("dialog", { name: "Controlled drawer" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
  await activate(picker, isMobile);
  if (isMobile) await option.tap();
  else {
    await option.focus();
    await page.keyboard.press("Enter");
  }
  await expect(picker).toContainText(employee.full_name);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("staff-selection")).toHaveText(`Selected staff: ${employee.id}`);
  expect(states.get(page)?.employeeReads).toEqual([{ page: "1", limit: "50", status: "active", sortBy: "name", sortOrder: "asc" }]);
});

test("breakpoints retain the draft, usable close target and bounded geometry", async ({ page }) => {
  await page.goto("/test-support/drawer");
  await page.getByRole("button", { name: "Open controlled drawer" }).click();
  const draft = page.getByRole("textbox", { name: "Fixture draft" });
  await draft.fill("Draft across breakpoints");
  for (const width of [320, 375, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const dialog = page.getByRole("dialog", { name: "Controlled drawer" });
    const close = dialog.getByRole("button", { name: "Close drawer" });
    await expect(close).toBeVisible();
    await expect(draft).toHaveValue("Draft across breakpoints");
    const bounds = await close.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(48);
    expect(bounds?.height).toBeGreaterThanOrEqual(48);
    await expect.poll(() => dialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("denied employee permissions do not expose an edit drawer or submit a mutation", async ({ page }) => {
  states.get(page)!.denied = true;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /access denied|forbidden/i })).toBeVisible();
  await expect(page.getByRole("button", { name: employee.full_name, exact: true })).toHaveCount(0);
  expect(states.get(page)?.writes).toEqual([]);
});

test("Quick Edit keeps the 800ms debounce, supersedes old input and sends only the dirty field", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Quick Edit", exact: true }).click();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const input = page.locator(`input[value="${employee.full_name}"]:visible`);
  await input.fill("Superseded synthetic name");
  await page.clock.runFor(400);
  await input.fill("Current synthetic name");
  await page.clock.runFor(799);
  expect(states.get(page)?.writes).toEqual([]);
  const saved = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/employees/${employee.id}` && response.request().method() === "PATCH");
  await page.clock.runFor(1);
  expect((await saved).status()).toBe(200);
  expect(states.get(page)?.writes).toEqual([{
    method: "PATCH", path: `/api/employees/${employee.id}`, payload: { full_name: "Current synthetic name" },
  }]);
  expect(states.get(page)?.record).toMatchObject({
    department_id: employee.department_id, office_id: employee.office_id,
    salary_level: employee.salary_level, compensation_mode: employee.compensation_mode,
  });
});

test("content scroll does not dismiss; the mobile handle alone owns swipe dismissal", async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/test-support/drawer");
  await activate(page.getByRole("button", { name: "Open controlled drawer" }), isMobile);
  const scroll = page.locator("[data-drawer-panel] > .overflow-y-auto");
  await expect(scroll).toBeVisible();
  await expect.poll(() => page.locator("[data-drawer-panel]").evaluate((panel) =>
    Math.abs(panel.getBoundingClientRect().bottom - innerHeight))).toBeLessThan(1);
  if (isMobile) {
    const cdp = await page.context().newCDPSession(page);
    const swipe = async (x: number, start: number, end: number) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: start }] });
      for (let step = 1; step <= 10; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove", touchPoints: [{ x, y: start + (end - start) * step / 10 }],
        });
        await page.waitForTimeout(16); // Gesture cadence, not an application readiness wait.
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    const bounds = await scroll.boundingBox();
    if (!bounds) throw new Error("Missing scrollable drawer body");
    expect(bounds.y + bounds.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) + 1);
    await test.info().attach("touch-start-geometry", { body: JSON.stringify(bounds), contentType: "application/json" });
    await swipe(bounds.x + bounds.width / 2, bounds.y + bounds.height - 60, bounds.y + 60);
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(50);
    await expect(page.getByRole("dialog", { name: "Controlled drawer" })).toBeVisible();
    const handle = await page.locator("[data-drawer-drag-handle]").boundingBox();
    if (!handle) throw new Error("Missing mobile drag handle");
    await swipe(handle.x + handle.width / 2, handle.y + handle.height / 2, handle.y + handle.height / 2 + 180);
    await cdp.detach();
  } else {
    await scroll.hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(50);
    await expect(page.getByRole("dialog", { name: "Controlled drawer" })).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("User close callbacks: 1");
});
