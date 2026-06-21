import { Pool } from "pg";
import { Router, Response } from "express";
import ExcelJS from "exceljs";
import { stringify } from "csv-stringify/sync";
import { pool } from "../../db/pool";
import { requireAuth, AuthRequest, getEffectivePermissionSlugsFromUser } from "../../middleware/auth";
import { hasPermissionSlug } from "../../lib/permissions";
import { profitReportQuerySchema, profitReportExportQuerySchema } from "../../lib/validation";

function hasPermission(req: AuthRequest, slug: string): boolean {
  return hasPermissionSlug(getEffectivePermissionSlugsFromUser(req.user), slug);
}

function canAccessProfitReports(req: AuthRequest): boolean {
  return hasPermission(req, "reports:profit:read");
}

async function insertProfitReportAuditLog(
  client: Pool,
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

const PROFIT_REPORT_SORT_FIELDS: Record<string, string> = {
  start_date: "profit_rows.start_date",
  event_name: "profit_rows.event_name",
  event_type: "profit_rows.event_type_name",
  revenue: "profit_rows.revenue",
  approved_expenses: "profit_rows.approved_expenses",
  labor_cost: "profit_rows.labor_cost",
  fuel_cost: "profit_rows.fuel_cost",
  net_profit: "profit_rows.net_profit",
  margin_percentage: "profit_rows.margin_percentage",
  pending_expense_exposure: "profit_rows.pending_expense_exposure",
  estimated_profit_variance: "profit_rows.estimated_profit_variance",
};

const PROFIT_REPORT_EXPORT_COLUMNS = [
  { key: "event_name", header: "Event" },
  { key: "event_type_name", header: "Event Type" },
  { key: "start_date", header: "Date" },
  { key: "status", header: "Status" },
  { key: "revenue", header: "Revenue" },
  { key: "approved_expenses", header: "Approved Expenses" },
  { key: "labor_cost", header: "Labor / Commission" },
  { key: "fuel_cost", header: "Trip / Fuel" },
  { key: "other_cost", header: "Other Cost" },
  { key: "net_profit", header: "Net Profit" },
  { key: "margin_percentage", header: "Margin %" },
  { key: "pending_expense_exposure", header: "Pending Expense Exposure" },
  { key: "proposal_status", header: "Proposal Status" },
  { key: "estimated_net_profit", header: "Estimated Proposal Profit" },
  { key: "estimated_profit_variance", header: "Estimated vs Actual Variance" },
];

type ProfitReportQueryOptions = {
  page: number;
  limit: number;
  search?: string;
  start_date: string;
  end_date: string;
  event_type_id?: string;
  status?: string;
  min_margin?: number;
  max_margin?: number;
  min_profit?: number;
  max_profit?: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
};

type ProfitReportRow = Record<string, any>;

function roundMoney(value: unknown): number {
  return Number(Number(value || 0).toFixed(2));
}

function buildProfitReportBaseQuery(options: ProfitReportQueryOptions): { sql: string; params: any[] } {
  const params: any[] = [options.start_date, options.end_date];
  const conditions = [
    "e.deleted_at IS NULL",
    "e.start_date >= $1",
    "e.start_date <= $2",
  ];

  if (options.search?.trim()) {
    params.push(`%${options.search.trim()}%`);
    conditions.push(`(e.name ILIKE $${params.length} OR e.client_name ILIKE $${params.length} OR e.venue_location ILIKE $${params.length})`);
  }
  if (options.event_type_id) {
    params.push(options.event_type_id);
    conditions.push(`e.event_type_id = $${params.length}`);
  }
  if (options.status) {
    params.push(options.status);
    conditions.push(`e.status = $${params.length}`);
  }

  const metricConditions: string[] = [];
  const whereClause = conditions.join(" AND ");
  if (options.min_margin !== undefined) {
    params.push(options.min_margin);
    metricConditions.push(`profit_rows.margin_percentage >= $${params.length}`);
  }
  if (options.max_margin !== undefined) {
    params.push(options.max_margin);
    metricConditions.push(`profit_rows.margin_percentage <= $${params.length}`);
  }
  if (options.min_profit !== undefined) {
    params.push(options.min_profit);
    metricConditions.push(`profit_rows.net_profit >= $${params.length}`);
  }
  if (options.max_profit !== undefined) {
    params.push(options.max_profit);
    metricConditions.push(`profit_rows.net_profit <= $${params.length}`);
  }

  const metricWhere = metricConditions.length > 0 ? `WHERE ${metricConditions.join(" AND ")}` : "";
  const sql = `
    WITH expense_totals AS (
      SELECT
        event_id,
        COALESCE(SUM(amount) FILTER (WHERE status = 'Approved'), 0)::numeric AS approved_expenses,
        COALESCE(SUM(amount) FILTER (WHERE status = 'Pending'), 0)::numeric AS pending_expense_exposure,
        COALESCE(SUM(amount) FILTER (WHERE status = 'Approved' AND category = 'Labor'), 0)::numeric AS labor_cost,
        COALESCE(SUM(amount) FILTER (WHERE status = 'Approved' AND category = 'Fuel'), 0)::numeric AS fuel_cost,
        COALESCE(SUM(amount) FILTER (WHERE status = 'Approved' AND category NOT IN ('Labor', 'Fuel')), 0)::numeric AS other_cost
      FROM expenses
      GROUP BY event_id
    ),
    profit_rows AS (
      SELECT
        e.id AS event_id,
        e.name AS event_name,
        et.name AS event_type_name,
        e.event_type_id,
        e.start_date,
        e.status,
        COALESCE(e.contract_price, 0)::numeric AS revenue,
        COALESCE(expense_totals.approved_expenses, 0)::numeric AS approved_expenses,
        COALESCE(expense_totals.labor_cost, 0)::numeric AS labor_cost,
        COALESCE(expense_totals.fuel_cost, 0)::numeric AS fuel_cost,
        COALESCE(expense_totals.other_cost, 0)::numeric AS other_cost,
        COALESCE(expense_totals.pending_expense_exposure, 0)::numeric AS pending_expense_exposure,
        (COALESCE(e.contract_price, 0) - COALESCE(expense_totals.approved_expenses, 0))::numeric AS net_profit,
        CASE
          WHEN COALESCE(e.contract_price, 0) > 0
          THEN ROUND((((COALESCE(e.contract_price, 0) - COALESCE(expense_totals.approved_expenses, 0)) / e.contract_price) * 100)::numeric, 2)
          ELSE 0
        END AS margin_percentage,
        ep.id AS proposal_id,
        ep.status AS proposal_status,
        COALESCE(ep.estimated_total_cost, 0)::numeric AS estimated_total_cost,
        COALESCE(ep.estimated_net_profit, 0)::numeric AS estimated_net_profit,
        CASE
          WHEN ep.id IS NOT NULL
          THEN ((COALESCE(e.contract_price, 0) - COALESCE(expense_totals.approved_expenses, 0)) - COALESCE(ep.estimated_net_profit, 0))::numeric
          ELSE NULL
        END AS estimated_profit_variance
      FROM events e
      LEFT JOIN event_types et ON et.id = e.event_type_id
      LEFT JOIN expense_totals ON expense_totals.event_id = e.id
      LEFT JOIN event_proposals ep ON ep.id = e.event_proposal_id
      WHERE ${whereClause}
    )
    SELECT *
    FROM profit_rows
    ${metricWhere}
  `;

  return { sql, params };
}

function formatProfitReportRow(row: ProfitReportRow): ProfitReportRow {
  return {
    ...row,
    revenue: roundMoney(row.revenue),
    approved_expenses: roundMoney(row.approved_expenses),
    labor_cost: roundMoney(row.labor_cost),
    fuel_cost: roundMoney(row.fuel_cost),
    other_cost: roundMoney(row.other_cost),
    pending_expense_exposure: roundMoney(row.pending_expense_exposure),
    net_profit: roundMoney(row.net_profit),
    margin_percentage: Number(Number(row.margin_percentage || 0).toFixed(2)),
    estimated_total_cost: roundMoney(row.estimated_total_cost),
    estimated_net_profit: roundMoney(row.estimated_net_profit),
    estimated_profit_variance: row.estimated_profit_variance === null || row.estimated_profit_variance === undefined
      ? null
      : roundMoney(row.estimated_profit_variance),
  };
}

function buildProfitAnalytics(rows: ProfitReportRow[]) {
  const formattedRows = rows.map(formatProfitReportRow);
  const summary = formattedRows.reduce((acc, row) => {
    acc.totalEvents += 1;
    acc.totalRevenue += row.revenue;
    acc.totalExpenses += row.approved_expenses;
    acc.netProfit += row.net_profit;
    acc.pendingExpenseExposure += row.pending_expense_exposure;
    return acc;
  }, {
    totalEvents: 0,
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    profitMargin: 0,
    pendingExpenseExposure: 0,
  });
  summary.totalRevenue = roundMoney(summary.totalRevenue);
  summary.totalExpenses = roundMoney(summary.totalExpenses);
  summary.netProfit = roundMoney(summary.netProfit);
  summary.pendingExpenseExposure = roundMoney(summary.pendingExpenseExposure);
  summary.profitMargin = summary.totalRevenue > 0 ? Number(((summary.netProfit / summary.totalRevenue) * 100).toFixed(2)) : 0;

  const categoryTotals = { Labor: 0, Fuel: 0, Other: 0 };
  const monthlyMap: Record<string, any> = {};
  const eventTypeMap: Record<string, any> = {};
  let mostProfitableEvent: ProfitReportRow | null = null;
  let lowestMarginEvent: ProfitReportRow | null = null;

  for (const row of formattedRows) {
    categoryTotals.Labor += row.labor_cost;
    categoryTotals.Fuel += row.fuel_cost;
    categoryTotals.Other += row.other_cost;

    const month = String(row.start_date || "").slice(0, 7);
    if (month) {
      monthlyMap[month] ||= { month, eventCount: 0, revenue: 0, expenses: 0, profit: 0, margin: 0 };
      monthlyMap[month].eventCount += 1;
      monthlyMap[month].revenue += row.revenue;
      monthlyMap[month].expenses += row.approved_expenses;
      monthlyMap[month].profit += row.net_profit;
    }

    const typeName = row.event_type_name || "Uncategorized";
    eventTypeMap[typeName] ||= { eventType: typeName, eventCount: 0, revenue: 0, expenses: 0, netProfit: 0, averageMargin: 0 };
    eventTypeMap[typeName].eventCount += 1;
    eventTypeMap[typeName].revenue += row.revenue;
    eventTypeMap[typeName].expenses += row.approved_expenses;
    eventTypeMap[typeName].netProfit += row.net_profit;

    if (!mostProfitableEvent || row.net_profit > mostProfitableEvent.net_profit) mostProfitableEvent = row;
    if (!lowestMarginEvent || row.margin_percentage < lowestMarginEvent.margin_percentage) lowestMarginEvent = row;
  }

  const monthlyData = Object.values(monthlyMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((item) => ({
      ...item,
      revenue: roundMoney(item.revenue),
      expenses: roundMoney(item.expenses),
      profit: roundMoney(item.profit),
      margin: item.revenue > 0 ? Number(((item.profit / item.revenue) * 100).toFixed(2)) : 0,
    }));

  const eventTypePerformance = Object.values(eventTypeMap)
    .map((item) => ({
      ...item,
      revenue: roundMoney(item.revenue),
      expenses: roundMoney(item.expenses),
      netProfit: roundMoney(item.netProfit),
      averageMargin: item.revenue > 0 ? Number(((item.netProfit / item.revenue) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.netProfit - a.netProfit);

  const proposalVarianceRows = formattedRows
    .filter((row) => row.proposal_id)
    .map((row) => ({
      eventId: row.event_id,
      eventName: row.event_name,
      proposalId: row.proposal_id,
      estimatedNetProfit: row.estimated_net_profit,
      actualNetProfit: row.net_profit,
      variance: row.estimated_profit_variance,
    }));

  const convertedProposalCount = formattedRows.filter((row) => row.proposal_id).length;

  return {
    summary,
    categoryBreakdown: [
      { category: "Labor", amount: roundMoney(categoryTotals.Labor) },
      { category: "Fuel", amount: roundMoney(categoryTotals.Fuel) },
      { category: "Other", amount: roundMoney(categoryTotals.Other) },
    ],
    monthlyData,
    eventTypePerformance,
    kpis: {
      mostProfitableEvent,
      mostProfitableEventType: eventTypePerformance[0] || null,
      highestMarginEventType: [...eventTypePerformance].sort((a, b) => b.averageMargin - a.averageMargin)[0] || null,
      lowestMarginEvent,
      pendingExpenseExposure: summary.pendingExpenseExposure,
      proposalConversionRate: formattedRows.length > 0 ? Number(((convertedProposalCount / formattedRows.length) * 100).toFixed(2)) : 0,
    },
    proposalVariance: {
      events: proposalVarianceRows,
      averageVariance: proposalVarianceRows.length > 0
        ? roundMoney(proposalVarianceRows.reduce((sum, row) => sum + Number(row.variance || 0), 0) / proposalVarianceRows.length)
        : 0,
    },
  };
}


export function createEventProfitReportsRouter(): Router {
  const router = Router();

  // GET /events/reports/profit/export - Export filtered profit report rows
  router.get("/reports/profit/export", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!canAccessProfitReports(req)) {
        res.status(403).json({ error: "Forbidden: Missing profit report access permission" });
        return;
      }

      const currentYear = new Date().getFullYear();
      const validationResult = profitReportExportQuerySchema.safeParse({
        ...req.query,
        start_date: req.query.start_date || `${currentYear}-01-01`,
        end_date: req.query.end_date || `${currentYear}-12-31`,
      });
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }

      const query = {
        ...validationResult.data,
        start_date: validationResult.data.start_date || `${currentYear}-01-01`,
        end_date: validationResult.data.end_date || `${currentYear}-12-31`,
      };
      const baseQuery = buildProfitReportBaseQuery(query);
      const countResult = await pool.query(`SELECT COUNT(*) FROM (${baseQuery.sql}) counted`, baseQuery.params);
      const total = Number(countResult.rows[0]?.count || 0);
      if (total > query.maxRows) {
        await insertProfitReportAuditLog(
          pool,
          req.user?.id || null,
          "profit_report_export_blocked",
          `rows=${total}`,
          `maxRows=${query.maxRows}`,
        );
        res.status(413).json({ error: `Export row count ${total} exceeds maxRows ${query.maxRows}` });
        return;
      }

      const sortSql = PROFIT_REPORT_SORT_FIELDS[query.sortBy] || PROFIT_REPORT_SORT_FIELDS.start_date;
      const sortDirection = query.sortOrder === "asc" ? "ASC" : "DESC";
      const result = await pool.query(
        `${baseQuery.sql} ORDER BY ${sortSql} ${sortDirection}, profit_rows.event_id ASC`,
        baseQuery.params,
      );
      const rows = result.rows.map(formatProfitReportRow);
      const exportRows = rows.map((row) => {
        const out: Record<string, unknown> = {};
        for (const column of PROFIT_REPORT_EXPORT_COLUMNS) {
          out[column.header] = row[column.key];
        }
        return out;
      });

      await insertProfitReportAuditLog(
        pool,
        req.user?.id || null,
        "profit_report_export",
        null,
        `format=${query.format}; rows=${rows.length}`,
      );

      const dateTag = new Date().toISOString().slice(0, 10);
      if (query.format === "xlsx") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Profit Report");
        sheet.columns = PROFIT_REPORT_EXPORT_COLUMNS.map((column) => ({
          header: column.header,
          key: column.header,
          width: Math.max(column.header.length + 4, 18),
        }));
        sheet.addRows(exportRows);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="profit-report-${dateTag}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
        return;
      }

      const csv = stringify(exportRows, { header: true });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="profit-report-${dateTag}.csv"`);
      res.send(csv);
    } catch (error: any) {
      console.error("[export-profit-report] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // GET /events/reports/profit - Paginated event profitability report and KPIs
  router.get("/reports/profit", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!canAccessProfitReports(req)) {
        res.status(403).json({ error: "Forbidden: Missing profit report access permission" });
        return;
      }

      const currentYear = new Date().getFullYear();
      const validationResult = profitReportQuerySchema.safeParse({
        ...req.query,
        start_date: req.query.start_date || `${currentYear}-01-01`,
        end_date: req.query.end_date || `${currentYear}-12-31`,
      });
      if (!validationResult.success) {
        res.status(400).json({ error: validationResult.error.errors[0].message });
        return;
      }

      const query = {
        ...validationResult.data,
        start_date: validationResult.data.start_date || `${currentYear}-01-01`,
        end_date: validationResult.data.end_date || `${currentYear}-12-31`,
      };
      const baseQuery = buildProfitReportBaseQuery(query);
      const countResult = await pool.query(`SELECT COUNT(*) FROM (${baseQuery.sql}) counted`, baseQuery.params);
      const total = Number(countResult.rows[0]?.count || 0);
      const sortSql = PROFIT_REPORT_SORT_FIELDS[query.sortBy] || PROFIT_REPORT_SORT_FIELDS.start_date;
      const sortDirection = query.sortOrder === "asc" ? "ASC" : "DESC";
      const allRowsResult = await pool.query(
        `${baseQuery.sql} ORDER BY ${sortSql} ${sortDirection}, profit_rows.event_id ASC`,
        baseQuery.params,
      );
      const offset = (query.page - 1) * query.limit;
      const pageRows = allRowsResult.rows.slice(offset, offset + query.limit).map(formatProfitReportRow);
      const analytics = buildProfitAnalytics(allRowsResult.rows);

      res.json({
        ...analytics,
        events: pageRows,
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      });
    } catch (error: any) {
      console.error("[get-profit-report] Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });


  return router;
}
