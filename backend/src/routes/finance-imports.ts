import { Router, Response } from "express";
import { workbookUpload } from "../lib/multipart";
import { pool } from "../db/pool";
import { AuthRequest, requirePermissionSlugs } from "../middleware/auth";
import { hisabImportCommitSchema } from "../lib/validation";
import { sendFinanceMutationFailure } from "../lib/finance-transaction";
import {
  closedOverheadImportMessage,
  closedOverheadPreviewMonths,
  commitHisabImport,
  parseHisabWorkbook,
} from "../services/hisab-import-service";

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
      // Advisory only: the commit re-checks closures under the month locks.
      const closedMonths = await closedOverheadPreviewMonths(preview, pool);

      res.json({
        ...preview,
        blockingErrors: closedMonths.length
          ? [...preview.blockingErrors, closedOverheadImportMessage(closedMonths)]
          : preview.blockingErrors,
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

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const result = await commitHisabImport(validationResult.data, userId);
      res.status(201).json(result);
    } catch (error: unknown) {
      // Workbook rows can carry operator-entered text; log only the outcome.
      sendFinanceMutationFailure(res, "finance-import-commit", error, (failure) => ({
        message: failure.message, status: failure.status, outcomeUncertain: failure.outcomeUncertain, userId,
      }));
    }
  },
);

export default router;
