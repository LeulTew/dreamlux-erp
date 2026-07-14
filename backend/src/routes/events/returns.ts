import { Router, Response } from "express";
import { pool } from "../../db/pool";
import { requireAuth, AuthRequest, getEffectivePermissionSlugsFromUser } from "../../middleware/auth";
import { hasPermissionSlug } from "../../lib/permissions";
import { recordEventReturnSchema } from "../../lib/validation";
import { NotificationsService } from "../../services/notifications-service";

/**
 * Issue #173 — dispatched-item return checklist and inventory reallocation.
 *
 * Invariant (documented in event_returns.sql):
 *   outstanding(allocation) = quantity_allocated - (good + damaged + lost + repair)
 *   availability            = items.quantity - SUM(outstanding) over status <> 'Returned'
 * Good returns restore availability by shrinking outstanding only; damaged /
 * lost / repair quantities additionally reduce items.quantity via one immutable
 * inventory_movements row per receipt. Receipts are append-only.
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

      res.json({
        event: eventResult.rows[0],
        allocations: allocationsResult.rows,
        receipts: receiptsResult.rows,
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
      const receiptTotal = input.good_quantity + input.damaged_quantity + input.lost_quantity + input.repair_quantity;
      const nonGoodTotal = input.damaged_quantity + input.lost_quantity + input.repair_quantity;

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

      const accounted =
        Number(allocation.returned_good_quantity) +
        Number(allocation.returned_damaged_quantity) +
        Number(allocation.returned_lost_quantity) +
        Number(allocation.returned_repair_quantity);
      const outstandingBefore = Number(allocation.quantity_allocated) - accounted;
      if (receiptTotal > outstandingBefore) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: `Return exceeds outstanding quantity (outstanding: ${outstandingBefore}, submitted: ${receiptTotal})`,
        });
        return;
      }
      const outstandingAfter = outstandingBefore - receiptTotal;

      const itemResult = await client.query(
        "SELECT id, name, quantity FROM items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [allocation.item_id],
      );
      if (itemResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "The allocated inventory item no longer exists" });
        return;
      }
      const item = itemResult.rows[0];

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

      // Damaged/lost/repair quantities leave owned-good stock, through the
      // shared immutable ledger (#172 pattern). Good quantities restore
      // availability purely by shrinking outstanding — items.quantity untouched.
      if (nonGoodTotal > 0) {
        const quantityBefore = Number(item.quantity);
        const quantityAfter = quantityBefore - nonGoodTotal;
        if (quantityAfter < 0) {
          await client.query("ROLLBACK");
          res.status(409).json({ error: "Return would drive item stock negative; run a recount first" });
          return;
        }
        await client.query(
          `INSERT INTO inventory_movements
             (item_id, quantity_delta, quantity_before, quantity_after, source_type, source_id, notes, created_by)
           VALUES ($1, $2, $3, $4, 'event_return', $5, $6, $7)`,
          [
            item.id,
            -nonGoodTotal,
            quantityBefore,
            quantityAfter,
            receipt.id,
            `Return receipt: damaged ${input.damaged_quantity}, lost ${input.lost_quantity}, repair ${input.repair_quantity}`,
            req.user?.id || null,
          ],
        );
        await client.query("UPDATE items SET quantity = $2, updated_at = NOW() WHERE id = $1", [item.id, quantityAfter]);
      }

      const fullyAccounted = outstandingAfter === 0;
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
        const hasIncident = input.damaged_quantity > 0 || input.lost_quantity > 0 || input.repair_quantity > 0;
        await NotificationsService.emitNotificationToRoleOrPermission({
          permissionSlug: "event_checklist:write",
          actor_id: req.user?.id,
          title: hasIncident ? "Return recorded with damage/loss" : "Inventory return recorded",
          message: `${item.name}: good ${input.good_quantity}, damaged ${input.damaged_quantity}, lost ${input.lost_quantity}, repair ${input.repair_quantity}. Outstanding ${outstandingAfter}.`,
          entity_type: "event",
          entity_id: id,
          action_url: `/assets/returns?event=${id}`,
          priority: hasIncident ? "high" : "normal",
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

  return router;
}
