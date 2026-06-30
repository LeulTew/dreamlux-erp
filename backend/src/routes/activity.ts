import { Router, Response } from "express";
import { AuthRequest, requireAuth } from "../middleware/auth";
import { pool } from "../db/pool";
import { ActivityService, ActivityLogEntry } from "../services/activity-service";
import { getEffectivePermissionSlugsFromUser } from "../middleware/auth";
import { hasPermissionSlug } from "../lib/permissions";

const router = Router();

const ENTITY_ACTIVITY_PERMISSIONS: Record<string, string[]> = {
  event: ["events:read"],
  proposal: ["events:read", "events:proposals:write", "events:proposals:approve"],
  asset: ["assets:read"],
  inventory_item: ["assets:read"],
  employee: ["hr:read"],
  payroll: ["payroll:read"],
  user: ["users:manage"],
  role: ["users:manage"],
  permission: ["users:manage"],
  settings: ["settings:write", "users:manage"],
  department: ["departments:manage", "hr:read", "settings:write"],
  position: ["positions:manage", "hr:read", "settings:write"],
  office: ["offices:manage", "hr:read", "settings:write"],
  salary_level: ["salary-levels:manage", "hr:read"],
};

function normalizeEntityType(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function canReadEntityActivity(entityType: string, permissionSlugs: string[]): boolean {
  const requiredSlugs = ENTITY_ACTIVITY_PERMISSIONS[entityType];
  if (!requiredSlugs) {
    return hasPermissionSlug(permissionSlugs, "users:manage");
  }

  return requiredSlugs.some((slug) => hasPermissionSlug(permissionSlugs, slug));
}

// GET /api/activity — retrieve audit timeline feed for a resource
router.get("/", requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { entity_type, entity_id } = req.query;
    const normalizedEntityType = normalizeEntityType(entity_type);

    if (!normalizedEntityType || !entity_id) {
      res.status(400).json({ error: "Missing entity_type or entity_id parameters" });
      return;
    }

    const userPermissions = getEffectivePermissionSlugsFromUser(req.user);
    if (!canReadEntityActivity(normalizedEntityType, userPermissions)) {
      res.status(403).json({ error: "Forbidden: Missing required activity permission" });
      return;
    }

    let query = "";
    let params: string[] = [];

    // Formulate SQL combining unified generic logs and legacy table logs if applicable
    if (normalizedEntityType === "proposal") {
      query = `
        SELECT 
          al.id,
          'proposal' AS entity_type,
          al.proposal_id::text AS entity_id,
          al.user_id,
          u.username,
          u.full_name,
          al.action,
          'status' AS field_changed,
          al.old_status AS old_value,
          al.new_status AS new_value,
          al.note,
          'event_proposal_logs' AS source_route,
          al.created_at
        FROM public.event_proposal_logs al
        LEFT JOIN public.users u ON al.user_id = u.id
        WHERE al.proposal_id = $1

        UNION ALL

        SELECT 
          al.id,
          al.entity_type,
          al.entity_id::text,
          al.user_id,
          u.username,
          u.full_name,
          al.action,
          al.field_changed,
          al.old_value,
          al.new_value,
          al.note,
          'activity_logs' AS source_route,
          al.created_at
        FROM public.activity_logs al
        LEFT JOIN public.users u ON al.user_id = u.id
        WHERE al.entity_type = 'proposal' AND al.entity_id = $1

        ORDER BY created_at DESC
        LIMIT 100
      `;
      params = [String(entity_id)];
    } else if (normalizedEntityType === "event") {
      query = `
        SELECT 
          al.id,
          'event' AS entity_type,
          al.event_id::text AS entity_id,
          al.user_id,
          u.username,
          u.full_name,
          'update' AS action,
          al.field_changed,
          al.old_value,
          al.new_value,
          NULL AS note,
          'event_logs' AS source_route,
          al.changed_at AS created_at
        FROM public.event_logs al
        LEFT JOIN public.users u ON al.user_id = u.id
        WHERE al.event_id = $1

        UNION ALL

        SELECT 
          al.id,
          al.entity_type,
          al.entity_id::text,
          al.user_id,
          u.username,
          u.full_name,
          al.action,
          al.field_changed,
          al.old_value,
          al.new_value,
          al.note,
          'activity_logs' AS source_route,
          al.created_at
        FROM public.activity_logs al
        LEFT JOIN public.users u ON al.user_id = u.id
        WHERE al.entity_type = 'event' AND al.entity_id = $1

        ORDER BY created_at DESC
        LIMIT 100
      `;
      params = [String(entity_id)];
    } else {
      // General entity fetch
      query = `
        SELECT 
          al.id,
          al.entity_type,
          al.entity_id::text,
          al.user_id,
          u.username,
          u.full_name,
          al.action,
          al.field_changed,
          al.old_value,
          al.new_value,
          al.note,
          'activity_logs' AS source_route,
          al.created_at
        FROM public.activity_logs al
        LEFT JOIN public.users u ON al.user_id = u.id
        WHERE al.entity_type = $1 AND al.entity_id = $2
        ORDER BY al.created_at DESC
        LIMIT 100
      `;
      params = [normalizedEntityType, String(entity_id)];
    }

    const { rows } = await pool.query(query, params);

    // Apply redactions based on user permission slugs
    const sanitizedLogs = ActivityService.redactLogs(rows as ActivityLogEntry[], userPermissions);

    res.json({ activity: sanitizedLogs });
  } catch (error) {
    console.error("Failed to fetch activity logs:", error);
    res.status(500).json({ error: "Failed to fetch activity logs" });
  }
});

export default router;
