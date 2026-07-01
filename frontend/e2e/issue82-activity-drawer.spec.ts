import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

test.describe("Issue 82 activity timeline drawer", () => {
  test("proposal detail opens the shared activity drawer and renders normalized feed data", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read", "events:proposals:approve"] });
    await mockCommonShellData(page);

    await page.route("http://localhost:4000/events/proposals/proposal-activity-e2e", (route) =>
      fulfillJson(route, {
        proposal: {
          id: "proposal-activity-e2e",
          name: "Activity Review Proposal",
          client_name: "Dream Lux Client",
          client_phone: "+251911111111",
          requested_budget: 150000,
          requested_start_date: "2026-08-01",
          requested_end_date: "2026-08-01",
          venue_location: "Addis Hall",
          status: "Submitted",
          estimated_total_cost: 100000,
          estimated_net_profit: 50000,
          estimated_margin_percentage: 33,
          proposed_by_name: "Tigist Haile",
          proposed_by_username: "tigist",
          proposed_by_email: "tigist@example.com",
          approved_by_name: null,
          approved_by_username: null,
          approved_by_email: null,
          cost_breakdown: {
            design: [],
            team: [],
            trip: [],
            other: [],
          },
        },
        logs: [],
      }),
    );

    await page.route("**/api/activity**", (route) =>
      fulfillJson(route, {
        activity: [
          {
            id: "activity-1",
            entity_type: "proposal",
            entity_id: "proposal-activity-e2e",
            user_id: "user-ops",
            username: "tigist",
            full_name: "Tigist Haile",
            action: "update",
            field_changed: "status",
            old_value: "Draft",
            new_value: "Submitted",
            note: "Submitted for approval",
            source_route: "event_proposal_logs",
            created_at: "2026-06-30T02:00:00.000Z",
          },
        ],
      }),
    );

    await page.goto("/events/proposals/proposal-activity-e2e");

    await expect(page.getByRole("heading", { name: "Activity Review Proposal" })).toBeVisible();

    await page.getByRole("button", { name: "Activity Timeline" }).click();
    const activityDialog = page.getByRole("dialog");

    await expect(activityDialog.getByText("Tigist Haile")).toBeVisible();
    await expect(activityDialog.getByText("Submitted for approval")).toBeVisible();
    await expect(activityDialog.getByText("event_proposal_logs")).toBeVisible();
    await expect(activityDialog.getByText(/^Draft$/)).toBeVisible();
    await expect(activityDialog.getByText(/^Submitted$/)).toBeVisible();
    await expect(activityDialog.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  });
});
