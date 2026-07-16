import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const MOCK_QUEUE_ENTRY = {
  event_id: "evt-e2e-returns-1",
  event_name: "Gala Night Return",
  client_name: "Elite Events",
  start_date: "2026-07-10T10:00:00Z",
  end_date: "2026-07-12T22:00:00Z",
  event_status: "Completed",
  open_allocation_count: 1,
  dispatched_quantity: 10,
  accounted_quantity: 4,
  outstanding_quantity: 6,
};

const MOCK_ALLOCATION = {
  id: "alloc-e2e-returns-1",
  item_id: "item-e2e-returns-1",
  item_name: "Sound System Subwoofer",
  unit_of_measurement: "pcs",
  store_name: "Bole Main Warehouse",
  quantity_allocated: 10,
  status: "Pulled",
  notes: "Check subwoofers for transport scratches",
  departed_at: "2026-07-10T09:00:00Z",
  returned_at: null,
  returned_by_name: null,
  returned_good_quantity: 4,
  returned_damaged_quantity: 0,
  returned_lost_quantity: 0,
  returned_repair_quantity: 0,
  outstanding_quantity: 6,
};

const MOCK_RECEIPT = {
  id: "rec-e2e-returns-1",
  allocation_id: "alloc-e2e-returns-1",
  good_quantity: 4,
  damaged_quantity: 0,
  lost_quantity: 0,
  repair_quantity: 0,
  outstanding_before: 10,
  outstanding_after: 6,
  notes: "First batch return",
  created_at: "2026-07-13T08:00:00Z",
  created_by_name: "Sam Storekeeper",
};

test.describe("Issue 173 Inventory Returns Checklist Flow", () => {
  test("Authorized manager views returns queue, selects event, and records returns checklist line", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, {
      permissions: ["event_allocations:write", "assets:write"],
    });
    await mockCommonShellData(page);

    let recordedReturnCount = 0;

    // Intercept return queue query
    await page.route(
      (url) => url.pathname === "/api/events/returns/queue",
      (route) => {
        return fulfillJson(route, {
          queue: [
            {
              ...MOCK_QUEUE_ENTRY,
              accounted_quantity: recordedReturnCount === 0 ? 4 : recordedReturnCount === 1 ? 9 : 10,
              outstanding_quantity: recordedReturnCount === 0 ? 6 : recordedReturnCount === 1 ? 1 : 0,
            },
          ],
          total: 1,
        });
      }
    );

    // Intercept event returns detail lookup
    await page.route(
      (url) => url.pathname === "/api/events/evt-e2e-returns-1/returns",
      (route) => {
        return fulfillJson(route, {
          event: {
            id: "evt-e2e-returns-1",
            name: "Gala Night Return",
            client_name: "Elite Events",
            status: "Completed",
          },
          allocations: [
            {
              ...MOCK_ALLOCATION,
              returned_good_quantity: recordedReturnCount === 0 ? 4 : recordedReturnCount === 1 ? 8 : 9,
              returned_damaged_quantity: recordedReturnCount === 0 ? 0 : 1,
              outstanding_quantity: recordedReturnCount === 0 ? 6 : recordedReturnCount === 1 ? 1 : 0,
              status: recordedReturnCount >= 2 ? "Returned" : "Pulled",
            },
          ],
          receipts: recordedReturnCount > 0
            ? [
                MOCK_RECEIPT,
                {
                  id: "rec-e2e-returns-2",
                  allocation_id: "alloc-e2e-returns-1",
                  good_quantity: 4,
                  damaged_quantity: 1,
                  lost_quantity: 0,
                  repair_quantity: 0,
                  outstanding_before: 6,
                  outstanding_after: 1,
                  notes: "Second batch return",
                  created_at: "2026-07-14T09:00:00Z",
                  created_by_name: "Sam Storekeeper",
                },
                ...(recordedReturnCount >= 2 ? [{
                  id: "rec-e2e-returns-3", allocation_id: "alloc-e2e-returns-1", good_quantity: 1,
                  damaged_quantity: 0, lost_quantity: 0, repair_quantity: 0, outstanding_before: 1,
                  outstanding_after: 0, notes: "Final unit", created_at: "2026-07-14T10:00:00Z",
                  created_by_name: "Sam Storekeeper",
                }] : []),
              ]
            : [MOCK_RECEIPT],
        });
      }
    );

    // Intercept record return API POST
    await page.route(
      (url) => url.pathname === "/api/events/evt-e2e-returns-1/allocations/alloc-e2e-returns-1/returns",
      (route) => {
        if (route.request().method() === "POST") {
          recordedReturnCount += 1;
          return fulfillJson(route, { fully_returned: recordedReturnCount >= 2 });
        }
        return route.continue();
      }
    );

    // Navigate to inventory returns page
    await page.goto("/assets/returns");
    await expect(page.locator(".animate-spin")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Inventory Returns" })).toBeVisible();

    // Verify queue displays gala night return
    await expect(page.getByText("Gala Night Return")).toBeVisible();
    await expect(page.getByText("Elite Events")).toBeVisible();
    await expect(page.locator("text=Outstanding").first()).toBeVisible();

    // Open returns checklist for event
    await page.getByRole("button", { name: "Open returns" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Gala Night Return" })).toBeVisible();

    // Verify checklist line renders with correct stats
    await expect(page.getByText("Sound System Subwoofer")).toBeVisible();
    await expect(page.getByText("6 of 10 outstanding")).toBeVisible();

    // Fill returns checklist inputs
    await page.locator('input[id^="good-"]').fill("4");
    await page.locator('input[id^="damaged-"]').fill("1");
    await page.locator('input[id^="notes-"]').fill("Second batch return");

    // Click Record Return
    await page.getByRole("button", { name: "Record return" }).click();

    // Verify checklist re-renders with updated counts and receipt history
    await expect(page.getByText("9 of 10 outstanding")).not.toBeVisible();
    await expect(page.getByText("1 of 10 outstanding")).toBeVisible();
    await expect(page.getByText("Second batch return")).toBeVisible();

    await page.locator('input[id^="good-"]').fill("1");
    await page.locator('input[id^="notes-"]').fill("Final unit");
    await page.getByRole("button", { name: "Record return" }).click();
    await expect(page.locator("span").filter({ hasText: /^Fully returned$/ }).first()).toBeVisible();
    await expect(page.getByText("Final unit")).toBeVisible();
  });

  test("Unauthorized users are shown ForbiddenState", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: [] });
    await mockCommonShellData(page);

    await page.goto("/assets/returns");
    await expect(page.locator(".animate-spin")).toHaveCount(0);
    await expect(page.getByText(/access restricted/i)).toBeVisible();
  });
});
