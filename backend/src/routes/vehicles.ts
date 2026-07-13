import { Router, Response } from "express";
import { supabase } from "../db/supabase";
import { requirePermissionSlugs, AuthRequest } from "../middleware/auth";
import { z } from "zod";
import { NotificationsService } from "../services/notifications-service";

const router = Router();

// Fuel consumption is stored as liters per kilometer (L/km). The DB enforces
// (0, 5]; keep the API bound identical so client/server agree (issue #147).
const FUEL_RATE_MIN_EXCLUSIVE = 0;
const FUEL_RATE_MAX = 5;

const vehicleBodySchema = z.object({
  plate_number: z.string().trim().min(1, "Plate number is required").max(32),
  vehicle_type: z.string().trim().min(1, "Vehicle type is required").max(64),
  fuel_type: z.string().trim().min(1, "Fuel type is required").max(32),
  fuel_consumption_rate: z
    .number({ invalid_type_error: "Fuel consumption rate must be a number" })
    .gt(FUEL_RATE_MIN_EXCLUSIVE, "Fuel consumption rate must be greater than 0 L/km")
    .lte(FUEL_RATE_MAX, `Fuel consumption rate must not exceed ${FUEL_RATE_MAX} L/km`),
  driver_license_details: z.string().trim().max(255).optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase();
}

// GET /vehicles — paginated fleet registry with search + filters.
router.get(
  "/",
  requirePermissionSlugs(["vehicles:read", "vehicles:write", "vehicle_assignments:write"]),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "25"), 10) || 25));
      const search = String(req.query.search ?? "").trim();
      const fuelType = String(req.query.fuel_type ?? "").trim();
      // status: active (default) | archived | all
      const status = String(req.query.status ?? "active").trim().toLowerCase();

      let query = supabase.from("vehicles").select("*", { count: "exact" });

      if (status === "active") {
        query = query.is("deleted_at", null);
      } else if (status === "archived") {
        query = query.not("deleted_at", "is", null);
      }
      // status === "all" applies no deleted_at filter.

      if (search) {
        query = query.or(`plate_number.ilike.%${search}%,vehicle_type.ilike.%${search}%`);
      }
      if (fuelType) {
        query = query.eq("fuel_type", fuelType);
      }

      const from = (page - 1) * limit;
      query = query.order("plate_number", { ascending: true }).range(from, from + limit - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      res.json({ vehicles: data || [], total: count ?? 0, page, limit });
    } catch (err: unknown) {
      console.error("[vehicles:list] Failed to fetch vehicles:", err);
      res.status(500).json({ error: "Failed to fetch vehicles", details: err instanceof Error ? err.message : String(err) });
    }
  }
);

// GET /vehicles/:id — single vehicle.
router.get(
  "/:id",
  requirePermissionSlugs(["vehicles:read", "vehicles:write", "vehicle_assignments:write"]),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { data, error } = await supabase.from("vehicles").select("*").eq("id", req.params.id).maybeSingle();
      if (error) throw error;
      if (!data) {
        res.status(404).json({ error: "Vehicle not found" });
        return;
      }
      res.json(data);
    } catch (err: unknown) {
      console.error("[vehicles:get] Failed:", err);
      res.status(500).json({ error: "Failed to fetch vehicle", details: err instanceof Error ? err.message : String(err) });
    }
  }
);

// POST /vehicles — create a vehicle.
router.post(
  "/",
  requirePermissionSlugs(["vehicles:write"]),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = vehicleBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors[0].message });
        return;
      }
      const body = parsed.data;

      const { data, error } = await supabase
        .from("vehicles")
        .insert({
          plate_number: normalizePlate(body.plate_number),
          vehicle_type: body.vehicle_type,
          fuel_type: body.fuel_type,
          fuel_consumption_rate: body.fuel_consumption_rate,
          driver_license_details: body.driver_license_details ?? null,
          is_active: body.is_active,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          res.status(409).json({ error: "A vehicle with this plate number already exists" });
          return;
        }
        if (error.code === "23514") {
          res.status(400).json({ error: `Fuel consumption rate must be within (0, ${FUEL_RATE_MAX}] L/km` });
          return;
        }
        throw error;
      }

      await NotificationsService.emitNotificationToRoleOrPermission({
        permissionSlug: "vehicles:write",
        actor_id: req.user?.id,
        title: "Vehicle Added",
        message: `Vehicle "${data.plate_number}" (${data.vehicle_type}) has been added to the fleet.`,
        entity_type: "vehicle",
        entity_id: data.id,
      });

      res.status(201).json(data);
    } catch (err: unknown) {
      console.error("[vehicles:create] Failed:", err);
      res.status(500).json({ error: "Failed to create vehicle", details: err instanceof Error ? err.message : String(err) });
    }
  }
);

