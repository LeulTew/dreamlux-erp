import { Router, Response } from "express";
import { pool } from "../db/pool";
import { requireAdmin, AuthRequest } from "../middleware/auth";
import {
  createEventSchema,
  updateEventSchema,
  updateEventDesignSchema,
  createEventAllocationSchema,
  createEventChecklistItemSchema,
  updateEventChecklistItemSchema,
  createEventAssignmentSchema,
  createVehicleAssignmentSchema,
  createEventExpenseSchema,
  reviewEventExpenseSchema,
  createTripLogSchema,
} from "../lib/validation";


const router = Router();

// Helper to check if user has permission to edit completed events or transition backward
function canOverrideCompleted(role?: string): boolean {
  if (!role) return false;
  const allowed = ["SUPER_ADMIN", "ADMIN", "OWNER", "ACCOUNTANT"];
  return allowed.includes(role.toUpperCase());
}

function canWriteExpenses(role?: string): boolean {
  if (!role) return false;
  const allowed = ["SUPER_ADMIN", "ADMIN", "OWNER", "OPS_MANAGER", "EVENT_MANAGER", "ACCOUNTANT", "DRIVER"];
  return allowed.includes(role.toUpperCase());
}

function canApproveExpenses(role?: string): boolean {
  if (!role) return false;
  const allowed = ["SUPER_ADMIN", "ADMIN", "OWNER", "ACCOUNTANT"];
  return allowed.includes(role.toUpperCase());
}

