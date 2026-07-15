import { Router, Response } from "express";
import ExcelJS from "exceljs";
import { stringify } from "csv-stringify/sync";
import { Pool, PoolClient } from "pg";
import { pool } from "../db/pool";
import { AuthRequest, requirePermissionSlugs } from "../middleware/auth";
import { insertFinanceAuditLog, roundMoney, toDateString } from "../lib/finance-audit";
import {
  createCapitalInvestmentSchema,
  updateCapitalInvestmentSchema,
  rejectCapitalInvestmentSchema,
  capitalInvestmentListQuerySchema,
  capitalInvestmentSummaryQuerySchema,
  capitalInvestmentExportQuerySchema,
  overheadMonthToDate,
} from "../lib/validation";

const router = Router();
const INVESTMENT_ENTITY_TYPE = "capital_investment";
const INVESTMENT_SORT_SQL: Record<string, string> = {
  purchase_date: "ci.purchase_date",
  created_at: "ci.created_at",
  updated_at: "ci.updated_at",
  total_cost: "ci.total_cost",
  item_name: "ci.item_name",
  status: "ci.status",
  recent: "ci.updated_at",
};

function formatInvestmentRow(row: Record<string, any>): Record<string, any> {
  return {
    ...row,
    quantity: Number(row.quantity || 0),
    unit_cost: roundMoney(row.unit_cost),
    total_cost: roundMoney(row.total_cost),
  };
}

function buildInvestmentWhere(query: {
  month?: string;
  status?: string;
  category?: string;
  capex_classification?: string;
  linked?: "linked" | "unlinked";
  search?: string;
}): { whereClause: string; params: any[] } {
  const params: any[] = [];
  const conditions = ["ci.deleted_at IS NULL"];

  if (query.month) {
    const monthStart = overheadMonthToDate(query.month);
    params.push(monthStart);
    conditions.push(`ci.purchase_date >= $${params.length}`);
    params.push(nextMonthDate(monthStart));
    conditions.push(`ci.purchase_date < $${params.length}`);
  }
  if (query.status) {
    params.push(query.status);
    conditions.push(`ci.status = $${params.length}`);
  }
  if (query.category) {
    params.push(query.category);
    conditions.push(`ci.category = $${params.length}`);
  }
  if (query.capex_classification) {
    params.push(query.capex_classification);
    conditions.push(`ci.capex_classification = $${params.length}`);
  }
  if (query.linked === "linked") {
    conditions.push("ci.asset_id IS NOT NULL");
  } else if (query.linked === "unlinked") {
    conditions.push("ci.asset_id IS NULL");
  }
  if (query.search?.trim()) {
    params.push(`%${query.search.trim()}%`);
    conditions.push(`(ci.item_name ILIKE $${params.length} OR ci.vendor ILIKE $${params.length} OR ci.notes ILIKE $${params.length})`);
  }

  return { whereClause: conditions.join(" AND "), params };
}

