import type { ConditionDraft, ConditionResolution, ConditionStockItem } from "@/lib/condition-stock";
import { createConditionIntent } from "@/lib/condition-stock";

export const conditionActor = "27900000-0000-4000-8000-000000000001";
export const otherConditionActor = "27900000-0000-4000-8000-000000000002";
export const conditionItem: ConditionStockItem = {
  id: "27900000-0000-4000-8000-000000000003", name: "Synthetic DreamLux inspection item",
  unit_of_measurement: "pcs", store_id: null, store_name: null, store_is_active: null,
  quantity: 20, unavailable_damaged_quantity: 5, unavailable_repair_quantity: 4, deleted_at: null,
};
export const conditionDraft: ConditionDraft = { source_condition: "damaged", outcome: "good", quantity: "2", notes: "  Inspected safely  " };
export const conditionIntent = createConditionIntent(conditionActor, conditionItem.id, "condition-key", conditionDraft);
export const conditionReceipt: ConditionResolution = {
  id: "27900000-0000-4000-8000-000000000004", item_id: conditionItem.id,
  source_condition: "damaged", outcome: "good", quantity: 2, notes: "Inspected safely",
  idempotency_key: "condition-key", created_by: conditionActor, created_by_name: "Synthetic DreamLux operator",
  created_at: "2031-02-03T04:05:06.123456Z",
};
export const conditionDetail = { item: conditionItem, history: [conditionReceipt], next_cursor: null, recovery: null };
