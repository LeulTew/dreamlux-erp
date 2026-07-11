import type { Page, Route } from "@playwright/test";

type PermissionMockOptions = {
  permissions?: string[];
  permission_slugs?: string[];
  isSuperuser?: boolean;
  user?: Partial<typeof defaultUser> & { email?: string; role_name?: string; profile_image_url?: string | null };
};

const defaultUser = {
  id: "user-e2e",
  username: "phase5-e2e",
  full_name: "Phase 5 Reviewer",
  role: "REVIEWER",
  role_name: "Reviewer",
  roles: ["Reviewer"],
  is_active: true,
};

export async function seedAuthenticatedSession(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "e2e-token");
    window.localStorage.setItem(
      "user",
      JSON.stringify({
        full_name: "Phase 5 Reviewer",
        role_name: "Reviewer",
      }),
    );
  });
}

export async function mockAuth(page: Page, options: PermissionMockOptions = {}) {
  const permissions = options.permissions ?? options.permission_slugs ?? [];
  const isSuperuser = options.isSuperuser ?? false;
  const user = { ...defaultUser, ...options.user };

  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user }),
    }),
  );

  await page.route("**/auth/permissions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user_id: user.id,
        role: user.role_name || user.role,
        roles: user.roles,
        permission_slugs: permissions,
        is_superuser: isSuperuser,
        catalog: [],
      }),
    }),
  );
}

export async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  });
}

export async function mockCommonShellData(page: Page) {
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
  await page.route("http://localhost:4000/api/notifications**", (route) =>
    fulfillJson(route, { notifications: [], total: 0 }),
  );
  await page.route("http://localhost:4000/api/notifications/unread-count", (route) =>
    fulfillJson(route, { count: 0 }),
  );
}