function nextMonthDate(monthDate: string): string {
  const start = new Date(`${monthDate}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() + 1);
  return start.toISOString().slice(0, 10);
}

async function assetExists(client: PoolClient | Pool, assetId: string | null | undefined): Promise<boolean> {
  if (!assetId) return true;
  const result = await client.query("SELECT 1 FROM items WHERE id = $1 AND deleted_at IS NULL", [assetId]);
  return (result.rowCount ?? 0) > 0;
}

function describeInvestment(row: Record<string, any>): string {
  const vendor = row.vendor ? ` from ${row.vendor}` : "";
  const assetLink = row.asset_id ? ` linked to asset ${row.asset_id}` : " without asset link";
  return `${row.item_name} ${roundMoney(row.total_cost)} ${row.capex_classification}${vendor}${assetLink}`;
}

function normalizeUnit(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

type StockApplication = {
  movement_id: string;
  item_id: string;
  item_name: string;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
};

class StockApplicationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Apply a stock-creating investment to its linked item exactly once (issue #172).
 *
 * Invariant: items.quantity is TOTAL OWNED stock; availability is derived by
 * subtracting outstanding event allocations, so this single increment is the
 * only mutation an approved purchase performs. Must run inside the approval
 * transaction with the investment row already locked; locks the item row second
 * (deterministic order). The UNIQUE (source_type, source_id) index on
 * inventory_movements is the database-level idempotency backstop.
 */
async function applyInvestmentStock(
  client: PoolClient,
  investment: Record<string, any>,
  userId: string | null,
): Promise<StockApplication> {
  if (!investment.asset_id) {
    throw new StockApplicationError(409, "This purchase is marked as creating stock but has no linked inventory item");
  }
  const quantity = Number(investment.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new StockApplicationError(
      409,
      `Stock-creating purchases must use a positive whole-number quantity (got ${investment.quantity})`,
    );
  }

  const itemResult = await client.query(
    "SELECT id, name, quantity, unit_of_measurement FROM items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
    [investment.asset_id],
  );
  if (itemResult.rowCount === 0) {
    throw new StockApplicationError(409, "The linked inventory item no longer exists or was deleted");
  }
  const item = itemResult.rows[0];

  const investmentUnit = normalizeUnit(investment.unit);
  const itemUnit = normalizeUnit(item.unit_of_measurement || "pcs");
  if (investmentUnit !== itemUnit) {
    throw new StockApplicationError(
      409,
      `Unit mismatch: purchase is in "${investment.unit}" but item "${item.name}" is tracked in "${item.unit_of_measurement || "pcs"}"`,
    );
  }

  const quantityBefore = Number(item.quantity);
  const quantityAfter = quantityBefore + quantity;
  const noteParts = [`Approved capital investment: ${investment.item_name}`];
  if (investment.vendor) noteParts.push(`vendor: ${investment.vendor}`);

  const movementResult = await client.query(
    `INSERT INTO inventory_movements
       (item_id, quantity_delta, quantity_before, quantity_after, source_type, source_id, notes, created_by)
     VALUES ($1, $2, $3, $4, 'capital_investment', $5, $6, $7)
     RETURNING id`,
    [item.id, quantity, quantityBefore, quantityAfter, investment.id, noteParts.join(" | "), userId],
  );
  await client.query("UPDATE items SET quantity = $2, updated_at = NOW() WHERE id = $1", [item.id, quantityAfter]);

  return {
    movement_id: movementResult.rows[0].id,
    item_id: item.id,
    item_name: item.name,
    quantity_delta: quantity,
    quantity_before: quantityBefore,
    quantity_after: quantityAfter,
  };
}

// GET /finance/investments - paginated capex register
router.get(
  "/",
  requirePermissionSlugs(["finance:investments:read"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const validationResult = capitalInvestmentListQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const query = validationResult.data;
      const { whereClause, params } = buildInvestmentWhere(query);

      const countResult = await pool.query(`SELECT COUNT(*) FROM capital_investments ci WHERE ${whereClause}`, params);
      const total = Number(countResult.rows[0]?.count || 0);
      const offset = (query.page - 1) * query.limit;
      const sortSql = INVESTMENT_SORT_SQL[query.sortBy] || INVESTMENT_SORT_SQL.purchase_date;
      const sortDirection = query.sortOrder === "asc" ? "ASC" : "DESC";

      const listResult = await pool.query(
        `SELECT ci.*, i.name AS asset_name, i.quantity AS asset_quantity, i.unit_of_measurement AS asset_unit,
                cu.username AS created_by_username, au.username AS approved_by_username
         FROM capital_investments ci
         LEFT JOIN items i ON i.id = ci.asset_id
         LEFT JOIN users cu ON cu.id = ci.created_by
         LEFT JOIN users au ON au.id = ci.approved_by
         WHERE ${whereClause}
         ORDER BY ${sortSql} ${sortDirection}, ci.updated_at DESC, ci.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, query.limit, offset],
      );

      res.json({
        investments: listResult.rows.map(formatInvestmentRow),
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      });
    } catch (error: any) {
      console.error("[finance-investments-list] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },
);

// GET /finance/investments/summary - approved totals by category/classification
router.get(
  "/summary",
  requirePermissionSlugs(["finance:investments:read"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const validationResult = capitalInvestmentSummaryQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const query = validationResult.data;
      const { whereClause, params } = buildInvestmentWhere(query);

      const [totalResult, categoryResult, classResult] = await Promise.all([
        pool.query(
          `SELECT
             COALESCE(SUM(total_cost) FILTER (WHERE status = 'Approved'), 0)::numeric AS approved_total,
             COALESCE(SUM(total_cost) FILTER (WHERE status = 'Pending'), 0)::numeric AS pending_total,
             COUNT(*) FILTER (WHERE status = 'Pending')::int AS pending_count,
             COUNT(*) FILTER (WHERE asset_id IS NOT NULL)::int AS linked_count,
             COUNT(*) FILTER (WHERE asset_id IS NULL)::int AS unlinked_count
           FROM capital_investments ci
           WHERE ${whereClause}`,
          params,
        ),
        pool.query(
          `SELECT category, COALESCE(SUM(total_cost) FILTER (WHERE status = 'Approved'), 0)::numeric AS amount
           FROM capital_investments ci
           WHERE ${whereClause}
           GROUP BY category
           HAVING COALESCE(SUM(total_cost) FILTER (WHERE status = 'Approved'), 0) > 0
           ORDER BY 2 DESC`,
          params,
        ),
        pool.query(
          `SELECT capex_classification, COALESCE(SUM(total_cost) FILTER (WHERE status = 'Approved'), 0)::numeric AS amount
           FROM capital_investments ci
           WHERE ${whereClause}
           GROUP BY capex_classification
           HAVING COALESCE(SUM(total_cost) FILTER (WHERE status = 'Approved'), 0) > 0
           ORDER BY 2 DESC`,
          params,
        ),
      ]);

      const totals = totalResult.rows[0] || {};
      res.json({
        totals: {
          approvedTotal: roundMoney(totals.approved_total),
          pendingTotal: roundMoney(totals.pending_total),
          pendingCount: Number(totals.pending_count || 0),
          linkedCount: Number(totals.linked_count || 0),
          unlinkedCount: Number(totals.unlinked_count || 0),
        },
        byCategory: categoryResult.rows.map((row) => ({ category: row.category, amount: roundMoney(row.amount) })),
        byClassification: classResult.rows.map((row) => ({
          capex_classification: row.capex_classification,
          amount: roundMoney(row.amount),
        })),
      });
    } catch (error: any) {
      console.error("[finance-investments-summary] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },
);

// GET /finance/investments/export - owner/accountant review export
router.get(
  "/export",
  requirePermissionSlugs(["finance:investments:approve"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const validationResult = capitalInvestmentExportQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const query = validationResult.data;
      const { whereClause, params } = buildInvestmentWhere(query);
      const result = await pool.query(
        `SELECT ci.purchase_date, ci.item_name, ci.category, ci.quantity, ci.unit, ci.unit_cost, ci.total_cost,
                ci.vendor, ci.capex_classification, ci.creates_inventory_stock, ci.status,
                i.name AS asset_name
         FROM capital_investments ci
         LEFT JOIN items i ON i.id = ci.asset_id
         WHERE ${whereClause}
         ORDER BY ci.purchase_date DESC, ci.created_at DESC
         LIMIT $${params.length + 1}`,
        [...params, query.maxRows],
      );

      const rows = result.rows.map((row) => ({
        purchase_date: toDateString(row.purchase_date),
        item_name: row.item_name,
        category: row.category,
        quantity: Number(row.quantity || 0),
        unit: row.unit,
        unit_cost: roundMoney(row.unit_cost),
        total_cost: roundMoney(row.total_cost),
        vendor: row.vendor || "",
        capex_classification: row.capex_classification,
        linked_asset: row.asset_name || "",
        creates_inventory_stock: row.creates_inventory_stock ? "Yes" : "No",
        status: row.status,
      }));

      if (query.format === "xlsx") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Capital Investments");
        sheet.columns = Object.keys(rows[0] || {
          purchase_date: "",
          item_name: "",
          category: "",
          quantity: "",
          unit: "",
          unit_cost: "",
          total_cost: "",
          vendor: "",
          capex_classification: "",
          linked_asset: "",
          creates_inventory_stock: "",
          status: "",
        }).map((key) => ({ header: key, key, width: 22 }));
        sheet.addRows(rows);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=capital-investments.xlsx");
        await workbook.xlsx.write(res);
        res.end();
        return;
      }

      const csv = stringify(rows, { header: true });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=capital-investments.csv");
      res.send(csv);
    } catch (error: any) {
      console.error("[finance-investments-export] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },
);

// POST /finance/investments - create a pending capex entry
router.post(
  "/",
  requirePermissionSlugs(["finance:investments:write"]),
  async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const validationResult = createCapitalInvestmentSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const input = validationResult.data;
      if (!(await assetExists(client, input.asset_id))) {
        res.status(400).json({ error: "Linked asset was not found" });
        return;
      }

      await client.query("BEGIN");
      const insertResult = await client.query(
        `INSERT INTO capital_investments
           (purchase_date, item_name, category, quantity, unit, unit_cost, vendor, notes,
            capex_classification, asset_id, creates_inventory_stock, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          input.purchase_date,
          input.item_name,
          input.category,
          input.quantity,
          input.unit,
          input.unit_cost,
          input.vendor ?? null,
          input.notes ?? null,
          input.capex_classification,
          input.asset_id ?? null,
          input.creates_inventory_stock,
          req.user?.id || null,
        ],
      );
      const investment = insertResult.rows[0];
      await insertFinanceAuditLog(client, {
        entityType: INVESTMENT_ENTITY_TYPE,
        entityId: investment.id,
        userId: req.user?.id || null,
        action: "create",
        newValue: describeInvestment(investment),
        note: investment.notes,
      });
      await client.query("COMMIT");
      res.status(201).json({ investment: formatInvestmentRow(investment) });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[finance-investments-create] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  },
);

// PATCH /finance/investments/:id - edit a non-approved capex entry
router.patch(
  "/:id",
  requirePermissionSlugs(["finance:investments:write"]),
  async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const validationResult = updateCapitalInvestmentSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const input = validationResult.data;

      await client.query("BEGIN");
      const existingResult = await client.query(
        "SELECT * FROM capital_investments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [req.params.id],
      );
      if (existingResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Capital investment not found" });
        return;
      }
      const existing = existingResult.rows[0];
      if (existing.status === "Approved") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Approved capital investments are locked and cannot be edited" });
        return;
      }
      const hasKey = (key: string) => Object.prototype.hasOwnProperty.call(req.body ?? {}, key);
      const nextAssetId = hasKey("asset_id") ? input.asset_id ?? null : existing.asset_id;
      if (!(await assetExists(client, nextAssetId))) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Linked asset was not found" });
        return;
      }

      // Issue #172: validate the MERGED row for stock-creation rules (a partial
      // patch could otherwise strip the asset link or introduce a fractional
      // quantity on a stock-creating purchase).
      const nextCreatesStock = input.creates_inventory_stock ?? existing.creates_inventory_stock;
      const nextQuantity = input.quantity ?? Number(existing.quantity);
      if (nextCreatesStock) {
        if (!nextAssetId) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "A linked inventory item is required when the purchase creates stock" });
          return;
        }
        if (!Number.isInteger(Number(nextQuantity))) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Stock-creating purchases must use a whole-number quantity" });
          return;
        }
      }

      const updateResult = await client.query(
        `UPDATE capital_investments
         SET purchase_date = COALESCE($2, purchase_date),
             item_name = COALESCE($3, item_name),
             category = COALESCE($4, category),
             quantity = COALESCE($5, quantity),
             unit = COALESCE($6, unit),
             unit_cost = COALESCE($7, unit_cost),
             vendor = $8,
             notes = $9,
             capex_classification = COALESCE($10, capex_classification),
             asset_id = $11,
             creates_inventory_stock = COALESCE($12, creates_inventory_stock),
             status = 'Pending',
             rejected_reason = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          req.params.id,
          input.purchase_date ?? null,
          input.item_name ?? null,
          input.category ?? null,
          input.quantity ?? null,
          input.unit ?? null,
          input.unit_cost ?? null,
          hasKey("vendor") ? input.vendor ?? null : existing.vendor,
          hasKey("notes") ? input.notes ?? null : existing.notes,
          input.capex_classification ?? null,
          nextAssetId,
          input.creates_inventory_stock ?? null,
        ],
      );
      const updated = updateResult.rows[0];
      await insertFinanceAuditLog(client, {
        entityType: INVESTMENT_ENTITY_TYPE,
        entityId: updated.id,
        userId: req.user?.id || null,
        action: "update",
        oldValue: `${describeInvestment(existing)} [${existing.status}]`,
        newValue: `${describeInvestment(updated)} [Pending]`,
        note: updated.notes,
      });
      await client.query("COMMIT");
      res.json({ investment: formatInvestmentRow(updated) });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[finance-investments-update] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  },
);

// DELETE /finance/investments/:id - soft delete pending/rejected capex
router.delete(
  "/:id",
  requirePermissionSlugs(["finance:investments:approve"]),
  async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existingResult = await client.query(
        "SELECT * FROM capital_investments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [req.params.id],
      );
      if (existingResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Capital investment not found" });
        return;
      }
      const existing = existingResult.rows[0];
      if (existing.status === "Approved") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Approved capital investments are locked and cannot be deleted" });
        return;
      }
      await client.query("UPDATE capital_investments SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1", [req.params.id]);
      await insertFinanceAuditLog(client, {
        entityType: INVESTMENT_ENTITY_TYPE,
        entityId: existing.id,
        userId: req.user?.id || null,
        action: "delete",
        oldValue: describeInvestment(existing),
        note: existing.notes,
      });
      await client.query("COMMIT");
      res.json({ deleted: true });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[finance-investments-delete] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  },
);

async function reviewInvestment(req: AuthRequest, res: Response, decision: "Approved" | "Rejected"): Promise<void> {
  const client = await pool.connect();
  try {
    let rejectedReason: string | null = null;
    if (decision === "Rejected") {
      const validationResult = rejectCapitalInvestmentSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      rejectedReason = validationResult.data.rejected_reason;
    }

    await client.query("BEGIN");
    const existingResult = await client.query(
      "SELECT * FROM capital_investments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
      [req.params.id],
    );
    if (existingResult.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Capital investment not found" });
      return;
    }
    const existing = existingResult.rows[0];
    if (existing.status !== "Pending") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: `Only pending capital investments can be reviewed (current status: ${existing.status})` });
      return;
    }

    // Issue #172: approving a stock-creating purchase applies the quantity to
    // the linked item exactly once, inside this same transaction. Rejection and
    // non-stock approvals never touch inventory.
    let stockApplication: StockApplication | null = null;
    if (decision === "Approved" && existing.creates_inventory_stock) {
      stockApplication = await applyInvestmentStock(client, existing, req.user?.id || null);
    }

    const updateResult = await client.query(
      `UPDATE capital_investments
       SET status = $2,
           rejected_reason = $3,
           approved_by = $4,
           approved_at = NOW(),
           stock_applied_at = CASE WHEN $5::boolean THEN NOW() ELSE stock_applied_at END,
           stock_applied_by = CASE WHEN $5::boolean THEN $4 ELSE stock_applied_by END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, decision, rejectedReason, req.user?.id || null, stockApplication !== null],
    );
    const updated = updateResult.rows[0];
    await insertFinanceAuditLog(client, {
      entityType: INVESTMENT_ENTITY_TYPE,
      entityId: updated.id,
      userId: req.user?.id || null,
      action: decision === "Approved" ? "approve" : "reject",
      fieldChanged: "status",
      oldValue: "Pending",
      newValue: stockApplication
        ? `${decision} (stock applied: +${stockApplication.quantity_delta} to item ${stockApplication.item_id}, ${stockApplication.quantity_before} -> ${stockApplication.quantity_after})`
        : decision,
      note: rejectedReason,
    });
    await client.query("COMMIT");
    res.json({ investment: formatInvestmentRow(updated), stock_application: stockApplication });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error instanceof StockApplicationError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error?.code === "23505" && String(error?.constraint || "").includes("inventory_movements")) {
      // Database-level idempotency backstop: a movement for this investment
      // already exists (e.g. a racing approval that won).
      res.status(409).json({ error: "Stock has already been applied for this investment" });
      return;
    }
    console.error(`[finance-investments-${decision.toLowerCase()}] Error:`, error);
    res.status(500).json({ error: error.message || "Internal server error" });
  } finally {
    client.release();
  }
}

router.post(
  "/:id/approve",
  requirePermissionSlugs(["finance:investments:approve"]),
  (req: AuthRequest, res: Response) => reviewInvestment(req, res, "Approved"),
);

router.post(
  "/:id/reject",
  requirePermissionSlugs(["finance:investments:approve"]),
  (req: AuthRequest, res: Response) => reviewInvestment(req, res, "Rejected"),
);

export default router;
