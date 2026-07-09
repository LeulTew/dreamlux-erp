import { expect, test } from "@playwright/test";
import { fulfillJson, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

test.describe("Issue 128 auth bootstrap and logout cache safety", () => {
  test("does not render protected settings content before auth and permissions resolve", async ({ page }) => {
    let resolveAuth: (() => void) | null = null;
    const authGate = new Promise<void>((resolve) => {
      resolveAuth = resolve;
    });

    await seedAuthenticatedSession(page);
    await mockCommonShellData(page);

    await page.route("**/auth/me", async (route) => {
      await authGate;
      await fulfillJson(route, {
        user: {
          id: "driver-user",
          username: "driver",
          full_name: "Driver User",
          role: "DRIVER",
          role_name: "Driver",
          roles: ["Driver"],
          is_active: true,
        },
      });
    });

    await page.route("**/auth/permissions", async (route) => {
      await authGate;
      await fulfillJson(route, {
        user_id: "driver-user",
        role: "Driver",
        roles: ["Driver"],
        permission_slugs: ["events:read", "trips:create"],
        is_superuser: false,
        catalog: [],
      });
    });

    const navigation = page.goto("/settings/departments");
    await page.waitForTimeout(250);
    expect(await page.getByText("Department Setup").count()).toBe(0);
    expect(await page.getByText("Reference Data").count()).toBe(0);

    resolveAuth?.();
    await navigation;

    await expect(page.getByText("Forbidden: Insufficient privileges")).toBeVisible();
    await expect(page.getByText("Department Setup")).toHaveCount(0);
  });

  test("logout clears auth storage and browser back does not restore protected shell", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.route("**/auth/me", (route) =>
      fulfillJson(route, {
        user: {
          id: "owner-user",
          username: "ceo",
          full_name: "Owner User",
          role: "OWNER",
          role_name: "Owner",
          roles: ["Owner"],
          is_active: true,
        },
      }),
    );
    await page.route("**/auth/permissions", (route) =>
      fulfillJson(route, {
        user_id: "owner-user",
        role: "Owner",
        roles: ["Owner"],
        permission_slugs: ["assets:read"],
        is_superuser: true,
        catalog: [],
      }),
    );
    await page.route("http://localhost:4000/stores**", (route) => fulfillJson(route, []));
    await page.route("http://localhost:4000/items**", (route) =>
      fulfillJson(route, { items: [], total: 0, page: 1, limit: 20, totalPages: 1 }),
    );
    await page.route("http://localhost:4000/api/notifications**", (route) =>
      fulfillJson(route, { notifications: [], total: 0, unread_count: 0 }),
    );
    await page.route("http://localhost:4000/events**", (route) =>
      fulfillJson(route, { events: [], total: 0, page: 1, limit: 5 }),
    );
    await page.route("http://localhost:4000/employees**", (route) =>
      fulfillJson(route, { employees: [], total: 0, page: 1, limit: 5 }),
    );
    await page.route("http://localhost:4000/salary-levels**", (route) => fulfillJson(route, []));
    await page.route("http://localhost:4000/payroll/runs**", (route) => fulfillJson(route, { runs: [] }));

    await page.goto("/assets");
    await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();

    await page.getByTestId("auth-user-menu-trigger").click();
    await page.getByRole("button", { name: /^Sign Out$/ }).click();
    await page.getByTestId("confirm-sign-out").click();

    await expect(page).toHaveURL(/\/login$/);
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("token"))).toBeNull();
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("user"))).toBeNull();

    await page.goBack();
    await expect(page).not.toHaveURL(/\/assets$/);
    await expect(page.getByRole("heading", { name: "Assets" })).toHaveCount(0);
  });
});
