import { Router, Response } from "express";
import { workbookUpload } from "../lib/multipart";
import { pool } from "../db/pool";
import { AuthRequest, requirePermissionSlugs } from "../middleware/auth";
import { hisabImportCommitSchema } from "../lib/validation";
import { commitHisabImport, parseHisabWorkbook } from "../services/hisab-import-service";

const router = Router();

router.post(
  "/hisab/preview",
  requirePermissionSlugs(["finance:imports:write"]),
  workbookUpload,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file?.buffer) {
        res.status(400).json({ error: "Workbook file is required" });
        return;
      }

      const preview = await parseHisabWorkbook(req.file.buffer, req.file.originalname);
      const duplicate = await pool.query(
        "SELECT id, committed_at FROM finance_import_batches WHERE workbook_hash = $1 AND status = 'Committed' LIMIT 1",
        [preview.workbookHash],
      );

      res.json({
        ...preview,
        duplicate: (duplicate.rowCount ?? 0) > 0
          ? { importId: duplicate.rows[0].id, committedAt: duplicate.rows[0].committed_at }
          : null,
      });
    } catch (error: any) {
      console.error("[finance-import-preview] Error:", { message: error.message, userId: req.user?.id });
      res.status(400).json({ error: error.message || "Failed to parse workbook" });
    }
  },
);

router.post(
  "/hisab/commit",
  requirePermissionSlugs(["finance:imports:write"]),
  async (req: AuthRequest, res: Response) => {
    const validationResult = hisabImportCommitSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const client = await pool.connect();
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const result = await commitHisabImport(client, validationResult.data, userId);
      res.status(201).json(result);
    } catch (error: any) {
      const status = Number(error.statusCode || 500);
      console.error("[finance-import-commit] Error:", { message: error.message, status, userId: req.user?.id });
      res.status(status).json({ error: error.message || "Failed to commit import" });
    } finally {
      client.release();
    }
  },
);

export default router;
