import type { Page, Route } from "@playwright/test";

type PermissionMockOptions = {
  permissions?: string[];
  isSuperuser?: boolean;
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
  const permissions = options.permissions ?? [];
  const isSuperuser = options.isSuperuser ?? false;

  await page.route("http://localhost:4000/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: defaultUser }),
    }),
  );

  await page.route("http://localhost:4000/auth/permissions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user_id: defaultUser.id,
        role: "Reviewer",
        roles: ["Reviewer"],
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
}
