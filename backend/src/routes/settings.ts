import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { AppSettings, getSettings, updateSettings } from "../lib/settings";

const router = Router();

const VALID_PAYROLL_CYCLES = ["weekly", "bi-weekly", "monthly", "manual"] as const;
const VALID_CALENDAR_TYPES = ["gregorian", "ethiopian", "manual_start_date"] as const;

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
    const { 
      employee_id_prefix, 
      inventory_id_prefix, 
      event_id_prefix,
      payroll_cycle,
      payroll_cycle_days,
      payroll_calendar_type,
      payroll_manual_start_date
    } = req.body;

    // Only allow updating known fields.
    const updates: Partial<AppSettings> = {};
    if (typeof employee_id_prefix === "string") {
      updates.employee_id_prefix = employee_id_prefix.trim().toUpperCase();
    }
    if (typeof inventory_id_prefix === "string") {
      updates.inventory_id_prefix = inventory_id_prefix.trim().toUpperCase();
    }
    if (typeof event_id_prefix === "string") {
      updates.event_id_prefix = event_id_prefix.trim().toUpperCase();
    }
    if (typeof payroll_cycle === "string") {
      const trimmed = payroll_cycle.trim();
      if (!(VALID_PAYROLL_CYCLES as readonly string[]).includes(trimmed)) {
        res.status(400).json({ error: `Invalid payroll_cycle. Must be one of: ${VALID_PAYROLL_CYCLES.join(", ")}` });
        return;
      }
      updates.payroll_cycle = trimmed;
    }
    if (typeof payroll_cycle_days === "number") {
      if (!Number.isInteger(payroll_cycle_days) || payroll_cycle_days < 1 || payroll_cycle_days > 365) {
        res.status(400).json({ error: "payroll_cycle_days must be an integer between 1 and 365" });
        return;
      }
      updates.payroll_cycle_days = payroll_cycle_days;
    } else if (payroll_cycle_days === null) {
      updates.payroll_cycle_days = null;
    }
    if (typeof payroll_calendar_type === "string") {
      const trimmed = payroll_calendar_type.trim();
      if (!(VALID_CALENDAR_TYPES as readonly string[]).includes(trimmed)) {
        res.status(400).json({ error: `Invalid payroll_calendar_type. Must be one of: ${VALID_CALENDAR_TYPES.join(", ")}` });
        return;
      }
      updates.payroll_calendar_type = trimmed;
    }
    if (typeof payroll_manual_start_date === "string") {
      // Validate ISO date format (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payroll_manual_start_date)) {
        res.status(400).json({ error: "payroll_manual_start_date must be in YYYY-MM-DD format" });
        return;
      }
      updates.payroll_manual_start_date = payroll_manual_start_date;
    } else if (payroll_manual_start_date === null) {
      updates.payroll_manual_start_date = null;
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
