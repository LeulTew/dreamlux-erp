import { pool } from "../db/pool";
import {
  hasPermissionSlug,
  permissionMapToSlugs,
  ROLE_PERMISSION_SEEDS,
} from "../lib/permissions";

export interface CreateNotificationParams {
  recipient_id: string;
  actor_id?: string;
  actor_display_name?: string;
  actor_username?: string;
  actor_type?: "user" | "system";
  title: string;
  message: string;
  entity_type: string;
  entity_id?: string;
  action_url?: string;
  priority?: "low" | "normal" | "high";
}

export interface EmitNotificationParams {
  permissionSlug?: string;
  roleName?: string;
  actor_id?: string;
  actor_display_name?: string;
  actor_username?: string;
  actor_type?: "user" | "system";
  include_actor?: boolean;
  title: string;
  message: string;
  entity_type: string;
  entity_id?: string;
  action_url?: string;
  priority?: "low" | "normal" | "high";
}

const DEFAULT_NOTIFICATION_CATEGORIES: Record<string, boolean> = {
  proposals: true,
  events: true,
  expenses: true,
  payroll: true,
  inventory: true,
  employees: true,
  users: true,
  roles: true,
  settings: true,
  security: true,
};

function normalizeCategoryKey(entityType: string): string {
  const key = (entityType || "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    proposal: "proposals",
    event: "events",
    expense: "expenses",
    asset: "inventory",
    inventory_item: "inventory",
    employee: "employees",
    user: "users",
    role: "roles",
    permission: "security",
  };
  return aliases[key] || key;
}

function moduleWildcardSlug(permissionSlug: string): string | null {
  const moduleName = permissionSlug.split(":")[0]?.trim().toLowerCase();
  return moduleName ? `${moduleName}:*` : null;
}

function isMissingColumnError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  const message = (err?.message || "").toLowerCase();
  return err?.code === "42703" || message.includes("column");
}

export class NotificationsService {
  static readonly defaultCategories = DEFAULT_NOTIFICATION_CATEGORIES;

