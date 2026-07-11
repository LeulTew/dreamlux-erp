import { Router, Response } from "express";
import ExcelJS from "exceljs";
import { stringify } from "csv-stringify/sync";
import { pool } from "../db/pool";
import { AuthRequest, requirePermissionSlugs } from "../middleware/auth";
import { insertFinanceAuditLog, roundMoney, toDateString } from "../lib/finance-audit";
import {
  createFinanceOpexSchema,
  updateFinanceOpexSchema,
  rejectFinanceOpexSchema,
  financeOpexListQuerySchema,
  hisabQuerySchema,
  hisabExportQuerySchema,
  monthlyNetProfitQuerySchema,
  monthlyNetProfitExportQuerySchema,
  HisabQueryInput,
} from "../lib/validation";
import { buildMonthlyNetProfitStatement } from "../services/finance-reporting-service";

const router = Router();

const OPEX_ENTITY_TYPE = "finance_operational_expense";
const HISAB_ENTITY_TYPE = "finance_hisab_report";
const MONTHLY_NET_PROFIT_ENTITY_TYPE = "finance_monthly_net_profit_report";
const OPEX_SORT_SQL: Record<string, string> = {
  expense_date: "fe.expense_date",
  created_at: "fe.created_at",
  updated_at: "fe.updated_at",
  amount: "fe.amount",
  category: "fe.category",
  status: "fe.status",
  recent: "fe.updated_at",
};

function formatOpexRow(row: Record<string, any>): Record<string, any> {
  return { ...row, amount: roundMoney(row.amount) };
}

function monthlyNetProfitExportRows(statement: Awaited<ReturnType<typeof buildMonthlyNetProfitStatement>>) {
  const rows: Array<Record<string, unknown>> = [
    { section: "Summary", name: "Event Revenue", amount: statement.totals.eventRevenue, count: statement.counts.events },
    { section: "Summary", name: "Approved Event Expenses", amount: statement.totals.approvedEventExpenses, count: "" },
    { section: "Summary", name: "Event Gross Profit", amount: statement.totals.eventGrossProfit, count: "" },
    { section: "Summary", name: "Operational Expenses", amount: statement.totals.operationalExpenses, count: "" },
    { section: "Summary", name: "Overhead Expenses", amount: statement.totals.overheadExpenses, count: "" },
    { section: "Summary", name: "Payroll Expenses", amount: statement.totals.payrollExpenses, count: statement.counts.payrollRuns },
    { section: "Summary", name: "Operating Profit", amount: statement.totals.operatingProfit, count: "" },
    { section: "Summary", name: "Approved Investments", amount: statement.totals.approvedInvestments, count: statement.counts.investmentRows },
    { section: "Summary", name: "Net After Investments", amount: statement.totals.netAfterInvestments, count: "" },
    { section: "Summary", name: "Pending Exposure", amount: statement.totals.pendingExposure, count: "" },
  ];

  for (const row of statement.breakdowns.eventExpensesByCategory) {
    rows.push({ section: "Event Expense Category", name: row.category, amount: row.amount, count: row.count });
  }
  for (const row of statement.breakdowns.operationalExpensesByCategory) {
    rows.push({ section: "Operational Expense Category", name: row.category, amount: row.amount, pending_amount: row.pendingAmount, count: row.count });
  }
  for (const row of statement.breakdowns.overheadByScope) {
    rows.push({ section: "Overhead Scope", name: `${row.scope} / ${row.payment_kind}`, amount: row.amount, pending_amount: row.pendingAmount, count: row.count });
  }
  for (const row of statement.breakdowns.investmentsByCategory) {
    rows.push({ section: "Investment Category", name: row.category, amount: row.amount, pending_amount: row.pendingAmount, count: row.count });
  }
  for (const event of statement.drilldowns.events) {
    rows.push({ section: "Event Drilldown", source_id: event.id, name: event.name, date: event.start_date, amount: event.netProfit, revenue: event.revenue, approved_expenses: event.approvedExpenses });
  }
  for (const run of statement.drilldowns.payrollRuns) {
    rows.push({ section: "Payroll Drilldown", source_id: run.id, name: run.title, date: `${run.period_start} to ${run.period_end}`, amount: run.total });
  }
  for (const investment of statement.drilldowns.investments) {
    rows.push({ section: "Investment Drilldown", source_id: investment.id, name: investment.item_name, date: investment.purchase_date, amount: investment.total_cost, category: investment.category });
  }

  return rows;
}

