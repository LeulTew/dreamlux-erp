import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

test.describe("Issue 86 RBAC Custom Role Manager UX Guardrails", () => {
  const mockRoles = [
    {
      id: "role-admin",
      name: "SUPER_ADMIN",
      description: "Super Administrator with full access",
      permission_slugs: ["*"],
    },
    {
      id: "role-custom-1",
      name: "OPERATIONS_COORDINATOR",
      description: "Coordinates event logistics",
      permission_slugs: ["events:read", "assets:read"],
    },
  ];

  const mockCatalog = [
    { slug: "events:read", description: "Read events" },
    { slug: "events:write", description: "Create/edit events" },
    { slug: "events:delete", description: "Delete events" },
    { slug: "assets:read", description: "Read assets" },
    { slug: "payroll:write", description: "Dangerous payroll edit" },
  ];

  const mockUsers = [
    {
      id: "user-1",
      username: "coordinatordave",
      full_name: "Dave Coordinator",
      role_id: "role-custom-1",
      role_ids: ["role-custom-1"],
    },
  ];

  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["users:manage"] });
    await mockCommonShellData(page);

    // Mock API requests
    await page.route("http://localhost:4000/users", (route) => fulfillJson(route, mockUsers));
    await page.route("http://localhost:4000/users/roles", (route) => fulfillJson(route, mockRoles));
    await page.route("http://localhost:4000/users/permissions", (route) => fulfillJson(route, mockCatalog));
  });

  test("can search and filter permissions", async ({ page }) => {
    await page.goto("/settings/permissions");

    // Click custom role to load permissions checklist
    await page.getByRole("button", { name: /OPERATIONS_COORDINATOR/ }).click();

    // Verify all mock permissions are visible initially
    await expect(page.getByText("events:read")).toBeVisible();
    await expect(page.getByText("payroll:write")).toBeVisible();

    // Search for payroll-related permissions
    await page.getByPlaceholder("Search Permissions...").fill("payroll");

    // Only payroll:write should be visible, events:read should be filtered out
    await expect(page.getByText("payroll:write")).toBeVisible();
    await expect(page.getByText("events:read")).not.toBeVisible();

    // Clear search term
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByText("events:read")).toBeVisible();
  });

  test("shows dangerous permission warning badges", async ({ page }) => {
    await page.goto("/settings/permissions");
    await page.getByRole("button", { name: /OPERATIONS_COORDINATOR/ }).click();

    // Verify dangerous permission badge is visible for payroll:write (color-coded as text-amber-500)
    const payrollButton = page.locator("button").filter({ hasText: "payroll:write" });
    await expect(payrollButton.locator(".text-amber-500")).toBeVisible();
  });

  test("displays pending changes diff preview and requires CONFIRM for dangerous updates", async ({ page }) => {
    let putRequestPayload: any = null;
    await page.route("http://localhost:4000/users/roles/role-custom-1/permissions", async (route) => {
      putRequestPayload = route.request().postDataJSON();
      return fulfillJson(route, { success: true });
    });

    await page.goto("/settings/permissions");
    await page.getByRole("button", { name: /OPERATIONS_COORDINATOR/ }).click();

    // 1. Remove "events:read" (uncheck it)
    await page.getByRole("button", { name: /events:read/ }).click();

    // 2. Add "events:write" (check it)
    await page.getByRole("button", { name: /events:write/ }).click();

    // Verify diff preview displays added/removed changes
    const diffPreview = page.getByTestId("diff-preview");
    await expect(diffPreview).toBeVisible();
    await expect(diffPreview.getByText("events:write", { exact: true })).toBeVisible();
    await expect(diffPreview.getByText("events:read", { exact: true })).toBeVisible();

    // Click "Save Changes" (since they are not dangerous yet, should save immediately)
    await page.getByRole("button", { name: "Save Changes" }).click();
    await page.waitForTimeout(300);
    expect(putRequestPayload).toEqual({ permission_slugs: ["assets:read", "events:write"] });

    // Reset mocks and state for dangerous permission test
    putRequestPayload = null;

    // 3. Add dangerous "payroll:write"
    await page.getByRole("button", { name: /payroll:write/ }).click();
    await expect(diffPreview.getByText("payroll:write", { exact: true })).toBeVisible();

    // Save changes should now trigger dangerous confirmation modal
    await page.getByRole("button", { name: "Save Changes" }).click();
    
    // Scope confirm modal
    const confirmModal = page.locator("div.fixed").filter({ hasText: "Confirm Dangerous Permissions" });
    await expect(confirmModal).toBeVisible();

    // Try clicking confirm with empty textbox - should be disabled
    const confirmBtn = confirmModal.getByRole("button", { name: "Confirm", exact: true });
    await expect(confirmBtn).toBeDisabled();

    // Type "CONFIRM" to authorize
    await confirmModal.getByPlaceholder("CONFIRM").fill("CONFIRM");
    await expect(confirmBtn).toBeEnabled();

    // Confirm save
    await confirmBtn.click();
    await page.waitForTimeout(300);
    expect(putRequestPayload).toEqual({ permission_slugs: ["assets:read", "events:write", "payroll:write"] });
  });

  test("blocks role deletion if users are still assigned", async ({ page }) => {
    await page.goto("/settings/permissions");
    await page.getByRole("button", { name: /OPERATIONS_COORDINATOR/ }).click();

    // Try deleting role (exact match to avoid events:delete checkbox button substring match)
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    // Confirm delete modal should be shown
    const deleteModal = page.locator("div.fixed").filter({ hasText: "Delete Role" });
    await expect(deleteModal).toBeVisible();

    // Verify warnings that role is assigned to Dave Coordinator and Delete is disabled/absent
    await expect(deleteModal.getByText("Cannot Delete Role")).toBeVisible();
    await expect(deleteModal.getByText("Dave Coordinator")).toBeVisible();
    await expect(deleteModal.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);

    // Cancel deletion
    await deleteModal.getByRole("button", { name: "Cancel" }).click();
    await expect(deleteModal).toHaveCount(0);
  });
});
