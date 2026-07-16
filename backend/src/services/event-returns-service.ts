export type ReturnQuantities = {
  good_quantity: number;
  damaged_quantity: number;
  lost_quantity: number;
  repair_quantity: number;
};

export class ReturnConflictError extends Error {}

export function calculateReturnTransition(
  allocation: ReturnQuantities & { quantity_allocated: number },
  receipt: ReturnQuantities,
) {
  const accountedBefore =
    Number(allocation.good_quantity) +
    Number(allocation.damaged_quantity) +
    Number(allocation.lost_quantity) +
    Number(allocation.repair_quantity);
  const receiptTotal =
    receipt.good_quantity + receipt.damaged_quantity + receipt.lost_quantity + receipt.repair_quantity;
  const outstandingBefore = Number(allocation.quantity_allocated) - accountedBefore;

  if (receiptTotal > outstandingBefore) {
    throw new ReturnConflictError(
      `Return exceeds outstanding quantity (outstanding: ${outstandingBefore}, submitted: ${receiptTotal})`,
    );
  }

  const outstandingAfter = outstandingBefore - receiptTotal;
  return { receiptTotal, outstandingBefore, outstandingAfter, fullyAccounted: outstandingAfter === 0 };
}

export function calculateInventoryReturnEffect(
  item: { quantity: number; unavailable_damaged_quantity?: number; unavailable_repair_quantity?: number },
  receipt: ReturnQuantities,
) {
  const ownedAfter = Number(item.quantity) - receipt.lost_quantity;
  const unavailableAfter =
    Number(item.unavailable_damaged_quantity || 0) + receipt.damaged_quantity +
    Number(item.unavailable_repair_quantity || 0) + receipt.repair_quantity;

  if (ownedAfter < 0 || unavailableAfter > ownedAfter) {
    throw new ReturnConflictError("Return conditions exceed the item's owned quantity");
  }
  return { ownedAfter, unavailableAfter };
}

export function buildReturnNotification(itemName: string, receipt: ReturnQuantities, outstandingAfter: number) {
  const hasIncident = receipt.damaged_quantity > 0 || receipt.lost_quantity > 0 || receipt.repair_quantity > 0;
  return {
    title: hasIncident ? "Return recorded with damage/loss" : "Inventory return recorded",
    message: `${itemName}: good ${receipt.good_quantity}, damaged ${receipt.damaged_quantity}, lost ${receipt.lost_quantity}, repair ${receipt.repair_quantity}. Outstanding ${outstandingAfter}.`,
    priority: hasIncident ? "high" as const : "normal" as const,
  };
}

export function calculateConditionResolutionEffect(
  sourceBalance: number,
  input: { source_condition: "damaged" | "repair"; outcome: "good" | "damaged" | "repair" | "lost"; quantity: number },
) {
  if (input.quantity > sourceBalance) {
    throw new ReturnConflictError(
      `Only ${sourceBalance} ${input.source_condition} items are awaiting resolution`,
    );
  }
  return {
    lost: input.outcome === "lost" ? input.quantity : 0,
    damaged: input.outcome === "damaged" ? input.quantity : 0,
    repair: input.outcome === "repair" ? input.quantity : 0,
  };
}
