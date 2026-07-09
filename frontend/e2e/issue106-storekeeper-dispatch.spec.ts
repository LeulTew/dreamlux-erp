import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const workspacePayload = {
  event: {
    id: "event-dispatch-e2e",
    name: "Dispatch Gala",
    client_name: "Dream Lux Client",
    venue_location: "Sheraton Addis",
    status: "Ongoing",
    start_date: "2026-07-10",
    end_date: "2026-07-10",
    contract_price: 150000,
    estimated_design_cost: 20000,
  },
  allocations: [
    {
      id: "alloc-chair",
      event_id: "event-dispatch-e2e",
      item_id: "item-chair",
      item_name: "Gold Chairs",
      store_name: "Bulbula Coka",
      status: "Reserved",
      quantity_allocated: 50,
      dispatch_checked_at: null,
      departed_at: null,
      notes: null,
    },
  ],
  checklist: [],
  assignments: [],
  vehicleAssignments: [],
  expenses: [],
  trips: [],
};

test.describe("Issue 106 storekeeper dispatch flow", () => {
  test("inventory role with asset write access can open dispatch queue", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["assets:read", "assets:write", "assets:reconcile"] });
    await mockCommonShellData(page);

    await page.route("http://localhost:4000/events/dispatch/queue", (route) =>
      fulfillJson(route, {
        queue: [
          {
            event_id: "event-dispatch-e2e",
            event_name: "Dispatch Gala",
            client_name: "Dream Lux Client",
            start_date: "2026-07-10",
            end_date: "2026-07-10",
            venue_location: "Sheraton Addis",
            allocation_count: 1,
            checked_count: 0,
            departed_count: 0,
            departed_at: null,
          },
        ],
      }),
    );

    await page.goto("/assets/dispatch");

    await expect(page.getByRole("heading", { name: "Dispatch Queue" })).toBeVisible();
    await expect(page.getByText("Dispatch Gala")).toBeVisible();
    await expect(page.getByText("Forbidden: Insufficient privileges")).toHaveCount(0);
  });

  test("storekeeper checks allocation, marks departure, and event manager sees notification", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read", "event_allocations:write"] });
    await mockCommonShellData(page);

    let allocationChecked = false;
    let departed = false;
    const notificationRequests: string[] = [];

    await page.route("http://localhost:4000/events/dispatch/queue", (route) =>
      fulfillJson(route, {
        queue: [
          {
            event_id: "event-dispatch-e2e",
            event_name: "Dispatch Gala",
            client_name: "Dream Lux Client",
            start_date: "2026-07-10",
            end_date: "2026-07-10",
            venue_location: "Sheraton Addis",
            allocation_count: 1,
            checked_count: allocationChecked ? 1 : 0,
            departed_count: departed ? 1 : 0,
            departed_at: departed ? "2026-07-01T11:00:00.000Z" : null,
          },
        ],
      }),
    );

    await page.route("http://localhost:4000/events/event-dispatch-e2e/workspace", (route) =>
      fulfillJson(route, {
        ...workspacePayload,
        allocations: workspacePayload.allocations.map((allocation) => ({
          ...allocation,
          status: departed ? "Pulled" : allocation.status,
          dispatch_checked_at: allocationChecked ? "2026-07-01T10:00:00.000Z" : null,
          departed_at: departed ? "2026-07-01T11:00:00.000Z" : null,
        })),
      }),
    );

    await page.route("http://localhost:4000/events/event-dispatch-e2e/allocations/alloc-chair/dispatch-check", async (route) => {
      allocationChecked = true;
      await fulfillJson(route, { id: "alloc-chair", dispatch_checked_at: "2026-07-01T10:00:00.000Z" });
    });

    await page.route("http://localhost:4000/events/event-dispatch-e2e/dispatch/depart", async (route) => {
      departed = true;
      await fulfillJson(route, { success: true, departed_count: 1, already_departed: false });
    });

    await page.route("http://localhost:4000/api/notifications/unread-count", (route) => {
      notificationRequests.push(route.request().url());
      return fulfillJson(route, { count: departed ? 1 : 0 });
    });
    await page.route("http://localhost:4000/api/notifications?**", (route) => {
      notificationRequests.push(route.request().url());
      return fulfillJson(route, {
        notifications: departed
          ? [
              {
                id: "notification-dispatch",
                title: "Inventory Departed",
                message: "Storekeeper dispatched 1 allocation for event \"Dispatch Gala\".",
                entity_type: "event",
                entity_id: "event-dispatch-e2e",
                action_url: "/events/event-dispatch-e2e",
                priority: "high",
                read_at: null,
                created_at: "2026-07-01T11:00:00.000Z",
              },
            ]
          : [],
      });
    });

    await page.goto("/assets/dispatch");

    await expect(page.getByRole("heading", { name: "Dispatch Queue" })).toBeVisible();
    await expect(page.getByText("Dispatch Gala")).toBeVisible();
    await page.getByRole("link", { name: /Open dispatch/i }).click();

    await page.getByRole("button", { name: /Inventory Allocation/i }).click();
    await expect(page.getByRole("button", { name: /Mark Departed/i })).toBeDisabled();
    await page.getByRole("checkbox", { name: /Dispatch Checklist Gold Chairs/i }).click();
    await expect(page.getByRole("button", { name: /Mark Departed/i })).toBeEnabled();

    await page.getByRole("button", { name: /Mark Departed/i }).click();
    await expect(page.getByText(/Departed: 2026-07-01/)).toBeVisible();
    expect(notificationRequests.length).toBeGreaterThan(0);
  });
});
