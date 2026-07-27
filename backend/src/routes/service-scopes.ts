import express, { Response } from "express";
import { pool } from "../db/pool";
import { AuthRequest } from "../middleware/auth";
import { getActiveServiceScopes } from "../lib/service-scopes";

const router = express.Router();

// GET /service-scopes - List active service scopes
router.get("/", async (_req: AuthRequest, res: Response) => {
  try {
    const scopes = await getActiveServiceScopes(pool);
    // Keep the catalog response aligned with the typed frontend API contract.
    // Returning a bare array here made a successful request look like an empty
    // catalog because ServiceScopeSelect reads `response.service_scopes`.
    res.json({ service_scopes: scopes });
  } catch (error: any) {
    console.error("[service-scopes] Error fetching catalog:", error);
    res.status(500).json({ error: "Failed to fetch service scopes catalog" });
  }
});

// GET /service-scopes/:idOrCode - Get service scope by ID or Code
router.get("/:idOrCode", async (req: AuthRequest, res: Response) => {
  try {
    const { idOrCode } = req.params;
    const result = await pool.query(
      `SELECT id, code, name_en, name_am, description, display_order, is_active
       FROM event_service_scopes
       WHERE (id::text = $1 OR LOWER(code) = LOWER($1)) AND is_active = TRUE
       LIMIT 1`,
      [idOrCode],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Service scope not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error("[service-scopes] Error fetching scope:", error);
    res.status(500).json({ error: "Failed to fetch service scope" });
  }
});

export default router;
