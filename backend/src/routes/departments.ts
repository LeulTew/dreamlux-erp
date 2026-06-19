import { Router } from "express";
import { supabase } from "../db/supabase";
import { requirePermissionSlugs } from "../middleware/auth";

const router = Router();

// Get all departments
router.get("/", requirePermissionSlugs(["departments:manage"]), async (req, res) => {
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .order("name");

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create department
router.post("/", requirePermissionSlugs(["departments:manage"]), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  const { data, error } = await supabase
    .from("departments")
    .insert({ name })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return res.status(400).json({ error: "Department already exists" });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

export default router;