// GET /finance/reports/monthly-net-profit — complete month statement read model
router.get(
  "/reports/monthly-net-profit",
  requirePermissionSlugs(["finance:hisab:read"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const validationResult = monthlyNetProfitQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }

      const statement = await buildMonthlyNetProfitStatement(validationResult.data);
      res.json(statement);
    } catch (error: any) {
      console.error("[finance-monthly-net-profit] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },
);

// GET /finance/reports/monthly-net-profit/export — bounded statement export
router.get(
  "/reports/monthly-net-profit/export",
  requirePermissionSlugs(["finance:hisab:read"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const validationResult = monthlyNetProfitExportQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const query = validationResult.data;
      const statement = await buildMonthlyNetProfitStatement(query);
      const rows = monthlyNetProfitExportRows(statement);

      const actorId = req.user?.id || null;
      if (rows.length > query.maxRows) {
        if (actorId) {
          const client = await pool.connect();
          try {
            await insertFinanceAuditLog(client, {
              entityType: MONTHLY_NET_PROFIT_ENTITY_TYPE,
              entityId: actorId,
              userId: actorId,
              action: "export_blocked",
              oldValue: `rows=${rows.length}`,
              newValue: `maxRows=${query.maxRows}; month=${query.month}`,
            });
          } finally {
            client.release();
          }
        }
        res.status(413).json({ error: `Export row count ${rows.length} exceeds maxRows ${query.maxRows}` });
        return;
      }

      if (actorId) {
        const client = await pool.connect();
        try {
          await insertFinanceAuditLog(client, {
            entityType: MONTHLY_NET_PROFIT_ENTITY_TYPE,
            entityId: actorId,
            userId: actorId,
            action: "export",
            newValue: `format=${query.format}; month=${query.month}; rows=${rows.length}`,
          });
        } finally {
          client.release();
        }
      }

      const flattenedRows = rows.map((row) => ({
        Month: statement.month,
        Section: row.section || "",
        "Source ID": row.source_id || "",
        Name: row.name || "",
        Date: row.date || "",
        Amount: row.amount ?? "",
        Revenue: row.revenue ?? "",
        "Approved Expenses": row.approved_expenses ?? "",
        "Pending Amount": row.pending_amount ?? "",
        Category: row.category || "",
        Count: row.count ?? "",
      }));

      if (query.format === "xlsx") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Monthly Net Profit");
        sheet.columns = Object.keys(flattenedRows[0] || {
          Month: "",
          Section: "",
          "Source ID": "",
          Name: "",
          Date: "",
          Amount: "",
          Revenue: "",
          "Approved Expenses": "",
          "Pending Amount": "",
          Category: "",
          Count: "",
        }).map((key) => ({ header: key, key, width: Math.max(key.length + 4, 18) }));
        sheet.addRows(flattenedRows);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="monthly-net-profit-${query.month}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
        return;
      }

      const csv = stringify(flattenedRows, { header: true });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="monthly-net-profit-${query.month}.csv"`);
      res.send(csv);
    } catch (error: any) {
      console.error("[finance-monthly-net-profit-export] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },
);

// GET /finance/operational-expenses — paginated non-event operational expense ledger
router.get(
  "/operational-expenses",
  requirePermissionSlugs(["finance:hisab:read"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const validationResult = financeOpexListQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const query = validationResult.data;

      const params: any[] = [];
      const conditions = ["fe.deleted_at IS NULL"];
      if (query.status) {
        params.push(query.status);
        conditions.push(`fe.status = $${params.length}`);
      }
      if (query.category) {
        params.push(query.category);
        conditions.push(`fe.category = $${params.length}`);
      }
      if (query.start_date) {
        params.push(query.start_date);
        conditions.push(`fe.expense_date >= $${params.length}`);
      }
      if (query.end_date) {
        params.push(query.end_date);
        conditions.push(`fe.expense_date <= $${params.length}`);
      }
      if (query.search?.trim()) {
        params.push(`%${query.search.trim()}%`);
        conditions.push(`fe.description ILIKE $${params.length}`);
      }
      const whereClause = conditions.join(" AND ");

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM finance_operational_expenses fe WHERE ${whereClause}`,
        params,
      );
      const total = Number(countResult.rows[0]?.count || 0);

      const offset = (query.page - 1) * query.limit;
      const sortSql = OPEX_SORT_SQL[query.sortBy] || OPEX_SORT_SQL.expense_date;
      const sortDirection = query.sortOrder === "asc" ? "ASC" : "DESC";
      const listResult = await pool.query(
        `SELECT fe.*, cu.username AS created_by_username, au.username AS approved_by_username
         FROM finance_operational_expenses fe
         LEFT JOIN users cu ON cu.id = fe.created_by
         LEFT JOIN users au ON au.id = fe.approved_by
         WHERE ${whereClause}
         ORDER BY ${sortSql} ${sortDirection}, fe.updated_at DESC, fe.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, query.limit, offset],
      );

      res.json({
        expenses: listResult.rows.map(formatOpexRow),
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      });
    } catch (error: any) {
      console.error("[finance-opex-list] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },
);

// POST /finance/operational-expenses — create a non-event operational expense
router.post(
  "/operational-expenses",
  requirePermissionSlugs(["finance:opex:write"]),
  async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const validationResult = createFinanceOpexSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const input = validationResult.data;

      await client.query("BEGIN");
      const insertResult = await client.query(
        `INSERT INTO finance_operational_expenses (expense_date, category, amount, description, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [input.expense_date, input.category, input.amount, input.description, req.user?.id || null],
      );
      const expense = insertResult.rows[0];
      await insertFinanceAuditLog(client, {
        entityType: OPEX_ENTITY_TYPE,
        entityId: expense.id,
        userId: req.user?.id || null,
        action: "create",
        newValue: `${input.category} ${roundMoney(input.amount)} on ${input.expense_date}`,
        note: input.description,
      });
      await client.query("COMMIT");

      res.status(201).json({ expense: formatOpexRow(expense) });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[finance-opex-create] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  },
);

// PATCH /finance/operational-expenses/:id — edit a non-approved expense
router.patch(
  "/operational-expenses/:id",
  requirePermissionSlugs(["finance:opex:write"]),
  async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const validationResult = updateFinanceOpexSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const input = validationResult.data;

      await client.query("BEGIN");
      const existingResult = await client.query(
        "SELECT * FROM finance_operational_expenses WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [req.params.id],
      );
      if (existingResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Operational expense not found" });
        return;
      }
      const existing = existingResult.rows[0];
      if (existing.status === "Approved") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Approved expenses are locked and cannot be edited" });
        return;
      }

      const updateResult = await client.query(
        `UPDATE finance_operational_expenses
         SET expense_date = COALESCE($2, expense_date),
             category = COALESCE($3, category),
             amount = COALESCE($4, amount),
             description = COALESCE($5, description),
             status = 'Pending',
             rejected_reason = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          req.params.id,
          input.expense_date ?? null,
          input.category ?? null,
          input.amount ?? null,
          input.description ?? null,
        ],
      );
      const updated = updateResult.rows[0];
      await insertFinanceAuditLog(client, {
        entityType: OPEX_ENTITY_TYPE,
        entityId: updated.id,
        userId: req.user?.id || null,
        action: "update",
        oldValue: `${existing.category} ${roundMoney(existing.amount)} on ${toDateString(existing.expense_date)} [${existing.status}]`,
        newValue: `${updated.category} ${roundMoney(updated.amount)} on ${toDateString(updated.expense_date)} [Pending]`,
        note: updated.description,
      });
      await client.query("COMMIT");

      res.json({ expense: formatOpexRow(updated) });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[finance-opex-update] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  },
);

// DELETE /finance/operational-expenses/:id — soft-delete a non-approved expense
router.delete(
  "/operational-expenses/:id",
  requirePermissionSlugs(["finance:opex:write"]),
  async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existingResult = await client.query(
        "SELECT * FROM finance_operational_expenses WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [req.params.id],
      );
      if (existingResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Operational expense not found" });
        return;
      }
      const existing = existingResult.rows[0];
      if (existing.status === "Approved") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Approved expenses are locked and cannot be deleted" });
        return;
      }

      await client.query(
        "UPDATE finance_operational_expenses SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1",
        [req.params.id],
      );
      await insertFinanceAuditLog(client, {
        entityType: OPEX_ENTITY_TYPE,
        entityId: existing.id,
        userId: req.user?.id || null,
        action: "delete",
        oldValue: `${existing.category} ${roundMoney(existing.amount)} on ${toDateString(existing.expense_date)}`,
        note: existing.description,
      });
      await client.query("COMMIT");

      res.json({ deleted: true });
    } catch (error: any) {
      await client.query("ROLLBACK");
      console.error("[finance-opex-delete] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      client.release();
    }
  },
);

async function reviewOperationalExpense(
  req: AuthRequest,
  res: Response,
  decision: "Approved" | "Rejected",
): Promise<void> {
  const client = await pool.connect();
  try {
    let rejectedReason: string | null = null;
    if (decision === "Rejected") {
      const validationResult = rejectFinanceOpexSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      rejectedReason = validationResult.data.rejected_reason;
    }

    await client.query("BEGIN");
    const existingResult = await client.query(
      "SELECT * FROM finance_operational_expenses WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
      [req.params.id],
    );
    if (existingResult.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Operational expense not found" });
      return;
    }
    const existing = existingResult.rows[0];
    if (existing.status !== "Pending") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: `Only pending expenses can be reviewed (current status: ${existing.status})` });
      return;
    }

    const updateResult = await client.query(
      `UPDATE finance_operational_expenses
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
      entityType: OPEX_ENTITY_TYPE,
      entityId: updated.id,
      userId: req.user?.id || null,
      action: decision === "Approved" ? "approve" : "reject",
      fieldChanged: "status",
      oldValue: "Pending",
      newValue: decision,
      note: rejectedReason,
    });
    await client.query("COMMIT");

    res.json({ expense: formatOpexRow(updated) });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error(`[finance-opex-${decision.toLowerCase()}] Error:`, error);
    res.status(500).json({ error: error.message || "Internal server error" });
  } finally {
    client.release();
  }
}

