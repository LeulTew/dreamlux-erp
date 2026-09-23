import { describe, expect, it } from "vitest";
import {
  ConditionContractError, ConditionIntentConflict, conditionQuantity, createConditionIntent,
  matchesConditionResolution, parseConditionAcknowledgement, parseConditionDetail, parseConditionIntent, parseConditionItem, parseConditionList,
} from "./condition-stock";
import {
  conditionActor, otherConditionActor, conditionItem, conditionIntent, conditionDraft, conditionReceipt, conditionDetail,
} from "@/__tests__/helpers/condition-stock";

describe("condition stock boundary contracts", () => {
  it.each([true, false, null])("preserves authoritative nullable location status %s and archived metadata", (active) => {
    const item = { ...conditionItem, store_id: conditionActor, store_name: "Recorded warehouse",
      store_is_active: active, unit_of_measurement: null, deleted_at: "2026-09-22T00:00:00Z" };
    expect(parseConditionItem(item)).toEqual(item);
    expect(parseConditionList({ items: [item], next_cursor: null }).items).toEqual([item]);
    expect(parseConditionDetail({ ...conditionDetail, item }, item.id).item).toEqual(item);
  });

  it.each(["store_id", "store_name", "store_is_active", "unit_of_measurement"])("does not silently default missing identity field %s", (field) => {
    const item: Record<string, unknown> = { ...conditionItem };
    delete item[field];
    expect(() => parseConditionItem(item)).toThrow(ConditionContractError);
  });

  it("rejects contradictory or mistyped location context instead of displaying invented identity", () => {
    expect(() => parseConditionItem({ ...conditionItem, store_name: "Phantom store" })).toThrow(ConditionContractError);
    expect(() => parseConditionItem({ ...conditionItem, store_is_active: "false" })).toThrow(ConditionContractError);
  });

  it("retains the actual list and detail output shapes and NULL-key history", () => {
    const list = { items: [conditionItem], next_cursor: conditionItem.id };
    expect(parseConditionList(list)).toEqual(list);
    const detail = { ...conditionDetail, history: [{ ...conditionReceipt, idempotency_key: null, created_by: null, created_by_name: null }] };
    expect(parseConditionDetail(detail, conditionItem.id)).toEqual(detail);
    expect(parseConditionItem({ ...conditionItem, deleted_at: "2026-09-22T01:00:00Z" }).deleted_at).not.toBeNull();
  });

  it.each(["quantity", "unavailable_damaged_quantity", "unavailable_repair_quantity"])("does not invent zero for missing %s", (field) => {
    const incomplete: Record<string, unknown> = { ...conditionItem };
    delete incomplete[field];
    expect(() => parseConditionItem(incomplete)).toThrow(ConditionContractError);
    expect(() => parseConditionItem({ ...conditionItem, [field]: "0" })).toThrow(ConditionContractError);
  });

  it("distinguishes malformed or missing history/recovery from an actual empty snapshot", () => {
    expect(parseConditionDetail({ ...conditionDetail, history: [] }, conditionItem.id).history).toEqual([]);
    for (const patch of [{ history: undefined }, { history: null }, { recovery: undefined }, { next_cursor: undefined },
      { item: { ...conditionItem, id: conditionActor } }, { history: [{ ...conditionReceipt, item_id: conditionActor }] }]) {
      expect(() => parseConditionDetail({ ...conditionDetail, ...patch }, conditionItem.id)).toThrow(ConditionContractError);
    }
  });

  it("validates page boundaries and preserves sub-millisecond cursors", () => {
    const next_cursor = { id: conditionReceipt.id, created_at: conditionReceipt.created_at };
    expect(parseConditionDetail({ ...conditionDetail, next_cursor }, conditionItem.id).next_cursor).toEqual(next_cursor);
    expect(() => parseConditionDetail({ ...conditionDetail, next_cursor: { ...next_cursor, id: conditionActor } }, conditionItem.id)).toThrow();
    expect(() => parseConditionList({ items: [conditionItem, conditionItem], next_cursor: null })).toThrow();
    expect(() => parseConditionList({ items: [], next_cursor: conditionItem.id })).toThrow();
  });

  it.each(["", " ", "0", "-1", "1.5", "1e3", "NaN", "Infinity", "1000001", "1,000"])("rejects invalid operator quantity %j", (value) => {
    expect(conditionQuantity(value)).toBeNull();
  });
  it.each(["1", "0002", "1000000"])("accepts positive bounded whole quantities %s", (value) => {
    expect(conditionQuantity(value)).toBe(Number(value));
  });

  it.each((["damaged", "repair"] as const).flatMap((source) =>
    (["good", "damaged", "repair", "lost"] as const).map((outcome) => ({ source, outcome }))))("preserves $source to $outcome, including inspections", ({ source, outcome }) => {
    const intent = createConditionIntent(conditionActor, conditionItem.id, "exact-key", {
      ...conditionDraft, source_condition: source, outcome,
    });
    expect(intent.payload).toEqual({ source_condition: source, outcome, quantity: 2, notes: "Inspected safely", idempotency_key: "exact-key" });
    expect(intent.draft.notes).toBe("  Inspected safely  ");
    expect(Object.isFrozen(intent.payload)).toBe(true);
    expect(parseConditionIntent(JSON.parse(JSON.stringify(intent)), conditionActor)).toEqual(intent);
  });

  it("rejects another product, actor or internally inconsistent persisted intent", () => {
    for (const patch of [{ product_id: "other-product" }, { actor_id: otherConditionActor },
      { payload: { ...conditionIntent.payload, quantity: 3 } }]) {
      expect(() => parseConditionIntent({ ...conditionIntent, ...patch }, conditionActor)).toThrow();
    }
  });

  it("accepts only a matching identifiable immutable acknowledgement", () => {
    expect(parseConditionAcknowledgement({ resolved: 2, outcome: "good", resolution: conditionReceipt }, conditionIntent)).toEqual(conditionReceipt);
    for (const body of [{ resolved: 2, outcome: "good" }, {}, { success: true }, { resolution: conditionReceipt }]) {
      expect(() => parseConditionAcknowledgement(body, conditionIntent)).toThrow();
    }
  });

  it.each([
    { item_id: conditionActor }, { created_by: otherConditionActor }, { created_by: null },
    { idempotency_key: null }, { idempotency_key: "other" }, { quantity: 3 },
    { source_condition: "repair" as const }, { outcome: "lost" as const }, { notes: null },
  ])("does not confuse a mismatched ledger row with success: %j", (patch) => {
    const row = { ...conditionReceipt, ...patch };
    expect(matchesConditionResolution(conditionIntent, row)).toBe(false);
    expect(() => parseConditionAcknowledgement({ resolved: 2, outcome: "good", resolution: row }, conditionIntent)).toThrow(ConditionIntentConflict);
  });
});