// PUT /vehicles/:id — update a vehicle.
router.put(
  "/:id",
  requirePermissionSlugs(["vehicles:write"]),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = vehicleBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors[0].message });
        return;
      }
      const body = parsed.data;

      const { data, error } = await supabase
        .from("vehicles")
        .update({
          plate_number: normalizePlate(body.plate_number),
          vehicle_type: body.vehicle_type,
          fuel_type: body.fuel_type,
          fuel_consumption_rate: body.fuel_consumption_rate,
          driver_license_details: body.driver_license_details ?? null,
          is_active: body.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", req.params.id)
        .select()
        .maybeSingle();

      if (error) {
        if (error.code === "23505") {
          res.status(409).json({ error: "A vehicle with this plate number already exists" });
          return;
        }
        if (error.code === "23514") {
          res.status(400).json({ error: `Fuel consumption rate must be within (0, ${FUEL_RATE_MAX}] L/km` });
          return;
        }
        throw error;
      }
      if (!data) {
        res.status(404).json({ error: "Vehicle not found" });
        return;
      }

      res.json(data);
    } catch (err: unknown) {
      console.error("[vehicles:update] Failed:", err);
      res.status(500).json({ error: "Failed to update vehicle", details: err instanceof Error ? err.message : String(err) });
    }
  }
);

// PATCH /vehicles/:id/archive — retire a vehicle (soft delete). Retired vehicles are
// excluded from new assignments but preserved for historical reporting.
router.patch(
  "/:id/archive",
  requirePermissionSlugs(["vehicles:write"]),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from("vehicles")
        .update({ deleted_at: new Date().toISOString(), is_active: false, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .is("deleted_at", null)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        res.status(404).json({ error: "Active vehicle not found" });
        return;
      }
      res.json({ message: "Vehicle archived", vehicle: data });
    } catch (err: unknown) {
      console.error("[vehicles:archive] Failed:", err);
      res.status(500).json({ error: "Failed to archive vehicle", details: err instanceof Error ? err.message : String(err) });
    }
  }
);

// PATCH /vehicles/:id/restore — restore a retired vehicle.
router.patch(
  "/:id/restore",
  requirePermissionSlugs(["vehicles:write"]),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from("vehicles")
        .update({ deleted_at: null, is_active: true, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .not("deleted_at", "is", null)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        res.status(404).json({ error: "Archived vehicle not found" });
        return;
      }
      res.json({ message: "Vehicle restored", vehicle: data });
    } catch (err: unknown) {
      console.error("[vehicles:restore] Failed:", err);
      res.status(500).json({ error: "Failed to restore vehicle", details: err instanceof Error ? err.message : String(err) });
    }
  }
);

// DELETE /vehicles/:id — permanent delete. Blocked when assignment history exists
// (vehicle_assignments cascade would destroy historical reporting); callers should
// archive instead.
router.delete(
  "/:id",
  requirePermissionSlugs(["vehicles:delete"]),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const { count: assignmentCount, error: assignmentError } = await supabase
        .from("vehicle_assignments")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", id);
      if (assignmentError) throw assignmentError;

      if ((assignmentCount ?? 0) > 0) {
        res.status(409).json({
          error: `Cannot permanently delete: this vehicle has ${assignmentCount} assignment record(s) required for historical reporting. Archive it instead.`,
        });
        return;
      }

      const { data, error } = await supabase.from("vehicles").delete().eq("id", id).select().maybeSingle();
      if (error) throw error;
      if (!data) {
        res.status(404).json({ error: "Vehicle not found" });
        return;
      }

      await NotificationsService.emitNotificationToRoleOrPermission({
        permissionSlug: "vehicles:write",
        actor_id: req.user?.id,
        title: "Vehicle Deleted",
        message: `Vehicle "${data.plate_number}" has been permanently deleted.`,
        entity_type: "vehicle",
        entity_id: id,
      });

      res.json({ message: "Vehicle deleted", vehicle: data });
    } catch (err: unknown) {
      console.error("[vehicles:delete] Failed:", err);
      res.status(500).json({ error: "Failed to delete vehicle", details: err instanceof Error ? err.message : String(err) });
    }
  }
);

export default router;
