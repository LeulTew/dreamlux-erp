import { expect, test } from "@playwright/test";
import { fulfillJson, mockAuth, mockCommonShellData, seedAuthenticatedSession } from "./helpers";

const EVENT_ID = "event-alloc-edit-e2e";

const baseEvent = {
  id: EVENT_ID,
  name: "Correction Gala",
  client_name: "Dream Lux Client",
  venue_location: "Sheraton Addis",
  status: "Ongoing",
  start_date: "2026-07-10",
  end_date: "2026-07-10",
  contract_price: 150000,
  estimated_design_cost: 20000,
};

const chairAllocation = {
  id: "alloc-chair",
  event_id: EVENT_ID,
  item_id: "item-chair",
  item_name: "Gold Chairs",
  store_name: "Bulbula Coka",
  status: "Reserved",
  quantity_allocated: 50,
  dispatch_checked_at: null,
  departed_at: null,
  notes: "Front hall",
  available_quantity: 30,
};

const departedAllocation = {
  id: "alloc-stand",
  event_id: EVENT_ID,
  item_id: "item-stand",
  item_name: "Silver Stands",
  store_name: "Bulbula Coka",
  status: "Pulled",
  quantity_allocated: 10,
  dispatch_checked_at: "2026-07-01T10:00:00.000Z",
  departed_at: "2026-07-01T11:00:00.000Z",
  notes: null,
  available_quantity: 5,
};

test.describe("Issue 196 storekeeper corrects an event inventory allocation", () => {
  test("edits quantity and notes on an active allocation and leaves departed rows locked", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read", "event_allocations:write"] });
    await mockCommonShellData(page);

    // Server-side state the workspace read reflects, so the assertions below prove the
    // UI re-read the authoritative values rather than showing an optimistic guess.
    let chairQuantity = 50;
    let chairNotes: string | null = "Front hall";
    let chairAvailable = 30;
    let patchBody: Record<string, unknown> | null = null;

    await page.route((url) => url.pathname.endsWith(`/events/${EVENT_ID}/workspace`), (route) =>
      fulfillJson(route, {
        event: baseEvent,
        allocations: [
          { ...chairAllocation, quantity_allocated: chairQuantity, notes: chairNotes, available_quantity: chairAvailable },
          departedAllocation,
        ],
        checklist: [],
        assignments: [],
        vehicleAssignments: [],
        expenses: [],
        trips: [],
      }),
    );

    await page.route((url) => url.pathname.endsWith(`/events/${EVENT_ID}/allocations/alloc-chair`), async (route) => {
      expect(route.request().method()).toBe("PATCH");
      patchBody = route.request().postDataJSON();
      const nextQuantity = Number(patchBody!.quantity_allocated);
      // Freeing 15 units returns them to the pool the item picker reads from.
      chairAvailable += chairQuantity - nextQuantity;
      chairQuantity = nextQuantity;
      chairNotes = (patchBody!.notes as string | null) ?? null;
      await fulfillJson(route, {
        ...chairAllocation,
        quantity_allocated: chairQuantity,
        notes: chairNotes,
      });
    });

    await page.goto(`/events/${EVENT_ID}`);
    await page.getByRole("button", { name: /^Inventory Allocation$/ }).click();

    await expect(page.getByText("Gold Chairs")).toBeVisible();

    // A departed allocation must not advertise an edit affordance.
    await expect(page.getByRole("button", { name: /Edit Allocation Silver Stands/i })).toHaveCount(0);
    await expect(page.getByText("Locked after departure")).toBeVisible();

    await page.getByRole("button", { name: /Edit Allocation Gold Chairs/i }).click();

    const quantityField = page.getByLabel("Quantity");
    const notesField = page.getByLabel("Notes");
    await expect(quantityField).toHaveValue("50");
    await expect(notesField).toHaveValue("Front hall");

    await quantityField.fill("35");
    await notesField.fill("Back hall only");
    await page.getByRole("button", { name: /^Save$/ }).click();

    await expect(page.getByRole("button", { name: /Edit Allocation Gold Chairs/i })).toBeVisible();
    await expect(page.getByText("Allocated: 35")).toBeVisible();
    await expect(page.getByText("Back hall only")).toBeVisible();

    expect(patchBody).toEqual({ quantity_allocated: 35, notes: "Back hall only" });
    // 15 units released back into availability.
    expect(chairAvailable).toBe(45);
  });

  test("cancelling an edit leaves the allocation untouched", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read", "event_allocations:write"] });
    await mockCommonShellData(page);

    let patchCalls = 0;

    await page.route((url) => url.pathname.endsWith(`/events/${EVENT_ID}/workspace`), (route) =>
      fulfillJson(route, {
        event: baseEvent,
        allocations: [chairAllocation],
        checklist: [],
        assignments: [],
        vehicleAssignments: [],
        expenses: [],
        trips: [],
      }),
    );

    await page.route((url) => url.pathname.endsWith(`/events/${EVENT_ID}/allocations/alloc-chair`), async (route) => {
      patchCalls += 1;
      await fulfillJson(route, chairAllocation);
    });

    await page.goto(`/events/${EVENT_ID}`);
    await page.getByRole("button", { name: /^Inventory Allocation$/ }).click();

    await page.getByRole("button", { name: /Edit Allocation Gold Chairs/i }).click();
    await page.getByLabel("Quantity").fill("7");
    await page.getByRole("button", { name: /^Cancel$/ }).click();

    await expect(page.getByLabel("Quantity")).toHaveCount(0);
    await expect(page.getByText("Allocated: 50")).toBeVisible();
    expect(patchCalls).toBe(0);
  });

  test("surfaces the backend insufficient-stock conflict", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuth(page, { permissions: ["events:read", "event_allocations:write"] });
    await mockCommonShellData(page);

    await page.route((url) => url.pathname.endsWith(`/events/${EVENT_ID}/workspace`), (route) =>
      fulfillJson(route, {
        event: baseEvent,
        allocations: [chairAllocation],
        checklist: [],
        assignments: [],
        vehicleAssignments: [],
        expenses: [],
        trips: [],
      }),
    );

    await page.route((url) => url.pathname.endsWith(`/events/${EVENT_ID}/allocations/alloc-chair`), (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "Requested quantity exceeds available stock", available_quantity: 30 }),
      }),
    );

    await page.goto(`/events/${EVENT_ID}`);
    await page.getByRole("button", { name: /^Inventory Allocation$/ }).click();

    await page.getByRole("button", { name: /Edit Allocation Gold Chairs/i }).click();
    await page.getByLabel("Quantity").fill("9999");
    await page.getByRole("button", { name: /^Save$/ }).click();

    await expect(page.getByText("Requested quantity exceeds available stock")).toBeVisible();
    // The form stays open with the rejected draft so the storekeeper can correct it.
    await expect(page.getByLabel("Quantity")).toHaveValue("9999");
  });
});
