import { Router, Response } from "express";
import { Pool, PoolClient } from "pg";
import { pool } from "../db/pool";
import { AuthRequest, requirePermissionSlugs } from "../middleware/auth";
import { insertFinanceAuditLog, roundMoney, toDateString } from "../lib/finance-audit";
import {
  createFinanceOverheadSchema,
  updateFinanceOverheadSchema,
  rejectFinanceOverheadSchema,
  financeOverheadListQuerySchema,
  financeOverheadSummaryQuerySchema,
  financeOverheadMonthParamSchema,
  overheadMonthToDate,
} from "../lib/validation";

const router = Router();

const OVERHEAD_ENTITY_TYPE = "finance_overhead_expense";
const MONTH_CLOSURE_ENTITY_TYPE = "finance_overhead_month";

function formatOverheadRow(row: Record<string, any>): Record<string, any> {
  return { ...row, amount: roundMoney(row.amount) };
}

function monthLabel(value: unknown): string {
  return toDateString(value).slice(0, 7);
}

async function isMonthClosed(client: PoolClient | Pool, monthDate: string): Promise<boolean> {
  const result = await client.query(
    "SELECT 1 FROM finance_overhead_month_closures WHERE month = $1",
    [monthDate],
  );
  return (result.rowCount ?? 0) > 0;
}

