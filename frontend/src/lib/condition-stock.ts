export type ConditionSource = "damaged" | "repair";
export type ConditionOutcome = ConditionSource | "good" | "lost";
export type ConditionStockItem = {
  id: string; name: string; unit_of_measurement: string | null; quantity: number;
  store_id: string | null; store_name: string | null; store_is_active: boolean | null;
  unavailable_damaged_quantity: number; unavailable_repair_quantity: number; deleted_at: string | null;
};
export type ConditionResolution = {
  id: string; item_id: string; source_condition: ConditionSource; outcome: ConditionOutcome;
  quantity: number; notes: string | null; idempotency_key: string | null;
  created_by: string | null; created_by_name: string | null; created_at: string | null;
};
export type ConditionHistoryCursor = { created_at: string | null; id: string };
export type ConditionStockList = { items: ConditionStockItem[]; next_cursor: string | null };
export type ConditionStockDetail = {
  item: ConditionStockItem; history: ConditionResolution[];
  next_cursor: ConditionHistoryCursor | null; recovery: ConditionResolution | null;
};
export type ConditionDraft = {
  source_condition: ConditionSource; outcome: ConditionOutcome; quantity: string; notes: string;
};
export type ConditionIntent = Readonly<{
  product_id: "dreamlux-erp"; actor_id: string; item_id: string;
  draft: Readonly<ConditionDraft>;
  payload: Readonly<{
    source_condition: ConditionSource; outcome: ConditionOutcome; quantity: number;
    notes: string | null; idempotency_key: string;
  }>;
}>;

export class ConditionContractError extends Error {
  constructor() { super("Condition stock response could not be verified"); }
}
export class ConditionIntentConflict extends Error {
  constructor() { super("The recorded condition resolution does not match this request"); }
}
export class ConditionAccessChanged extends Error {
  constructor() { super("Condition stock authority changed; no request was sent"); }
}

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConditionContractError();
  return value as Record<string, unknown>;
};
const text = (value: unknown, max: number): string => {
  if (typeof value !== "string" || value.length > max) throw new ConditionContractError();
  return value;
};
export function conditionId(value: unknown): string {
  const id = text(value, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ConditionContractError();
  return id.toLowerCase();
}
const nullableText = (value: unknown, max: number) => value === null ? null : text(value, max);
const nullableId = (value: unknown) => value === null ? null : conditionId(value);
const integer = (value: unknown, minimum = 0): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > 2_147_483_647) {
    throw new ConditionContractError();
  }
  return value;
};
const timestamp = (value: unknown): string | null => {
  if (value === null) return null;
  const result = text(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) throw new ConditionContractError();
  return result;
};
export const isConditionSource = (value: unknown): value is ConditionSource => value === "damaged" || value === "repair";
export const isConditionOutcome = (value: unknown): value is ConditionOutcome =>
  isConditionSource(value) || value === "good" || value === "lost";

export function conditionQuantity(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 1_000_000 ? quantity : null;
}

export function parseConditionItem(value: unknown): ConditionStockItem {
  const row = object(value);
  if (row.store_is_active !== null && typeof row.store_is_active !== "boolean") throw new ConditionContractError();
  const item = {
    id: conditionId(row.id), name: text(row.name, 1000), unit_of_measurement: nullableText(row.unit_of_measurement, 100),
    store_id: nullableId(row.store_id), store_name: nullableText(row.store_name, 1000), store_is_active: row.store_is_active,
    quantity: integer(row.quantity), unavailable_damaged_quantity: integer(row.unavailable_damaged_quantity),
    unavailable_repair_quantity: integer(row.unavailable_repair_quantity), deleted_at: timestamp(row.deleted_at),
  };
  if (item.store_id === null && (item.store_name !== null || item.store_is_active !== null)) throw new ConditionContractError();
  if (item.unavailable_damaged_quantity + item.unavailable_repair_quantity > item.quantity) throw new ConditionContractError();
  return item;
}

export function parseConditionResolution(value: unknown): ConditionResolution {
  const row = object(value);
  if (!isConditionSource(row.source_condition) || !isConditionOutcome(row.outcome)) throw new ConditionContractError();
  return {
    id: conditionId(row.id), item_id: conditionId(row.item_id), source_condition: row.source_condition,
    outcome: row.outcome, quantity: integer(row.quantity, 1), notes: nullableText(row.notes, 1000),
    idempotency_key: nullableText(row.idempotency_key, 120), created_by: nullableId(row.created_by),
    created_by_name: nullableText(row.created_by_name, 1000), created_at: timestamp(row.created_at),
  };
}

