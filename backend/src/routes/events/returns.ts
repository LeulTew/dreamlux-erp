import { Router, Response } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "../../db/pool";
import { requireAuth, AuthRequest, getEffectivePermissionSlugsFromUser } from "../../middleware/auth";
import { hasPermissionSlug } from "../../lib/permissions";
import { correctEventReturnSchema, recordEventReturnSchema, resolveInventoryConditionSchema } from "../../lib/validation";
import { NotificationsService } from "../../services/notifications-service";
import {
  conditionStockDetailSchema, conditionStockListSchema, inspectConditionStock, listConditionStock,
} from "../../services/condition-stock-service";
import {
  ReturnConflictError,
  buildReturnNotification,
  calculateConditionResolutionEffect,
  calculateInventoryReturnEffect,
  calculateReturnTransition,
} from "../../services/event-returns-service";

/**
 * Issue #173 — dispatched-item return checklist and inventory reallocation.
 *
 * Invariant (documented in event_returns.sql):
 *   outstanding(allocation) = quantity_allocated - (good + damaged + lost + repair)
 *   availability            = items.quantity - SUM(outstanding) over status <> 'Returned'
 * Good returns restore availability by shrinking outstanding. Damaged and
 * repair quantities remain owned but unavailable. Only loss reduces owned stock.
 */

function hasPermission(req: AuthRequest, slug: string): boolean {
  return hasPermissionSlug(getEffectivePermissionSlugsFromUser(req.user), slug);
}

function canManageReturns(req: AuthRequest): boolean {
  // Same capability set as the outbound dispatch checklist (#106).
  return hasPermission(req, "event_allocations:write") || hasPermission(req, "assets:write");
}

const OUTSTANDING_SQL =
  "(ea.quantity_allocated - ea.returned_good_quantity - ea.returned_damaged_quantity - ea.returned_lost_quantity - ea.returned_repair_quantity)";

