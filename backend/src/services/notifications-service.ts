import { pool } from "../db/pool";

export interface CreateNotificationParams {
  recipient_id: string;
  actor_id?: string;
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
  title: string;
  message: string;
  entity_type: string;
  entity_id?: string;
  action_url?: string;
  priority?: "low" | "normal" | "high";
}

export class NotificationsService {
  /**
   * Creates a single notification for a specific user, checking preferences first.
   */
  static async createNotification(params: CreateNotificationParams): Promise<boolean> {
    try {
      const {
        recipient_id,
        actor_id,
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
        if (categories[entity_type] === false) {
          return false;
        }
      }

      // 2. Insert notification
      await pool.query(
        `INSERT INTO public.notifications (
          recipient_id, actor_id, title, message, entity_type, entity_id, action_url, priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [recipient_id, actor_id || null, title, message, entity_type, entity_id || null, action_url || null, priority]
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
        title,
        message,
        entity_type,
        entity_id,
        action_url,
        priority = "normal",
      } = params;

      let recipientIds: string[] = [];

      if (permissionSlug) {
        // Find all users with the exact permission, a wildcard permission, or superuser status
        const res = await pool.query(
          `SELECT DISTINCT u.id 
           FROM public.users u
           JOIN public.roles r ON u.role_id = r.id
           LEFT JOIN public.role_permissions rp ON r.id = rp.role_id
           LEFT JOIN public.permissions p ON rp.permission_id = p.id
           WHERE (LOWER(r.name) IN ('super_admin', 'admin', 'owner') 
              OR p.slug = $1 
              OR p.slug = '*')
              AND u.deleted_at IS NULL 
              AND u.is_active = TRUE`,
          [permissionSlug]
        );
        recipientIds = res.rows.map((row) => row.id);
      } else if (roleName) {
        // Find users with the specific role name
        const res = await pool.query(
          `SELECT DISTINCT u.id 
           FROM public.users u
           JOIN public.roles r ON u.role_id = r.id
           WHERE LOWER(r.name) = LOWER($1)
             AND u.deleted_at IS NULL
             AND u.is_active = TRUE`,
          [roleName]
        );
        recipientIds = res.rows.map((row) => row.id);
      }

      // Include the actor in the notification recipient list so they can see their own notifications in the feed

      let count = 0;
      for (const recipientId of recipientIds) {
        const success = await this.createNotification({
          recipient_id: recipientId,
          actor_id,
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

  /**
   * Automatically initializes notification preferences for a user if they do not exist yet.
   */
  static async ensureUserPreferences(userId: string): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO public.notification_preferences (user_id) 
         VALUES ($1) 
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
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
