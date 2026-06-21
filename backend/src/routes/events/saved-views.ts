import { Pool, PoolClient } from "pg";
import { Router, Response } from "express";
import { pool } from "../../db/pool";
import { requireAuth, AuthRequest, getEffectivePermissionSlugsFromUser } from "../../middleware/auth";
import { hasPermissionSlug } from "../../lib/permissions";
import { eventSavedViewPayloadSchema } from "../../lib/validation";

function hasPermission(req: AuthRequest, slug: string): boolean {
  return hasPermissionSlug(getEffectivePermissionSlugsFromUser(req.user), slug);
}

function canShareSavedViews(req: AuthRequest): boolean {
  return hasPermission(req, "events:saved_views:share") || hasPermission(req, "users:manage");
}

function getUserRoleNames(req: AuthRequest): string[] {
  return [req.user?.role, ...(req.user?.roles || [])]
    .filter((role): role is string => Boolean(role))
    .map((role) => role.toLowerCase());
}

function canAccessSavedViewRow(row: any, req: AuthRequest): boolean {
  if (row.scope === "global") return true;
  if (row.scope === "personal") return row.user_id === req.user?.id;
  if (row.scope === "role") return getUserRoleNames(req).includes(String(row.role_name || "").toLowerCase());
  return false;
}

async function clearSavedViewDefault(
  client: PoolClient,
  scope: string,
  userId: string | null,
  roleName: string | null,
  exceptId?: string,
): Promise<void> {
  const params: any[] = [scope];
  let targetCondition: string;

  if (scope === "personal") {
    params.push(userId);
    targetCondition = `user_id = $${params.length}`;
  } else if (scope === "role") {
    params.push((roleName || "").toLowerCase());
    targetCondition = `LOWER(role_name) = $${params.length}`;
  } else {
    targetCondition = "scope = 'global'";
  }

  let exceptCondition = "";
  if (exceptId) {
    params.push(exceptId);
    exceptCondition = `AND id <> $${params.length}`;
  }

  await client.query(
    `
      UPDATE event_saved_views
      SET is_default = FALSE, updated_at = NOW()
      WHERE deleted_at IS NULL
        AND scope = $1
        AND ${targetCondition}
        ${exceptCondition}
    `,
    params,
  );
}

async function insertSavedViewAuditLog(
  client: PoolClient | Pool,
  userId: string | null,
  fieldChanged: string,
  oldValue: string | null,
  newValue: string | null,
): Promise<void> {
  await client.query(
    `
      INSERT INTO event_logs (event_id, user_id, field_changed, old_value, new_value)
      VALUES (NULL, $1, $2, $3, $4)
    `,
    [userId, fieldChanged, oldValue, newValue],
  );
}

