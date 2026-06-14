import { Router, Response } from "express";
import { pool } from "../db/pool";
import { requireAdmin, AuthRequest } from "../middleware/auth";
import { createEventSchema, updateEventSchema } from "../lib/validation";

const router = Router();

// Helper to check if user has permission to edit completed events or transition backward
function canOverrideCompleted(role?: string): boolean {
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

export default router;