export function parseConditionList(value: unknown): ConditionStockList {
  const data = object(value);
  if (!Array.isArray(data.items) || data.items.length > 50) throw new ConditionContractError();
  const items = data.items.map(parseConditionItem);
  const next_cursor = nullableId(data.next_cursor);
  if (new Set(items.map((item) => item.id)).size !== items.length
    || (next_cursor !== null && next_cursor !== items.at(-1)?.id)) throw new ConditionContractError();
  return { items, next_cursor };
}

export function parseConditionDetail(value: unknown, itemId: string, key?: string): ConditionStockDetail {
  itemId = conditionId(itemId);
  const data = object(value);
  const item = parseConditionItem(data.item);
  if (item.id !== itemId || !Array.isArray(data.history) || data.history.length > 50) throw new ConditionContractError();
  const history = data.history.map(parseConditionResolution);
  const recovery = data.recovery === null ? null : parseConditionResolution(data.recovery);
  if (history.some((row) => row.item_id !== itemId) || new Set(history.map((row) => row.id)).size !== history.length
    || (recovery !== null && (recovery.item_id !== itemId || recovery.idempotency_key !== key))) throw new ConditionContractError();
  const cursor = data.next_cursor === null ? null : object(data.next_cursor);
  const next_cursor = cursor ? { id: conditionId(cursor.id), created_at: timestamp(cursor.created_at) } : null;
  if (next_cursor && (next_cursor.id !== history.at(-1)?.id || next_cursor.created_at !== history.at(-1)?.created_at)) {
    throw new ConditionContractError();
  }
  return { item, history, recovery, next_cursor };
}

export function createConditionIntent(actorId: string, itemId: string, key: string, draft: ConditionDraft): ConditionIntent {
  const quantity = conditionQuantity(draft.quantity);
  if (!quantity || !isConditionSource(draft.source_condition) || !isConditionOutcome(draft.outcome)
    || typeof draft.notes !== "string" || draft.notes.length > 1000 || !key.trim() || key.length > 120) throw new ConditionContractError();
  return Object.freeze({
    product_id: "dreamlux-erp",
    actor_id: conditionId(actorId), item_id: conditionId(itemId),
    draft: Object.freeze({ ...draft }),
    payload: Object.freeze({
      source_condition: draft.source_condition, outcome: draft.outcome, quantity,
      notes: draft.notes.trim() || null, idempotency_key: key,
    }),
  });
}

export function parseConditionIntent(value: unknown, actorId: string): ConditionIntent {
  const data = object(value);
  const draft = object(data.draft);
  const payload = object(data.payload);
  if (data.product_id !== "dreamlux-erp" || data.actor_id !== actorId
    || !isConditionSource(draft.source_condition) || !isConditionOutcome(draft.outcome)) throw new ConditionContractError();
  const intent = createConditionIntent(actorId, conditionId(data.item_id), text(payload.idempotency_key, 120), {
    source_condition: draft.source_condition, outcome: draft.outcome,
    quantity: text(draft.quantity, 32), notes: text(draft.notes, 1000),
  });
  if (intent.payload.source_condition !== payload.source_condition || intent.payload.outcome !== payload.outcome
    || intent.payload.quantity !== payload.quantity || intent.payload.notes !== payload.notes) throw new ConditionContractError();
  return intent;
}

export function matchesConditionResolution(intent: ConditionIntent, row: ConditionResolution): boolean {
  return row.item_id === intent.item_id && row.created_by === intent.actor_id
    && row.idempotency_key === intent.payload.idempotency_key && row.quantity === intent.payload.quantity
    && row.source_condition === intent.payload.source_condition && row.outcome === intent.payload.outcome
    && row.notes === intent.payload.notes;
}

export function parseConditionAcknowledgement(value: unknown, intent: ConditionIntent): ConditionResolution {
  const data = object(value);
  const row = parseConditionResolution(data.resolution);
  if (data.resolved !== intent.payload.quantity || data.outcome !== intent.payload.outcome || !matchesConditionResolution(intent, row)) {
    throw new ConditionIntentConflict();
  }
  return row;
}
