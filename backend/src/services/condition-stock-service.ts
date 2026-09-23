import { z } from "zod";
import { pool } from "../db/pool";

const limit = z.coerce.number().int().min(1).max(50).default(25);
export const conditionStockListSchema = z.object({
  search: z.string().trim().max(100).default(""),
  limit,
  after: z.string().uuid().optional(),
  include_archived: z.enum(["true", "false"]).default("false"),
});
export const conditionStockDetailSchema = z.object({
  limit,
  before_id: z.string().uuid().optional(),
  before_time: z.union([z.string().datetime({ offset: true }), z.literal("null")]).optional(),
  idempotency_key: z.string().trim().min(1).max(120).optional(),
}).refine((value) => Boolean(value.before_id) === Boolean(value.before_time), {
  message: "Both history cursor fields are required",
});

type ConditionStockItem = {
  id: string; name: string; unit_of_measurement: string | null; quantity: number;
  store_id: string | null; store_name: string | null; store_is_active: boolean | null;
  unavailable_damaged_quantity: number; unavailable_repair_quantity: number; deleted_at: string | null;
};
type Resolution = {
  id: string; item_id: string; source_condition: "damaged" | "repair";
  outcome: "good" | "damaged" | "repair" | "lost"; quantity: number; notes: string | null;
  idempotency_key: string | null; created_by: string | null; created_by_name: string | null; created_at: string | null;
};
const ITEM_COLUMNS = `i.id, i.name, i.unit_of_measurement, i.quantity,
  i.unavailable_damaged_quantity, i.unavailable_repair_quantity, i.deleted_at,
  i.store_id, s.name AS store_name, s.is_active AS store_is_active`;
// DreamLux stores a timezone-less clock, not Koti's timestamptz. Preserve its
// value; new resolutions explicitly store UTC and cursors use the same UTC axis.
const RESOLUTION_COLUMNS = `r.id, r.item_id, r.source_condition, r.outcome, r.quantity,
  r.notes, r.idempotency_key, r.created_by, u.full_name AS created_by_name,
  to_char(r.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;

export async function listConditionStock(input: z.infer<typeof conditionStockListSchema>) {
  const result = await pool.query<ConditionStockItem>(
    `/* condition-stock list */
     SELECT ${ITEM_COLUMNS} FROM items i LEFT JOIN stores s ON s.id = i.store_id
      WHERE ($1::boolean OR i.deleted_at IS NULL)
        AND i.name ILIKE $2
        AND ($3::uuid IS NULL OR i.id > $3::uuid)
        AND (i.unavailable_damaged_quantity > 0 OR i.unavailable_repair_quantity > 0
          OR EXISTS (SELECT 1 FROM inventory_condition_resolutions r WHERE r.item_id = i.id))
      ORDER BY i.id LIMIT $4`,
    [input.include_archived === "true", `%${input.search.replace(/[\\%_]/g, "\\$&")}%`, input.after ?? null, input.limit + 1],
  );
  const items = result.rows.slice(0, input.limit);
  return { items, next_cursor: result.rows.length > input.limit ? items[items.length - 1].id : null };
}

export async function inspectConditionStock(itemId: string, input: z.infer<typeof conditionStockDetailSchema>) {
  const result = await pool.query<{ item: ConditionStockItem; history: Resolution[]; recovery: Resolution | null }>(
    `/* condition-stock detail */
     SELECT row_to_json(i) AS item,
       COALESCE((SELECT jsonb_agg(h ORDER BY h.created_at DESC NULLS LAST, h.id DESC)
         FROM (SELECT ${RESOLUTION_COLUMNS}
           FROM inventory_condition_resolutions r LEFT JOIN users u ON u.id = r.created_by
          WHERE r.item_id = i.id AND (
            $2::uuid IS NULL
            OR ($3::timestamptz IS NOT NULL AND (
              r.created_at < ($3::timestamptz AT TIME ZONE 'UTC')
              OR (r.created_at = ($3::timestamptz AT TIME ZONE 'UTC') AND r.id < $2::uuid)
              OR r.created_at IS NULL))
            OR ($3::timestamptz IS NULL AND r.created_at IS NULL AND r.id < $2::uuid))
          ORDER BY r.created_at DESC NULLS LAST, r.id DESC LIMIT $4) h), '[]'::jsonb) AS history,
       (SELECT row_to_json(saved) FROM (SELECT ${RESOLUTION_COLUMNS}
          FROM inventory_condition_resolutions r LEFT JOIN users u ON u.id = r.created_by
         WHERE r.item_id = i.id AND r.idempotency_key = $5) saved) AS recovery
       FROM (SELECT ${ITEM_COLUMNS} FROM items i LEFT JOIN stores s ON s.id = i.store_id WHERE i.id = $1) i`,
    [itemId, input.before_id ?? null, input.before_time === "null" ? null : input.before_time ?? null,
      input.limit + 1, input.idempotency_key ?? null],
  );
  const snapshot = result.rows[0];
  if (!snapshot) return null;
  const history = snapshot.history.slice(0, input.limit);
  const last = history[history.length - 1];
  return { ...snapshot, history,
    next_cursor: snapshot.history.length > input.limit ? { created_at: last.created_at, id: last.id } : null };
}