// POST /finance/operational-expenses/:id/approve — approve and lock a pending expense
router.post(
  "/operational-expenses/:id/approve",
  requirePermissionSlugs(["finance:opex:approve"]),
  (req: AuthRequest, res: Response) => reviewOperationalExpense(req, res, "Approved"),
);

// POST /finance/operational-expenses/:id/reject — reject a pending expense with a reason
router.post(
  "/operational-expenses/:id/reject",
  requirePermissionSlugs(["finance:opex:approve"]),
  (req: AuthRequest, res: Response) => reviewOperationalExpense(req, res, "Rejected"),
);

type HisabEventRow = {
  event_id: string;
  event_name: string;
  event_date: string;
  period_start: string;
  income: number;
  transport: number;
  rental: number;
  labour: number;
  other: number;
  expense_total: number;
  profit: number;
};

type HisabOperationalRow = {
  period_start: string;
  category: string;
  approved_amount: number;
  pending_amount: number;
};

// Workbook category buckets pulled from approved event expenses:
// Transportation + Fuel -> transport, Equipment Rental -> rental, Labor -> labour, rest -> other.
async function fetchHisabRows(query: HisabQueryInput): Promise<{
  eventRows: HisabEventRow[];
  operationalRows: HisabOperationalRow[];
}> {
  const params = [query.start_date, query.end_date, query.period_type];

  const eventResult = await pool.query(
    `SELECT
       e.id AS event_id,
       e.name AS event_name,
       to_char(e.start_date, 'YYYY-MM-DD') AS event_date,
       to_char(date_trunc($3, e.start_date), 'YYYY-MM-DD') AS period_start,
       COALESCE(e.contract_price, 0)::numeric AS income,
       COALESCE(SUM(x.amount) FILTER (WHERE x.status = 'Approved' AND x.category IN ('Transportation', 'Fuel')), 0)::numeric AS transport,
       COALESCE(SUM(x.amount) FILTER (WHERE x.status = 'Approved' AND x.category = 'Equipment Rental'), 0)::numeric AS rental,
       COALESCE(SUM(x.amount) FILTER (WHERE x.status = 'Approved' AND x.category = 'Labor'), 0)::numeric AS labour,
       COALESCE(SUM(x.amount) FILTER (WHERE x.status = 'Approved' AND x.category NOT IN ('Transportation', 'Fuel', 'Equipment Rental', 'Labor')), 0)::numeric AS other
     FROM events e
     LEFT JOIN expenses x ON x.event_id = e.id
     WHERE e.deleted_at IS NULL AND e.start_date >= $1 AND e.start_date <= $2
     GROUP BY e.id
     ORDER BY e.start_date ASC, e.name ASC`,
    params,
  );

  const operationalResult = await pool.query(
    `SELECT
       to_char(date_trunc($3, expense_date), 'YYYY-MM-DD') AS period_start,
       category,
       COALESCE(SUM(amount) FILTER (WHERE status = 'Approved'), 0)::numeric AS approved_amount,
       COALESCE(SUM(amount) FILTER (WHERE status = 'Pending'), 0)::numeric AS pending_amount
     FROM finance_operational_expenses
     WHERE deleted_at IS NULL AND expense_date >= $1 AND expense_date <= $2
     GROUP BY 1, 2
     ORDER BY 1 ASC, 2 ASC`,
    params,
  );

  const eventRows: HisabEventRow[] = eventResult.rows.map((row) => {
    const income = roundMoney(row.income);
    const transport = roundMoney(row.transport);
    const rental = roundMoney(row.rental);
    const labour = roundMoney(row.labour);
    const other = roundMoney(row.other);
    const expenseTotal = roundMoney(transport + rental + labour + other);
    return {
      event_id: row.event_id,
      event_name: row.event_name,
      event_date: row.event_date,
      period_start: row.period_start,
      income,
      transport,
      rental,
      labour,
      other,
      expense_total: expenseTotal,
      profit: roundMoney(income - expenseTotal),
    };
  });

  const operationalRows: HisabOperationalRow[] = operationalResult.rows.map((row) => ({
    period_start: row.period_start,
    category: row.category,
    approved_amount: roundMoney(row.approved_amount),
    pending_amount: roundMoney(row.pending_amount),
  }));

  return { eventRows, operationalRows };
}

