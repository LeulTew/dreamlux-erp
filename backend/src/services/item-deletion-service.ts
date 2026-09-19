import { pool } from "../db/pool";
import { ActivityService } from "./activity-service";

type DeletableItem = {
  id: string;
  name: string;
  quantity: number;
  image_key: string | null;
  deleted_at: Date | null;
};

export class ItemDeletionError extends Error {
  constructor(
    public readonly status: 404 | 409 | 503,
    public readonly code: "ITEM_NOT_FOUND" | "ITEM_NOT_TRASHED" | "ITEM_HAS_HISTORY" | "ITEM_DELETE_BUSY" | "ITEM_DELETE_UNCONFIRMED",
    message: string,
  ) {
    super(message);
    this.name = "ItemDeletionError";
  }
}

export async function permanentlyDeleteUnusedItem(id: string, actorId: string | null): Promise<DeletableItem> {
  const client = await pool.connect();
  let discard = false;
  let committing = false;
  let deletingItem = false;
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '10s'");
    // Child FK inserts take key-share locks: this lock makes the history check
    // and deletion one decision even when a new reference is being committed.
    const { rows: [item] } = await client.query<DeletableItem>(
      "select id, name, quantity, image_key, deleted_at from items where id=$1::uuid for update", [id],
    );
    if (!item) throw new ItemDeletionError(404, "ITEM_NOT_FOUND", "Item not found");
    if (!item.deleted_at) {
      throw new ItemDeletionError(409, "ITEM_NOT_TRASHED", "Move the item to trash before permanently deleting it.");
    }
    const { rows: [history] } = await client.query<{ has_history: boolean }>(
      `select (
        exists(select 1 from event_allocations where item_id=$1::uuid)
        or exists(select 1 from event_return_receipts where item_id=$1::uuid)
        or exists(select 1 from event_return_corrections where item_id=$1::uuid)
        or exists(select 1 from inventory_condition_resolutions where item_id=$1::uuid)
        or exists(select 1 from inventory_movements where item_id=$1::uuid)
        or exists(select 1 from inventory_reconciliation_items where item_id=$1::uuid)
        or exists(select 1 from capital_investments where asset_id=$1::uuid)
      ) as has_history`, [item.id],
    );
    if (typeof history?.has_history !== "boolean") throw new Error("Item history could not be verified");
    if (history.has_history) {
      throw new ItemDeletionError(409, "ITEM_HAS_HISTORY", "This item has operational history and cannot be permanently deleted. Keep it in trash or restore it.");
    }
    deletingItem = true;
    const deleted = await client.query("delete from items where id=$1::uuid returning id", [item.id]);
    deletingItem = false;
    if (deleted.rowCount !== 1) throw new Error("Item deletion was not acknowledged");
    await ActivityService.writeActivity(client, {
      entity_type: "asset", entity_id: item.id, user_id: actorId, action: "permanent_delete",
      old_value: JSON.stringify({ name: item.name, quantity: item.quantity, deleted_at: item.deleted_at, image_key: item.image_key }),
      note: "Permanently deleted unused trashed item",
    });
    committing = true;
    await client.query("commit");
    return item;
  } catch (error: unknown) {
    try {
      await client.query("rollback");
    } catch {
      discard = true;
      console.error("[ItemDeletion] Rollback failed; discarding connection");
    }
    if (committing) {
      discard = true;
      console.error("[ItemDeletion] Commit acknowledgement failed; reload required", { itemId: id });
      throw new ItemDeletionError(503, "ITEM_DELETE_UNCONFIRMED", "Item deletion could not be confirmed. Reload trash before trying again.");
    }
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "23503" && deletingItem) {
      throw new ItemDeletionError(409, "ITEM_HAS_HISTORY", "This item has operational history and cannot be permanently deleted. Keep it in trash or restore it.");
    }
    if (code === "55P03" || code === "40P01") {
      throw new ItemDeletionError(409, "ITEM_DELETE_BUSY", "This item is being changed. Reload trash and try again.");
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
