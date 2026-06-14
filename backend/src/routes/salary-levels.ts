import express from "express";
import { supabase } from "../db/supabase";
import { createSalaryLevelSchema, updateSalaryLevelSchema } from "../lib/validation";

const router = express.Router();

function isMissingColumnError(error: unknown): boolean {
  const maybeError = error as { code?: string; message?: string; details?: string; hint?: string };
  if (maybeError?.code === "42703") return true;
  const text = `${maybeError?.message ?? ""} ${maybeError?.details ?? ""} ${maybeError?.hint ?? ""}`;
  return (
    /does not exist/i.test(text) ||
    /Could not find the ['"][a-zA-Z0-9_]+['"] column/i.test(text) ||
    /schema cache/i.test(text)
  );
}

async function getActiveEmployeeIdsByColumn(column: "salary_level" | "salary_level_id", value: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id")
    .eq(column, value)
    .is("deleted_at", null);

  if (error) {
    if (isMissingColumnError(error)) return [];
    throw error;
  }

  return (data ?? []).map((row: { id: string | number }) => String(row.id));
}

/**
 * Map raw Supabase row → API response shape.
 *
 * The actual DB columns are:
 *   id, code, amount_etb, description, sort_order, is_active, created_at, updated_at, deleted_at
 *
 * The frontend expects:
 *   id, level_name, base_salary, description, sort_order, is_active, created_at, updated_at, deleted_at
 */
function toApiShape(row: Record<string, unknown>) {
  return {
    id: row.id,
    level_name: row.code ?? "",
    base_salary: Number(row.amount_etb ?? 0),
    description: row.description ?? null,
    sort_order: row.sort_order ?? 0,
    is_active: row.is_active ?? true,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
  };
}

// GET all salary levels (active only)
router.get("/", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("salary_levels")
      .select("*")
      .is("deleted_at", null)
      .order("amount_etb", { ascending: true });

    if (error) {
      console.error("Error fetching salary levels:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json((data ?? []).map(toApiShape));
  } catch (error) {
    console.error("Error fetching salary levels:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET one salary level by id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Guard: don't let "trash" fall through to single-record lookup
    if (id === "trash") return res.status(400).json({ error: "Use /trash/list" });

    const { data, error } = await supabase
      .from("salary_levels")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("Error fetching salary level:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Salary level not found" });
    }

    res.json(toApiShape(data));
  } catch (error) {
    console.error("Error fetching salary level:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET delete impact: count active employees using this salary level
router.get("/:id/delete-impact", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: level, error: levelError } = await supabase
      .from("salary_levels")
      .select("id, code")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (levelError) {
      console.error("Error loading salary level delete impact:", levelError);
      return res.status(500).json({ error: levelError.message });
    }

    if (!level) {
      return res.status(404).json({ error: "Salary level not found" });
    }

    const byLegacyCode = await getActiveEmployeeIdsByColumn("salary_level", String(level.code ?? ""));
    const byForeignKey = await getActiveEmployeeIdsByColumn("salary_level_id", String(level.id));
    const activeEmployeeCount = new Set([...byLegacyCode, ...byForeignKey]).size;

    res.json({
      salary_level_id: level.id,
      level_name: level.code,
      active_employee_count: activeEmployeeCount,
    });
  } catch (error) {
    console.error("Error calculating salary level delete impact:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE salary level
router.post("/", async (req, res) => {
  try {
    const result = createSalaryLevelSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { level_name, base_salary } = result.data;

    const { data, error } = await supabase
      .from("salary_levels")
      .insert({ code: level_name, amount_etb: base_salary })
      .select()
      .single();

    if (error) {
      console.error("Error creating salary level:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json(toApiShape(data));
  } catch (error) {
    console.error("Error creating salary level:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATE salary level
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = updateSalaryLevelSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (result.data.level_name !== undefined) {
      updates.code = result.data.level_name;
    }
    if (result.data.base_salary !== undefined) {
      updates.amount_etb = result.data.base_salary;
    }

    if (Object.keys(updates).length === 1) {
      // Only updated_at — nothing meaningful
      return res.json({ message: "No fields to update" });
    }

    const { data, error } = await supabase
      .from("salary_levels")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) {
      console.error("Error updating salary level:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Salary level not found" });
    }

    res.json(toApiShape(data));
  } catch (error) {
    console.error("Error updating salary level:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE (soft delete) salary level
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("salary_levels")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) {
      console.error("Error deleting salary level:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Salary level not found" });
    }

    res.json({ message: "Salary level deleted successfully" });
  } catch (error) {
    console.error("Error deleting salary level:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET TRASH
router.get("/trash/list", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("salary_levels")
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) {
      console.error("Error fetching salary_levels trash:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json((data ?? []).map(toApiShape));
  } catch (error) {
    console.error("Error fetching salary_levels trash:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// RESTORE FROM TRASH
router.post("/:id/restore", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("salary_levels")
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error restoring salary_levels:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json({ message: "Restored successfully", data: toApiShape(data) });
  } catch (error) {
    console.error("Error restoring salary_levels:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE PERMANENT
router.delete("/:id/permanent", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("salary_levels")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error permanently deleting salary_levels:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: "Permanently deleted successfully" });
  } catch (error) {
    console.error("Error permanently deleting salary_levels:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
