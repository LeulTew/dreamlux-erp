import { Router, Response } from "express";
import { pool } from "../db/pool";
import { AuthRequest, requireAuth } from "../middleware/auth";
import {
  recordListPreferenceParamsSchema,
  recordListPreferencePayloadSchema,
} from "../lib/validation";

const router = Router();

function requireUserId(req: AuthRequest, res: Response): string | null {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Authenticated user id is required" });
    return null;
  }
  return userId;
}

function formatPreference(row: Record<string, any> | undefined | null, recordType: string) {
  if (!row) {
    return {
      record_type: recordType,
      sort: null,
      filters: {},
      pageSize: null,
      visibleColumns: [],
      density: null,
      activeTab: null,
      updated_at: null,
    };
  }

  return {
    id: row.id,
    record_type: row.record_type,
    sort: row.sort ?? null,
    filters: row.filters ?? {},
    pageSize: row.page_size ?? null,
    visibleColumns: row.visible_columns ?? [],
    density: row.density ?? null,
    activeTab: row.active_tab ?? null,
    updated_at: row.updated_at,
  };
}

router.get("/record-list/:recordType", requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const parsedParams = recordListPreferenceParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.errors[0].message });
      return;
    }

    const { recordType } = parsedParams.data;
    const result = await pool.query(
      `SELECT id, record_type, sort, filters, page_size, visible_columns, density, active_tab, updated_at
       FROM public.record_list_preferences
       WHERE user_id = $1 AND record_type = $2
       LIMIT 1`,
      [userId, recordType],
    );

    res.json({ preference: formatPreference(result.rows[0], recordType) });
  } catch (error: any) {
    console.error("[record-preferences-get] Error:", error);
    res.status(500).json({ error: "Failed to fetch record list preference" });
  }
});

router.put("/record-list/:recordType", requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const parsedParams = recordListPreferenceParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.errors[0].message });
      return;
    }

    const parsedBody = recordListPreferencePayloadSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.errors[0].message });
      return;
    }

    const { recordType } = parsedParams.data;
    const input = parsedBody.data;
    const result = await pool.query(
      `INSERT INTO public.record_list_preferences (
         user_id, record_type, sort, filters, page_size, visible_columns, density, active_tab, updated_at
       )
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6::text[], $7, $8, NOW())
       ON CONFLICT (user_id, record_type)
       DO UPDATE SET
         sort = EXCLUDED.sort,
         filters = EXCLUDED.filters,
         page_size = EXCLUDED.page_size,
         visible_columns = EXCLUDED.visible_columns,
         density = EXCLUDED.density,
         active_tab = EXCLUDED.active_tab,
         updated_at = NOW()
       RETURNING id, record_type, sort, filters, page_size, visible_columns, density, active_tab, updated_at`,
      [
        userId,
        recordType,
        input.sort ? JSON.stringify(input.sort) : null,
        JSON.stringify(input.filters ?? {}),
        input.pageSize ?? null,
        input.visibleColumns ?? [],
        input.density ?? null,
        input.activeTab ?? null,
      ],
    );

    res.json({ preference: formatPreference(result.rows[0], recordType) });
  } catch (error: any) {
    console.error("[record-preferences-put] Error:", error);
    res.status(500).json({ error: "Failed to save record list preference" });
  }
});

export default router;
