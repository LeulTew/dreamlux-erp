import { expect, test, type Page, type Route } from "@playwright/test";
import { fulfillJson, mockAuth, seedAuthenticatedSession } from "./helpers";

type AuthPayload = {
  user: {
    id: string;
    username: string;
    full_name: string;
    role_name: string;
    role_names: string[];
    permission_slugs: string[];
    is_active: boolean;
  };
};

type PermissionsPayload = {
  user_id: string;
  role: string;
  roles: string[];
  permission_slugs: string[];
  is_superuser: boolean;
  catalog: never[];
};

function createRouteGate<T>(payload: T) {
  let released = false;
  const pending: Route[] = [];

  return {
    handler(route: Route) {
      if (released) {
        return fulfillJson(route, payload);
      }
      pending.push(route);
      return undefined;
    },
    async release() {
      released = true;
      await Promise.all(pending.splice(0).map((route) => fulfillJson(route, payload)));
    },
  };
}

async function mockDelayedAuth(page: Page, permissions: string[]) {
  const authPayload: AuthPayload = {
    user: {
      id: "driver-user",
      username: "driver_user",
      full_name: "Driver User",
      role_name: "DRIVER",
      role_names: ["DRIVER"],
      permission_slugs: permissions,
      is_active: true,
    },
  };

  const permissionsPayload: PermissionsPayload = {
    user_id: "driver-user",
    role: "DRIVER",
    roles: ["DRIVER"],
    permission_slugs: permissions,
    is_superuser: false,
    catalog: [],
  };

  const me = createRouteGate(authPayload);
  const authPermissions = createRouteGate(permissionsPayload);

  await page.route("**/auth/me", (route) => me.handler(route));
  await page.route("**/auth/permissions", (route) => authPermissions.handler(route));

  return {
    async release() {
      await Promise.all([me.release(), authPermissions.release()]);
    },
  };
}

async function mockBackendShellData(page: Page) {
  await page.route("http://localhost:4000/employees**", (route) =>
    fulfillJson(route, { employees: [], total: 0, page: 1, limit: 5 }),
  );
  await page.route("http://localhost:4000/assets**", (route) =>
    fulfillJson(route, { items: [], total: 0, page: 1, limit: 5 }),
  );
  await page.route("http://localhost:4000/events?**", (route) =>
    fulfillJson(route, { events: [], total: 0, page: 1, limit: 5 }),
  );
  await page.route("http://localhost:4000/salary-levels**", (route) => fulfillJson(route, []));
  await page.route("http://localhost:4000/payroll/runs**", (route) => fulfillJson(route, []));
  await page.route("**/api/notifications/unread-count", (route) => fulfillJson(route, { count: 0 }));
  await page.route("**/api/notifications**", (route) =>
    fulfillJson(route, { notifications: [], total: 0 }),
  );
}

test.describe("Issue 128 auth session hardening", () => {
  test("does not first-paint protected shell while auth and permissions are pending", async ({ page }) => {
    await seedAuthenticatedSession(page);
    const delayedAuth = await mockDelayedAuth(page, ["events:read"]);
    await mockBackendShellData(page);

    await page.goto("/assets", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Assets", exact: true })).toHaveCount(0);
    await expect(page.getByText("Admin Settings")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /search/i })).toHaveCount(0);
    await expect(page.locator(".animate-spin")).toBeVisible();

    await delayedAuth.release();
    await expect(page.getByText("Forbidden: Insufficient privileges")).toBeVisible();
    await expect(page.getByText("Admin Settings")).toHaveCount(0);
  });

  test("does not expose finance content or fetch net profit data before permission resolution", async ({ page }) => {
    const financeRequests: string[] = [];

    await seedAuthenticatedSession(page);
    const delayedAuth = await mockDelayedAuth(page, ["events:read"]);
    await mockBackendShellData(page);
    await page.route("http://localhost:4000/finance/net-profit**", (route) => {
      financeRequests.push(route.request().url());
      return fulfillJson(route, {
        month: "2026-07",
        summary: {
          event_revenue: 250000,
          net_profit: 200000,
        },
      });
    });

    await page.goto("/hr/finance/net-profit", { waitUntil: "domcontentloaded" });

    await expect(page.getByText(/Net Profit/i)).toHaveCount(0);
    await expect(page.getByText(/250,000|200,000|ETB/i)).toHaveCount(0);
    expect(financeRequests).toEqual([]);

    await delayedAuth.release();
    await expect(page.getByText("Forbidden: Insufficient privileges")).toBeVisible();
    expect(financeRequests).toEqual([]);
  });

  test("browser back after logout user removal returns to login without protected shell", async ({ page }) => {
    await mockAuth(page, { permissions: ["assets:read"] });
    await mockBackendShellData(page);

    await page.goto("/login");
    await page.evaluate(() => {
      window.localStorage.setItem(
        "user",
        JSON.stringify({
          full_name: "Phase 5 Reviewer",
          role_name: "Reviewer",
        }),
      );
    });

    await page.goto("/assets");
    await expect(page.getByRole("heading", { name: "Assets", exact: true })).toBeVisible();

    // Mock auth/me to fail to simulate server-side cookie clearance on logout
    await page.route("**/auth/me", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      })
    );

    await page.evaluate(() => {
      window.localStorage.removeItem("user");
    });
    await page.goto("/login");
    await page.goBack();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Assets", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /search/i })).toHaveCount(0);
  });
});
