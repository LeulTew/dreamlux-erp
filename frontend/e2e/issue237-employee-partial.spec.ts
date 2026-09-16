import { expect, test, type Page } from "@playwright/test";
import { fulfillJson } from "./helpers";

test("one-field Quick Edit preserves employee setup after reload", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("An isolated browser base URL is required");
  let employee = {
    id: "23700000-0000-4000-8000-000000000001", employee_id: "EMP-PARTIAL",
    full_name: "Original employee", department: "Operations",
    department_id: "23700000-0000-4000-8000-000000000002",
    office_id: "23700000-0000-4000-8000-000000000003",
    office: "Central Office", salary_level: "L1", compensation_mode: "commission_only",
    base_salary: 0, event_prices: {}, deleted_at: null,
  };
  const writes: unknown[] = [];
  const preferenceWrites: unknown[] = [];
  const expectedPreference = {
    sort: { sortBy: "salary", sortOrder: "desc" },
    filters: { officeId: "all", departmentId: "all" },
    pageSize: 10,
  };
  let preference: Record<string, unknown> = {
    record_type: "employees", sort: null, filters: {}, pageSize: null,
    visibleColumns: [], density: null, activeTab: null, updated_at: null,
  };
  const unexpected: string[] = [];
  const errors: string[] = [];
  const user = { id: "partial-test-user", username: "partial-reviewer", full_name: "Partial Reviewer", role: "REVIEWER", roles: ["REVIEWER"], is_active: true };
  const observe = (target: Page) => target.on("pageerror", (error) => errors.push(error.message));
  observe(page);
  context.on("page", observe);
  await context.addInitScript(({ user }) => {
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("lang", "en");
  }, { user });
  await context.routeWebSocket("**/*", (socket) => {
    const url = new URL(socket.url());
    if (url.origin === baseURL.replace("http:", "ws:") && url.pathname === "/_next/webpack-hmr") {
      socket.connectToServer();
      return;
    }
    if (url.origin !== "ws://127.0.0.1:54321" || url.pathname !== "/realtime/v1/websocket") {
      unexpected.push("Unconfigured WebSocket");
      void socket.close();
      return;
    }
    socket.onMessage((message) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(message.toString()) as [
        string | null, string, string, string, { config?: { postgres_changes?: Record<string, unknown>[] } },
      ];
      if (!["phx_join", "phx_leave", "heartbeat", "access_token"].includes(event)) {
        unexpected.push(`Unconfigured realtime event: ${event}`);
        return;
      }
      const response = event === "phx_join"
        ? { postgres_changes: (payload.config?.postgres_changes ?? []).map((change, id) => ({ ...change, id })) }
        : {};
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
    if (url.pathname === "/api/api/preferences/record-list/employees") {
      if (request.method() === "GET") return fulfillJson(route, { preference });
      if (request.method() === "PUT") {
        const body: unknown = request.postDataJSON();
        expect(body).toEqual(expectedPreference);
        preferenceWrites.push(body);
        preference = { ...preference, ...expectedPreference, updated_at: "2026-09-16T00:00:00Z" };
        return fulfillJson(route, { preference });
      }
    }
    if (url.pathname === `/api/employees/${employee.id}` && request.method() === "PATCH") {
      const update: unknown = request.postDataJSON();
      writes.push(update);
      expect(update).toEqual({ full_name: "Updated employee" });
      employee = { ...employee, full_name: "Updated employee" };
      return fulfillJson(route, employee);
    }
    const reads: Record<string, unknown> = {
      "/api/auth/me": { user },
      "/api/auth/permissions": { permission_slugs: ["hr:read", "hr:write"], is_superuser: false, catalog: [] },
      "/api/employees": { employees: [employee], total: 1, page: 1, limit: 10 },
      "/api/departments": [],
      "/api/stores": [],
      "/api/offices": [],
      "/api/offices/all": [],
      "/api/salary-levels": [],
      "/api/api/notifications": { notifications: [], total: 0 },
      "/api/api/notifications/unread-count": { count: 0 },
    };
    if (request.method() === "GET" && Object.hasOwn(reads, url.pathname)) {
      return fulfillJson(route, reads[url.pathname]);
    }
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  try {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-type"]).toContain("text/html");
    await expect(page.getByText("Original employee", { exact: true }).filter({ visible: true })).toBeVisible();
    await page.getByRole("button", { name: "Quick Edit", exact: true }).click();
    const saved = page.waitForResponse((response) =>
      new URL(response.url()).pathname === `/api/employees/${employee.id}` && response.request().method() === "PATCH",
    );
    await page.locator('input[value="Original employee"]:visible').fill("Updated employee");
    expect((await saved).status()).toBe(200);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.reload();
    await expect(page.getByText("Updated employee", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Operations", { exact: true }).filter({ visible: true })).toBeVisible();
    expect(employee.department_id).toBe("23700000-0000-4000-8000-000000000002");
    expect(employee.office_id).toBe("23700000-0000-4000-8000-000000000003");
    expect(employee.salary_level).toBe("L1");
    expect(employee.compensation_mode).toBe("commission_only");
    expect(writes).toEqual([{ full_name: "Updated employee" }]);
    await expect.poll(() => preferenceWrites.length).toBeGreaterThan(0);
    const readBack = await page.evaluate(async () => {
      const response = await fetch("/api/api/preferences/record-list/employees");
      return { status: response.status, data: await response.json() };
    });
    expect(readBack).toEqual({ status: 200, data: { preference } });
  } finally {
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  }
});