// GET /events - List events (filtered, paginated)
router.get("/", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
    const limit = Math.max(1, parseInt(req.query.limit as string || "20", 10));
    const offset = (page - 1) * limit;

    const { status, start_date, end_date, search } = req.query;

    const conditions: string[] = ["e.deleted_at IS NULL"];
    const params: any[] = [];

    if (status) {
      params.push(status);
      conditions.push(`e.status = $${params.length}`);
    }

    if (start_date) {
      params.push(start_date);
      conditions.push(`e.start_date >= $${params.length}`);
    }

    if (end_date) {
      params.push(end_date);
      conditions.push(`e.end_date <= $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(e.name ILIKE $${params.length} OR e.client_name ILIKE $${params.length} OR e.venue_location ILIKE $${params.length})`
      );
    }

    const whereClause = conditions.join(" AND ");

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM events e WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated data
    const queryParams = [...params];
    queryParams.push(limit);
    const limitParam = `$${queryParams.length}`;
    queryParams.push(offset);
    const offsetParam = `$${queryParams.length}`;

    const dataQuery = `
      SELECT e.*, et.name as event_type_name
      FROM events e
      LEFT JOIN event_types et ON e.event_type_id = et.id
      WHERE ${whereClause}
      ORDER BY e.start_date ASC, e.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const dataResult = await pool.query(dataQuery, queryParams);

    res.json({
      events: dataResult.rows,
      total,
      page,
      limit,
    });
  } catch (error: any) {
    console.error("[get-events] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /events/expenses/pending - accountant approval queue
router.get("/expenses/pending", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if (!canApproveExpenses(req.user?.role)) {
      res.status(403).json({ error: "Forbidden: Missing expense approval permission" });
      return;
    }

    const result = await pool.query(`
      SELECT
        exp.*,
        e.name AS event_name,
        e.client_name,
        e.venue_location,
        submitter.full_name AS submitted_by_name
      FROM expenses exp
      JOIN events e ON exp.event_id = e.id
      LEFT JOIN users submitter ON exp.created_by = submitter.id
      WHERE exp.status = 'Pending' AND e.deleted_at IS NULL
      ORDER BY exp.created_at ASC
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error("[get-pending-expenses] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// PATCH /events/expenses/:expenseId/review - approve/reject pending expense
router.patch("/expenses/:expenseId/review", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { expenseId } = req.params;
    if (!canApproveExpenses(req.user?.role)) {
      res.status(403).json({ error: "Forbidden: Missing expense approval permission" });
      return;
    }

    const validationResult = reviewEventExpenseSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const existingResult = await pool.query("SELECT * FROM expenses WHERE id = $1", [expenseId]);
    if (existingResult.rowCount === 0) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    if (existingResult.rows[0].status === "Approved") {
      res.status(409).json({ error: "Approved expenses are locked" });
      return;
    }

    const { status, rejected_reason } = validationResult.data;
    const result = await pool.query(
      `
        UPDATE expenses
        SET status = $1,
            rejected_reason = $2,
            approved_by = $3,
            approved_at = NOW()
        WHERE id = $4
        RETURNING *
      `,
      [status, status === "Rejected" ? rejected_reason : null, req.user?.id || null, expenseId]
    );

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error("[patch-expense-review] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /events/:id - Get specific event with history logs
router.get("/:id", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const eventQuery = `
      SELECT e.*, et.name as event_type_name, u.full_name as created_by_name
      FROM events e
      LEFT JOIN event_types et ON e.event_type_id = et.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = $1 AND e.deleted_at IS NULL
    `;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];

    const logsQuery = `
      SELECT el.*, u.full_name as user_full_name, u.username as user_username
      FROM event_logs el
      LEFT JOIN users u ON el.user_id = u.id
      WHERE el.event_id = $1
      ORDER BY el.changed_at DESC
    `;
    const logsResult = await pool.query(logsQuery, [id]);

    res.json({
      event,
      logs: logsResult.rows,
    });
  } catch (error: any) {
    console.error("[get-event-by-id] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events - Create a new event
router.post("/", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const validationResult = createEventSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const {
      name,
      client_name,
      client_phone,
      event_type_id,
      start_date,
      end_date,
      start_time,
      end_time,
      venue_location,
      contract_price,
    } = validationResult.data;

    const insertQuery = `
      INSERT INTO events (
        name, client_name, client_phone, event_type_id,
        start_date, end_date, start_time, end_time,
        venue_location, contract_price, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Planned', $11)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      name,
      client_name,
      client_phone || null,
      event_type_id || null,
      start_date,
      end_date,
      start_time || null,
      end_time || null,
      venue_location,
      contract_price,
      req.user?.id || null,
    ]);

    res.status(201).json({ event: result.rows[0] });
  } catch (error: any) {
    console.error("[create-event] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// PUT /events/:id - Update event details & status transitions
router.put("/:id", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch existing event
    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const currentEvent = eventResult.rows[0];

    // Auth validation: Completed event locking
    const isOverrideAuthorized = canOverrideCompleted(req.user?.role);
    if (currentEvent.status === "Completed" && !isOverrideAuthorized) {
      res.status(403).json({
        error: "Completed events cannot be edited except by administrators or accountants",
      });
      return;
    }

    // Validate request body
    const validationResult = updateEventSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const updateData = validationResult.data;

    // Status transition validation
    if (updateData.status && updateData.status !== currentEvent.status) {
      const current = currentEvent.status;
      const target = updateData.status;

      // Planned -> Ongoing -> Completed
      if (current === "Planned" && target === "Completed" && !isOverrideAuthorized) {
        // Allowing Planned -> Completed directly for admins/accountants but optionally warn or restrict for Event Managers?
        // Actually, Planned -> Completed is generally fine, let's allow it but warn.
      }

      if (current === "Ongoing" && target === "Planned" && !isOverrideAuthorized) {
        res.status(400).json({
          error: "Cannot transition event status from Ongoing back to Planned",
        });
        return;
      }

      if (current === "Completed" && target !== "Completed" && !isOverrideAuthorized) {
        res.status(403).json({
          error: "Completed status cannot be changed except by administrators or accountants",
        });
        return;
      }
    }

    // Identify changed fields and insert into event_logs
    const fieldsToTrack = [
      "name",
      "client_name",
      "client_phone",
      "event_type_id",
      "start_date",
      "end_date",
      "start_time",
      "end_time",
      "venue_location",
      "contract_price",
      "status",
    ];

    const logPromises: Promise<any>[] = [];

    // Helper to format values for event log comparison
    const formatForLog = (field: string, val: any): string => {
      if (val === null || val === undefined) return "";
      if (val instanceof Date) {
        return val.toISOString().split("T")[0]; // YYYY-MM-DD
      }
      if (field === "start_date" || field === "end_date") {
        // Date objects from pg driver are Dates, but update input is string
        const d = new Date(val);
        return isNaN(d.getTime()) ? String(val) : d.toISOString().split("T")[0];
      }
      if (field === "contract_price") {
        return Number(val).toFixed(2);
      }
      return String(val);
    };

    for (const field of fieldsToTrack) {
      if (updateData[field as keyof typeof updateData] !== undefined) {
        const oldValue = formatForLog(field, currentEvent[field]);
        const newValue = formatForLog(field, updateData[field as keyof typeof updateData]);

        if (oldValue !== newValue) {
          const logInsert = `
            INSERT INTO event_logs (event_id, user_id, field_changed, old_value, new_value)
            VALUES ($1, $2, $3, $4, $5)
          `;
          logPromises.push(
            pool.query(logInsert, [
              id,
              req.user?.id || null,
              field,
              oldValue || null,
              newValue || null,
            ])
          );
        }
      }
    }

    await Promise.all(logPromises);

    // Build dynamic update query
    const setClauses: string[] = [];
    const updateParams: any[] = [];

    for (const [key, val] of Object.entries(updateData)) {
      if (val !== undefined) {
        updateParams.push(val);
        setClauses.push(`${key} = $${updateParams.length}`);
      }
    }

    if (setClauses.length > 0) {
      updateParams.push(id);
      const idPlaceholder = `$${updateParams.length}`;
      const updateQuery = `
        UPDATE events
        SET ${setClauses.join(", ")}, updated_at = NOW()
        WHERE id = ${idPlaceholder}
        RETURNING *
      `;
      const result = await pool.query(updateQuery, updateParams);
      res.json({ event: result.rows[0] });
    } else {
      res.json({ event: currentEvent });
    }
  } catch (error: any) {
    console.error("[update-event] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// DELETE /events/:id - Soft delete event
router.delete("/:id", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE events SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("[delete-event] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /events/:id/workspace - Get event operational workspace data
router.get("/:id/workspace", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const eventQuery = `
      SELECT e.*, et.name as event_type_name, u.full_name as created_by_name
      FROM events e
      LEFT JOIN event_types et ON e.event_type_id = et.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = $1 AND e.deleted_at IS NULL
    `;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];

    const allocationsQuery = `
      SELECT
        ea.id,
        ea.event_id,
        ea.item_id,
        ea.quantity_allocated,
        ea.status,
        ea.notes,
        ea.created_by,
        ea.created_at,
        ea.updated_at,
        i.name AS item_name,
        i.description AS item_description,
        i.image_key,
        s.name AS store_name,
        COALESCE(
          i.quantity - (
            SELECT COALESCE(SUM(quantity_allocated), 0)
            FROM event_allocations
            WHERE item_id = ea.item_id AND status != 'Returned'
          ),
          0
        ) AS available_quantity
      FROM event_allocations ea
      JOIN items i ON ea.item_id = i.id
      LEFT JOIN stores s ON i.store_id = s.id
      WHERE ea.event_id = $1
    `;
    const allocationsResult = await pool.query(allocationsQuery, [id]);

    const checklistQuery = `
      SELECT * FROM event_checklist
      WHERE event_id = $1
      ORDER BY created_at ASC
    `;
    const checklistResult = await pool.query(checklistQuery, [id]);

    const assignmentsQuery = `
      SELECT ea.*, emp.full_name as employee_name, emp.phone as employee_phone
      FROM event_assignments ea
      JOIN employees emp ON ea.employee_id = emp.id
      WHERE ea.event_id = $1
    `;
    const assignmentsResult = await pool.query(assignmentsQuery, [id]);

    const vehicleAssignmentsQuery = `
      SELECT va.*, v.plate_number, v.vehicle_type, v.fuel_type, v.fuel_consumption_rate, emp.full_name as driver_name
      FROM vehicle_assignments va
      JOIN vehicles v ON va.vehicle_id = v.id
      LEFT JOIN employees emp ON va.driver_id = emp.id
      WHERE va.event_id = $1
    `;
    const vehicleAssignmentsResult = await pool.query(vehicleAssignmentsQuery, [id]);

    const expensesQuery = `
      SELECT exp.*, submitter.full_name AS submitted_by_name, approver.full_name AS approved_by_name
      FROM expenses exp
      LEFT JOIN users submitter ON exp.created_by = submitter.id
      LEFT JOIN users approver ON exp.approved_by = approver.id
      WHERE exp.event_id = $1
      ORDER BY exp.created_at DESC
    `;
    const expensesResult = await pool.query(expensesQuery, [id]);

    const tripsQuery = `
      SELECT
        t.*,
        va.event_id,
        va.vehicle_id,
        v.plate_number,
        v.vehicle_type,
        v.fuel_type,
        v.fuel_consumption_rate,
        emp.full_name AS driver_name
      FROM trips t
      JOIN vehicle_assignments va ON t.vehicle_assignment_id = va.id
      JOIN vehicles v ON va.vehicle_id = v.id
      LEFT JOIN employees emp ON va.driver_id = emp.id
      WHERE va.event_id = $1
      ORDER BY t.created_at DESC
    `;
    const tripsResult = await pool.query(tripsQuery, [id]);

    res.json({
      event,
      allocations: allocationsResult.rows,
      checklist: checklistResult.rows,
      assignments: assignmentsResult.rows,
      vehicleAssignments: vehicleAssignmentsResult.rows,
      expenses: expensesResult.rows,
      trips: tripsResult.rows,
    });
  } catch (error: any) {
    console.error("[get-event-workspace] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// PATCH /events/:id/design - Update package design details
router.patch("/:id/design", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const currentEvent = eventResult.rows[0];

    const isOverrideAuthorized = canOverrideCompleted(req.user?.role);
    if (currentEvent.status === "Completed" && !isOverrideAuthorized) {
      res.status(403).json({
        error: "Completed events cannot be edited except by administrators or accountants",
      });
      return;
    }

    const validationResult = updateEventDesignSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { package_design_notes, estimated_design_cost } = validationResult.data;

    const logPromises: Promise<any>[] = [];
    if (package_design_notes !== undefined && package_design_notes !== currentEvent.package_design_notes) {
      logPromises.push(
        pool.query(
          `INSERT INTO event_logs (event_id, user_id, field_changed, old_value, new_value) VALUES ($1, $2, $3, $4, $5)`,
          [id, req.user?.id || null, "package_design_notes", currentEvent.package_design_notes, package_design_notes]
        )
      );
    }
    if (estimated_design_cost !== undefined && Number(estimated_design_cost) !== Number(currentEvent.estimated_design_cost || 0)) {
      logPromises.push(
        pool.query(
          `INSERT INTO event_logs (event_id, user_id, field_changed, old_value, new_value) VALUES ($1, $2, $3, $4, $5)`,
          [id, req.user?.id || null, "estimated_design_cost", currentEvent.estimated_design_cost ? String(currentEvent.estimated_design_cost) : "0", String(estimated_design_cost)]
        )
      );
    }
    await Promise.all(logPromises);

    const setClauses: string[] = [];
    const updateParams: any[] = [];

    if (package_design_notes !== undefined) {
      updateParams.push(package_design_notes);
      setClauses.push(`package_design_notes = $${updateParams.length}`);
    }

    if (estimated_design_cost !== undefined) {
      updateParams.push(estimated_design_cost);
      setClauses.push(`estimated_design_cost = $${updateParams.length}`);
    }

    if (setClauses.length > 0) {
      updateParams.push(id);
      const updateQuery = `
        UPDATE events
        SET ${setClauses.join(", ")}, updated_at = NOW()
        WHERE id = $${updateParams.length}
        RETURNING *
      `;
      const result = await pool.query(updateQuery, updateParams);
      res.json({ event: result.rows[0] });
    } else {
      res.json({ event: currentEvent });
    }
  } catch (error: any) {
    console.error("[patch-event-design] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/:id/allocations - Allocate a store item to the event
router.post("/:id/allocations", requireAdmin, async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await client.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const currentEvent = eventResult.rows[0];

    const isOverrideAuthorized = canOverrideCompleted(req.user?.role);
    if (currentEvent.status === "Completed" && !isOverrideAuthorized) {
      res.status(403).json({
        error: "Completed events cannot be edited except by administrators or accountants",
      });
      return;
    }

    const validationResult = createEventAllocationSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { item_id, quantity_allocated, notes } = validationResult.data;

    await client.query("BEGIN");

    const itemQuery = `SELECT * FROM items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`;
    const itemResult = await client.query(itemQuery, [item_id]);

    if (itemResult.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Inventory item not found" });
      return;
    }

    const item = itemResult.rows[0];

    const activeAllocationsQuery = `
      SELECT COALESCE(SUM(quantity_allocated), 0) as total_allocated
      FROM event_allocations
      WHERE item_id = $1 AND status != 'Returned'
    `;
    const activeAllocationsResult = await client.query(activeAllocationsQuery, [item_id]);
    const totalAllocated = parseInt(activeAllocationsResult.rows[0].total_allocated, 10);

    const availableQuantity = item.quantity - totalAllocated;

    if (quantity_allocated > availableQuantity) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Requested quantity exceeds available stock" });
      return;
    }

    const insertAllocationQuery = `
      INSERT INTO event_allocations (event_id, item_id, quantity_allocated, status, notes, created_by)
      VALUES ($1, $2, $3, 'Reserved', $4, $5)
      RETURNING *
    `;
    const allocationResult = await client.query(insertAllocationQuery, [
      id,
      item_id,
      quantity_allocated,
      notes || null,
      req.user?.id || null,
    ]);

    await client.query("COMMIT");
    res.status(201).json(allocationResult.rows[0]);
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[post-event-allocation] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  } finally {
    client.release();
  }
});

// DELETE /events/:id/allocations/:allocationId - Release/delete allocated inventory item
router.delete("/:id/allocations/:allocationId", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id, allocationId } = req.params;

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const currentEvent = eventResult.rows[0];

    const isOverrideAuthorized = canOverrideCompleted(req.user?.role);
    if (currentEvent.status === "Completed" && !isOverrideAuthorized) {
      res.status(403).json({
        error: "Completed events cannot be edited except by administrators or accountants",
      });
      return;
    }

    const deleteQuery = `
      DELETE FROM event_allocations
      WHERE id = $1 AND event_id = $2
      RETURNING *
    `;
    const result = await pool.query(deleteQuery, [allocationId, id]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Allocation not found" });
      return;
    }

    res.json({ success: true, allocation: result.rows[0] });
  } catch (error: any) {
    console.error("[delete-event-allocation] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/:id/checklist - Create a new checklist task item
router.post("/:id/checklist", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const validationResult = createEventChecklistItemSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { title, due_date, owner_name } = validationResult.data;

    const insertQuery = `
      INSERT INTO event_checklist (event_id, title, status, due_date, owner_name, created_by)
      VALUES ($1, $2, 'Todo', $3, $4, $5)
      RETURNING *
    `;
    const result = await pool.query(insertQuery, [
      id,
      title,
      due_date || null,
      owner_name || null,
      req.user?.id || null,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("[post-event-checklist] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// PATCH /events/:id/checklist/:itemId - Update checklist item details or status
router.patch("/:id/checklist/:itemId", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id, itemId } = req.params;

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const validationResult = updateEventChecklistItemSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const updateData = validationResult.data;

    const setClauses: string[] = [];
    const updateParams: any[] = [];

    for (const [key, val] of Object.entries(updateData)) {
      if (val !== undefined) {
        updateParams.push(val);
        setClauses.push(`${key} = $${updateParams.length}`);
      }
    }

    if (setClauses.length > 0) {
      updateParams.push(itemId);
      const itemIdPlaceholder = `$${updateParams.length}`;
      updateParams.push(id);
      const eventIdPlaceholder = `$${updateParams.length}`;

      const updateQuery = `
        UPDATE event_checklist
        SET ${setClauses.join(", ")}, updated_at = NOW()
        WHERE id = ${itemIdPlaceholder} AND event_id = ${eventIdPlaceholder}
        RETURNING *
      `;
      const result = await pool.query(updateQuery, updateParams);

      if (result.rowCount === 0) {
        res.status(404).json({ error: "Checklist item not found" });
        return;
      }

      res.json(result.rows[0]);
    } else {
      const checklistQuery = `SELECT * FROM event_checklist WHERE id = $1 AND event_id = $2`;
      const checklistResult = await pool.query(checklistQuery, [itemId, id]);
      if (checklistResult.rowCount === 0) {
        res.status(404).json({ error: "Checklist item not found" });
        return;
      }
      res.json(checklistResult.rows[0]);
    }
  } catch (error: any) {
    console.error("[patch-event-checklist] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Helper functions for scheduling conflict checks
async function hasEmployeeConflict(employeeId: string, eventId: string, startDate: string, endDate: string): Promise<boolean> {
  const teamConflictQuery = `
    SELECT COUNT(*) FROM event_assignments ea
    JOIN events e ON ea.event_id = e.id
    WHERE ea.employee_id = $1
      AND e.deleted_at IS NULL
      AND e.id != $2
      AND e.start_date <= $3
      AND e.end_date >= $4
  `;
  const teamResult = await pool.query(teamConflictQuery, [employeeId, eventId, endDate, startDate]);
  if (parseInt(teamResult.rows[0].count, 10) > 0) return true;

  const driverConflictQuery = `
    SELECT COUNT(*) FROM vehicle_assignments va
    JOIN events e ON va.event_id = e.id
    WHERE va.driver_id = $1
      AND e.deleted_at IS NULL
      AND e.id != $2
      AND e.start_date <= $3
      AND e.end_date >= $4
  `;
  const driverResult = await pool.query(driverConflictQuery, [employeeId, eventId, endDate, startDate]);
  return parseInt(driverResult.rows[0].count, 10) > 0;
}

async function hasVehicleConflict(vehicleId: string, eventId: string, startDate: string, endDate: string): Promise<boolean> {
  const vehicleConflictQuery = `
    SELECT COUNT(*) FROM vehicle_assignments va
    JOIN events e ON va.event_id = e.id
    WHERE va.vehicle_id = $1
      AND e.deleted_at IS NULL
      AND e.id != $2
      AND e.start_date <= $3
      AND e.end_date >= $4
  `;
  const result = await pool.query(vehicleConflictQuery, [vehicleId, eventId, endDate, startDate]);
  return parseInt(result.rows[0].count, 10) > 0;
}

// GET /events/:id/assignments/available-employees - List employees available for this event's dates
router.get("/:id/assignments/available-employees", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const { start_date, end_date } = eventResult.rows[0];

    const availableEmployeesQuery = `
      SELECT emp.*, SL.level_name as salary_level_name
      FROM employees emp
      LEFT JOIN salary_levels SL ON emp.salary_level_id = SL.id
      WHERE emp.deleted_at IS NULL
        AND emp.id NOT IN (
          SELECT DISTINCT ea.employee_id FROM event_assignments ea
          JOIN events e ON ea.event_id = e.id
          WHERE e.deleted_at IS NULL AND e.id != $1 AND e.start_date <= $2 AND e.end_date >= $3
        )
        AND emp.id NOT IN (
          SELECT DISTINCT va.driver_id FROM vehicle_assignments va
          JOIN events e ON va.event_id = e.id
          WHERE e.deleted_at IS NULL AND va.driver_id IS NOT NULL AND e.id != $1 AND e.start_date <= $2 AND e.end_date >= $3
        )
      ORDER BY emp.full_name ASC
    `;
    const result = await pool.query(availableEmployeesQuery, [id, end_date, start_date]);
    res.json(result.rows);
  } catch (error: any) {
    console.error("[get-available-employees] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /events/:id/assignments/available-vehicles - List vehicles available for this event's dates
router.get("/:id/assignments/available-vehicles", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const { start_date, end_date } = eventResult.rows[0];

    const availableVehiclesQuery = `
      SELECT v.* FROM vehicles v
      WHERE v.deleted_at IS NULL AND v.is_active = TRUE
        AND v.id NOT IN (
          SELECT DISTINCT va.vehicle_id FROM vehicle_assignments va
          JOIN events e ON va.event_id = e.id
          WHERE e.deleted_at IS NULL AND e.id != $1 AND e.start_date <= $2 AND e.end_date >= $3
        )
      ORDER BY v.plate_number ASC
    `;
    const result = await pool.query(availableVehiclesQuery, [id, end_date, start_date]);
    res.json(result.rows);
  } catch (error: any) {
    console.error("[get-available-vehicles] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/:id/assignments/employees - Assign an employee
router.post("/:id/assignments/employees", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role?.toUpperCase();

    // Check permissions (Owner, Ops Manager, Event Manager)
    if (userRole !== "OWNER" && userRole !== "OPS_MANAGER" && userRole !== "EVENT_MANAGER" && userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      res.status(403).json({ error: "Forbidden: Insufficient assignment privileges" });
      return;
    }

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];

    // Enforce completed-event locking
    if (event.status === "Completed" && !canOverrideCompleted(req.user?.role)) {
      res.status(400).json({
        error: "Completed event assignments cannot be modified except by administrators or accountants",
      });
      return;
    }

    const validationResult = createEventAssignmentSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { employee_id, role, commission_amount, attended } = validationResult.data;

    // Check for scheduling conflict
    const conflict = await hasEmployeeConflict(employee_id, id, event.start_date, event.end_date);
    if (conflict) {
      res.status(400).json({
        error: "Scheduling Conflict: This employee is already assigned to another event on these dates.",
      });
      return;
    }

    const insertQuery = `
      INSERT INTO event_assignments (event_id, employee_id, role, commission_amount, attended)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (event_id, employee_id) DO UPDATE
      SET role = EXCLUDED.role, commission_amount = EXCLUDED.commission_amount, attended = EXCLUDED.attended
      RETURNING *
    `;
    const result = await pool.query(insertQuery, [
      id,
      employee_id,
      role,
      commission_amount,
      attended,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("[post-employee-assignment] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// DELETE /events/:id/assignments/employees/:employeeId - Remove employee assignment
router.delete("/:id/assignments/employees/:employeeId", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id, employeeId } = req.params;
    const userRole = req.user?.role?.toUpperCase();

    // Check permissions
    if (userRole !== "OWNER" && userRole !== "OPS_MANAGER" && userRole !== "EVENT_MANAGER" && userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      res.status(403).json({ error: "Forbidden: Insufficient assignment privileges" });
      return;
    }

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];

    // Enforce completed-event locking
    if (event.status === "Completed" && !canOverrideCompleted(req.user?.role)) {
      res.status(400).json({
        error: "Completed event assignments cannot be modified except by administrators or accountants",
      });
      return;
    }

    const deleteQuery = `
      DELETE FROM event_assignments
      WHERE event_id = $1 AND employee_id = $2
      RETURNING *
    `;
    const result = await pool.query(deleteQuery, [id, employeeId]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    res.json({ message: "Employee assignment removed successfully" });
  } catch (error: any) {
    console.error("[delete-employee-assignment] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/:id/assignments/vehicles - Assign a vehicle and optional driver
router.post("/:id/assignments/vehicles", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role?.toUpperCase();

    // Check permissions
    if (userRole !== "OWNER" && userRole !== "OPS_MANAGER" && userRole !== "EVENT_MANAGER" && userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      res.status(403).json({ error: "Forbidden: Insufficient assignment privileges" });
      return;
    }

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];

    // Enforce completed-event locking
    if (event.status === "Completed" && !canOverrideCompleted(req.user?.role)) {
      res.status(400).json({
        error: "Completed event assignments cannot be modified except by administrators or accountants",
      });
      return;
    }

    const validationResult = createVehicleAssignmentSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { vehicle_id, driver_id, is_night_shift } = validationResult.data;

    // Check for vehicle scheduling conflict
    const vehicleConflict = await hasVehicleConflict(vehicle_id, id, event.start_date, event.end_date);
    if (vehicleConflict) {
      res.status(400).json({
        error: "Scheduling Conflict: This vehicle is already assigned to another event on these dates.",
      });
      return;
    }

    // Check for driver scheduling conflict (if driver is provided)
    if (driver_id) {
      const driverConflict = await hasEmployeeConflict(driver_id, id, event.start_date, event.end_date);
      if (driverConflict) {
        res.status(400).json({
          error: "Scheduling Conflict: This driver is already assigned to another event on these dates.",
        });
        return;
      }
    }

    const insertQuery = `
      INSERT INTO vehicle_assignments (event_id, vehicle_id, driver_id, is_night_shift)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (event_id, vehicle_id) DO UPDATE
      SET driver_id = EXCLUDED.driver_id, is_night_shift = EXCLUDED.is_night_shift
      RETURNING *
    `;
    const result = await pool.query(insertQuery, [
      id,
      vehicle_id,
      driver_id || null,
      is_night_shift,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("[post-vehicle-assignment] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// DELETE /events/:id/assignments/vehicles/:vehicleId - Remove vehicle assignment
router.delete("/:id/assignments/vehicles/:vehicleId", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id, vehicleId } = req.params;
    const userRole = req.user?.role?.toUpperCase();

    // Check permissions
    if (userRole !== "OWNER" && userRole !== "OPS_MANAGER" && userRole !== "EVENT_MANAGER" && userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      res.status(403).json({ error: "Forbidden: Insufficient privileges" });
      return;
    }

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];

    // Enforce completed-event locking
    if (event.status === "Completed" && !canOverrideCompleted(req.user?.role)) {
      res.status(400).json({
        error: "Completed event assignments cannot be modified except by administrators or accountants",
      });
      return;
    }

    const deleteQuery = `
      DELETE FROM vehicle_assignments
      WHERE event_id = $1 AND vehicle_id = $2
      RETURNING *
    `;
    const result = await pool.query(deleteQuery, [id, vehicleId]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    res.json({ message: "Vehicle assignment removed successfully" });
  } catch (error: any) {
    console.error("[delete-vehicle-assignment] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// PATCH /events/:id/assignments/employees/:employeeId/attendance - Toggle attendance
router.patch("/:id/assignments/employees/:employeeId/attendance", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id, employeeId } = req.params;
    const userRole = req.user?.role?.toUpperCase();

    // Check permissions
    if (userRole !== "OWNER" && userRole !== "OPS_MANAGER" && userRole !== "EVENT_MANAGER" && userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      res.status(403).json({ error: "Forbidden: Insufficient privileges" });
      return;
    }

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];

    // Enforce completed-event locking
    if (event.status === "Completed" && !canOverrideCompleted(req.user?.role)) {
      res.status(400).json({
        error: "Completed event assignments cannot be modified except by administrators or accountants",
      });
      return;
    }

    const { attended } = req.body;
    if (attended === undefined) {
      res.status(400).json({ error: "Attended field is required" });
      return;
    }

    const updateQuery = `
      UPDATE event_assignments
      SET attended = $1
      WHERE event_id = $2 AND employee_id = $3
      RETURNING *
    `;
    const result = await pool.query(updateQuery, [attended, id, employeeId]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error("[patch-employee-attendance] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/:id/expenses - submit a pending event expense
router.post("/:id/expenses", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!canWriteExpenses(req.user?.role)) {
      res.status(403).json({ error: "Forbidden: Missing expense write permission" });
      return;
    }

    const eventResult = await pool.query("SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL", [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];
    if (event.status === "Completed" && !canOverrideCompleted(req.user?.role)) {
      res.status(403).json({ error: "Completed event expenses cannot be changed except by administrators or accountants" });
      return;
    }

    const validationResult = createEventExpenseSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { category, amount, description, receipt_image_key } = validationResult.data;
    const result = await pool.query(
      `
        INSERT INTO expenses (event_id, category, amount, description, receipt_image_key, status, created_by)
        VALUES ($1, $2, $3, $4, $5, 'Pending', $6)
        RETURNING *
      `,
      [id, category, amount, description, receipt_image_key || null, req.user?.id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("[post-event-expense] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/:id/trips - log trip and generate pending fuel expense
router.post("/:id/trips", requireAdmin, async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    if (!canWriteExpenses(req.user?.role)) {
      res.status(403).json({ error: "Forbidden: Missing expense write permission" });
      return;
    }

    const validationResult = createTripLogSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { vehicle_assignment_id, destination, distance_km, fuel_price_etb } = validationResult.data;
    await client.query("BEGIN");

    const assignmentResult = await client.query(
      `
        SELECT va.*, v.plate_number, v.vehicle_type, v.fuel_consumption_rate, e.status AS event_status
        FROM vehicle_assignments va
        JOIN vehicles v ON va.vehicle_id = v.id
        JOIN events e ON va.event_id = e.id
        WHERE va.id = $1 AND va.event_id = $2 AND e.deleted_at IS NULL
      `,
      [vehicle_assignment_id, id]
    );

    if (assignmentResult.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Vehicle assignment not found for this event" });
      return;
    }

    const assignment = assignmentResult.rows[0];
    if (assignment.event_status === "Completed" && !canOverrideCompleted(req.user?.role)) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Completed event trips cannot be changed except by administrators or accountants" });
      return;
    }

    const fuelLitersUsed = Number((Number(distance_km) * Number(assignment.fuel_consumption_rate)).toFixed(2));
    const fuelCostEtb = Number((fuelLitersUsed * Number(fuel_price_etb)).toFixed(2));

    const tripResult = await client.query(
      `
        INSERT INTO trips (vehicle_assignment_id, destination, distance_km, fuel_liters_used, fuel_cost_etb)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [vehicle_assignment_id, destination, distance_km, fuelLitersUsed, fuelCostEtb]
    );

    const description = `Fuel for ${destination} (${distance_km} km, ${assignment.fuel_consumption_rate} L/km, ${fuel_price_etb} ETB/L)`;
    const expenseResult = await client.query(
      `
        INSERT INTO expenses (event_id, category, amount, description, status, created_by)
        VALUES ($1, 'Fuel', $2, $3, 'Pending', $4)
        RETURNING *
      `,
      [id, fuelCostEtb, description, req.user?.id || null]
    );

    await client.query("COMMIT");
    res.status(201).json({
      trip: tripResult.rows[0],
      expense: expenseResult.rows[0],
      fuel_liters_used: fuelLitersUsed,
      fuel_cost_etb: fuelCostEtb,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[post-event-trip] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  } finally {
    client.release();
  }
});

// POST /events/:id/expenses/generate-labor - create pending labor expense from assignments
router.post("/:id/expenses/generate-labor", requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!canWriteExpenses(req.user?.role)) {
      res.status(403).json({ error: "Forbidden: Missing expense write permission" });
      return;
    }

    const eventResult = await pool.query("SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL", [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (eventResult.rows[0].status !== "Completed") {
      res.status(400).json({ error: "Labor expense can only be generated after event completion" });
      return;
    }

    const assignmentResult = await pool.query(
      "SELECT COALESCE(SUM(commission_amount), 0) AS total FROM event_assignments WHERE event_id = $1 AND attended = true",
      [id]
    );
    const laborTotal = Number(assignmentResult.rows[0]?.total || 0);
    if (laborTotal <= 0) {
      res.status(400).json({ error: "No attended labor assignments found for this event" });
      return;
    }

    const existingResult = await pool.query(
      "SELECT id FROM expenses WHERE event_id = $1 AND category = 'Labor' AND description = $2 AND status != 'Rejected'",
      [id, "Auto-generated labor cost from attended event assignments"]
    );
    if ((existingResult.rowCount || 0) > 0) {
      res.status(409).json({ error: "Labor expense has already been generated for this event" });
      return;
    }

    const result = await pool.query(
      `
        INSERT INTO expenses (event_id, category, amount, description, status, created_by)
        VALUES ($1, 'Labor', $2, $3, 'Pending', $4)
        RETURNING *
      `,
      [id, laborTotal, "Auto-generated labor cost from attended event assignments", req.user?.id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("[post-event-labor-expense] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});


export default router;
