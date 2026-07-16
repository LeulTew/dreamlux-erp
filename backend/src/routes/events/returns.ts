import { Router, Response } from "express";
import { pool } from "../../db/pool";
import { requireAuth, AuthRequest, getEffectivePermissionSlugsFromUser } from "../../middleware/auth";
import { hasPermissionSlug } from "../../lib/permissions";
import { correctEventReturnSchema, recordEventReturnSchema, resolveInventoryConditionSchema } from "../../lib/validation";
import { NotificationsService } from "../../services/notifications-service";
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

  router.post("/returns/items/:itemId/condition-resolutions", requireAuth, async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      if (!hasPermission(req, "assets:reconcile")) {
        res.status(403).json({ error: "Forbidden: Missing inventory reconciliation privileges" });
        return;
      }
      const parsed = resolveInventoryConditionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors[0].message });
        return;
      }
      const input = parsed.data;
      await client.query("BEGIN");
      const itemResult = await client.query(
        `SELECT id, quantity, unavailable_damaged_quantity, unavailable_repair_quantity
         FROM items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [req.params.itemId],
      );
      if (itemResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Inventory item not found" });
        return;
      }
      const item = itemResult.rows[0];
      const sourceColumn = input.source_condition === "damaged"
        ? "unavailable_damaged_quantity"
        : "unavailable_repair_quantity";
      const { lost, damaged, repair } = calculateConditionResolutionEffect(Number(item[sourceColumn]), input);
      const resolutionResult = await client.query(
        `INSERT INTO inventory_condition_resolutions
           (item_id, source_condition, outcome, quantity, notes, idempotency_key, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [item.id, input.source_condition, input.outcome, input.quantity, input.notes ?? null, input.idempotency_key ?? null, req.user?.id || null],
      );
      await client.query(
        `UPDATE items SET ${sourceColumn} = ${sourceColumn} - $2,
           unavailable_damaged_quantity = unavailable_damaged_quantity + $3,
           unavailable_repair_quantity = unavailable_repair_quantity + $4,
           quantity = quantity - $5, updated_at = NOW() WHERE id = $1`,
        [item.id, input.quantity, damaged, repair, lost],
      );
      if (lost > 0) {
        await client.query(
          `INSERT INTO inventory_movements
             (item_id, quantity_delta, quantity_before, quantity_after, source_type, source_id, notes, created_by)
           VALUES ($1, $2, $3, $4, 'condition_resolution', $5, $6, $7)`,
          [item.id, -lost, Number(item.quantity), Number(item.quantity) - lost, resolutionResult.rows[0].id, input.notes ?? "Condition resolved as lost", req.user?.id || null],
        );
      }
      await client.query("COMMIT");
      res.status(201).json({ resolved: input.quantity, outcome: input.outcome });
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error instanceof ReturnConflictError) {
        res.status(409).json({ error: error.message });
        return;
      }
      if (error?.code === "23505") {
        res.status(409).json({ error: "This condition resolution was already recorded" });
        return;
      }
      console.error("[resolve-inventory-condition] Error:", error?.message || error);
      res.status(500).json({ error: "Failed to resolve inventory condition" });
    } finally {
      client.release();
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
    const client = await pool.connect();
    try {
      if (!hasPermission(req, "assets:reconcile")) {
        res.status(403).json({ error: "Forbidden: Missing inventory reconciliation privileges" });
        return;
      }
      const parsed = correctEventReturnSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors[0].message });
        return;
      }
      const input = parsed.data;
      await client.query("BEGIN");
      const receiptResult = await client.query(
        `SELECT r.*, ea.quantity_allocated, ea.returned_good_quantity, ea.returned_damaged_quantity,
                ea.returned_lost_quantity, ea.returned_repair_quantity,
                COALESCE((SELECT SUM(c.good_delta) FROM event_return_corrections c WHERE c.receipt_id=r.id),0)::int AS correction_good_delta,
                COALESCE((SELECT SUM(c.damaged_delta) FROM event_return_corrections c WHERE c.receipt_id=r.id),0)::int AS correction_damaged_delta,
                COALESCE((SELECT SUM(c.lost_delta) FROM event_return_corrections c WHERE c.receipt_id=r.id),0)::int AS correction_lost_delta,
                COALESCE((SELECT SUM(c.repair_delta) FROM event_return_corrections c WHERE c.receipt_id=r.id),0)::int AS correction_repair_delta
         FROM event_return_receipts r
         JOIN event_allocations ea ON ea.id = r.allocation_id
         JOIN events e ON e.id = r.event_id AND e.deleted_at IS NULL
         WHERE r.id = $1 FOR UPDATE OF r, ea`,
        [req.params.receiptId],
      );
      if (receiptResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Return receipt not found" });
        return;
      }
      const receipt = receiptResult.rows[0];
      const correctedReceipt = {
        good: Number(receipt.good_quantity) + Number(receipt.correction_good_delta) + input.good_delta,
        damaged: Number(receipt.damaged_quantity) + Number(receipt.correction_damaged_delta) + input.damaged_delta,
        lost: Number(receipt.lost_quantity) + Number(receipt.correction_lost_delta) + input.lost_delta,
        repair: Number(receipt.repair_quantity) + Number(receipt.correction_repair_delta) + input.repair_delta,
      };
      if (Object.values(correctedReceipt).some((value) => value < 0)) {
        await client.query("ROLLBACK");
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
        res.status(409).json({ error: "The receipt inventory item no longer exists" });
        return;
      }
      const item = itemResult.rows[0];
      const quantityAfter = Number(item.quantity) - input.lost_delta;
      const damagedAfter = Number(item.unavailable_damaged_quantity) + input.damaged_delta;
      const repairAfter = Number(item.unavailable_repair_quantity) + input.repair_delta;
      if (quantityAfter < 0 || damagedAfter < 0 || repairAfter < 0 || damagedAfter + repairAfter > quantityAfter) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Correction would make owned or unavailable inventory invalid" });
        return;
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
      await client.query(
        `UPDATE items SET quantity = $2, unavailable_damaged_quantity = $3,
           unavailable_repair_quantity = $4, updated_at = NOW() WHERE id = $1`,
        [item.id, quantityAfter, damagedAfter, repairAfter],
      );
      if (input.lost_delta !== 0) {
        await client.query(
          `INSERT INTO inventory_movements
             (item_id, quantity_delta, quantity_before, quantity_after, source_type, source_id, notes, created_by)
           VALUES ($1,$2,$3,$4,'event_return_correction',$5,$6,$7)`,
          [item.id, -input.lost_delta, Number(item.quantity), quantityAfter, correctionResult.rows[0].id,
            input.reason, req.user?.id || null],
        );
      }
      await client.query(
        `UPDATE event_allocations SET returned_good_quantity=$2, returned_damaged_quantity=$3,
           returned_lost_quantity=$4, returned_repair_quantity=$5,
           status=CASE WHEN $6=0 THEN 'Returned' ELSE 'Pulled' END,
           returned_at=CASE WHEN $6=0 THEN COALESCE(returned_at,NOW()) ELSE NULL END,
           returned_by=CASE WHEN $6=0 THEN $7 ELSE NULL END, updated_at=NOW() WHERE id=$1`,
        [receipt.allocation_id, next.good, next.damaged, next.lost, next.repair, outstandingAfter, req.user?.id || null],
      );
      await client.query(
        `INSERT INTO event_logs (event_id,user_id,field_changed,old_value,new_value)
         VALUES ($1,$2,'inventory_return_correction',$3,$4)`,
        [receipt.event_id, req.user?.id || null, `outstanding ${outstandingBefore}`,
          `correction ${correctionResult.rows[0].id}; outstanding ${outstandingAfter}; reason ${input.reason}`],
      );
      await client.query("COMMIT");
      res.status(201).json({ correction: correctionResult.rows[0], outstanding_quantity: outstandingAfter });
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error?.code === "23505" && String(error?.constraint || "").includes("corrections_idem")) {
        res.status(409).json({ error: "This correction was already recorded" });
        return;
      }
      console.error("[correct-event-return] Error:", error?.message || error);
      res.status(500).json({ error: "Failed to correct the return receipt" });
    } finally {
      client.release();
    }
  });

  return router;
}