  /**
   * Creates a single notification for a specific user, checking preferences first.
   */
  static async createNotification(params: CreateNotificationParams): Promise<boolean> {
    try {
      const {
        recipient_id,
        actor_id,
        actor_display_name,
        actor_username,
        actor_type,
        title,
        message,
        entity_type,
        entity_id,
        action_url,
        priority = "normal",
      } = params;

      // 1. Fetch user's notification preferences
      const prefQuery = await pool.query(
        `SELECT in_app_enabled, categories FROM public.notification_preferences WHERE user_id = $1`,
        [recipient_id]
      );

      // If preferences exist and in-app notifications are globally disabled, skip
      if (prefQuery.rows.length > 0) {
        const pref = prefQuery.rows[0];
        if (!pref.in_app_enabled) {
          return false;
        }

        // Check if preferences disable notifications for this specific entity type
        const categories = pref.categories || {};
        const categoryKey = normalizeCategoryKey(entity_type);
        if (categories[categoryKey] === false || categories[entity_type] === false) {
          return false;
        }
      }

      // 2. Insert notification
      await pool.query(
        `INSERT INTO public.notifications (
          recipient_id, actor_id, actor_display_name, actor_username, actor_type,
          title, message, entity_type, entity_id, action_url, priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          recipient_id,
          actor_id || null,
          actor_display_name || null,
          actor_username || null,
          actor_type || (actor_id ? "user" : "system"),
          title,
          message,
          entity_type,
          entity_id || null,
          action_url || null,
          priority,
        ]
      );

      return true;
    } catch (error) {
      // Fail closed / silently logging to avoid interrupting main database transactions
      console.error("[NotificationsService] Error creating notification:", error);
      return false;
    }
  }

  /**
   * Emits a notification to all users matching a permission slug or role.
   */
  static async emitNotificationToRoleOrPermission(params: EmitNotificationParams): Promise<number> {
    try {
      const {
        permissionSlug,
        roleName,
        actor_id,
        actor_display_name,
        actor_username,
        actor_type,
        include_actor = false,
        title,
        message,
        entity_type,
        entity_id,
        action_url,
        priority = "normal",
      } = params;

      let recipientIds: string[] = [];

      if (permissionSlug) {
        recipientIds = await this.findRecipientIdsByPermission(permissionSlug);
      } else if (roleName) {
        recipientIds = await this.findRecipientIdsByRole(roleName);
      }

      // De-duplicate actor_id so users do not receive notifications for their own actions
      if (actor_id && !include_actor) {
        recipientIds = recipientIds.filter((id) => id !== actor_id);
      }

      let count = 0;
      for (const recipientId of recipientIds) {
        const success = await this.createNotification({
          recipient_id: recipientId,
          actor_id,
          actor_display_name,
          actor_username,
          actor_type,
          title,
          message,
          entity_type,
          entity_id,
          action_url,
          priority,
        });
        if (success) count++;
      }

      return count;
    } catch (error) {
      console.error("[NotificationsService] Error emitting notifications:", error);
      return 0;
    }
  }

  private static async findRecipientIdsByPermission(permissionSlug: string): Promise<string[]> {
    const normalizedSlug = permissionSlug.trim().toLowerCase();
    const wildcardSlug = moduleWildcardSlug(normalizedSlug);

    try {
      const res = await pool.query(
        `WITH user_roles AS (
           SELECT u.id AS user_id, r.id AS role_id, LOWER(r.name) AS role_name, r.permissions
           FROM public.users u
           LEFT JOIN LATERAL (
             SELECT jsonb_array_elements_text(u.role_ids)::uuid AS role_id
             WHERE jsonb_typeof(u.role_ids) = 'array'
           ) extra_role ON TRUE
           JOIN public.roles r ON r.id = u.role_id OR r.id = extra_role.role_id
           WHERE u.deleted_at IS NULL
             AND u.is_active = TRUE
         ),
         role_slugs AS (
           SELECT DISTINCT
             ur.user_id,
             ur.role_name,
             ur.permissions,
             p.slug
           FROM user_roles ur
           LEFT JOIN public.role_permissions rp ON ur.role_id = rp.role_id
           LEFT JOIN public.permissions p ON rp.permission_id = p.id
         )
         SELECT DISTINCT user_id AS id, role_name, permissions, array_agg(slug) FILTER (WHERE slug IS NOT NULL) AS slugs
         FROM role_slugs
         GROUP BY user_id, role_name, permissions`,
      );

      return this.filterRecipientsByPermissionRows(res.rows, normalizedSlug, wildcardSlug);
    } catch (error) {
      if (!isMissingColumnError(error)) {
        throw error;
      }

      const legacyRes = await pool.query(
        `SELECT DISTINCT u.id, LOWER(r.name) AS role_name, r.permissions,
                COALESCE(array_agg(p.slug) FILTER (WHERE p.slug IS NOT NULL), '{}') AS slugs
         FROM public.users u
         JOIN public.roles r ON u.role_id = r.id
         LEFT JOIN public.role_permissions rp ON r.id = rp.role_id
         LEFT JOIN public.permissions p ON rp.permission_id = p.id
         WHERE u.deleted_at IS NULL
           AND u.is_active = TRUE
         GROUP BY u.id, r.name, r.permissions`,
      );
      return this.filterRecipientsByPermissionRows(legacyRes.rows, normalizedSlug, wildcardSlug);
    }
  }

  private static async findRecipientIdsByRole(roleName: string): Promise<string[]> {
    try {
      const res = await pool.query(
        `SELECT DISTINCT u.id
         FROM public.users u
         LEFT JOIN LATERAL (
           SELECT jsonb_array_elements_text(u.role_ids)::uuid AS role_id
           WHERE jsonb_typeof(u.role_ids) = 'array'
         ) extra_role ON TRUE
         JOIN public.roles r ON r.id = u.role_id OR r.id = extra_role.role_id
         WHERE LOWER(r.name) = LOWER($1)
           AND u.deleted_at IS NULL
           AND u.is_active = TRUE`,
        [roleName],
      );
      return res.rows.map((row) => row.id);
    } catch (error) {
      if (!isMissingColumnError(error)) {
        throw error;
      }

      const legacyRes = await pool.query(
        `SELECT DISTINCT u.id
         FROM public.users u
         JOIN public.roles r ON u.role_id = r.id
         WHERE LOWER(r.name) = LOWER($1)
           AND u.deleted_at IS NULL
           AND u.is_active = TRUE`,
        [roleName],
      );
      return legacyRes.rows.map((row) => row.id);
    }
  }

  private static filterRecipientsByPermissionRows(
    rows: Array<{ id?: string; user_id?: string; role_name?: string; permissions?: unknown; slugs?: string[] }>,
    requiredSlug: string,
    wildcardSlug: string | null,
  ): string[] {
    const recipientIds = rows
      .filter((row) => {
        const roleName = (row.role_name || "").trim().toLowerCase();
        const explicitSlugs = Array.isArray(row.slugs) ? row.slugs : [];
        const jsonSlugs = permissionMapToSlugs((row.permissions || {}) as Record<string, unknown>);
        const seedSlugs = ROLE_PERMISSION_SEEDS[roleName] || [];
        const effectiveSlugs = [...new Set([...explicitSlugs, ...jsonSlugs, ...seedSlugs].map((slug) => slug.trim().toLowerCase()))];

        return (
          roleName === "super_admin" ||
          roleName === "admin" ||
          roleName === "owner" ||
          hasPermissionSlug(effectiveSlugs, requiredSlug) ||
          Boolean(wildcardSlug && effectiveSlugs.includes(wildcardSlug))
        );
      })
      .map((row) => row.id || row.user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    return [...new Set(recipientIds)];
  }

  /**
   * Automatically initializes notification preferences for a user if they do not exist yet.
   */
  static async ensureUserPreferences(userId: string): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO public.notification_preferences (user_id, categories)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, DEFAULT_NOTIFICATION_CATEGORIES]
      );
    } catch (error) {
      console.error("[NotificationsService] Error ensuring user preferences:", error);
    }
  }

  /**
   * Resolves the user ID for an employee based on email or name parity.
   */
  static async getUserIdForEmployee(employeeId: string): Promise<string | null> {
    try {
      const res = await pool.query(
        `SELECT u.id 
         FROM public.users u
         JOIN public.employees e ON LOWER(u.email) = LOWER(e.email) OR LOWER(u.full_name) = LOWER(e.full_name)
         WHERE e.id = $1 AND u.deleted_at IS NULL AND u.is_active = TRUE`,
        [employeeId]
      );
      return res.rows[0]?.id || null;
    } catch {
      return null;
    }
  }
}
