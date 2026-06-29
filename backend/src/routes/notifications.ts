import { Router, Response } from "express";
import { pool } from "../db/pool";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { NotificationsService } from "../services/notifications-service";

const router = Router();

// GET /notifications - Paginated list of unarchived notifications for current user
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 10)));
    const offset = (page - 1) * limit;

    // Fetch notifications
    const itemsRes = await pool.query(
      `SELECT n.*, u.username as actor_username, u.full_name as actor_name
       FROM public.notifications n
       LEFT JOIN public.users u ON n.actor_id = u.id
       WHERE n.recipient_id = $1 AND n.archived_at IS NULL
       ORDER BY n.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // Fetch total count
    const countRes = await pool.query(
      `SELECT COUNT(*) as total FROM public.notifications WHERE recipient_id = $1 AND archived_at IS NULL`,
      [userId]
    );
    const total = Number(countRes.rows[0]?.total || 0);
    const totalPages = Math.ceil(total / limit);

    res.json({
      notifications: itemsRes.rows,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (error: any) {
    console.error("[GET /notifications] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /notifications/unread-count - Fetch unread count for current user
router.get("/unread-count", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const countRes = await pool.query(
      `SELECT COUNT(*) as unread_count 
       FROM public.notifications 
       WHERE recipient_id = $1 AND read_at IS NULL AND archived_at IS NULL`,
      [userId]
    );
    res.json({ unread_count: Number(countRes.rows[0]?.unread_count || 0) });
  } catch (error: any) {
    console.error("[GET /notifications/unread-count] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// PATCH /notifications/:id/read - Mark a single notification as read
router.patch("/:id/read", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await pool.query(
      `UPDATE public.notifications
       SET read_at = NOW()
       WHERE id = $1 AND recipient_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notification not found or access denied" });
    }

    res.json({ success: true, notification: result.rows[0] });
  } catch (error: any) {
    console.error("[PATCH /notifications/:id/read] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /notifications/mark-all-read - Mark all notifications as read for current user
router.post("/mark-all-read", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await pool.query(
      `UPDATE public.notifications
       SET read_at = NOW()
       WHERE recipient_id = $1 AND read_at IS NULL AND archived_at IS NULL`,
      [userId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("[POST /notifications/mark-all-read] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// PATCH /notifications/:id/archive - Archive a notification
router.patch("/:id/archive", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await pool.query(
      `UPDATE public.notifications
       SET archived_at = NOW(), read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND recipient_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notification not found or access denied" });
    }

    res.json({ success: true, notification: result.rows[0] });
  } catch (error: any) {
    console.error("[PATCH /notifications/:id/archive] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /notifications/preferences - Fetch notification preferences
router.get("/preferences", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Ensure preferences record exists
    await NotificationsService.ensureUserPreferences(userId);

    const prefRes = await pool.query(
      `SELECT in_app_enabled, email_enabled, push_enabled, categories
       FROM public.notification_preferences
       WHERE user_id = $1`,
      [userId]
    );

    res.json(prefRes.rows[0]);
  } catch (error: any) {
    console.error("[GET /notifications/preferences] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// PUT /notifications/preferences - Update notification preferences
router.put("/preferences", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { in_app_enabled, email_enabled, push_enabled, categories } = req.body;

    const result = await pool.query(
      `INSERT INTO public.notification_preferences (
        user_id, in_app_enabled, email_enabled, push_enabled, categories, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET in_app_enabled = EXCLUDED.in_app_enabled,
           email_enabled = EXCLUDED.email_enabled,
           push_enabled = EXCLUDED.push_enabled,
           categories = EXCLUDED.categories,
           updated_at = NOW()
       RETURNING *`,
      [
        userId,
        in_app_enabled !== undefined ? Boolean(in_app_enabled) : true,
        email_enabled !== undefined ? Boolean(email_enabled) : true,
        push_enabled !== undefined ? Boolean(push_enabled) : false,
        categories || '{"proposals": true, "events": true, "expenses": true, "payroll": true, "inventory": true}',
      ]
    );

    res.json({ success: true, preferences: result.rows[0] });
  } catch (error: any) {
    console.error("[PUT /notifications/preferences] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export const notificationsRouter = router;
