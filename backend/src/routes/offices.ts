import { Router, Response } from "express";
import { supabase } from "../db/supabase";
import { requirePermissionSlugs, AuthRequest } from "../middleware/auth";
import { z } from "zod";
import { NotificationsService } from "../services/notifications-service";

const router = Router();

// GET /offices — list associated offices (legacy/employee filter fallback)
router.get(
  "/",
  requirePermissionSlugs(["offices:manage", "hr:read", "offices:read"]),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { data: storesData, error: storesError } = await supabase
        .from("stores")
        .select("id, name, is_active")
        .order("name", { ascending: true });

      if (storesError) throw storesError;

      const { data: itemsData, error: itemsError } = await supabase
        .from("items")
        .select("store_id")
        .neq("quantity", -999999);

      if (itemsError) throw itemsError;

      const { data: employeesData, error: employeesError } = await supabase
        .from("employees")
        .select("office_id")
        .is("deleted_at", null)
        .not("office_id", "is", null);

      if (employeesError) throw employeesError;

      const associatedStoreIds = new Set<string>();
      for (const item of itemsData || []) {
        if (item.store_id) associatedStoreIds.add(item.store_id);
      }
      for (const employee of employeesData || []) {
        if (employee.office_id) associatedStoreIds.add(employee.office_id);
      }

      const stores = (storesData || []).filter((store: any) => associatedStoreIds.has(store.id));

      res.json(stores);
    } catch (err: unknown) {
      console.error("Failed to fetch offices:", err);
      res.status(500).json({
        error: "Failed to fetch offices",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

// GET /offices/all — list all offices in database
router.get(
  "/all",
  requirePermissionSlugs(["offices:manage", "hr:read", "offices:read"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch all offices" });
    }
  }
);

// POST /offices — create a new office/store location
router.post(
  "/",
  requirePermissionSlugs(["offices:manage"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, is_active } = z.object({
        name: z.string().min(1),
        is_active: z.boolean().optional().default(true),
      }).parse(req.body);

      const { data, error } = await supabase
        .from("stores")
        .insert({ name: name.trim(), is_active })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(400).json({ error: "Office location already exists" });
        }
        throw error;
      }

      await NotificationsService.emitNotificationToRoleOrPermission({
        permissionSlug: "settings:write",
        actor_id: req.user?.id,
        title: "Office Created",
        message: `Office location "${data.name}" has been created.`,
        entity_type: "settings",
        entity_id: data.id,
      });

      res.status(201).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to create office" });
    }
  }
);

// PUT /offices/:id — update office name/status
router.put(
  "/:id",
  requirePermissionSlugs(["offices:manage"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, is_active } = z.object({
        name: z.string().min(1),
        is_active: z.boolean(),
      }).parse(req.body);

      const { data, error } = await supabase
        .from("stores")
        .update({ name: name.trim(), is_active })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(400).json({ error: "Office location already exists" });
        }
        throw error;
      }

      if (!data) return res.status(404).json({ error: "Office not found" });

      await NotificationsService.emitNotificationToRoleOrPermission({
        permissionSlug: "settings:write",
        actor_id: req.user?.id,
        title: "Office Updated",
        message: `Office location "${data.name}" has been updated.`,
        entity_type: "settings",
        entity_id: data.id,
      });

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update office" });
    }
  }
);

// DELETE /offices/:id — delete office with dual impact checks (employees and assets)
router.delete(
  "/:id",
  requirePermissionSlugs(["offices:manage"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      // 1. Employee reference check
      const { data: employees, error: empError } = await supabase
        .from("employees")
        .select("id, full_name")
        .eq("office_id", id)
        .is("deleted_at", null);

      if (empError) throw empError;

      if (employees && employees.length > 0) {
        const names = employees.map((e: { full_name: string }) => e.full_name).slice(0, 3).join(", ");
        const suffix = employees.length > 3 ? ` and ${employees.length - 3} others` : "";
        return res.status(400).json({
          error: `Cannot delete office: associated with active employee(s) (${names}${suffix}).`,
        });
      }

      // 2. Inventory items check
      const { data: items, error: itemError } = await supabase
        .from("items")
        .select("id, name")
        .eq("store_id", id)
        .neq("quantity", -999999);

      if (itemError) throw itemError;

      if (items && items.length > 0) {
        const names = items.map((i: { name: string }) => i.name).slice(0, 3).join(", ");
        const suffix = items.length > 3 ? ` and ${items.length - 3} others` : "";
        return res.status(400).json({
          error: `Cannot delete office: associated with inventory item(s) (${names}${suffix}).`,
        });
      }

      const { data, error } = await supabase
        .from("stores")
        .delete()
        .eq("id", id)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Office not found" });

      await NotificationsService.emitNotificationToRoleOrPermission({
        permissionSlug: "settings:write",
        actor_id: req.user?.id,
        title: "Office Deleted",
        message: `Office location "${data.name}" has been deleted.`,
        entity_type: "settings",
        entity_id: id,
      });

      res.json({ message: "Office deleted successfully", office: data });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to delete office" });
    }
  }
);

export default router;
