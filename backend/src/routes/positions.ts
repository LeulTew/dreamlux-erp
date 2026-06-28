import { Router, Response } from "express";
import { supabase } from "../db/supabase";
import { requirePermissionSlugs, AuthRequest } from "../middleware/auth";
import { z } from "zod";

const router = Router();

// GET /positions
router.get(
  "/",
  requirePermissionSlugs(["positions:manage", "hr:read", "positions:read"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch positions" });
    }
  }
);

// POST /positions
router.post(
  "/",
  requirePermissionSlugs(["positions:manage", "hr:write"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { name } = z.object({ name: z.string().min(1) }).parse(req.body);

      const { data, error } = await supabase
        .from("positions")
        .insert({ name: name.trim() })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(400).json({ error: "Position already exists" });
        }
        throw error;
      }
      res.status(201).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to create position" });
    }
  }
);

// PUT /positions/:id
router.put(
  "/:id",
  requirePermissionSlugs(["positions:manage"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name } = z.object({ name: z.string().min(1) }).parse(req.body);

      const { data, error } = await supabase
        .from("positions")
        .update({ name: name.trim() })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(400).json({ error: "Position already exists" });
        }
        throw error;
      }

      if (!data) return res.status(404).json({ error: "Position not found" });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update position" });
    }
  }
);

// DELETE /positions/:id with impact check
router.delete(
  "/:id",
  requirePermissionSlugs(["positions:manage"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Check impact: active employees referencing this position
      const { data: employees, error: empError } = await supabase
        .from("employees")
        .select("id, full_name")
        .eq("position_id", id)
        .is("deleted_at", null);

      if (empError) throw empError;

      if (employees && employees.length > 0) {
        const names = employees.map((e: { full_name: string }) => e.full_name).slice(0, 3).join(", ");
        const suffix = employees.length > 3 ? ` and ${employees.length - 3} others` : "";
        return res.status(400).json({
          error: `Cannot delete position: associated with active employee(s) (${names}${suffix}).`,
        });
      }

      const { data, error } = await supabase
        .from("positions")
        .delete()
        .eq("id", id)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Position not found" });

      res.json({ message: "Position deleted successfully", position: data });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to delete position" });
    }
  }
);

export default router;