function monthEndDate(monthDate: string): string {
  const start = new Date(`${monthDate}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() + 1);
  start.setUTCDate(0);
  return start.toISOString().slice(0, 10);
}

async function hasFinalizedPayrollForEmployeeMonth(
  client: PoolClient | Pool,
  employeeId: string | null | undefined,
  monthDate: string,
): Promise<boolean> {
  if (!employeeId) {
    return false;
  }

  const result = await client.query(
    `SELECT 1
     FROM payroll_run_employee_lines line
     JOIN payroll_runs run ON run.id = line.run_id
     WHERE line.employee_id = $1
       AND run.status = 'finalized'
       AND run.deleted_at IS NULL
       AND run.period_start <= $3
       AND run.period_end >= $2
     LIMIT 1`,
    [employeeId, monthDate, monthEndDate(monthDate)],
  );
  return (result.rowCount ?? 0) > 0;
}

async function assertPayrollDoubleCountAllowed(
  client: PoolClient | Pool,
  input: { payment_kind: string; employee_id?: string | null },
  monthDate: string,
): Promise<string | null> {
  if (input.payment_kind !== "staff_payment" || !input.employee_id) {
    return null;
  }

  const hasPayroll = await hasFinalizedPayrollForEmployeeMonth(client, input.employee_id, monthDate);
  return hasPayroll
    ? "This employee already has finalized payroll for the selected month; use payroll records instead of a staff-payment overhead entry"
    : null;
}

function describeOverhead(row: Record<string, any>): string {
  const payee = row.payee ? ` to ${row.payee}` : "";
  return `${row.category} ${roundMoney(row.amount)}${payee} [${row.scope}/${row.payment_kind}] for ${monthLabel(row.expense_month)}`;
}

// GET /finance/overheads — paginated monthly overhead register
router.get(
  "/",
  requirePermissionSlugs(["finance:overheads:read"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const validationResult = financeOverheadListQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const query = validationResult.data;

      const params: any[] = [];
      const conditions = ["fo.deleted_at IS NULL"];
      if (query.month) {
        params.push(overheadMonthToDate(query.month));
        conditions.push(`fo.expense_month = $${params.length}`);
      }
      if (query.status) {
        params.push(query.status);
        conditions.push(`fo.status = $${params.length}`);
      }
      if (query.category) {
        params.push(query.category);
        conditions.push(`fo.category = $${params.length}`);
      }
      if (query.scope) {
        params.push(query.scope);
        conditions.push(`fo.scope = $${params.length}`);
      }
      if (query.payment_kind) {
        params.push(query.payment_kind);
        conditions.push(`fo.payment_kind = $${params.length}`);
      }
      if (query.search?.trim()) {
        params.push(`%${query.search.trim()}%`);
        conditions.push(`(fo.payee ILIKE $${params.length} OR fo.notes ILIKE $${params.length} OR fo.shared_with ILIKE $${params.length})`);
      }
      const whereClause = conditions.join(" AND ");

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM finance_overhead_expenses fo WHERE ${whereClause}`,
        params,
      );
      const total = Number(countResult.rows[0]?.count || 0);

      const offset = (query.page - 1) * query.limit;
      const listResult = await pool.query(
        `SELECT fo.*, cu.username AS created_by_username, au.username AS approved_by_username,
                e.full_name AS employee_name
         FROM finance_overhead_expenses fo
         LEFT JOIN users cu ON cu.id = fo.created_by
         LEFT JOIN users au ON au.id = fo.approved_by
         LEFT JOIN employees e ON e.id = fo.employee_id
         WHERE ${whereClause}
         ORDER BY fo.expense_month DESC, fo.scope ASC, fo.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, query.limit, offset],
      );

      res.json({
        overheads: listResult.rows.map(formatOverheadRow),
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      });
    } catch (error: any) {
      console.error("[finance-overheads-list] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },
);

// GET /finance/overheads/summary?month=YYYY-MM — workbook-style monthly grouping
router.get(
  "/summary",
  requirePermissionSlugs(["finance:overheads:read"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const validationResult = financeOverheadSummaryQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const monthDate = overheadMonthToDate(validationResult.data.month);

      const [groupResult, categoryResult, closureResult] = await Promise.all([
        pool.query(
          `SELECT scope, payment_kind,
                  COALESCE(SUM(amount) FILTER (WHERE status = 'Approved'), 0)::numeric AS approved_amount,
                  COALESCE(SUM(amount) FILTER (WHERE status = 'Pending'), 0)::numeric AS pending_amount,
                  COUNT(*) FILTER (WHERE status = 'Pending')::int AS pending_count
           FROM finance_overhead_expenses
           WHERE deleted_at IS NULL AND expense_month = $1
           GROUP BY scope, payment_kind`,
          [monthDate],
        ),
        pool.query(
          `SELECT category, COALESCE(SUM(amount) FILTER (WHERE status = 'Approved'), 0)::numeric AS approved_amount
           FROM finance_overhead_expenses
           WHERE deleted_at IS NULL AND expense_month = $1
           GROUP BY category
           HAVING COALESCE(SUM(amount) FILTER (WHERE status = 'Approved'), 0) > 0
           ORDER BY 2 DESC`,
          [monthDate],
        ),
        pool.query(
          `SELECT c.month, c.closed_at, u.username AS closed_by_username
           FROM finance_overhead_month_closures c
           LEFT JOIN users u ON u.id = c.closed_by
           WHERE c.month = $1`,
          [monthDate],
        ),
      ]);

      let officeStaff = 0;
      let storeStaff = 0;
      let shared = 0;
      let rentalAndOther = 0;
      let staffPayments = 0;
      let approvedTotal = 0;
      let pendingExposure = 0;
      let pendingCount = 0;

      for (const row of groupResult.rows) {
        const approved = Number(row.approved_amount || 0);
        approvedTotal += approved;
        pendingExposure += Number(row.pending_amount || 0);
        pendingCount += Number(row.pending_count || 0);
        if (row.payment_kind === "staff_payment") {
          staffPayments += approved;
        }
        if (row.scope === "Shared") {
          shared += approved;
        } else if (row.payment_kind === "staff_payment") {
          if (row.scope === "Office") officeStaff += approved;
          else if (row.scope === "Store") storeStaff += approved;
          else rentalAndOther += approved;
        } else {
          rentalAndOther += approved;
        }
      }

      const closure = closureResult.rows[0] || null;

      res.json({
        month: validationResult.data.month,
        closed: !!closure,
        closure: closure
          ? { closed_at: closure.closed_at, closed_by_username: closure.closed_by_username || null }
          : null,
        blocks: {
          officeStaff: roundMoney(officeStaff),
          storeStaff: roundMoney(storeStaff),
          shared: roundMoney(shared),
          rentalAndOther: roundMoney(rentalAndOther),
          grandOfficeStore: roundMoney(officeStaff + storeStaff),
          grandSharedRental: roundMoney(shared + rentalAndOther),
        },
        totals: {
          subtotalMonthly: roundMoney(approvedTotal),
          staffPayments: roundMoney(staffPayments),
          nonPayrollOverhead: roundMoney(approvedTotal - staffPayments),
          pendingExposure: roundMoney(pendingExposure),
          pendingCount,
        },
        byCategory: categoryResult.rows.map((row) => ({
          category: row.category,
          amount: roundMoney(row.approved_amount),
        })),
      });
    } catch (error: any) {
      console.error("[finance-overheads-summary] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },
);

// POST /finance/overheads — create a monthly overhead entry
router.post(
  "/",
  requirePermissionSlugs(["finance:overheads:write"]),
  async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const validationResult = createFinanceOverheadSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const input = validationResult.data;
      const monthDate = overheadMonthToDate(input.expense_month);

      await client.query("BEGIN");
      if (await isMonthClosed(client, monthDate)) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: `Month ${input.expense_month} is closed for edits` });
        return;
      }
      const payrollGuardError = await assertPayrollDoubleCountAllowed(client, input, monthDate);
      if (payrollGuardError) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: payrollGuardError });
        return;
      }

      const insertResult = await client.query(
        `INSERT INTO finance_overhead_expenses
           (expense_month, due_date, category, payee, scope, shared_with, payment_kind, employee_id, is_recurring, amount, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          monthDate,
          input.due_date ?? null,
          input.category,
          input.payee ?? null,
          input.scope,
          input.shared_with ?? null,
          input.payment_kind,
          input.employee_id ?? null,
          input.is_recurring,
          input.amount,
          input.notes ?? null,
          req.user?.id || null,
        ],
      );
      const overhead = insertResult.rows[0];
      await insertFinanceAuditLog(client, {
        entityType: OVERHEAD_ENTITY_TYPE,
        entityId: overhead.id,
        userId: req.user?.id || null,
        action: "create",
        newValue: describeOverhead(overhead),
        note: overhead.notes,
      });
      await client.query("COMMIT");

      res.status(201).json({ overhead: formatOverheadRow(overhead) });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[finance-overheads-create] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  },
);

