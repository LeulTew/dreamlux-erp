import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import type { FinanceOverhead } from "../src/lib/types";

const employeeId = (index: number) => `23200000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const employees = Array.from({ length: 151 }, (_, index) => ({
  id: employeeId(index + 1),
  full_name: index === 150 ? "Synthetic Zuri 151" : `Synthetic Staff ${String(index + 1).padStart(3, "0")}`,
  employee_id: `SYN-${String(index + 1).padStart(4, "0")}`,
  department: "Synthetic Operations",
  compensation_mode: index % 2 ? "commission_only" : "regular",
  deleted_at: null,
}));
const savedEmployee = { id: employeeId(152), full_name: "Previously Linked Synthetic", deleted_at: "2026-01-01" };
type LookupMode = "ready" | "empty" | "forbidden" | "invalid" | "network" | "malformed";

const fixtures = new WeakMap<Page, Awaited<ReturnType<typeof fixture>>>();

async function fixture(page: Page, lang = "en") {
  const base = new URL(String(test.info().project.use.baseURL));
  expect(base.protocol).toBe("http:");
  expect(["127.0.0.1", "localhost"]).toContain(base.hostname);
  const employeeAttempts: { url: URL; request: Request; startedAt: number }[] = [];
  const state = {
    mode: "ready" as LookupMode,
    closed: false,
    employeeAttempts,
    get employeeRequests() {
      // Exclude aborted requests from page/retry counts. Preserve every abort
      // (including development Strict Mode's mount probe) in the raw evidence.
      return employeeAttempts.filter(({ request }) => request.failure()?.errorText !== "net::ERR_ABORTED").map(({ url }) => url);
    },
    rejectedStatuses: [] as number[],
    writes: [] as { method: string; path: string; payload: Partial<FinanceOverhead> }[],
    overheads: [] as FinanceOverhead[],
    unexpected: [] as string[],
    runtimeErrors: [] as string[],
    hold: undefined as Promise<void> | undefined,
    holdSearch: undefined as string | undefined,
  };
  page.on("pageerror", (error) => state.runtimeErrors.push(error.message));
  await page.addInitScript((language) => {
    localStorage.setItem("lang", language);
    localStorage.setItem("user", JSON.stringify({ full_name: "Synthetic Finance Operator", role_name: "Accountant" }));
  }, lang);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (url.origin !== base.origin) {
      state.unexpected.push(`non-fixture:${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/me") {
      return json({ user: { id: "synthetic-232", username: "synthetic-232", full_name: "Synthetic Finance Operator", role: "Accountant", roles: ["Accountant"], is_active: true } });
    }
    if (url.pathname === "/api/auth/permissions") {
      return json({ user_id: "synthetic-232", role: "Accountant", roles: ["Accountant"], is_superuser: false, catalog: [],
        permission_slugs: ["hr:read", "finance:overheads:read", "finance:overheads:write", "finance:overheads:approve"] });
    }
    if (url.pathname === "/api/employees") {
      employeeAttempts.push({ url, request, startedAt: Date.now() });
      const number = Number(url.searchParams.get("page") ?? 1);
      const limit = Number(url.searchParams.get("limit") ?? 50);
      const status = url.searchParams.get("status") ?? "active";
      const search = url.searchParams.get("search");
      const sortBy = url.searchParams.get("sortBy") ?? "salary";
      const sortOrder = url.searchParams.get("sortOrder") ?? "desc";
      // The real schema/route/SDK contract is exercised in employee-lookup.test.ts.
      // Keep the browser fixture independent of backend build dependencies.
      if (!Number.isInteger(number) || number < 1 || !Number.isInteger(limit) || limit < 1 || limit > 5000
          || !["active", "trash"].includes(status) || !["asc", "desc"].includes(sortOrder)) {
        state.rejectedStatuses.push(400);
        return json({ error: "Invalid employee query parameters" }, 400);
      }
      if (state.hold && (!state.holdSearch || state.holdSearch === search)) await state.hold;
      if (state.mode === "forbidden") return json({ error: "Forbidden: Missing required permission" }, 403);
      if (state.mode === "invalid") return json({ error: "Invalid employee query parameters" }, 400);
      if (state.mode === "network") return route.abort("failed");
      if (state.mode === "malformed") return json({ employees: [] });
      const matching = state.mode === "empty" || status === "trash" ? [] : employees.filter((employee) =>
        !search || [employee.full_name, employee.employee_id, employee.department].some((value) => value.toLowerCase().includes(search.toLowerCase())));
      if (sortBy === "name" || sortBy === "full_name") {
        matching.sort((left, right) => (sortOrder === "asc" ? 1 : -1) * left.full_name.localeCompare(right.full_name)
          || left.employee_id.localeCompare(right.employee_id));
      }
      return json({ employees: matching.slice((number - 1) * limit, number * limit), total: matching.length, page: number, limit });
    }
    if (url.pathname === "/api/finance/overheads/summary") {
      return json({ month: url.searchParams.get("month"), closed: state.closed, closure: state.closed ? { closed_by_username: "Synthetic Owner" } : null,
        blocks: { officeStaff: 0, storeStaff: 0, shared: 0, rentalAndOther: 0, grandOfficeStore: 0, grandSharedRental: 0 },
        totals: { subtotalMonthly: 0, staffPayments: 0, nonPayrollOverhead: 0, pendingExposure: 0, pendingCount: 0 }, byCategory: [] });
    }
    if (url.pathname === "/api/finance/overheads" && request.method() === "GET") {
      return json({ overheads: state.overheads, total: state.overheads.length, page: 1, limit: 25, totalPages: 1 });
    }
    if (url.pathname.startsWith("/api/finance/overheads") && ["POST", "PATCH"].includes(request.method())) {
      const payload: Partial<FinanceOverhead> = request.postDataJSON();
      state.writes.push({ method: request.method(), path: url.pathname, payload });
      if (state.closed) return json({ error: "Month is closed for edits" }, 409);
      const overhead = {
        ...savedOverhead(),
        ...payload,
        id: employeeId(301),
        employee_name: employees.find((employee) => employee.id === payload.employee_id)?.full_name ?? savedEmployee.full_name,
      };
      state.overheads = [overhead];
      return json({ overhead }, request.method() === "POST" ? 201 : 200);
    }
    if (url.pathname.startsWith("/api/api/preferences/")) return json({ preference: null });
    if (url.pathname.startsWith("/api/api/notifications")) {
      return json(url.pathname.endsWith("unread-count") ? { count: 0 } : { notifications: [], total: 0 });
    }
    if (url.pathname === "/api/settings/public") return json({ company_name: "Dream Lux ERP" });
    state.unexpected.push(`${request.method()}:${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  fixtures.set(page, state);
  return state;
}

function savedOverhead(): FinanceOverhead {
  return {
    id: employeeId(301), expense_month: `${new Date().toISOString().slice(0, 7)}-01`, due_date: null,
    category: "Food", payee: null, scope: "Office", shared_with: null, payment_kind: "staff_payment",
    employee_id: savedEmployee.id, employee_name: savedEmployee.full_name, is_recurring: false,
    amount: 95.25, notes: "Synthetic staff payment", status: "Pending", rejected_reason: null,
    created_by: "synthetic-232", approved_by: null, approved_at: null,
    created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", deleted_at: null,
  };
}

async function activate(locator: Locator, mobile: boolean) {
  if (mobile) await locator.tap();
  else await locator.click();
}

async function openStaffPayment(page: Page, mobile: boolean) {
  await activate(page.getByRole("button", { name: "Add Expense", exact: true }), mobile);
  await activate(page.getByRole("combobox").filter({ hasText: /^Overhead$/ }), mobile);
  await activate(page.getByRole("option", { name: "Staff Payment", exact: true }), mobile);
}

test.afterEach(async ({ page }, info) => {
  const state = fixtures.get(page);
  if (state) {
    await info.attach("scoped-request-evidence", {
      body: JSON.stringify({
        attempts: state.employeeAttempts.map(({ url, request }) => ({ path: url.pathname, query: Object.fromEntries(url.searchParams), failure: request.failure()?.errorText ?? null })),
        writes: state.writes,
        unexpected: state.unexpected,
        runtimeErrors: state.runtimeErrors,
      }, null, 2),
      contentType: "application/json",
    });
    expect(state.runtimeErrors).toEqual([]);
  }
  if (info.status !== info.expectedStatus) {
    await info.attach("rendered-page", { body: await page.locator("body").innerText(), contentType: "text/plain" });
  }
});

test("canonical request reaches employee 151 with paging, selection and the unchanged save payload", async ({ page, isMobile }) => {
  const state = await fixture(page);
  await page.goto("/hr/finance/overheads");
  const response = page.waitForResponse((entry) => new URL(entry.url()).pathname === "/api/employees");
  await openStaffPayment(page, isMobile);
  expect((await response).status()).toBe(200);
  expect(Object.fromEntries(state.employeeRequests[0].searchParams)).toEqual({ page: "1", limit: "50", status: "active", sortBy: "name", sortOrder: "asc" });
  for (const number of [2, 3, 4]) {
    await activate(page.getByRole("button", { name: "Next employees" }), isMobile);
    await expect(page.getByText(`Page ${number} of 4`, { exact: true })).toBeVisible();
  }
  const picker = page.getByRole("combobox", { name: "Employee Link", exact: true });
  await activate(picker, isMobile);
  if (isMobile) await page.getByRole("option", { name: "Synthetic Zuri 151 (SYN-0151)", exact: true }).tap();
  else {
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
  }
  await expect(picker).toContainText("Synthetic Zuri 151");
  await test.info().attach("selected-page-four", { body: await picker.locator("xpath=ancestor::*[@aria-busy][1]").screenshot(), contentType: "image/png" });
  await page.locator('input[type="number"]').fill("123.45");
  await activate(page.getByRole("button", { name: "Save Expense", exact: true }), isMobile);
  await expect(page.getByRole("button", { name: "Save Expense", exact: true })).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({ method: "POST", path: "/api/finance/overheads", payload: {
    payment_kind: "staff_payment", employee_id: employeeId(151), amount: 123.45, due_date: null, shared_with: null,
  } });
  expect(state.employeeRequests.map((url) => url.searchParams.get("page"))).toEqual(["1", "2", "3", "4"]);
  expect(state.unexpected).toEqual([]);
});

test("server name and ID search retain a new selection outside the next result", async ({ page, isMobile }) => {
  const state = await fixture(page);
  await page.goto("/hr/finance/overheads");
  await openStaffPayment(page, isMobile);
  const search = page.getByRole("searchbox", { name: "Find employee" });
  await search.fill("  SYN-0151  ");
  await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible();
  const picker = page.getByRole("combobox", { name: "Employee Link", exact: true });
  await activate(picker, isMobile);
  await activate(page.getByRole("option", { name: "Synthetic Zuri 151 (SYN-0151)", exact: true }), isMobile);
  await search.fill("Staff 001");
  await expect.poll(() => state.employeeRequests.at(-1)?.searchParams.get("search")).toBe("Staff 001");
  await expect(picker).toBeEnabled();
  await expect(picker).toContainText("Synthetic Zuri 151");
  await activate(picker, isMobile);
  await expect(page.getByRole("option", { name: "Synthetic Staff 001 (SYN-0001)", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator('input[type="number"]').fill("123.45");
  await activate(page.getByRole("button", { name: "Save Expense", exact: true }), isMobile);
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].payload.employee_id).toBe(employeeId(151));
  expect(state.employeeRequests.every((url) => url.searchParams.get("limit") === "50" && url.searchParams.get("status") === "active")).toBe(true);
  expect(state.unexpected).toEqual([]);
});

test("an existing off-page archived association remains visible through empty search and denied lookup", async ({ page, isMobile }) => {
  const state = await fixture(page);
  state.overheads = [savedOverhead()];
  await page.goto("/hr/finance/overheads");
  await activate(page.getByRole("button", { name: "Edit", exact: true }), isMobile);
  const picker = page.getByRole("combobox", { name: "Employee Link", exact: true });
  await expect(picker).toContainText(savedEmployee.full_name);
  await page.getByRole("searchbox", { name: "Find employee" }).fill("no matching synthetic employee");
  await expect(page.getByText("No employees match this search.", { exact: true })).toBeVisible();
  await expect(picker).toContainText(savedEmployee.full_name);
  state.mode = "forbidden";
  await page.getByRole("searchbox", { name: "Find employee" }).fill("denied");
  await expect(page.getByRole("alert").filter({ hasText: "Your payment details are unchanged." })).toContainText("You do not have access to the employee list.");
  await expect(picker).toContainText(savedEmployee.full_name);
  await page.locator('input[type="number"]').fill("96.25");
  await activate(page.getByRole("button", { name: "Save Expense", exact: true }), isMobile);
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0]).toMatchObject({ method: "PATCH", payload: { employee_id: savedEmployee.id, amount: 96.25 } });
  expect(state.unexpected).toEqual([]);
});

test("loading and true empty states are distinct, and cancel does not apply a late response", async ({ page, isMobile }) => {
  const state = await fixture(page);
  let release = () => {};
  state.hold = new Promise<void>((resolve) => { release = resolve; });
  await page.goto("/hr/finance/overheads");
  await openStaffPayment(page, isMobile);
  await expect(page.getByText("Loading employees...", { exact: true })).toBeVisible();
  await expect(page.getByText("No employees available.", { exact: true })).toHaveCount(0);
  await activate(page.getByRole("button", { name: "Cancel", exact: true }), isMobile);
  state.mode = "empty";
  state.hold = undefined;
  release();
  await openStaffPayment(page, isMobile);
  await expect(page.getByText("No employees available.", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Employee Link", exact: true })).toHaveText("Select Employee");
  expect(state.writes).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

for (const mode of ["forbidden", "invalid", "network", "malformed"] as const) {
  test(`${mode} lookup is not empty success; recovery is deliberate and preserves the draft`, async ({ page, isMobile }) => {
    const state = await fixture(page);
    state.mode = mode;
    await page.goto("/hr/finance/overheads");
    await openStaffPayment(page, isMobile);
    await page.locator('input[type="number"]').fill("123.45");
    await expect(page.getByRole("alert").filter({ hasText: "Your payment details are unchanged." })).toBeVisible();
    await expect(page.getByText("No employees available.", { exact: true })).toHaveCount(0);
    expect(state.employeeRequests).toHaveLength(1);
    await expect(page.getByRole("combobox", { name: "Employee Link", exact: true })).toBeDisabled();
    state.mode = "ready";
    await activate(page.getByRole("button", { name: "Retry employee lookup", exact: true }), isMobile);
    await expect(page.getByRole("combobox", { name: "Employee Link", exact: true })).toBeEnabled();
    await expect(page.locator('input[type="number"]')).toHaveValue("123.45");
    expect(state.employeeRequests).toHaveLength(2);
    expect(state.writes).toEqual([]);
    expect(state.unexpected).toEqual([]);
  });
}

test("ordinary overheads do not request employees and a closed month still blocks add", async ({ page, isMobile }) => {
  const state = await fixture(page);
  state.mode = "forbidden";
  await page.goto("/hr/finance/overheads");
  await activate(page.getByRole("button", { name: "Add Expense", exact: true }), isMobile);
  await page.locator('input[type="number"]').fill("24.50");
  await page.getByPlaceholder("e.g. Office Depot").fill("Synthetic Supplies");
  await activate(page.getByRole("button", { name: "Save Expense", exact: true }), isMobile);
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].payload).toMatchObject({ payment_kind: "overhead", employee_id: null, amount: 24.5 });
  expect(state.employeeRequests).toEqual([]);
  state.closed = true;
  await page.reload();
  await expect(page.getByRole("button", { name: "Add Expense", exact: true })).toBeDisabled();
  expect(state.unexpected).toEqual([]);
});

test("a stalled lookup reaches its ten-second deadline with the draft intact", async ({ page, isMobile }) => {
  const state = await fixture(page);
  let release = () => {};
  state.hold = new Promise<void>((resolve) => { release = resolve; });
  try {
    await page.goto("/hr/finance/overheads");
    await openStaffPayment(page, isMobile);
    await page.locator('input[type="number"]').fill("123.45");
    await expect(page.getByRole("alert").filter({ hasText: "Your payment details are unchanged." })).toBeVisible({ timeout: 15_000 });
    const started = state.employeeAttempts.at(-1)?.startedAt;
    expect(started).toBeDefined();
    const elapsed = Date.now() - started!;
    expect(elapsed).toBeGreaterThanOrEqual(9_000);
    expect(elapsed).toBeLessThan(15_000);
    await expect(page.locator('input[type="number"]')).toHaveValue("123.45");
    await expect(page.getByRole("button", { name: "Retry employee lookup", exact: true })).toBeEnabled();
    await test.info().attach("observed-lookup-deadline", { body: JSON.stringify({ elapsedMs: elapsed }), contentType: "application/json" });
    expect(state.writes).toEqual([]);
    expect(state.unexpected).toEqual([]);
  } finally {
    state.hold = undefined;
    release();
  }
});

test("a late obsolete search cannot replace the latest selected employee", async ({ page, isMobile }) => {
  const state = await fixture(page);
  await page.goto("/hr/finance/overheads");
  await openStaffPayment(page, isMobile);
  const search = page.getByRole("searchbox", { name: "Find employee" });
  let release = () => {};
  state.hold = new Promise<void>((resolve) => { release = resolve; });
  state.holdSearch = "Staff 001";
  try {
    await search.fill("Staff 001");
    await expect.poll(() => state.employeeAttempts.some(({ url }) => url.searchParams.get("search") === "Staff 001")).toBe(true);
    await search.fill("SYN-0151");
    await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible();
    const picker = page.getByRole("combobox", { name: "Employee Link", exact: true });
    await activate(picker, isMobile);
    await activate(page.getByRole("option", { name: "Synthetic Zuri 151 (SYN-0151)", exact: true }), isMobile);
    release();
    await expect(picker).toContainText("Synthetic Zuri 151");
    await expect(search).toHaveValue("SYN-0151");
    await page.locator('input[type="number"]').fill("123.45");
    await activate(page.getByRole("button", { name: "Save Expense", exact: true }), isMobile);
    await expect.poll(() => state.writes.length).toBe(1);
    expect(state.writes[0].payload.employee_id).toBe(employeeId(151));
    expect(state.unexpected).toEqual([]);
  } finally {
    state.hold = undefined;
    release();
  }
});

test("Amharic picker after language switch preserves its saved link and readable touch controls across themes and widths", async ({ page, isMobile }) => {
  const state = await fixture(page);
  state.overheads = [savedOverhead()];
  await page.goto("/hr/finance/overheads");
  const profile = page.getByRole("button", { name: "Synthetic Finance Operator profile", exact: true });
  await activate(profile, isMobile);
  await activate(page.getByRole("button", { name: /Language/ }), isMobile);
  await activate(profile, isMobile);
  await activate(page.getByRole("button", { name: "Edit", exact: true }), isMobile);
  const picker = page.getByRole("combobox", { name: "የሰራተኛ ማገናኛ", exact: true });
  const search = page.getByRole("searchbox", { name: "ሰራተኛ ፈልግ", exact: true });
  const measurements = [];
  for (const width of [320, 375, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(picker).toContainText(savedEmployee.full_name);
    await search.scrollIntoViewIfNeeded();
    for (const dark of [false, true]) {
      await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
      const measured = await search.evaluate((element) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Unable to measure fixture text contrast");
        const luminance = (color: string) => {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const channels = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const style = getComputedStyle(element);
        const background = luminance(style.backgroundColor);
        const contrast = (color: string) => {
          const foreground = luminance(color);
          return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        };
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, left: rect.left, right: rect.right, textContrast: contrast(style.color),
          placeholderContrast: contrast(getComputedStyle(element, "::placeholder").color) };
      });
      expect(measured.height).toBeGreaterThanOrEqual(48);
      expect(measured.left).toBeGreaterThanOrEqual(0);
      expect(measured.right).toBeLessThanOrEqual(width);
      expect(measured.textContrast).toBeGreaterThanOrEqual(4.5);
      expect(measured.placeholderContrast).toBeGreaterThanOrEqual(4.5);
      for (const control of [picker, page.getByRole("button", { name: "ያለፉት ሰራተኞች" }), page.getByRole("button", { name: "ቀጣይ ሰራተኞች" })]) {
        const bounds = await control.boundingBox();
        expect(bounds?.height).toBeGreaterThanOrEqual(48);
        expect(bounds?.width).toBeGreaterThanOrEqual(48);
      }
      measurements.push({ viewport: width, dark, ...measured });
    }
  }
  await page.setViewportSize({ width: isMobile ? 375 : 1280, height: 900 });
  state.mode = "forbidden";
  await search.fill("denied");
  await expect(page.getByRole("alert").filter({ hasText: "የክፍያዎ ዝርዝሮች አልተለወጡም።" })).toBeVisible();
  await expect(picker).toContainText(savedEmployee.full_name);
  await test.info().attach("localized-error", { body: await picker.locator("xpath=ancestor::*[@aria-busy][1]").screenshot(), contentType: "image/png" });
  await test.info().attach("picker-geometry-and-contrast", { body: JSON.stringify(measurements, null, 2), contentType: "application/json" });
  expect(state.unexpected).toEqual([]);
});
