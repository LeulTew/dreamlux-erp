import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

test.describe("Issue 83 security posture page", () => {
  test("authorized settings user can open the security posture review surface", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["settings:write"] });
    await mockCommonShellData(page);

    await page.route("http://localhost:4000/users", (route) => fulfillJson(route, []));
    await page.route("http://localhost:4000/users/roles", (route) => fulfillJson(route, []));
    await page.route("http://localhost:4000/settings", (route) =>
      fulfillJson(route, {
        employee_id_prefix: "EMP",
        inventory_id_prefix: "INV",
        event_id_prefix: "EVT",
      }),
    );
    await page.route("http://localhost:4000/health", (route) =>
      fulfillJson(route, {
        status: "ok",
        timestamp: "2026-06-30T08:00:00.000Z",
      }),
    );

    await page.goto("/settings");
    await expect(page.locator(".animate-spin")).toHaveCount(0);
    await page.getByRole("button", { name: /Open Security Review/i }).click();

    await expect(page).toHaveURL(/\/settings\/security$/);
    await expect(page.getByRole("heading", { name: "Security Review" })).toBeVisible();
    await expect(page.getByText("No passwords or private data are shown on this page.")).toBeVisible();

    await page.getByRole("button", { name: /Known Limitations/i }).click();
    await expect(page.getByText(/Login sessions use a method/i)).toBeVisible();
  });

  test("unauthorized user sees forbidden state", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read"] });
    await mockCommonShellData(page);

    await page.goto("/settings/security");
    await expect(page.locator(".animate-spin")).toHaveCount(0);

    await expect(page.getByText("Restricted to security reviewers")).toBeVisible();
    await expect(page.getByText("Only security reviewers, system managers, and administrators can access this page.")).toBeVisible();
  });
});
