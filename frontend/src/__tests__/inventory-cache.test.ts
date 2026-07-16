import { describe, expect, it, vi } from "vitest";
import { invalidateInventoryState } from "@/lib/inventory-cache";

describe("inventory cache invalidation", () => {
  it("refreshes all inventory, history, low-stock, event, and finance surfaces", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await invalidateInventoryState({ invalidateQueries } as never, { eventId: "event-1", includeFinance: true });

    const roots = invalidateQueries.mock.calls.map(([arg]) => arg.queryKey.join(":"));
    expect(roots).toEqual(expect.arrayContaining([
      "assets", "items", "inventory-items-lookup", "inventoryStats", "inventory-movements",
      "inventory-history", "reconcileHistory", "low-stock", "event-return-queue",
      "finance-investments-list", "finance-investments-summary", "event-workspace",
      "event-returns:event-1", "event-workspace:event-1",
    ]));
  });
});
