import { Router } from "express";
import { supabase } from "../db/supabase";
import { requirePermissionSlugs, AuthRequest } from "../middleware/auth";
import { Response } from "express";
import { NotificationsService } from "../services/notifications-service";

const router = Router();

// GET all departments
router.get(
  "/",
  requirePermissionSlugs(["departments:manage", "hr:read", "departments:read"]),
  async (req: AuthRequest, res: Response) => {
    const { data, error } = await supabase
      .from("departments")
      .select("*")
      .order("name");

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  }
);

// Create department
router.post(
  "/",
  requirePermissionSlugs(["departments:manage"]),
  async (req: AuthRequest, res: Response) => {
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    const { data, error } = await supabase
      .from("departments")
      .insert({ name: name.trim() })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return res.status(400).json({ error: "Department already exists" });
      return res.status(500).json({ error: error.message });
    }

    NotificationsService.emitNotificationToRoleOrPermission({
      permissionSlug: "settings:write",
      actor_id: req.user?.id,
      title: "Department Created",
      message: `Department "${data.name}" has been created.`,
      entity_type: "settings",
      entity_id: data.id,
    });

    res.status(201).json(data);
  }
);

// Update department
router.put(
  "/:id",
  requirePermissionSlugs(["departments:manage"]),
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    const { data, error } = await supabase
      .from("departments")
      .update({ name: name.trim() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return res.status(400).json({ error: "Department already exists" });
      return res.status(500).json({ error: error.message });
    }

    if (!data) return res.status(404).json({ error: "Department not found" });

    NotificationsService.emitNotificationToRoleOrPermission({
      permissionSlug: "settings:write",
      actor_id: req.user?.id,
      title: "Department Updated",
      message: `Department "${data.name}" has been updated.`,
      entity_type: "settings",
      entity_id: data.id,
    });

    res.json(data);
  }
);

// DELETE department with impact check
router.delete(
  "/:id",
  requirePermissionSlugs(["departments:manage"]),
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // Check impact: active employees referencing this department
    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("id, full_name")
      .eq("department_id", id)
      .is("deleted_at", null);

    if (empError) return res.status(500).json({ error: empError.message });

    if (employees && employees.length > 0) {
      const names = employees.map((e: { full_name: string }) => e.full_name).slice(0, 3).join(", ");
      const suffix = employees.length > 3 ? ` and ${employees.length - 3} others` : "";
      return res.status(400).json({
        error: `Cannot delete department: associated with active employee(s) (${names}${suffix}).`,
      });
    }

    const { data, error } = await supabase
      .from("departments")
      .delete()
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Department not found" });

    NotificationsService.emitNotificationToRoleOrPermission({
      permissionSlug: "settings:write",
      actor_id: req.user?.id,
      title: "Department Deleted",
      message: `Department "${data.name}" has been deleted.`,
      entity_type: "settings",
      entity_id: id,
    });

    res.json({ message: "Department deleted successfully", department: data });
  }
);

export default router;