// PATCH /finance/overheads/:id — edit a non-approved entry in an open month
router.patch(
  "/:id",
  requirePermissionSlugs(["finance:overheads:write"]),
  async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const validationResult = updateFinanceOverheadSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const input = validationResult.data;

      await client.query("BEGIN");
      const existingResult = await client.query(
        "SELECT * FROM finance_overhead_expenses WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [req.params.id],
      );
      if (existingResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Overhead expense not found" });
        return;
      }
      const existing = existingResult.rows[0];
      if (existing.status === "Approved") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Approved overhead expenses are locked and cannot be edited" });
        return;
      }

      const currentMonth = toDateString(existing.expense_month);
      const targetMonth = input.expense_month ? overheadMonthToDate(input.expense_month) : currentMonth;
      if (await isMonthClosed(client, currentMonth)) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: `Month ${monthLabel(currentMonth)} is closed for edits` });
        return;
      }
      if (targetMonth !== currentMonth && (await isMonthClosed(client, targetMonth))) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: `Month ${monthLabel(targetMonth)} is closed for edits` });
        return;
      }

      const nextPaymentKind = input.payment_kind ?? existing.payment_kind;
      const nextEmployeeId = Object.prototype.hasOwnProperty.call(req.body ?? {}, "employee_id")
        ? input.employee_id ?? null
        : existing.employee_id;
      const nextScope = input.scope ?? existing.scope;
      const nextSharedWith = Object.prototype.hasOwnProperty.call(req.body ?? {}, "shared_with")
        ? input.shared_with ?? null
        : existing.shared_with;
      if (nextPaymentKind !== "staff_payment" && nextEmployeeId) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Employee links are only valid for staff payments" });
        return;
      }
      if (nextScope !== "Shared" && nextSharedWith) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "shared_with is only valid for Shared scope entries" });
        return;
      }
      const payrollGuardError = await assertPayrollDoubleCountAllowed(
        client,
        { payment_kind: nextPaymentKind, employee_id: nextEmployeeId },
        targetMonth,
      );
      if (payrollGuardError) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: payrollGuardError });
        return;
      }

      const hasKey = (key: string) => Object.prototype.hasOwnProperty.call(req.body ?? {}, key);
      const updateResult = await client.query(
        `UPDATE finance_overhead_expenses
         SET expense_month = $2,
             due_date = $3,
             category = COALESCE($4, category),
             payee = $5,
             scope = COALESCE($6, scope),
             shared_with = $7,
             payment_kind = COALESCE($8, payment_kind),
             employee_id = $9,
             is_recurring = COALESCE($10, is_recurring),
             amount = COALESCE($11, amount),
             notes = $12,
             status = 'Pending',
             rejected_reason = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          req.params.id,
          targetMonth,
          hasKey("due_date") ? input.due_date ?? null : existing.due_date,
          input.category ?? null,
          hasKey("payee") ? input.payee ?? null : existing.payee,
          input.scope ?? null,
          nextSharedWith,
          input.payment_kind ?? null,
          nextEmployeeId,
          input.is_recurring ?? null,
          input.amount ?? null,
          hasKey("notes") ? input.notes ?? null : existing.notes,
        ],
      );
      const updated = updateResult.rows[0];

      await insertFinanceAuditLog(client, {
        entityType: OVERHEAD_ENTITY_TYPE,
        entityId: updated.id,
        userId: req.user?.id || null,
        action: "update",
        oldValue: `${describeOverhead(existing)} [${existing.status}]`,
        newValue: `${describeOverhead(updated)} [Pending]`,
        note: updated.notes,
      });
      await client.query("COMMIT");

      res.json({ overhead: formatOverheadRow(updated) });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[finance-overheads-update] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  },
);

// DELETE /finance/overheads/:id — soft-delete a non-approved entry in an open month
router.delete(
  "/:id",
  requirePermissionSlugs(["finance:overheads:write"]),
  async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existingResult = await client.query(
        "SELECT * FROM finance_overhead_expenses WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [req.params.id],
      );
      if (existingResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Overhead expense not found" });
        return;
      }
      const existing = existingResult.rows[0];
      if (existing.status === "Approved") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Approved overhead expenses are locked and cannot be deleted" });
        return;
      }
      if (await isMonthClosed(client, toDateString(existing.expense_month))) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: `Month ${monthLabel(existing.expense_month)} is closed for edits` });
        return;
      }

      await client.query(
        "UPDATE finance_overhead_expenses SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1",
        [req.params.id],
      );
      await insertFinanceAuditLog(client, {
        entityType: OVERHEAD_ENTITY_TYPE,
        entityId: existing.id,
        userId: req.user?.id || null,
        action: "delete",
        oldValue: describeOverhead(existing),
        note: existing.notes,
      });
      await client.query("COMMIT");

      res.json({ deleted: true });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[finance-overheads-delete] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  },
);

async function reviewOverheadExpense(
  req: AuthRequest,
  res: Response,
  decision: "Approved" | "Rejected",
): Promise<void> {
  const client = await pool.connect();
  try {
    let rejectedReason: string | null = null;
    if (decision === "Rejected") {
      const validationResult = rejectFinanceOverheadSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      rejectedReason = validationResult.data.rejected_reason;
    }

    await client.query("BEGIN");
    const existingResult = await client.query(
      "SELECT * FROM finance_overhead_expenses WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
      [req.params.id],
    );
    if (existingResult.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Overhead expense not found" });
      return;
    }
    const existing = existingResult.rows[0];
    if (existing.status !== "Pending") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: `Only pending overhead expenses can be reviewed (current status: ${existing.status})` });
      return;
    }
    if (await isMonthClosed(client, toDateString(existing.expense_month))) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: `Month ${monthLabel(existing.expense_month)} is closed for edits` });
      return;
    }

    const updateResult = await client.query(
      `UPDATE finance_overhead_expenses
       SET status = $2,
           rejected_reason = $3,
           approved_by = $4,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, decision, rejectedReason, req.user?.id || null],
    );
    const updated = updateResult.rows[0];
    await insertFinanceAuditLog(client, {
      entityType: OVERHEAD_ENTITY_TYPE,
      entityId: updated.id,
      userId: req.user?.id || null,
      action: decision === "Approved" ? "approve" : "reject",
      fieldChanged: "status",
      oldValue: "Pending",
      newValue: decision,
      note: rejectedReason,
    });
    await client.query("COMMIT");

    res.json({ overhead: formatOverheadRow(updated) });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error(`[finance-overheads-${decision.toLowerCase()}] Error:`, error);
    res.status(500).json({ error: error.message || "Internal server error" });
  } finally {
    client.release();
  }
}