function periodLabel(periodStart: string, periodType: "week" | "month"): string {
  return periodType === "month" ? periodStart.slice(0, 7) : `Week of ${periodStart}`;
}

function periodEnd(periodStart: string, periodType: "week" | "month"): string {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(start);
  if (periodType === "month") {
    end.setUTCMonth(end.getUTCMonth() + 1);
  } else {
    end.setUTCDate(end.getUTCDate() + 7);
  }
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

function buildHisabRollup(
  eventRows: HisabEventRow[],
  operationalRows: HisabOperationalRow[],
  periodType: "week" | "month",
) {
  type PeriodBucket = {
    period_start: string;
    period_end: string;
    label: string;
    events: HisabEventRow[];
    eventTotals: { income: number; transport: number; rental: number; labour: number; other: number; expenses: number; profit: number };
    operational: { byCategory: Array<{ category: string; amount: number }>; total: number; pendingExposure: number };
    net: number;
  };

  const periodMap = new Map<string, PeriodBucket>();
  const getBucket = (periodStart: string): PeriodBucket => {
    let bucket = periodMap.get(periodStart);
    if (!bucket) {
      bucket = {
        period_start: periodStart,
        period_end: periodEnd(periodStart, periodType),
        label: periodLabel(periodStart, periodType),
        events: [],
        eventTotals: { income: 0, transport: 0, rental: 0, labour: 0, other: 0, expenses: 0, profit: 0 },
        operational: { byCategory: [], total: 0, pendingExposure: 0 },
        net: 0,
      };
      periodMap.set(periodStart, bucket);
    }
    return bucket;
  };

  for (const row of eventRows) {
    const bucket = getBucket(row.period_start);
    bucket.events.push(row);
    bucket.eventTotals.income += row.income;
    bucket.eventTotals.transport += row.transport;
    bucket.eventTotals.rental += row.rental;
    bucket.eventTotals.labour += row.labour;
    bucket.eventTotals.other += row.other;
    bucket.eventTotals.expenses += row.expense_total;
    bucket.eventTotals.profit += row.profit;
  }

  for (const row of operationalRows) {
    const bucket = getBucket(row.period_start);
    if (row.approved_amount > 0) {
      bucket.operational.byCategory.push({ category: row.category, amount: row.approved_amount });
    }
    bucket.operational.total += row.approved_amount;
    bucket.operational.pendingExposure += row.pending_amount;
  }

  const periods = [...periodMap.values()]
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
    .map((bucket) => {
      const eventTotals = {
        income: roundMoney(bucket.eventTotals.income),
        transport: roundMoney(bucket.eventTotals.transport),
        rental: roundMoney(bucket.eventTotals.rental),
        labour: roundMoney(bucket.eventTotals.labour),
        other: roundMoney(bucket.eventTotals.other),
        expenses: roundMoney(bucket.eventTotals.expenses),
        profit: roundMoney(bucket.eventTotals.profit),
      };
      const operationalTotal = roundMoney(bucket.operational.total);
      return {
        ...bucket,
        eventTotals,
        operational: {
          byCategory: bucket.operational.byCategory,
          total: operationalTotal,
          pendingExposure: roundMoney(bucket.operational.pendingExposure),
        },
        net: roundMoney(eventTotals.profit - operationalTotal),
      };
    });

  const summary = periods.reduce(
    (acc, period) => {
      acc.eventCount += period.events.length;
      acc.eventIncome += period.eventTotals.income;
      acc.eventExpenses += period.eventTotals.expenses;
      acc.eventProfit += period.eventTotals.profit;
      acc.operationalExpenses += period.operational.total;
      acc.pendingOperationalExposure += period.operational.pendingExposure;
      acc.net += period.net;
      return acc;
    },
    {
      periodCount: periods.length,
      eventCount: 0,
      eventIncome: 0,
      eventExpenses: 0,
      eventProfit: 0,
      operationalExpenses: 0,
      pendingOperationalExposure: 0,
      net: 0,
    },
  );
  summary.eventIncome = roundMoney(summary.eventIncome);
  summary.eventExpenses = roundMoney(summary.eventExpenses);
  summary.eventProfit = roundMoney(summary.eventProfit);
  summary.operationalExpenses = roundMoney(summary.operationalExpenses);
  summary.pendingOperationalExposure = roundMoney(summary.pendingOperationalExposure);
  summary.net = roundMoney(summary.net);

  return { periods, summary };
}

// GET /finance/hisab — weekly/monthly Hisab rollup (approved-only financial math)
router.get(
  "/hisab",
  requirePermissionSlugs(["finance:hisab:read"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const validationResult = hisabQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const query = validationResult.data;
      const { eventRows, operationalRows } = await fetchHisabRows(query);
      const rollup = buildHisabRollup(eventRows, operationalRows, query.period_type);

      let periods = rollup.periods;
      let paginationProps = {};

      if (query.page !== undefined && query.limit !== undefined) {
        const page = query.page;
        const limit = query.limit;
        const total = periods.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        periods = periods.slice(startIndex, startIndex + limit);
        paginationProps = {
          page,
          limit,
          total,
          totalPages,
        };
      }

      res.json({
        period_type: query.period_type,
        start_date: query.start_date,
        end_date: query.end_date,
        summary: rollup.summary,
        periods,
        ...paginationProps,
      });
    } catch (error: any) {
      console.error("[finance-hisab] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },
);

const HISAB_EXPORT_COLUMNS = [
  { key: "period", header: "Period" },
  { key: "row_type", header: "Row Type" },
  { key: "name", header: "Event / Category" },
  { key: "date", header: "Date" },
  { key: "income", header: "Income" },
  { key: "transport", header: "Transport" },
  { key: "rental", header: "Rental" },
  { key: "labour", header: "Labour" },
  { key: "other", header: "Other" },
  { key: "expenses", header: "Expense Total" },
  { key: "profit", header: "Profit" },
  { key: "net", header: "Net" },
];

// GET /finance/hisab/export — CSV/XLSX export of the Hisab rollup
router.get(
  "/hisab/export",
  requirePermissionSlugs(["finance:hisab:read"]),
  async (req: AuthRequest, res: Response) => {
    try {
      const validationResult = hisabExportQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }
      const query = validationResult.data;
      const { eventRows, operationalRows } = await fetchHisabRows(query);
      const rollup = buildHisabRollup(eventRows, operationalRows, query.period_type);

      const exportRows: Array<Record<string, unknown>> = [];
      for (const period of rollup.periods) {
        for (const event of period.events) {
          exportRows.push({
            period: period.label,
            row_type: "Event",
            name: event.event_name,
            date: event.event_date,
            income: event.income,
            transport: event.transport,
            rental: event.rental,
            labour: event.labour,
            other: event.other,
            expenses: event.expense_total,
            profit: event.profit,
            net: "",
          });
        }
        for (const entry of period.operational.byCategory) {
          exportRows.push({
            period: period.label,
            row_type: "Operational Expense",
            name: entry.category,
            date: "",
            income: "",
            transport: "",
            rental: "",
            labour: "",
            other: "",
            expenses: entry.amount,
            profit: "",
            net: "",
          });
        }
        exportRows.push({
          period: period.label,
          row_type: "Period Total",
          name: "",
          date: "",
          income: period.eventTotals.income,
          transport: period.eventTotals.transport,
          rental: period.eventTotals.rental,
          labour: period.eventTotals.labour,
          other: period.eventTotals.other,
          expenses: roundMoney(period.eventTotals.expenses + period.operational.total),
          profit: period.eventTotals.profit,
          net: period.net,
        });
      }

      const actorId = req.user?.id || null;
      if (exportRows.length > query.maxRows) {
        if (actorId) {
          const client = await pool.connect();
          try {
            await insertFinanceAuditLog(client, {
              entityType: HISAB_ENTITY_TYPE,
              entityId: actorId,
              userId: actorId,
              action: "export_blocked",
              oldValue: `rows=${exportRows.length}`,
              newValue: `maxRows=${query.maxRows}`,
            });
          } finally {
            client.release();
          }
        }
        res.status(413).json({ error: `Export row count ${exportRows.length} exceeds maxRows ${query.maxRows}` });
        return;
      }

      if (actorId) {
        const client = await pool.connect();
        try {
          await insertFinanceAuditLog(client, {
            entityType: HISAB_ENTITY_TYPE,
            entityId: actorId,
            userId: actorId,
            action: "export",
            newValue: `format=${query.format}; period_type=${query.period_type}; rows=${exportRows.length}`,
          });
        } finally {
          client.release();
        }
      }

      const dateTag = new Date().toISOString().slice(0, 10);
      const flattenedRows = exportRows.map((row) => {
        const out: Record<string, unknown> = {};
        for (const column of HISAB_EXPORT_COLUMNS) {
          out[column.header] = row[column.key];
        }
        return out;
      });

      if (query.format === "xlsx") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Hisab Report");
        sheet.columns = HISAB_EXPORT_COLUMNS.map((column) => ({
          header: column.header,
          key: column.header,
          width: Math.max(column.header.length + 4, 16),
        }));
        sheet.addRows(flattenedRows);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="hisab-report-${dateTag}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
        return;
      }

      const csv = stringify(flattenedRows, { header: true });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="hisab-report-${dateTag}.csv"`);
      res.send(csv);
    } catch (error: any) {
      console.error("[finance-hisab-export] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },
);

export default router;
