import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

test.describe("Issue #195 — employee compensation modes", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockCommonShellData(page);
    await mockAuth(page, { permission_slugs: ["hr:read", "hr:write", "payroll:read", "payroll:write"] });
    await page.route("**/departments**", (route) => fulfillJson(route, []));
    await page.route("**/stores**", (route) => fulfillJson(route, []));
    await page.route("**/salary-levels**", (route) => fulfillJson(route, [{ id: "level-1", level_name: "L1", base_salary: 7000 }]));
    await page.route("**/event-types**", (route) => fulfillJson(route, [{ id: "type-1", event_name: "Wedding" }]));
    await page.route("**/employees/next-id**", (route) => fulfillJson(route, { nextId: "EMP-195" }));
  });

  test("creates a commission-only employee and submits the mode", async ({ page }) => {
    let submittedMode = "";
    await page.route("**/employees", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const body = await route.request().postDataBuffer();
      submittedMode = body?.toString().includes("commission_only") ? "commission_only" : "regular";
      await fulfillJson(route, { id: "employee-195", employee_id: "EMP-195", compensation_mode: submittedMode }, 201);
    });

    await page.goto("/insert");
    await expect(page.getByText("Compensation Mode", { exact: true })).toBeVisible();
    await expect(page.getByText("Regular (salary + commission)", { exact: true })).toBeVisible();

    await page.getByText("Regular (salary + commission)", { exact: true }).click();
    await page.getByText("Commission only", { exact: true }).last().click();
    await page.getByPlaceholder("e.g. John Doe").fill("Commission Worker");
    await page.getByPlaceholder("09... or +251...").fill("0911123456");
    await page.getByRole("button", { name: "Create Employee Record" }).click();

    await expect.poll(() => submittedMode).toBe("commission_only");
  });

  test("keeps the compensation control usable on a narrow touch viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/insert");
    const regularOption = page.getByText("Regular (salary + commission)", { exact: true });
    await expect(regularOption).toBeVisible();
    const box = await regularOption.locator("xpath=ancestor::button[1]").boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
