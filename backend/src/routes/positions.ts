import { Router, Response } from "express";
import { supabase } from "../db/supabase";
import { AuthRequest } from "../middleware/auth";
import { z } from "zod";

const router = Router();

// GET /positions
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("positions")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch positions" });
  }
});

// POST /positions
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    
    const { data, error } = await supabase
      .from("positions")
      .insert({ name: name.trim() })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") { // Unique violation
        return res.status(400).json({ error: "Position already exists" });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch {
    res.status(500).json({ error: "Failed to create position" });
  }
});

export default router;
