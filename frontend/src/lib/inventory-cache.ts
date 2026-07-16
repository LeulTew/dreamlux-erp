import type { QueryClient } from "@tanstack/react-query";

/** Invalidate every cached view derived from inventory or allocation state. */
export async function invalidateInventoryState(
  queryClient: QueryClient,
  options: { eventId?: string | null; includeFinance?: boolean } = {},
): Promise<void> {
  const roots = [
    "assets",
    "items",
    "inventory-items-lookup",
    "inventoryStats",
    "inventory-movements",
    "inventory-history",
    "reconcileHistory",
    "low-stock",
    "event-return-queue",
  ];

  if (options.includeFinance) {
    roots.push("finance-investments-list", "finance-investments-summary");
  }

  await Promise.all([
    ...roots.map((root) => queryClient.invalidateQueries({ queryKey: [root] })),
    queryClient.invalidateQueries({ queryKey: ["event-workspace"] }),
    ...(options.eventId
      ? [
          queryClient.invalidateQueries({ queryKey: ["event-returns", options.eventId] }),
          queryClient.invalidateQueries({ queryKey: ["event-workspace", options.eventId] }),
        ]
      : []),
  ]);
}
