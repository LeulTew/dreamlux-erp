import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

test.describe("Issue 79 event and proposal trash", () => {
  test("event trash is readable without mutation controls for read-only event users", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read"] });
    await mockCommonShellData(page);
    await page.route("http://localhost:4000/events/trash/list**", (route) =>
      fulfillJson(route, {
        events: [
          {
            id: "event-trash-e2e",
            name: "Archived Wedding Gala",
            client_name: "Dream Lux Client",
            venue_location: "Addis Hall",
            start_date: "2026-08-10",
            deleted_at: "2026-08-20T00:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
    );

    await page.goto("/events/trash");

    await expect(page.getByRole("heading", { name: "Deleted Events" })).toBeVisible();
    await expect(page.getByText("Archived Wedding Gala")).toBeVisible();
    await expect(page.getByRole("button", { name: /restore/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^delete$/i })).toHaveCount(0);
  });

  test("proposal trash shows proposer metadata and delete controls for event deleters", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:proposals:approve", "events:delete"] });
    await mockCommonShellData(page);
    await page.route("http://localhost:4000/events/proposals/trash/list**", (route) =>
      fulfillJson(route, {
        proposals: [
          {
            id: "proposal-trash-e2e",
            name: "Archived Proposal",
            client_name: "Dream Lux Client",
            requested_budget: 140000,
            status: "Draft",
            proposed_by_name: "Tigist Haile",
            proposed_by_username: "tigist",
            proposed_by_email: "tigist@example.com",
            deleted_at: "2026-08-20T00:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
    );

    await page.goto("/events/proposals/trash");

    await expect(page.getByRole("heading", { name: "Deleted Proposals" })).toBeVisible();
    await expect(page.getByText("Archived Proposal")).toBeVisible();
    await expect(page.getByText("Tigist Haile")).toBeVisible();
    await expect(page.getByRole("button", { name: /restore/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^delete$/i })).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  });
});
