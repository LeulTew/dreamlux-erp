import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { getSettings, updateSettings } from "../lib/settings";

const router = Router();

// GET /settings
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// PATCH /settings
router.patch("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { employee_id_prefix } = req.body;
    
    // Only allow updating known fields
    const updates: any = {};
    if (typeof employee_id_prefix === "string") {
      updates.employee_id_prefix = employee_id_prefix.trim().toUpperCase();
    }
    
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields provided" });
      return;
    }
    
    const newSettings = await updateSettings(updates);
    res.json(newSettings);
  } catch {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