export function createEventSavedViewsRouter(): Router {
  const router = Router();

  // GET /events/saved-views - List personal, matching-role, and global saved event views
  router.get("/saved-views", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const roleNames = getUserRoleNames(req);
      const result = await pool.query(
        `
          SELECT *
          FROM event_saved_views
          WHERE deleted_at IS NULL
            AND (
              (scope = 'personal' AND user_id = $1)
              OR scope = 'global'
              OR (scope = 'role' AND LOWER(role_name) = ANY($2::text[]))
            )
          ORDER BY is_default DESC, scope ASC, name ASC
        `,
        [req.user?.id || null, roleNames],
      );

      res.json({ savedViews: result.rows });
    } catch (error: any) {
      console.error("[get-event-saved-views] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // POST /events/saved-views - Create a saved event view
  router.post("/saved-views", requireAuth, async (req: AuthRequest, res: Response) => {
    const validationResult = eventSavedViewPayloadSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const payload = validationResult.data;
    if (payload.scope !== "personal" && !canShareSavedViews(req)) {
      res.status(403).json({ error: "Forbidden: Missing saved view sharing permission" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (payload.is_default) {
        await clearSavedViewDefault(client, payload.scope, req.user?.id || null, payload.role_name || null);
      }

      const result = await client.query(
        `
          INSERT INTO event_saved_views (
            name, user_id, scope, role_name, columns, filters, sort, page_size,
            is_default, created_by, updated_by
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $10)
          RETURNING *
        `,
        [
          payload.name.trim(),
          payload.scope === "personal" ? req.user?.id || null : null,
          payload.scope,
          payload.scope === "role" ? payload.role_name?.trim() || null : null,
          JSON.stringify(payload.columns),
          JSON.stringify(payload.filters),
          payload.sort ? JSON.stringify(payload.sort) : null,
          payload.page_size,
          payload.is_default,
          req.user?.id || null,
        ],
      );

      if (payload.scope !== "personal") {
        await insertSavedViewAuditLog(client, req.user?.id || null, "event_saved_view_shared", null, `${payload.scope}:${payload.name.trim()}`);
      }

      await client.query("COMMIT");
      res.status(201).json({ savedView: result.rows[0] });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[create-event-saved-view] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  });

  // PUT /events/saved-views/:viewId - Update a saved event view
  router.put("/saved-views/:viewId", requireAuth, async (req: AuthRequest, res: Response) => {
    const validationResult = eventSavedViewPayloadSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { viewId } = req.params;
    const payload = validationResult.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingResult = await client.query(
        `SELECT * FROM event_saved_views WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [viewId],
      );
      if (existingResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Saved view not found" });
        return;
      }

      const existing = existingResult.rows[0];
      const canEdit = existing.scope === "personal"
        ? existing.user_id === req.user?.id
        : canShareSavedViews(req);
      if (!canEdit || (payload.scope !== "personal" && !canShareSavedViews(req))) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "Forbidden: Cannot update this saved view" });
        return;
      }

      const targetUserId = payload.scope === "personal" ? req.user?.id || null : null;
      const targetRoleName = payload.scope === "role" ? payload.role_name?.trim() || null : null;
      if (payload.is_default) {
        await clearSavedViewDefault(client, payload.scope, targetUserId, targetRoleName, viewId);
      }

      const result = await client.query(
        `
          UPDATE event_saved_views
          SET name = $1,
              user_id = $2,
              scope = $3,
              role_name = $4,
              columns = $5::jsonb,
              filters = $6::jsonb,
              sort = $7::jsonb,
              page_size = $8,
              is_default = $9,
              updated_by = $10,
              updated_at = NOW()
          WHERE id = $11
          RETURNING *
        `,
        [
          payload.name.trim(),
          targetUserId,
          payload.scope,
          targetRoleName,
          JSON.stringify(payload.columns),
          JSON.stringify(payload.filters),
          payload.sort ? JSON.stringify(payload.sort) : null,
          payload.page_size,
          payload.is_default,
          req.user?.id || null,
          viewId,
        ],
      );

      if (existing.scope !== payload.scope || existing.role_name !== targetRoleName) {
        await insertSavedViewAuditLog(client, req.user?.id || null, "event_saved_view_scope_changed", `${existing.scope}:${existing.role_name || ""}`, `${payload.scope}:${targetRoleName || ""}`);
      }

      await client.query("COMMIT");
      res.json({ savedView: result.rows[0] });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[update-event-saved-view] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  });

  // POST /events/saved-views/:viewId/duplicate - Duplicate a visible saved view as personal
  router.post("/saved-views/:viewId/duplicate", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { viewId } = req.params;
      const existingResult = await pool.query(
        `SELECT * FROM event_saved_views WHERE id = $1 AND deleted_at IS NULL`,
        [viewId],
      );
      if (existingResult.rowCount === 0) {
        res.status(404).json({ error: "Saved view not found" });
        return;
      }

      const existing = existingResult.rows[0];
      if (!canAccessSavedViewRow(existing, req)) {
        res.status(403).json({ error: "Forbidden: Cannot duplicate this saved view" });
        return;
      }

      const duplicateName = typeof req.body?.name === "string" && req.body.name.trim()
        ? req.body.name.trim().slice(0, 120)
        : `${existing.name} Copy`.slice(0, 120);

      const result = await pool.query(
        `
          INSERT INTO event_saved_views (
            name, user_id, scope, role_name, columns, filters, sort, page_size,
            is_default, created_by, updated_by
          ) VALUES ($1, $2, 'personal', NULL, $3::jsonb, $4::jsonb, $5::jsonb, $6, FALSE, $2, $2)
          RETURNING *
        `,
        [
          duplicateName,
          req.user?.id || null,
          JSON.stringify(existing.columns || []),
          JSON.stringify(existing.filters || []),
          existing.sort ? JSON.stringify(existing.sort) : null,
          existing.page_size || 20,
        ],
      );

      res.status(201).json({ savedView: result.rows[0] });
    } catch (error: any) {
      console.error("[duplicate-event-saved-view] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // PATCH /events/saved-views/:viewId/default - Make a saved view default for its scope
  router.patch("/saved-views/:viewId/default", requireAuth, async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingResult = await client.query(
        `SELECT * FROM event_saved_views WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [req.params.viewId],
      );
      if (existingResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Saved view not found" });
        return;
      }

      const existing = existingResult.rows[0];
      const canEdit = existing.scope === "personal"
        ? existing.user_id === req.user?.id
        : canShareSavedViews(req);
      if (!canEdit) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "Forbidden: Cannot update this saved view" });
        return;
      }

      await clearSavedViewDefault(client, existing.scope, existing.user_id, existing.role_name, existing.id);
      const result = await client.query(
        `
          UPDATE event_saved_views
          SET is_default = TRUE, updated_by = $1, updated_at = NOW()
          WHERE id = $2
          RETURNING *
        `,
        [req.user?.id || null, existing.id],
      );
      await insertSavedViewAuditLog(client, req.user?.id || null, "event_saved_view_default_set", null, existing.id);

      await client.query("COMMIT");
      res.json({ savedView: result.rows[0] });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[default-event-saved-view] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  });

  // DELETE /events/saved-views/:viewId - Soft-delete a saved event view
  router.delete("/saved-views/:viewId", requireAuth, async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingResult = await client.query(
        `SELECT * FROM event_saved_views WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [req.params.viewId],
      );
      if (existingResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Saved view not found" });
        return;
      }

      const existing = existingResult.rows[0];
      const canDelete = existing.scope === "personal"
        ? existing.user_id === req.user?.id
        : canShareSavedViews(req);
      if (!canDelete) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "Forbidden: Cannot delete this saved view" });
        return;
      }

      await client.query(
        `UPDATE event_saved_views SET deleted_at = NOW(), updated_by = $1, updated_at = NOW() WHERE id = $2`,
        [req.user?.id || null, existing.id],
      );
      await insertSavedViewAuditLog(client, req.user?.id || null, "event_saved_view_deleted", existing.id, null);

      await client.query("COMMIT");
      res.json({ success: true });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[delete-event-saved-view] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  });


  return router;
}
