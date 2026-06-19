import express from "express";
import { supabase } from "../db/supabase";
import { createEventTypeSchema, updateEventTypeSchema } from "../lib/validation";
import { requirePermissionSlugs, AuthRequest } from "../middleware/auth";

const router = express.Router();

/**
 * Map raw Supabase row → API response shape.
 *
 * DB columns:   id, name, description, is_active, created_at, updated_at, deleted_at
 * Frontend expects: id, event_name, description, is_active, ...
 */
function toApiShape(row: Record<string, unknown>) {
  return {
    id: row.id,
    event_name: row.name ?? "",
    description: row.description ?? null,
    is_active: row.is_active ?? true,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
  };
}

// GET all event types (active only)
router.get("/", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("event_types")
      .select("*")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching event types:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json((data ?? []).map(toApiShape));
  } catch (error) {
    console.error("Error fetching event types:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET one event type by id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (id === "trash") return res.status(400).json({ error: "Use /trash/list" });

    const { data, error } = await supabase
      .from("event_types")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("Error fetching event type:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Event type not found" });
    }

    res.json(toApiShape(data));
  } catch (error) {
    console.error("Error fetching event type:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE event type
router.post("/", requirePermissionSlugs(["events:write"]), async (req: AuthRequest, res) => {
  try {
    const result = createEventTypeSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { event_name, description } = result.data;

    const { data, error } = await supabase
      .from("event_types")
      .insert({ 
        name: event_name, 
        description: description ?? null
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating event type:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json(toApiShape(data));
  } catch (error) {
    console.error("Error creating event type:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE event type
router.put("/:id", requirePermissionSlugs(["events:write"]), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const result = updateEventTypeSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (result.data.event_name !== undefined) {
      updates.name = result.data.event_name;
    }
    if (result.data.description !== undefined) {
      updates.description = result.data.description;
    }

    if (Object.keys(updates).length === 1) {
      return res.json({ message: "No fields to update" });
    }

    const { data, error } = await supabase
      .from("event_types")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) {
      console.error("Error updating event type:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Event type not found" });
    }

    res.json(toApiShape(data));
  } catch (error) {
    console.error("Error updating event type:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE (soft delete) event type
router.delete("/:id", requirePermissionSlugs(["events:delete"]), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("event_types")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) {
      console.error("Error deleting event type:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Event type not found" });
    }

    res.json({ message: "Event type deleted successfully" });
  } catch (error) {
    console.error("Error deleting event type:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET TRASH
router.get("/trash/list", requirePermissionSlugs(["events:read"]), async (_req: AuthRequest, res) => {
  try {
    const { data, error } = await supabase
      .from("event_types")
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) {
      console.error("Error fetching event_types trash:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json((data ?? []).map(toApiShape));
  } catch (error) {
    console.error("Error fetching event_types trash:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// RESTORE FROM TRASH
router.post("/:id/restore", requirePermissionSlugs(["events:delete"]), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("event_types")
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error restoring event_types:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json({ message: "Restored successfully", data: toApiShape(data) });
  } catch (error) {
    console.error("Error restoring event_types:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE (permanent hard delete) event type
router.delete("/:id/permanent", requirePermissionSlugs(["events:delete"]), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Hard delete - PostgreSQL ON DELETE SET NULL for payroll_run_line_events will preserve snapshots
    const { error } = await supabase
      .from("event_types")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error permanently deleting event type:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: "Event type permanently deleted" });
  } catch (error) {
    console.error("Error permanently deleting event type:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