export function createEventReturnsRouter(): Router {
  const router = Router();

  const conditionActor = (req: AuthRequest, res: Response, next: () => void) => {
    const actor = z.string().uuid().safeParse(req.user?.id);
    if (!actor.success) {
      res.status(401).json({ error: "A verified current account identity is required", code: "CONDITION_IDENTITY_REQUIRED" });
      return;
    }
    const expected = req.get("X-Condition-Actor");
    if (expected && expected.toLowerCase() !== actor.data.toLowerCase()) {
      res.status(403).json({ error: "Condition stock account changed", code: "CONDITION_ACTOR_CHANGED" });
      return;
    }
    next();
  };
  const conditionReader = (req: AuthRequest, res: Response, next: () => void) => {
    if (hasPermission(req, "assets:read") || hasPermission(req, "assets:reconcile")) return next();
    res.status(403).json({ error: "Forbidden: Missing condition stock inspection privileges" });
  };

  router.get("/returns/condition-stock", requireAuth, conditionActor, conditionReader, async (req: AuthRequest, res: Response) => {
    const parsed = conditionStockListSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    try {
      res.set("Cache-Control", "no-store").json(await listConditionStock(parsed.data));
    } catch (error: unknown) {
      console.error("[condition-stock-list] Read failed", { actorId: req.user?.id, error });
      res.status(503).json({ error: "Condition stock is unavailable", code: "CONDITION_STOCK_UNAVAILABLE" });
    }
  });

  router.get("/returns/items/:itemId/condition-stock", requireAuth, conditionActor, conditionReader, async (req: AuthRequest, res: Response) => {
    const itemId = z.string().uuid().safeParse(req.params.itemId);
    const parsed = conditionStockDetailSchema.safeParse(req.query);
    if (!itemId.success || !parsed.success) {
      res.status(400).json({ error: "Invalid condition stock inspection request" });
      return;
    }
    try {
      const snapshot = await inspectConditionStock(itemId.data, parsed.data);
      if (!snapshot) { res.status(404).json({ error: "Inventory item not found" }); return; }
      res.set("Cache-Control", "no-store").json(snapshot);
    } catch (error: unknown) {
      console.error("[condition-stock-detail] Read failed", { actorId: req.user?.id, itemId: itemId.data, error });
      res.status(503).json({ error: "Condition stock history is unavailable", code: "CONDITION_STOCK_UNAVAILABLE" });
    }
  });

  router.post("/returns/items/:itemId/condition-resolutions", requireAuth, conditionActor, async (req: AuthRequest, res: Response) => {
    if (!hasPermission(req, "assets:reconcile")) {
      res.status(403).json({ error: "Forbidden: Missing inventory reconciliation privileges" });
      return;
    }
    const itemId = z.string().uuid().safeParse(req.params.itemId);
    if (!itemId.success) {
      res.status(400).json({ error: "Invalid inventory item ID" });
      return;
    }
    const parsed = resolveInventoryConditionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const input = parsed.data;
    let client: PoolClient | undefined;
    let transactionOpen = false;
    let committing = false;
    let discard = false;
    try {
      client = await pool.connect();
      // BEGIN can succeed at PostgreSQL even if its acknowledgement is lost.
      transactionOpen = true;
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '10s'");
      const itemResult = await client.query<{
        id: string; quantity: number; unavailable_damaged_quantity: number; unavailable_repair_quantity: number;
      }>(
        `SELECT id, quantity, unavailable_damaged_quantity, unavailable_repair_quantity
         FROM items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [itemId.data],
      );
      if (itemResult.rowCount === 0) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        res.status(404).json({ error: "Inventory item not found" });
        return;
      }
      const item = itemResult.rows[0];
      const sourceColumn = input.source_condition === "damaged"
        ? "unavailable_damaged_quantity"
        : "unavailable_repair_quantity";
      const { lost, damaged, repair } = calculateConditionResolutionEffect(Number(item[sourceColumn]), input);
      const resolutionResult = await client.query<{
        id: string; item_id: string; source_condition: string; outcome: string; quantity: number;
        notes: string | null; idempotency_key: string | null; created_by: string | null;
        created_by_name: string | null; created_at: string;
      }>(
        `INSERT INTO inventory_condition_resolutions
           (item_id, source_condition, outcome, quantity, notes, idempotency_key, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() AT TIME ZONE 'UTC')
         RETURNING id, item_id, source_condition, outcome, quantity, notes, idempotency_key, created_by,
           to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
           (SELECT full_name FROM users WHERE id = $7::uuid) AS created_by_name`,
        [item.id, input.source_condition, input.outcome, input.quantity, input.notes ?? null, input.idempotency_key ?? null, req.user?.id || null],
      );
      if (resolutionResult.rowCount !== 1 || resolutionResult.rows.length !== 1 || !resolutionResult.rows[0].id) {
        throw new Error("Condition resolution was not acknowledged");
      }
      const updated = await client.query(
        `UPDATE items SET unavailable_damaged_quantity = unavailable_damaged_quantity + $2,
           unavailable_repair_quantity = unavailable_repair_quantity + $3,
           quantity = quantity - $4, updated_at = NOW() WHERE id = $1`,
        [
          item.id, damaged - (input.source_condition === "damaged" ? input.quantity : 0),
          repair - (input.source_condition === "repair" ? input.quantity : 0), lost,
        ],
      );
      if (updated.rowCount !== 1) throw new Error("Condition stock update was not acknowledged");
      if (lost > 0) {
        const movement = await client.query(
          `INSERT INTO inventory_movements
             (item_id, quantity_delta, quantity_before, quantity_after, source_type, source_id, notes, created_by)
           VALUES ($1, $2, $3, $4, 'condition_resolution', $5, $6, $7)`,
          [item.id, -lost, Number(item.quantity), Number(item.quantity) - lost, resolutionResult.rows[0].id, input.notes ?? "Condition resolved as lost", req.user?.id || null],
        );
        if (movement.rowCount !== 1) throw new Error("Condition loss movement was not acknowledged");
      }
      committing = true;
      await client.query("COMMIT");
      transactionOpen = false;
      res.status(201).json({ resolved: input.quantity, outcome: input.outcome, resolution: resolutionResult.rows[0] });
    } catch (error: unknown) {
      if (client && transactionOpen) {
        try {
          await client.query("ROLLBACK");
        } catch {
          discard = true;
          console.error("[resolve-inventory-condition] Rollback failed; discarding connection", { itemId: itemId.data });
        }
      }
      if (committing) {
        discard = true;
        console.error("[resolve-inventory-condition] Commit acknowledgement failed", { itemId: itemId.data });
        res.status(503).json({
          error: "Condition resolution could not be confirmed. Verify inventory before retrying.",
          code: "CONDITION_RESOLUTION_UNCONFIRMED", outcome_uncertain: true,
        });
        return;
      }
      if (error instanceof ReturnConflictError) {
        res.status(409).json({ error: error.message });
        return;
      }
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === "23505") {
        res.status(409).json({ error: "This condition resolution was already recorded" });
        return;
      }
      if (code === "55P03" || code === "40P01") {
        res.status(409).json({ error: "Inventory is being changed. Reload and try again.", code: "CONDITION_RESOLUTION_BUSY" });
        return;
      }
      console.error("[resolve-inventory-condition] Failed", { itemId: itemId.data, code });
      res.status(500).json({ error: "Failed to resolve inventory condition" });
    } finally {
      client?.release(discard);
    }
  });

  // GET /events/returns/queue — departed allocations awaiting reconciliation,
  // grouped by event. Completed events with outstanding returns are included;
  // reserved-but-not-departed allocations never appear.
  router.get("/returns/queue", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!canManageReturns(req)) {
        res.status(403).json({ error: "Forbidden: Missing return processing privileges" });
        return;
      }
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "25"), 10) || 25));
      const offset = (page - 1) * limit;

      const baseWhere = `
        FROM events e
        JOIN event_allocations ea ON ea.event_id = e.id
          AND ea.departed_at IS NOT NULL
          AND ea.status <> 'Returned'
        WHERE e.deleted_at IS NULL`;

      const countResult = await pool.query(`SELECT COUNT(DISTINCT e.id) AS count ${baseWhere}`);
      const total = Number(countResult.rows[0]?.count || 0);

      const result = await pool.query(
        `SELECT
           e.id AS event_id,
           e.name AS event_name,
           e.client_name,
           e.start_date,
           e.end_date,
           e.status AS event_status,
           COUNT(ea.id)::int AS open_allocation_count,
           COALESCE(SUM(ea.quantity_allocated), 0)::int AS dispatched_quantity,
           COALESCE(SUM(ea.returned_good_quantity + ea.returned_damaged_quantity + ea.returned_lost_quantity + ea.returned_repair_quantity), 0)::int AS accounted_quantity,
           COALESCE(SUM(${OUTSTANDING_SQL}), 0)::int AS outstanding_quantity
         ${baseWhere}
         GROUP BY e.id
         ORDER BY e.end_date ASC, e.name ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );

      res.json({ queue: result.rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
    } catch (error: any) {
      console.error("[get-returns-queue] Error:", error?.message || error);
      res.status(500).json({ error: "Failed to load return queue" });
    }
  });

  // GET /events/:id/returns — per-allocation return detail + receipt history for one event.
  router.get("/:id/returns", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!canManageReturns(req)) {
        res.status(403).json({ error: "Forbidden: Missing return processing privileges" });
        return;
      }
      const { id } = req.params;
      const eventResult = await pool.query(
        "SELECT id, name, client_name, status, start_date, end_date FROM events WHERE id = $1 AND deleted_at IS NULL",
        [id],
      );
      if (eventResult.rowCount === 0) {
        res.status(404).json({ error: "Event not found" });
        return;
      }

      const allocationsResult = await pool.query(
        `SELECT
           ea.id, ea.item_id, ea.quantity_allocated, ea.status, ea.notes,
           ea.departed_at, ea.returned_at,
           ea.returned_good_quantity, ea.returned_damaged_quantity,
           ea.returned_lost_quantity, ea.returned_repair_quantity,
           ${OUTSTANDING_SQL} AS outstanding_quantity,
           i.name AS item_name, i.unit_of_measurement,
           s.name AS store_name,
           ru.full_name AS returned_by_name
         FROM event_allocations ea
         JOIN items i ON i.id = ea.item_id
         LEFT JOIN stores s ON s.id = i.store_id
         LEFT JOIN users ru ON ru.id = ea.returned_by
         WHERE ea.event_id = $1 AND ea.departed_at IS NOT NULL
         ORDER BY (ea.status <> 'Returned') DESC, i.name ASC`,
        [id],
      );

      const receiptsResult = await pool.query(
        `SELECT r.id, r.allocation_id, r.good_quantity, r.damaged_quantity, r.lost_quantity, r.repair_quantity,
                r.outstanding_before, r.outstanding_after, r.notes, r.created_at,
                u.full_name AS created_by_name
         FROM event_return_receipts r
         LEFT JOIN users u ON u.id = r.created_by
         WHERE r.event_id = $1
         ORDER BY r.created_at DESC
         LIMIT 500`,
        [id],
      );

      const correctionsResult = await pool.query(
        `SELECT c.*, u.full_name AS created_by_name
         FROM event_return_corrections c
         LEFT JOIN users u ON u.id = c.created_by
         WHERE c.event_id = $1
         ORDER BY c.created_at DESC
         LIMIT 500`,
        [id],
      );

      res.json({
        event: eventResult.rows[0],
        allocations: allocationsResult.rows,
        receipts: receiptsResult.rows,
        corrections: correctionsResult.rows,
      });
    } catch (error: any) {
      console.error("[get-event-returns] Error:", error?.message || error);
      res.status(500).json({ error: "Failed to load event returns" });
    }
  });

  // POST /events/:id/allocations/:allocationId/returns — record one immutable
  // return receipt and apply its inventory effects atomically.
  router.post("/:id/allocations/:allocationId/returns", requireAuth, async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      if (!canManageReturns(req)) {
        res.status(403).json({ error: "Forbidden: Missing return processing privileges" });
        return;
      }
      const { id, allocationId } = req.params;
      const validationResult = recordEventReturnSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const input = validationResult.data;
      await client.query("BEGIN");

      // BOLA: the allocation is scoped by BOTH event id and allocation id.
      // Deterministic lock order: allocation first, then item.
      const allocationResult = await client.query(
        `SELECT ea.* FROM event_allocations ea
         JOIN events e ON e.id = ea.event_id AND e.deleted_at IS NULL
         WHERE ea.id = $1 AND ea.event_id = $2
         FOR UPDATE OF ea`,
        [allocationId, id],
      );
      if (allocationResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Allocation not found for this event" });
        return;
      }
      const allocation = allocationResult.rows[0];

      if (!allocation.departed_at) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Only departed allocations can be returned" });
        return;
      }
      if (allocation.status === "Returned") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "This allocation has already been fully returned" });
        return;
      }

      const { outstandingBefore, outstandingAfter, fullyAccounted } = calculateReturnTransition({
        quantity_allocated: Number(allocation.quantity_allocated),
        good_quantity: Number(allocation.returned_good_quantity),
        damaged_quantity: Number(allocation.returned_damaged_quantity),
        lost_quantity: Number(allocation.returned_lost_quantity),
        repair_quantity: Number(allocation.returned_repair_quantity),
      }, input);

      const itemResult = await client.query(
        `SELECT id, name, quantity, unavailable_damaged_quantity, unavailable_repair_quantity
         FROM items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [allocation.item_id],
      );
      if (itemResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "The allocated inventory item no longer exists" });
        return;
      }
      const item = itemResult.rows[0];
      calculateInventoryReturnEffect(item, input);

      const receiptResult = await client.query(
        `INSERT INTO event_return_receipts
           (allocation_id, event_id, item_id, good_quantity, damaged_quantity, lost_quantity, repair_quantity,
            outstanding_before, outstanding_after, notes, idempotency_key, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          allocationId,
          id,
          allocation.item_id,
          input.good_quantity,
          input.damaged_quantity,
          input.lost_quantity,
          input.repair_quantity,
          outstandingBefore,
          outstandingAfter,
          input.notes ?? null,
          input.idempotency_key ?? null,
          req.user?.id || null,
        ],
      );
      const receipt = receiptResult.rows[0];

      // Loss leaves owned stock. Damaged and repair stock remain owned but are
      // unavailable until an audited condition resolution is recorded.
      if (input.lost_quantity > 0) {
        const quantityBefore = Number(item.quantity);
        const quantityAfter = quantityBefore - input.lost_quantity;
        await client.query(
          `INSERT INTO inventory_movements
             (item_id, quantity_delta, quantity_before, quantity_after, source_type, source_id, notes, created_by)
           VALUES ($1, $2, $3, $4, 'event_return', $5, $6, $7)`,
          [
            item.id,
            -input.lost_quantity,
            quantityBefore,
            quantityAfter,
            receipt.id,
            `Return receipt loss: ${input.lost_quantity}`,
            req.user?.id || null,
          ],
        );
      }

      if (input.lost_quantity + input.damaged_quantity + input.repair_quantity > 0) {
        await client.query(
          `UPDATE items
           SET quantity = quantity - $2,
               unavailable_damaged_quantity = unavailable_damaged_quantity + $3,
               unavailable_repair_quantity = unavailable_repair_quantity + $4,
               updated_at = NOW()
           WHERE id = $1`,
          [item.id, input.lost_quantity, input.damaged_quantity, input.repair_quantity],
        );
      }

      const updatedAllocation = await client.query(
        `UPDATE event_allocations
         SET returned_good_quantity = returned_good_quantity + $2,
             returned_damaged_quantity = returned_damaged_quantity + $3,
             returned_lost_quantity = returned_lost_quantity + $4,
             returned_repair_quantity = returned_repair_quantity + $5,
             status = CASE WHEN $6::boolean THEN 'Returned' ELSE status END,
             returned_at = CASE WHEN $6::boolean THEN NOW() ELSE returned_at END,
             returned_by = CASE WHEN $6::boolean THEN $7 ELSE returned_by END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          allocationId,
          input.good_quantity,
          input.damaged_quantity,
          input.lost_quantity,
          input.repair_quantity,
          fullyAccounted,
          req.user?.id || null,
        ],
      );

      // Event activity audit.
      await client.query(
        `INSERT INTO event_logs (event_id, user_id, field_changed, old_value, new_value)
         VALUES ($1, $2, 'inventory_return', $3, $4)`,
        [
          id,
          req.user?.id || null,
          `outstanding ${outstandingBefore}`,
          `receipt ${receipt.id}: good ${input.good_quantity}, damaged ${input.damaged_quantity}, lost ${input.lost_quantity}, repair ${input.repair_quantity}; outstanding ${outstandingAfter}${fullyAccounted ? " (returned)" : ""}`,
        ],
      );

      await client.query("COMMIT");

      // Notifications after commit — failure must not corrupt the transaction.
      try {
        const notification = buildReturnNotification(item.name, input, outstandingAfter);
        await NotificationsService.emitNotificationToRoleOrPermission({
          permissionSlug: "event_checklist:write",
          actor_id: req.user?.id,
          title: notification.title,
          message: notification.message,
          entity_type: "event",
          entity_id: id,
          action_url: `/assets/returns?event=${id}`,
          priority: notification.priority,
        });
      } catch (notifyError: any) {
        console.error("[record-event-return] Notification failed (non-fatal):", notifyError?.message || notifyError);
      }

      res.status(201).json({
        receipt,
        allocation: updatedAllocation.rows[0],
        outstanding_quantity: outstandingAfter,
        fully_returned: fullyAccounted,
      });
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error instanceof ReturnConflictError) {
        res.status(409).json({ error: error.message });
        return;
      }
      if (error?.code === "23505" && String(error?.constraint || "").includes("event_return_receipts_idem")) {
        res.status(409).json({ error: "This return was already recorded (duplicate submission)" });
        return;
      }
      if (error?.code === "23514" && String(error?.constraint || "").includes("event_allocations_return_totals")) {
        res.status(409).json({ error: "Return exceeds the dispatched quantity for this allocation" });
        return;
      }
      console.error("[record-event-return] Error:", error?.message || error);
      res.status(500).json({ error: "Failed to record the return" });
    } finally {
      client.release();
    }
  });

  // Corrections are immutable compensating deltas. The original receipt is
  // never edited, and all allocation/inventory/audit effects commit together.
  router.post("/returns/:receiptId/corrections", requireAuth, async (req: AuthRequest, res: Response) => {
    if (!hasPermission(req, "assets:reconcile")) {
      res.status(403).json({ error: "Forbidden: Missing inventory reconciliation privileges" });
      return;
    }
    const receiptId = z.string().uuid().safeParse(req.params.receiptId);
    if (!receiptId.success) {
      res.status(400).json({ error: "Invalid return receipt ID" });
      return;
    }
    const parsed = correctEventReturnSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const input = parsed.data;
    let client: PoolClient | undefined;
    let transactionOpen = false;
    let committing = false;
    let discard = false;
    try {
      client = await pool.connect();
      // A lost BEGIN reply must not return an open transaction to the pool.
      transactionOpen = true;
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '10s'");
      const receiptResult = await client.query(
        `SELECT r.*, ea.quantity_allocated, ea.status AS allocation_status, ea.returned_good_quantity, ea.returned_damaged_quantity,
                ea.returned_lost_quantity, ea.returned_repair_quantity
         FROM event_return_receipts r
         JOIN event_allocations ea ON ea.id = r.allocation_id
         JOIN events e ON e.id = r.event_id AND e.deleted_at IS NULL
         WHERE r.id = $1 FOR UPDATE OF r, ea`,
        [receiptId.data],
      );
      if (receiptResult.rowCount === 0) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        res.status(404).json({ error: "Return receipt not found" });
        return;
      }
      const receipt = receiptResult.rows[0];
      // A locking SELECT can wait with an older statement snapshot. Read the
      // immutable correction ledger only after both receipt/allocation locks.
      const correctionTotals = await client.query<{ good: number; damaged: number; lost: number; repair: number }>(
        `SELECT COALESCE(SUM(good_delta),0)::int AS good, COALESCE(SUM(damaged_delta),0)::int AS damaged,
                COALESCE(SUM(lost_delta),0)::int AS lost, COALESCE(SUM(repair_delta),0)::int AS repair
         FROM event_return_corrections WHERE receipt_id = $1`,
        [receipt.id],
      );
      if (correctionTotals.rowCount !== 1) throw new Error("Current receipt correction totals are unavailable");
      const totals = correctionTotals.rows[0];
      const correctedReceipt = {
        good: Number(receipt.good_quantity) + totals.good + input.good_delta,
        damaged: Number(receipt.damaged_quantity) + totals.damaged + input.damaged_delta,
        lost: Number(receipt.lost_quantity) + totals.lost + input.lost_delta,
        repair: Number(receipt.repair_quantity) + totals.repair + input.repair_delta,
      };
      if (Object.values(correctedReceipt).some((value) => value < 0)) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        res.status(409).json({ error: "Correction cannot make a receipt condition total negative" });
        return;
      }
      const next = {
        good: Number(receipt.returned_good_quantity) + input.good_delta,
        damaged: Number(receipt.returned_damaged_quantity) + input.damaged_delta,
        lost: Number(receipt.returned_lost_quantity) + input.lost_delta,
        repair: Number(receipt.returned_repair_quantity) + input.repair_delta,
      };
      const accountedAfter = next.good + next.damaged + next.lost + next.repair;
      if (Object.values(next).some((value) => value < 0) || accountedAfter > Number(receipt.quantity_allocated)) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        res.status(409).json({ error: "Correction would make allocation return totals invalid" });
        return;
      }
      const outstandingBefore = Number(receipt.quantity_allocated) - (
        Number(receipt.returned_good_quantity) + Number(receipt.returned_damaged_quantity) +
        Number(receipt.returned_lost_quantity) + Number(receipt.returned_repair_quantity)
      );
      const outstandingAfter = Number(receipt.quantity_allocated) - accountedAfter;
      const itemResult = await client.query(
        `SELECT id, quantity, unavailable_damaged_quantity, unavailable_repair_quantity
         FROM items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [receipt.item_id],
      );
      if (itemResult.rowCount === 0) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        res.status(409).json({ error: "The receipt inventory item no longer exists" });
        return;
      }
      const item = itemResult.rows[0];
      const quantityAfter = Number(item.quantity) - input.lost_delta;
      const damagedAfter = Number(item.unavailable_damaged_quantity) + input.damaged_delta;
      const repairAfter = Number(item.unavailable_repair_quantity) + input.repair_delta;
      if (quantityAfter < 0 || damagedAfter < 0 || repairAfter < 0 || damagedAfter + repairAfter > quantityAfter) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        res.status(409).json({ error: "Correction would make owned or unavailable inventory invalid" });
        return;
      }
      const usableBefore = Number(item.quantity) - Number(item.unavailable_damaged_quantity) - Number(item.unavailable_repair_quantity);
      const usableAfter = quantityAfter - damagedAfter - repairAfter;
      const demandDelta = outstandingAfter - (receipt.allocation_status === "Returned" ? 0 : outstandingBefore);
      if (usableAfter < usableBefore || demandDelta > 0) {
        // DreamLux reserves globally, not by event windows. Use the same ledger
        // as allocation creation/growth while holding their shared item lock.
        const capacity = await client.query<{ worsens_capacity: boolean }>(
          `SELECT GREATEST(COALESCE(SUM(quantity_allocated
             - returned_good_quantity - returned_damaged_quantity
             - returned_lost_quantity - returned_repair_quantity), 0) + $2::integer - $4::integer, 0)
           > GREATEST(COALESCE(SUM(quantity_allocated
             - returned_good_quantity - returned_damaged_quantity
             - returned_lost_quantity - returned_repair_quantity), 0) - $3::integer, 0) AS worsens_capacity
           FROM event_allocations WHERE item_id = $1 AND status <> 'Returned'`,
          [item.id, demandDelta, usableBefore, usableAfter],
        );
        if (capacity.rows.length !== 1 || typeof capacity.rows[0].worsens_capacity !== "boolean") {
          throw new Error("Correction capacity could not be confirmed");
        }
        if (capacity.rows[0].worsens_capacity) {
          await client.query("ROLLBACK");
          transactionOpen = false;
          res.status(409).json({ error: "Correction would consume stock already reserved for events" });
          return;
        }
      }
      const correctionResult = await client.query(
        `INSERT INTO event_return_corrections
           (receipt_id, allocation_id, event_id, item_id, good_delta, damaged_delta, lost_delta, repair_delta,
            outstanding_before, outstanding_after, reason, idempotency_key, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [receipt.id, receipt.allocation_id, receipt.event_id, receipt.item_id, input.good_delta, input.damaged_delta,
          input.lost_delta, input.repair_delta, outstandingBefore, outstandingAfter, input.reason,
          input.idempotency_key ?? null, req.user?.id || null],
      );
      if (correctionResult.rowCount !== 1 || correctionResult.rows.length !== 1 || !correctionResult.rows[0].id) {
        throw new Error("Return correction was not acknowledged");
      }
      const stockUpdate = await client.query(
        `UPDATE items SET quantity = $2, unavailable_damaged_quantity = $3,
           unavailable_repair_quantity = $4, updated_at = NOW() WHERE id = $1`,
        [item.id, quantityAfter, damagedAfter, repairAfter],
      );
      if (stockUpdate.rowCount !== 1) throw new Error("Corrected stock update was not acknowledged");
      if (input.lost_delta !== 0) {
        const movement = await client.query(
          `INSERT INTO inventory_movements
             (item_id, quantity_delta, quantity_before, quantity_after, source_type, source_id, notes, created_by)
           VALUES ($1,$2,$3,$4,'event_return_correction',$5,$6,$7)`,
          [item.id, -input.lost_delta, Number(item.quantity), quantityAfter, correctionResult.rows[0].id,
            input.reason, req.user?.id || null],
        );
        if (movement.rowCount !== 1) throw new Error("Correction stock movement was not acknowledged");
      }
      const allocationUpdate = await client.query(
        `UPDATE event_allocations SET returned_good_quantity=$2, returned_damaged_quantity=$3,
           returned_lost_quantity=$4, returned_repair_quantity=$5,
           status=CASE WHEN $6=0 THEN 'Returned' ELSE 'Pulled' END,
           returned_at=CASE WHEN $6=0 THEN COALESCE(returned_at,NOW()) ELSE NULL END,
           returned_by=CASE WHEN $6=0 THEN $7::uuid ELSE NULL END, updated_at=NOW() WHERE id=$1`,
        [receipt.allocation_id, next.good, next.damaged, next.lost, next.repair, outstandingAfter, req.user?.id || null],
      );
      if (allocationUpdate.rowCount !== 1) throw new Error("Corrected allocation was not acknowledged");
      const audit = await client.query(
        `INSERT INTO event_logs (event_id,user_id,field_changed,old_value,new_value)
         VALUES ($1,$2,'inventory_return_correction',$3,$4)`,
        [receipt.event_id, req.user?.id || null, `outstanding ${outstandingBefore}`,
          `correction ${correctionResult.rows[0].id}; outstanding ${outstandingAfter}; reason ${input.reason}`],
      );
      if (audit.rowCount !== 1) throw new Error("Return correction audit was not acknowledged");
      committing = true;
      await client.query("COMMIT");
      transactionOpen = false;
      res.status(201).json({ correction: correctionResult.rows[0], outstanding_quantity: outstandingAfter });
    } catch (error: unknown) {
      if (client && transactionOpen) {
        try {
          await client.query("ROLLBACK");
        } catch {
          discard = true;
          console.error("[correct-event-return] Rollback failed; discarding connection", { receiptId: receiptId.data });
        }
      }
      if (committing) {
        discard = true;
        console.error("[correct-event-return] Commit acknowledgement failed", { receiptId: receiptId.data });
        res.status(503).json({
          error: "Return correction could not be confirmed. Verify return history and inventory before retrying.",
          code: "RETURN_CORRECTION_UNCONFIRMED", outcome_uncertain: true,
        });
        return;
      }
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      const constraint = error && typeof error === "object" && "constraint" in error ? error.constraint : undefined;
      if (code === "23505" && typeof constraint === "string" && constraint.includes("corrections_idem")) {
        res.status(409).json({ error: "This correction was already recorded" });
        return;
      }
      if (code === "55P03" || code === "40P01") {
        res.status(409).json({ error: "Inventory is being changed. Reload and try again.", code: "RETURN_CORRECTION_BUSY" });
        return;
      }
      console.error("[correct-event-return] Failed", { receiptId: receiptId.data, code });
      res.status(500).json({ error: "Failed to correct the return receipt" });
    } finally {
      client?.release(discard);
    }
  });

  return router;
}