// POST /finance/overheads/:id/approve — approve and lock a pending entry
router.post(
  "/:id/approve",
  requirePermissionSlugs(["finance:overheads:approve"]),
  (req: AuthRequest, res: Response) => reviewOverheadExpense(req, res, "Approved"),
);

// POST /finance/overheads/:id/reject — reject a pending entry with a reason
router.post(
  "/:id/reject",
  requirePermissionSlugs(["finance:overheads:approve"]),
  (req: AuthRequest, res: Response) => reviewOverheadExpense(req, res, "Rejected"),
);

async function setMonthClosure(
  req: AuthRequest,
  res: Response,
  close: boolean,
): Promise<void> {
  const client = await pool.connect();
  try {
    const monthResult = financeOverheadMonthParamSchema.safeParse(req.params.month);
    if (!monthResult.success) {
      res.status(400).json({ error: monthResult.error.errors[0].message });
      return;
    }
    const month = monthResult.data;
    const monthDate = overheadMonthToDate(month);

    await client.query("BEGIN");
    const closed = await isMonthClosed(client, monthDate);
    if (close && closed) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: `Month ${month} is already closed` });
      return;
    }
    if (!close && !closed) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: `Month ${month} is not closed` });
      return;
    }

    if (close) {
      await client.query(
        "INSERT INTO finance_overhead_month_closures (month, closed_by) VALUES ($1, $2)",
        [monthDate, req.user?.id || null],
      );
    } else {
      await client.query("DELETE FROM finance_overhead_month_closures WHERE month = $1", [monthDate]);
    }
    await insertFinanceAuditLog(client, {
      entityType: MONTH_CLOSURE_ENTITY_TYPE,
      entityId: req.user?.id || "00000000-0000-0000-0000-000000000000",
      userId: req.user?.id || null,
      action: close ? "close_month" : "reopen_month",
      fieldChanged: "month",
      newValue: month,
    });
    await client.query("COMMIT");

    res.json({ month, closed: close });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[finance-overheads-closure] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  } finally {
    client.release();
  }
}

// POST /finance/overheads/months/:month/close — lock a month against edits
router.post(
  "/months/:month/close",
  requirePermissionSlugs(["finance:overheads:approve"]),
  (req: AuthRequest, res: Response) => setMonthClosure(req, res, true),
);

// POST /finance/overheads/months/:month/reopen — unlock a closed month
router.post(
  "/months/:month/reopen",
  requirePermissionSlugs(["finance:overheads:approve"]),
  (req: AuthRequest, res: Response) => setMonthClosure(req, res, false),
);

export default router;
