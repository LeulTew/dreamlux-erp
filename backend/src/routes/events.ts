import { Pool, PoolClient } from "pg";
import { Router, Response } from "express";
import ExcelJS from "exceljs";
import { stringify } from "csv-stringify/sync";
import { pool } from "../db/pool";
import { requireAuth, AuthRequest, getEffectivePermissionSlugsFromUser } from "../middleware/auth";
import { hasPermissionSlug } from "../lib/permissions";
import { fetchHiddenFieldsForRoles } from "../lib/permissions-db";
import {
  createEventSchema,
  updateEventSchema,
  updateEventDesignSchema,
  createEventAllocationSchema,
  createEventChecklistItemSchema,
  updateEventChecklistItemSchema,
  createEventAssignmentSchema,
  createVehicleAssignmentSchema,
  createEventExpenseSchema,
  reviewEventExpenseSchema,
  createTripLogSchema,
  eventListQuerySchema,
  eventSavedViewPayloadSchema,
  eventExportQuerySchema,
  eventImportPayloadSchema,
  eventProposalPayloadSchema,
  eventProposalListQuerySchema,
  eventProposalRejectSchema,
  profitReportQuerySchema,
  profitReportExportQuerySchema,
} from "../lib/validation";


const router = Router();

const hiddenEventFieldsByRoleKey = new Map<string, string[]>();

function hasPermission(req: AuthRequest, slug: string): boolean {
  return hasPermissionSlug(getEffectivePermissionSlugsFromUser(req.user), slug);
}

function hasAnyPermission(req: AuthRequest, slugs: string[]): boolean {
  return slugs.some((slug) => hasPermission(req, slug));
}

function canAccessProfitReports(req: AuthRequest): boolean {
  return hasPermission(req, "reports:profit:read");
}

function canOverrideCompleted(req: AuthRequest): boolean {
  return hasPermission(req, "events:override_completed");
}

function canViewEventFinancials(req: AuthRequest): boolean {
  return canAccessProfitReports(req);
}

function canViewEventOperations(req: AuthRequest): boolean {
  return hasAnyPermission(req, ["events:write", "event_assignments:write", "vehicle_assignments:write", "events:delete", "expenses:approve"]);
}

function canLogTrips(req: AuthRequest): boolean {
  return hasPermission(req, "trips:create");
}

function canApproveExpenses(req: AuthRequest): boolean {
  return hasPermission(req, "expenses:approve");
}

function canShareSavedViews(req: AuthRequest): boolean {
  return hasPermission(req, "events:saved_views:share") || hasPermission(req, "users:manage");
}

function canExportEvents(req: AuthRequest): boolean {
  return hasPermission(req, "exports:read") && (hasPermission(req, "events:read") || canAccessProfitReports(req));
}

function canImportEvents(req: AuthRequest): boolean {
  return hasPermission(req, "events:write");
}

function canWriteEventProposals(req: AuthRequest): boolean {
  return hasPermission(req, "events:proposals:write") || hasPermission(req, "events:write");
}

function canApproveEventProposals(req: AuthRequest): boolean {
  return hasPermission(req, "events:proposals:approve");
}

function canReadEventProposals(req: AuthRequest): boolean {
  return canWriteEventProposals(req) || canApproveEventProposals(req);
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

async function getHiddenEventFields(req: AuthRequest): Promise<string[]> {
  const roleNames = [req.user?.role, ...(req.user?.roles || [])].filter((role): role is string => Boolean(role));
  const key = roleNames.map((role) => role.toLowerCase()).sort().join("|");
  if (!key) return [];
  const cached = hiddenEventFieldsByRoleKey.get(key);
  if (cached) return cached;
  const hiddenFields = await fetchHiddenFieldsForRoles(roleNames, "events");
  hiddenEventFieldsByRoleKey.set(key, hiddenFields);
  return hiddenFields;
}

async function redactEventForPermissions<T extends Record<string, any>>(event: T, req: AuthRequest): Promise<T> {
  const redacted = { ...event };
  if (!canViewEventFinancials(req)) {
    delete redacted.contract_price;
    delete redacted.approved_expense_total;
    delete redacted.estimated_cost_total;
    delete redacted.net_profit;
    delete redacted.margin_percentage;
    delete redacted.pending_expense_count;
  }
  if (!canViewEventOperations(req)) delete redacted.estimated_design_cost;
  for (const fieldName of await getHiddenEventFields(req)) {
    delete redacted[fieldName];
  }
  return redacted;
}

type EventFilterField = {
  sql: string;
  type: "text" | "number" | "date" | "uuid";
  financial?: boolean;
};

const EVENT_FILTER_FIELDS: Record<string, EventFilterField> = {
  name: { sql: "e.name", type: "text" },
  title: { sql: "e.name", type: "text" },
  event_type: { sql: "et.name", type: "text" },
  event_type_id: { sql: "e.event_type_id", type: "uuid" },
  client_name: { sql: "e.client_name", type: "text" },
  client_phone: { sql: "e.client_phone", type: "text" },
  status: { sql: "e.status", type: "text" },
  start_date: { sql: "e.start_date", type: "date" },
  end_date: { sql: "e.end_date", type: "date" },
  venue_location: { sql: "e.venue_location", type: "text" },
  location: { sql: "e.venue_location", type: "text" },
  created_by: { sql: "e.created_by", type: "uuid" },
  created_date: { sql: "e.created_at", type: "date" },
  updated_date: { sql: "e.updated_at", type: "date" },
  contract_price: { sql: "e.contract_price", type: "number", financial: true },
  revenue: { sql: "e.contract_price", type: "number", financial: true },
  approved_expense_total: { sql: "COALESCE(expenses.approved_expense_total, 0)", type: "number", financial: true },
  estimated_cost_total: { sql: "COALESCE(e.estimated_design_cost, 0)", type: "number", financial: true },
  net_profit: { sql: "e.contract_price - COALESCE(expenses.approved_expense_total, 0)", type: "number", financial: true },
  margin_percentage: {
    sql: "CASE WHEN e.contract_price > 0 THEN ((e.contract_price - COALESCE(expenses.approved_expense_total, 0)) / e.contract_price) * 100 ELSE 0 END",
    type: "number",
    financial: true,
  },
  vehicle_count: { sql: "COALESCE(vehicles.vehicle_count, 0)", type: "number" },
  assigned_staff_count: { sql: "COALESCE(assignments.assigned_staff_count, 0)", type: "number" },
  allocation_count: { sql: "COALESCE(allocations.allocation_count, 0)", type: "number" },
  checklist_completion_percentage: {
    sql: "CASE WHEN COALESCE(checklist.total_items, 0) = 0 THEN 0 ELSE (COALESCE(checklist.done_items, 0)::numeric / checklist.total_items) * 100 END",
    type: "number",
  },
  pending_expense_count: { sql: "COALESCE(expenses.pending_expense_count, 0)", type: "number", financial: true },
};

type EventListQueryShape = {
  status?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  filterLogic: "and" | "or";
  filters: Array<{ field: string; operator: string; value?: unknown }>;
};

type EventQueryParts =
  | { ok: true; whereClause: string; params: any[]; sortSql: string; sortDirection: "ASC" | "DESC"; summaryJoins: string }
  | { ok: false; status: number; error: string };

const EVENT_SUMMARY_JOINS = `
  LEFT JOIN (
    SELECT
      event_id,
      COALESCE(SUM(amount) FILTER (WHERE status = 'Approved'), 0)::numeric AS approved_expense_total,
      COALESCE(COUNT(*) FILTER (WHERE status = 'Pending'), 0)::int AS pending_expense_count
    FROM expenses
    GROUP BY event_id
  ) expenses ON expenses.event_id = e.id
  LEFT JOIN (
    SELECT event_id, COUNT(*)::int AS assigned_staff_count
    FROM event_assignments
    GROUP BY event_id
  ) assignments ON assignments.event_id = e.id
  LEFT JOIN (
    SELECT event_id, COUNT(*)::int AS vehicle_count
    FROM vehicle_assignments
    GROUP BY event_id
  ) vehicles ON vehicles.event_id = e.id
  LEFT JOIN (
    SELECT event_id, COUNT(*)::int AS allocation_count
    FROM event_allocations
    WHERE status <> 'Returned'
    GROUP BY event_id
  ) allocations ON allocations.event_id = e.id
  LEFT JOIN (
    SELECT
      event_id,
      COUNT(*)::int AS total_items,
      COUNT(*) FILTER (WHERE status = 'Done')::int AS done_items
    FROM event_checklist
    GROUP BY event_id
  ) checklist ON checklist.event_id = e.id
`;

const EVENT_SELECT_COLUMNS = `
  e.*,
  et.name as event_type_name,
  COALESCE(expenses.approved_expense_total, 0)::float AS approved_expense_total,
  COALESCE(e.estimated_design_cost, 0)::float AS estimated_cost_total,
  (e.contract_price - COALESCE(expenses.approved_expense_total, 0))::float AS net_profit,
  CASE
    WHEN e.contract_price > 0 THEN ROUND((((e.contract_price - COALESCE(expenses.approved_expense_total, 0)) / e.contract_price) * 100)::numeric, 2)
    ELSE 0
  END::float AS margin_percentage,
  COALESCE(vehicles.vehicle_count, 0)::int AS vehicle_count,
  COALESCE(assignments.assigned_staff_count, 0)::int AS assigned_staff_count,
  COALESCE(allocations.allocation_count, 0)::int AS allocation_count,
  CASE
    WHEN COALESCE(checklist.total_items, 0) = 0 THEN 0
    ELSE ROUND(((COALESCE(checklist.done_items, 0)::numeric / checklist.total_items) * 100)::numeric, 2)
  END::float AS checklist_completion_percentage,
  COALESCE(expenses.pending_expense_count, 0)::int AS pending_expense_count
`;

const EVENT_EXPORT_COLUMNS: Record<string, { header: string; financial?: boolean }> = {
  name: { header: "Event Name" },
  client_name: { header: "Client Name" },
  client_phone: { header: "Client Phone" },
  event_type_name: { header: "Event Type" },
  status: { header: "Status" },
  start_date: { header: "Start Date" },
  end_date: { header: "End Date" },
  start_time: { header: "Start Time" },
  end_time: { header: "End Time" },
  venue_location: { header: "Venue / Location" },
  contract_price: { header: "Revenue / Contract Price", financial: true },
  approved_expense_total: { header: "Approved Expenses", financial: true },
  estimated_cost_total: { header: "Estimated Cost", financial: true },
  net_profit: { header: "Net Profit", financial: true },
  margin_percentage: { header: "Margin %", financial: true },
  vehicle_count: { header: "Vehicle Count" },
  assigned_staff_count: { header: "Assigned Staff Count" },
  allocation_count: { header: "Allocation Count" },
  checklist_completion_percentage: { header: "Checklist Completion %" },
  pending_expense_count: { header: "Pending Expense Count", financial: true },
};

const DEFAULT_EVENT_EXPORT_COLUMNS = [
  "name",
  "client_name",
  "event_type_name",
  "status",
  "start_date",
  "end_date",
  "venue_location",
  "vehicle_count",
  "assigned_staff_count",
  "allocation_count",
  "checklist_completion_percentage",
];

const DEFAULT_FINANCIAL_EVENT_EXPORT_COLUMNS = [
  "contract_price",
  "approved_expense_total",
  "estimated_cost_total",
  "net_profit",
  "margin_percentage",
  "pending_expense_count",
];

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

function normalizeFilterValue(value: unknown, field: EventFilterField): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (field.type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error("Filter value must be a number");
    return parsed;
  }
  if (field.type === "date") {
    if (typeof value !== "string" || isNaN(Date.parse(value))) throw new Error("Filter value must be a valid date");
    return value;
  }
  if (field.type === "uuid") {
    if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error("Filter value must be a valid UUID");
    }
    return value;
  }
  return String(value);
}

function buildEventFilterCondition(
  field: EventFilterField,
  operator: string,
  value: unknown,
  params: any[],
): string {
  const sql = field.sql;
  const addParam = (raw: unknown) => {
    const normalized = normalizeFilterValue(raw, field);
    params.push(normalized);
    return `$${params.length}`;
  };

  switch (operator) {
    case "equals":
      return `${sql} = ${addParam(value)}`;
    case "not_equals":
      return `${sql} IS DISTINCT FROM ${addParam(value)}`;
    case "contains":
      if (field.type !== "text") throw new Error("contains is only supported for text fields");
      return `${sql} ILIKE ${addParam(`%${String(value ?? "")}%`)}`;
    case "starts_with":
      if (field.type !== "text") throw new Error("starts_with is only supported for text fields");
      return `${sql} ILIKE ${addParam(`${String(value ?? "")}%`)}`;
    case "greater_than":
      return `${sql} > ${addParam(value)}`;
    case "greater_than_or_equal":
      return `${sql} >= ${addParam(value)}`;
    case "less_than":
      return `${sql} < ${addParam(value)}`;
    case "less_than_or_equal":
      return `${sql} <= ${addParam(value)}`;
    case "between": {
      if (!Array.isArray(value) || value.length !== 2) throw new Error("between requires exactly two values");
      return `(${sql} >= ${addParam(value[0])} AND ${sql} <= ${addParam(value[1])})`;
    }
    case "in":
    case "not_in": {
      if (!Array.isArray(value) || value.length === 0) throw new Error(`${operator} requires a non-empty value list`);
      const placeholders = value.map((entry) => addParam(entry));
      return `${sql} ${operator === "not_in" ? "NOT " : ""}IN (${placeholders.join(", ")})`;
    }
    case "is_empty":
      return field.type === "text" ? `(${sql} IS NULL OR ${sql} = '')` : `${sql} IS NULL`;
    case "is_not_empty":
      return field.type === "text" ? `(${sql} IS NOT NULL AND ${sql} <> '')` : `${sql} IS NOT NULL`;
    default:
      throw new Error("Unsupported filter operator");
  }
}

function buildEventQueryParts(query: EventListQueryShape, req: AuthRequest): EventQueryParts {
  const { status, start_date, end_date, search, sortBy, sortOrder, filterLogic, filters } = query;
  const canSeeFinancials = canViewEventFinancials(req);
  const conditions: string[] = ["e.deleted_at IS NULL"];
  const params: any[] = [];

  if (status) {
    params.push(status);
    conditions.push(`e.status = $${params.length}`);
  }

  if (start_date) {
    params.push(start_date);
    conditions.push(`e.start_date >= $${params.length}`);
  }

  if (end_date) {
    params.push(end_date);
    conditions.push(`e.end_date <= $${params.length}`);
  }

  if (search?.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(
      `(e.name ILIKE $${params.length} OR e.client_name ILIKE $${params.length} OR e.venue_location ILIKE $${params.length})`
    );
  }

  const advancedConditions: string[] = [];
  for (const filter of filters) {
    const field = EVENT_FILTER_FIELDS[filter.field];
    if (!field) {
      return { ok: false, status: 400, error: `Unsupported event filter field: ${filter.field}` };
    }
    if (field.financial && !canSeeFinancials) {
      return { ok: false, status: 403, error: "Forbidden: Missing profit report access permission" };
    }
    try {
      advancedConditions.push(buildEventFilterCondition(field, filter.operator, filter.value, params));
    } catch (error: any) {
      return { ok: false, status: 400, error: error.message || "Invalid event filter" };
    }
  }

  if (advancedConditions.length > 0) {
    conditions.push(`(${advancedConditions.join(filterLogic === "or" ? " OR " : " AND ")})`);
  }

  const sortField = EVENT_FILTER_FIELDS[sortBy];
  if (!sortField) {
    return { ok: false, status: 400, error: `Unsupported event sort field: ${sortBy}` };
  }
  if (sortField.financial && !canSeeFinancials) {
    return { ok: false, status: 403, error: "Forbidden: Missing profit report access permission" };
  }

  return {
    ok: true,
    whereClause: conditions.join(" AND "),
    params,
    sortSql: sortField.sql,
    sortDirection: sortOrder === "desc" ? "DESC" : "ASC",
    summaryJoins: EVENT_SUMMARY_JOINS,
  };
}

function getRequestedExportColumns(rawColumns: string[] | undefined, includeFinancials: boolean): string[] {
  const requested = rawColumns?.length
    ? rawColumns
    : [
        ...DEFAULT_EVENT_EXPORT_COLUMNS,
        ...(includeFinancials ? DEFAULT_FINANCIAL_EVENT_EXPORT_COLUMNS : []),
      ];

  return [...new Set(requested)].filter((column) => {
    const meta = EVENT_EXPORT_COLUMNS[column];
    return meta && (!meta.financial || includeFinancials);
  });
}

function formatExportValue(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  return String(value);
}

function buildExportRows(events: Array<Record<string, unknown>>, columns: string[]) {
  return events.map((event) => {
    const row: Record<string, string | number> = {};
    for (const column of columns) {
      row[column] = formatExportValue(event[column]);
    }
    return row;
  });
}

async function insertEventAuditLog(
  client: PoolClient | Pool,
  eventId: string | null,
  userId: string | null,
  fieldChanged: string,
  oldValue: string | null,
  newValue: string | null,
): Promise<void> {
  await client.query(
    `
      INSERT INTO event_logs (event_id, user_id, field_changed, old_value, new_value)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [eventId, userId, fieldChanged, oldValue, newValue],
  );
}

function normalizeImportText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim();
}

async function resolveImportEventTypeId(
  client: PoolClient | Pool,
  eventTypeId: string | null | undefined,
  eventTypeName: string | null | undefined,
): Promise<string | null> {
  if (eventTypeId) return eventTypeId;
  if (!eventTypeName?.trim()) return null;

  const result = await client.query(
    `SELECT id FROM event_types WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL LIMIT 1`,
    [eventTypeName.trim()],
  );
  return result.rows[0]?.id || null;
}

type ProposalCostBreakdown = {
  design?: Array<{ amount: number }>;
  team?: Array<{ amount?: number; people_count?: number; commission_per_person?: number }>;
  trip?: Array<{ amount: number }>;
  other?: Array<{ amount: number }>;
};

function sumAmounts(lines: Array<{ amount?: number }> = []): number {
  return lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
}

function calculateProposalFinancials(requestedBudget: number, costBreakdown: ProposalCostBreakdown) {
  const estimatedDesignCost = sumAmounts(costBreakdown.design || []);
  const estimatedTeamCost = (costBreakdown.team || []).reduce((sum, line) => {
    const explicitAmount = Number(line.amount || 0);
    const derivedAmount = Number(line.people_count || 0) * Number(line.commission_per_person || 0);
    return sum + Math.max(explicitAmount, derivedAmount);
  }, 0);
  const estimatedTripCost = sumAmounts(costBreakdown.trip || []);
  const estimatedOtherCost = sumAmounts(costBreakdown.other || []);
  const estimatedTotalCost = estimatedDesignCost + estimatedTeamCost + estimatedTripCost + estimatedOtherCost;
  const estimatedNetProfit = requestedBudget - estimatedTotalCost;
  const estimatedMarginPercentage = requestedBudget > 0
    ? Number(((estimatedNetProfit / requestedBudget) * 100).toFixed(2))
    : 0;

  return {
    estimatedDesignCost,
    estimatedTeamCost,
    estimatedTripCost,
    estimatedOtherCost,
    estimatedTotalCost,
    estimatedNetProfit,
    estimatedMarginPercentage,
  };
}

function normalizeOptionalText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim();
}

function formatProposal(row: any) {
  const budget = Number(row.requested_budget || 0);
  const estimatedTotalCost = Number(row.estimated_total_cost || 0);
  const estimatedNetProfit = Number(row.estimated_net_profit || 0);
  const estimatedMarginPercentage = Number(row.estimated_margin_percentage || 0);
  return {
    ...row,
    requested_budget: budget,
    estimated_design_cost: Number(row.estimated_design_cost || 0),
    estimated_team_cost: Number(row.estimated_team_cost || 0),
    estimated_trip_cost: Number(row.estimated_trip_cost || 0),
    estimated_other_cost: Number(row.estimated_other_cost || 0),
    estimated_total_cost: estimatedTotalCost,
    estimated_net_profit: estimatedNetProfit,
    estimated_margin_percentage: estimatedMarginPercentage,
  };
}

async function insertProposalAuditLog(
  client: PoolClient | Pool,
  proposalId: string,
  userId: string | null,
  action: string,
  oldStatus: string | null,
  newStatus: string | null,
  note: string | null = null,
): Promise<void> {
  await client.query(
    `
      INSERT INTO event_proposal_logs (proposal_id, user_id, action, old_status, new_status, note)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [proposalId, userId, action, oldStatus, newStatus, note],
  );
}

// GET /events - List events (filtered, paginated)
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const validationResult = eventListQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { page, limit } = validationResult.data;
    const offset = (page - 1) * limit;
    const queryParts = buildEventQueryParts(validationResult.data, req);
    if (!queryParts.ok) {
      res.status(queryParts.status).json({ error: queryParts.error });
      return;
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*)
      FROM events e
      LEFT JOIN event_types et ON e.event_type_id = et.id
      ${queryParts.summaryJoins}
      WHERE ${queryParts.whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParts.params);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated data
    const queryParams = [...queryParts.params];
    queryParams.push(limit);
    const limitParam = `$${queryParams.length}`;
    queryParams.push(offset);
    const offsetParam = `$${queryParams.length}`;

    const dataQuery = `
      SELECT
        ${EVENT_SELECT_COLUMNS}
      FROM events e
      LEFT JOIN event_types et ON e.event_type_id = et.id
      ${queryParts.summaryJoins}
      WHERE ${queryParts.whereClause}
      ORDER BY ${queryParts.sortSql} ${queryParts.sortDirection}, e.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const dataResult = await pool.query(dataQuery, queryParams);

    const events = await Promise.all(dataResult.rows.map((row: any) => redactEventForPermissions(row, req)));

    res.json({
      events,
      total,
      page,
      limit,
    });
  } catch (error: any) {
    console.error("[get-events] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /events/export/template - CSV/XLSX import template with SRD-grounded sample event data
router.get("/export/template", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canImportEvents(req)) {
      res.status(403).json({ error: "Forbidden: Missing event import permission" });
      return;
    }

    const format = req.query.format === "xlsx" ? "xlsx" : "csv";
    const columns = [
      { key: "name", header: "Event Name" },
      { key: "client_name", header: "Client Name" },
      { key: "client_phone", header: "Client Phone" },
      { key: "event_type_name", header: "Event Type Name" },
      { key: "start_date", header: "Start Date" },
      { key: "end_date", header: "End Date" },
      { key: "start_time", header: "Start Time" },
      { key: "end_time", header: "End Time" },
      { key: "venue_location", header: "Venue / Location" },
      { key: "contract_price", header: "Contract Price" },
      { key: "status", header: "Status" },
      { key: "package_design_notes", header: "Package Design Notes" },
      { key: "estimated_design_cost", header: "Estimated Design Cost" },
    ];
    const sampleRows = [
      {
        name: "DreamLux SRD Wedding Setup",
        client_name: "SRD Sample Client",
        client_phone: "+251900000000",
        event_type_name: "Wedding",
        start_date: "2026-07-20",
        end_date: "2026-07-20",
        start_time: "09:00",
        end_time: "18:00",
        venue_location: "Sheraton Addis",
        contract_price: "250000",
        status: "Planned",
        package_design_notes: "Luxury floral and stage decor estimate",
        estimated_design_cost: "50000",
      },
    ];

    if (format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Event Import Template");
      sheet.columns = columns.map((column) => ({ header: column.header, key: column.key, width: Math.max(column.header.length + 4, 18) }));
      sheet.addRows(sampleRows);
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E2C2" } };
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="events-import-template.xlsx"');
      await workbook.xlsx.write(res as unknown as import("stream").Stream);
      res.end();
      return;
    }

    const csv = stringify(sampleRows, { header: true, columns });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="events-import-template.csv"');
    res.send(csv);
  } catch (error: any) {
    console.error("[events-export-template] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /events/export - Export filtered event rows as CSV/XLSX with backend redaction
router.get("/export", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canExportEvents(req)) {
      res.status(403).json({ error: "Forbidden: Missing event export permission" });
      return;
    }

    const validationResult = eventExportQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const payload = validationResult.data;
    const queryParts = buildEventQueryParts(payload, req);
    if (!queryParts.ok) {
      res.status(queryParts.status).json({ error: queryParts.error });
      return;
    }

    const countResult = await pool.query(
      `
        SELECT COUNT(*)
        FROM events e
        LEFT JOIN event_types et ON e.event_type_id = et.id
        ${queryParts.summaryJoins}
        WHERE ${queryParts.whereClause}
      `,
      queryParts.params,
    );
    const total = parseInt(countResult.rows[0].count, 10);
    if (total > payload.maxRows) {
      await insertEventAuditLog(
        pool,
        null,
        req.user?.id || null,
        canViewEventFinancials(req) ? "events_export_financial_blocked" : "events_export_blocked",
        null,
        `${payload.format}:${total}/${payload.maxRows}`,
      );
      res.status(413).json({
        error: `Export contains ${total} rows and exceeds the maxRows guardrail of ${payload.maxRows}`,
        total,
        maxRows: payload.maxRows,
      });
      return;
    }

    const dataParams = [...queryParts.params, payload.maxRows];
    const eventsResult = await pool.query(
      `
        SELECT ${EVENT_SELECT_COLUMNS}
        FROM events e
        LEFT JOIN event_types et ON e.event_type_id = et.id
        ${queryParts.summaryJoins}
        WHERE ${queryParts.whereClause}
        ORDER BY ${queryParts.sortSql} ${queryParts.sortDirection}, e.created_at DESC
        LIMIT $${dataParams.length}
      `,
      dataParams,
    );
    const events = await Promise.all(eventsResult.rows.map((row: any) => redactEventForPermissions(row, req)));
    const columns = getRequestedExportColumns(payload.columns, canViewEventFinancials(req));
    const exportRows = buildExportRows(events, columns);
    const columnDefinitions = columns.map((column) => ({ key: column, header: EVENT_EXPORT_COLUMNS[column].header }));

    await insertEventAuditLog(
      pool,
      null,
      req.user?.id || null,
      canViewEventFinancials(req) ? "events_export_financial" : "events_export",
      null,
      `${payload.format}:${events.length}/${total}`,
    );

    const dateTag = new Date().toISOString().slice(0, 10);
    if (payload.format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Events");
      sheet.columns = columnDefinitions.map((column) => ({ header: column.header, key: column.key, width: Math.max(column.header.length + 4, 18) }));
      sheet.addRows(exportRows);
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E2C2" } };
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="events-export-${dateTag}.xlsx"`);
      await workbook.xlsx.write(res as unknown as import("stream").Stream);
      res.end();
      return;
    }

    const csv = stringify(exportRows, { header: true, columns: columnDefinitions });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="events-export-${dateTag}.csv"`);
    res.send(csv);
  } catch (error: any) {
    console.error("[events-export] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/import/preview - Validate structured rows parsed from CSV/XLSX before commit
router.post("/import/preview", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canImportEvents(req)) {
      res.status(403).json({ error: "Forbidden: Missing event import permission" });
      return;
    }

    const validationResult = eventImportPayloadSchema.safeParse({ ...req.body, commit: false });
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { mode, rows } = validationResult.data;
    const errors: Array<{ row: number; field: string; message: string }> = [];
    const preparedRows = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const eventTypeId = await resolveImportEventTypeId(pool, normalizeImportText(row.event_type_id), normalizeImportText(row.event_type_name));
      if (row.event_type_name && !eventTypeId) {
        errors.push({ row: index + 1, field: "event_type_name", message: `Unknown event type: ${row.event_type_name}` });
      }
      if (mode === "update" && !row.id) {
        errors.push({ row: index + 1, field: "id", message: "id is required for update imports" });
      }
      preparedRows.push({ row: index + 1, event_type_id: eventTypeId, action: mode, name: row.name });
    }

    await insertEventAuditLog(pool, null, req.user?.id || null, "events_import_preview", null, `${mode}:${rows.length}:errors=${errors.length}`);
    res.json({
      valid: errors.length === 0,
      mode,
      rowCount: rows.length,
      preparedRows,
      errors,
    });
  } catch (error: any) {
    console.error("[events-import-preview] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/import/commit - Transactional event import after preview passes
router.post("/import/commit", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!canImportEvents(req)) {
    res.status(403).json({ error: "Forbidden: Missing event import permission" });
    return;
  }

  const validationResult = eventImportPayloadSchema.safeParse({ ...req.body, commit: true });
  if (!validationResult.success) {
    res.status(400).json({ error: validationResult.error.errors[0].message });
    return;
  }

  const { mode, rows } = validationResult.data;
  const client = await pool.connect();
  const importedIds: string[] = [];
  const errors: Array<{ row: number; field: string; message: string }> = [];

  try {
    await client.query("BEGIN");

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const eventTypeId = await resolveImportEventTypeId(client, normalizeImportText(row.event_type_id), normalizeImportText(row.event_type_name));
      if (row.event_type_name && !eventTypeId) {
        errors.push({ row: index + 1, field: "event_type_name", message: `Unknown event type: ${row.event_type_name}` });
        continue;
      }
      if (mode === "update" && !row.id) {
        errors.push({ row: index + 1, field: "id", message: "id is required for update imports" });
        continue;
      }

      if (mode === "insert") {
        const insertResult = await client.query(
          `
            INSERT INTO events (
              name, client_name, client_phone, event_type_id,
              start_date, end_date, start_time, end_time,
              venue_location, contract_price, status, created_by,
              package_design_notes, estimated_design_cost
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
          `,
          [
            row.name,
            row.client_name,
            normalizeImportText(row.client_phone),
            eventTypeId,
            row.start_date,
            row.end_date,
            normalizeImportText(row.start_time),
            normalizeImportText(row.end_time),
            row.venue_location,
            row.contract_price,
            row.status,
            req.user?.id || null,
            normalizeImportText(row.package_design_notes),
            row.estimated_design_cost ?? null,
          ],
        );
        importedIds.push(insertResult.rows[0].id);
        await insertEventAuditLog(client, insertResult.rows[0].id, req.user?.id || null, "event_import_created", null, row.name);
      } else {
        const updateResult = await client.query(
          `
            UPDATE events
            SET name = $1,
                client_name = $2,
                client_phone = $3,
                event_type_id = $4,
                start_date = $5,
                end_date = $6,
                start_time = $7,
                end_time = $8,
                venue_location = $9,
                contract_price = $10,
                status = $11,
                package_design_notes = $12,
                estimated_design_cost = $13,
                updated_at = NOW()
            WHERE id = $14 AND deleted_at IS NULL
            RETURNING id
          `,
          [
            row.name,
            row.client_name,
            normalizeImportText(row.client_phone),
            eventTypeId,
            row.start_date,
            row.end_date,
            normalizeImportText(row.start_time),
            normalizeImportText(row.end_time),
            row.venue_location,
            row.contract_price,
            row.status,
            normalizeImportText(row.package_design_notes),
            row.estimated_design_cost ?? null,
            row.id,
          ],
        );
        if (updateResult.rowCount === 0) {
          errors.push({ row: index + 1, field: "id", message: "Event not found or deleted" });
          continue;
        }
        importedIds.push(updateResult.rows[0].id);
        await insertEventAuditLog(client, updateResult.rows[0].id, req.user?.id || null, "event_import_updated", null, row.name);
      }
    }

    if (errors.length > 0) {
      await client.query("ROLLBACK");
      await insertEventAuditLog(pool, null, req.user?.id || null, "events_import_failed", null, `${mode}:${rows.length}:errors=${errors.length}`);
      res.status(400).json({ imported: false, mode, rowCount: rows.length, importedCount: 0, errors });
      return;
    }

    await insertEventAuditLog(client, null, req.user?.id || null, "events_import_committed", null, `${mode}:${importedIds.length}`);
    await client.query("COMMIT");
    res.json({ imported: true, mode, rowCount: rows.length, importedCount: importedIds.length, eventIds: importedIds, errors: [] });
  } catch (error: any) {
    await client.query("ROLLBACK");
    await insertEventAuditLog(pool, null, req.user?.id || null, "events_import_failed", null, `${mode}:${rows.length}:exception`);
    console.error("[events-import-commit] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  } finally {
    client.release();
  }
});

// GET /events/proposals - Event intake/profitability proposal queue
router.get("/proposals", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canReadEventProposals(req)) {
      res.status(403).json({ error: "Forbidden: Missing event proposal access permission" });
      return;
    }

    const validationResult = eventProposalListQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { page, limit, status, created_by, event_type_id, search, start_date, end_date, min_margin, max_margin, min_profit, max_profit } = validationResult.data;
    const params: any[] = [];
    const conditions = ["p.deleted_at IS NULL"];

    if (status) {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }
    if (created_by) {
      params.push(created_by);
      conditions.push(`p.created_by = $${params.length}`);
    }
    if (event_type_id) {
      params.push(event_type_id);
      conditions.push(`p.event_type_id = $${params.length}`);
    }
    if (search?.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(p.name ILIKE $${params.length} OR p.client_name ILIKE $${params.length} OR p.venue_location ILIKE $${params.length})`);
    }
    if (start_date) {
      params.push(start_date);
      conditions.push(`p.requested_start_date >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date);
      conditions.push(`p.requested_end_date <= $${params.length}`);
    }
    if (min_margin !== undefined) {
      params.push(min_margin);
      conditions.push(`p.estimated_margin_percentage >= $${params.length}`);
    }
    if (max_margin !== undefined) {
      params.push(max_margin);
      conditions.push(`p.estimated_margin_percentage <= $${params.length}`);
    }
    if (min_profit !== undefined) {
      params.push(min_profit);
      conditions.push(`p.estimated_net_profit >= $${params.length}`);
    }
    if (max_profit !== undefined) {
      params.push(max_profit);
      conditions.push(`p.estimated_net_profit <= $${params.length}`);
    }

    const whereClause = conditions.join(" AND ");
    const countResult = await pool.query(`SELECT COUNT(*) FROM event_proposals p WHERE ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count, 10);
    const offset = (page - 1) * limit;
    const queryParams = [...params, limit, offset];

    const result = await pool.query(
      `
        SELECT p.*, et.name AS event_type_name
        FROM event_proposals p
        LEFT JOIN event_types et ON p.event_type_id = et.id
        WHERE ${whereClause}
        ORDER BY
          CASE WHEN p.status = 'Submitted' THEN 0 ELSE 1 END,
          CASE
            WHEN p.requested_start_date IS NOT NULL AND p.requested_start_date <= CURRENT_DATE + INTERVAL '14 days'
            THEN p.estimated_net_profit
            ELSE NULL
          END DESC NULLS LAST,
          CASE
            WHEN p.requested_start_date IS NOT NULL AND p.requested_start_date <= CURRENT_DATE + INTERVAL '14 days'
            THEN p.estimated_margin_percentage
            ELSE NULL
          END DESC NULLS LAST,
          p.created_at ASC
        LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
      `,
      queryParams,
    );

    res.json({
      proposals: result.rows.map(formatProposal),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("[event-proposals-list] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/proposals - Create draft proposal with rough estimates only
router.post("/proposals", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canWriteEventProposals(req)) {
      res.status(403).json({ error: "Forbidden: Missing event proposal write permission" });
      return;
    }

    const validationResult = eventProposalPayloadSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const payload = validationResult.data;
    const financials = calculateProposalFinancials(payload.requested_budget, payload.cost_breakdown);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query(
        `
          INSERT INTO event_proposals (
            name, client_name, client_phone, event_type_id, requested_budget,
            requested_start_date, requested_end_date, requested_start_time, requested_end_time,
            venue_location, notes, package_design_notes, cost_breakdown,
            estimated_design_cost, estimated_team_cost, estimated_trip_cost, estimated_other_cost,
            estimated_total_cost, estimated_net_profit, estimated_margin_percentage, created_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
          )
          RETURNING *
        `,
        [
          payload.name,
          payload.client_name,
          normalizeOptionalText(payload.client_phone),
          normalizeOptionalText(payload.event_type_id),
          payload.requested_budget,
          normalizeOptionalText(payload.requested_start_date),
          normalizeOptionalText(payload.requested_end_date),
          normalizeOptionalText(payload.requested_start_time),
          normalizeOptionalText(payload.requested_end_time),
          normalizeOptionalText(payload.venue_location),
          normalizeOptionalText(payload.notes),
          normalizeOptionalText(payload.package_design_notes),
          JSON.stringify(payload.cost_breakdown),
          financials.estimatedDesignCost,
          financials.estimatedTeamCost,
          financials.estimatedTripCost,
          financials.estimatedOtherCost,
          financials.estimatedTotalCost,
          financials.estimatedNetProfit,
          financials.estimatedMarginPercentage,
          req.user?.id || null,
        ],
      );
      await insertProposalAuditLog(client, result.rows[0].id, req.user?.id || null, "proposal_created", null, "Draft");
      await client.query("COMMIT");
      res.status(201).json({ proposal: formatProposal(result.rows[0]) });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("[event-proposals-create] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /events/proposals/:proposalId - Proposal detail with optional audit history
router.get("/proposals/:proposalId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canReadEventProposals(req)) {
      res.status(403).json({ error: "Forbidden: Missing event proposal access permission" });
      return;
    }

    const result = await pool.query(
      `
        SELECT p.*, et.name AS event_type_name
        FROM event_proposals p
        LEFT JOIN event_types et ON p.event_type_id = et.id
        WHERE p.id = $1 AND p.deleted_at IS NULL
      `,
      [req.params.proposalId],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: "Event proposal not found" });
      return;
    }

    const logsResult = await pool.query(
      `SELECT * FROM event_proposal_logs WHERE proposal_id = $1 ORDER BY created_at ASC`,
      [req.params.proposalId],
    );
    res.json({ proposal: formatProposal(result.rows[0]), logs: logsResult.rows });
  } catch (error: any) {
    console.error("[event-proposals-detail] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

async function transitionProposalStatus(
  req: AuthRequest,
  res: Response,
  allowedStatuses: string[],
  newStatus: string,
  action: string,
  note: string | null = null,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT * FROM event_proposals WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [req.params.proposalId],
    );
    if (existing.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Event proposal not found" });
      return;
    }

    const oldStatus = existing.rows[0].status;
    if (!allowedStatuses.includes(oldStatus)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: `Cannot ${action} proposal from ${oldStatus} status` });
      return;
    }

    const updateResult = await client.query(
      `
        UPDATE event_proposals
        SET status = $1,
            submitted_at = CASE WHEN $1 = 'Submitted' THEN NOW() ELSE submitted_at END,
            approved_by = CASE WHEN $1 = 'Approved' THEN $2 ELSE approved_by END,
            approved_at = CASE WHEN $1 = 'Approved' THEN NOW() ELSE approved_at END,
            rejection_reason = CASE WHEN $1 = 'Rejected' THEN $3 ELSE rejection_reason END,
            updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `,
      [newStatus, req.user?.id || null, note, req.params.proposalId],
    );
    await insertProposalAuditLog(client, req.params.proposalId, req.user?.id || null, action, oldStatus, newStatus, note);
    await client.query("COMMIT");
    res.json({ proposal: formatProposal(updateResult.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

router.post("/proposals/:proposalId/submit", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canWriteEventProposals(req)) {
      res.status(403).json({ error: "Forbidden: Missing event proposal write permission" });
      return;
    }
    await transitionProposalStatus(req, res, ["Draft"], "Submitted", "proposal_submitted");
  } catch (error: any) {
    console.error("[event-proposals-submit] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.post("/proposals/:proposalId/approve", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canApproveEventProposals(req)) {
      res.status(403).json({ error: "Forbidden: Missing event proposal approval permission" });
      return;
    }
    await transitionProposalStatus(req, res, ["Submitted"], "Approved", "proposal_approved");
  } catch (error: any) {
    console.error("[event-proposals-approve] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.post("/proposals/:proposalId/reject", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canApproveEventProposals(req)) {
      res.status(403).json({ error: "Forbidden: Missing event proposal approval permission" });
      return;
    }
    const validationResult = eventProposalRejectSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }
    await transitionProposalStatus(req, res, ["Submitted"], "Rejected", "proposal_rejected", validationResult.data.reason);
  } catch (error: any) {
    console.error("[event-proposals-reject] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

router.post("/proposals/:proposalId/cancel", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canApproveEventProposals(req) && !canWriteEventProposals(req)) {
      res.status(403).json({ error: "Forbidden: Missing event proposal permission" });
      return;
    }
    await transitionProposalStatus(req, res, ["Draft", "Submitted", "Approved"], "Canceled", "proposal_canceled");
  } catch (error: any) {
    console.error("[event-proposals-cancel] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/proposals/:proposalId/convert - Atomically convert approved proposal into a real event
router.post("/proposals/:proposalId/convert", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!canApproveEventProposals(req) || !canImportEvents(req)) {
    res.status(403).json({ error: "Forbidden: Missing event proposal conversion permission" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const proposalResult = await client.query(
      `SELECT * FROM event_proposals WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [req.params.proposalId],
    );
    if (proposalResult.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Event proposal not found" });
      return;
    }

    const proposal = proposalResult.rows[0];
    if (proposal.converted_event_id) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Proposal is already converted", eventId: proposal.converted_event_id });
      return;
    }
    if (proposal.status !== "Approved") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: `Cannot convert proposal from ${proposal.status} status` });
      return;
    }
    if (!proposal.requested_start_date || !proposal.requested_end_date || !proposal.venue_location) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Approved proposal must have dates and venue before conversion" });
      return;
    }

    const eventResult = await client.query(
      `
        INSERT INTO events (
          name, client_name, client_phone, event_type_id,
          start_date, end_date, start_time, end_time,
          venue_location, contract_price, status, created_by,
          package_design_notes, estimated_design_cost, event_proposal_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Planned', $11, $12, $13, $14)
        RETURNING *
      `,
      [
        proposal.name,
        proposal.client_name,
        proposal.client_phone,
        proposal.event_type_id,
        proposal.requested_start_date,
        proposal.requested_end_date,
        proposal.requested_start_time,
        proposal.requested_end_time,
        proposal.venue_location,
        proposal.requested_budget,
        req.user?.id || null,
        proposal.package_design_notes,
        proposal.estimated_design_cost,
        proposal.id,
      ],
    );

    const updatedProposal = await client.query(
      `
        UPDATE event_proposals
        SET status = 'Converted',
            converted_event_id = $1,
            updated_at = NOW()
        WHERE id = $2 AND converted_event_id IS NULL
        RETURNING *
      `,
      [eventResult.rows[0].id, proposal.id],
    );
    if (updatedProposal.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Proposal conversion was already completed" });
      return;
    }

    await insertProposalAuditLog(client, proposal.id, req.user?.id || null, "proposal_converted", proposal.status, "Converted", eventResult.rows[0].id);
    await insertEventAuditLog(client, eventResult.rows[0].id, req.user?.id || null, "event_created_from_proposal", null, proposal.id);
    await client.query("COMMIT");
    res.status(201).json({ proposal: formatProposal(updatedProposal.rows[0]), event: eventResult.rows[0] });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[event-proposals-convert] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  } finally {
    client.release();
  }
});

// GET /events/expenses/pending - accountant approval queue
router.get("/expenses/pending", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canApproveExpenses(req)) {
      res.status(403).json({ error: "Forbidden: Missing expense approval permission" });
      return;
    }

    const result = await pool.query(`
      SELECT
        exp.*,
        e.name AS event_name,
        e.client_name,
        e.venue_location,
        submitter.full_name AS submitted_by_name
      FROM expenses exp
      JOIN events e ON exp.event_id = e.id
      LEFT JOIN users submitter ON exp.created_by = submitter.id
      WHERE exp.status = 'Pending' AND e.deleted_at IS NULL
      ORDER BY exp.created_at ASC
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error("[get-pending-expenses] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

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

// PATCH /events/expenses/:expenseId/review - approve/reject pending expense
router.patch("/expenses/:expenseId/review", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { expenseId } = req.params;
    if (!canApproveExpenses(req)) {
      res.status(403).json({ error: "Forbidden: Missing expense approval permission" });
      return;
    }

    const validationResult = reviewEventExpenseSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingResult = await client.query(
        `
          SELECT exp.*
          FROM expenses exp
          JOIN events e ON exp.event_id = e.id
          WHERE exp.id = $1 AND e.deleted_at IS NULL
        `,
        [expenseId]
      );

      if (existingResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Expense not found or associated event is deleted" });
        return;
      }
      if (existingResult.rows[0].status === "Approved") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Approved expenses are locked" });
        return;
      }

      const { status, rejected_reason } = validationResult.data;
      const result = await client.query(
        `
          UPDATE expenses
          SET status = $1,
              rejected_reason = $2,
              approved_by = $3,
              approved_at = NOW()
          WHERE id = $4
          RETURNING *
        `,
        [status, status === "Rejected" ? rejected_reason : null, req.user?.id || null, expenseId]
      );

      // Insert audit log
      await client.query(
        `
          INSERT INTO event_logs (event_id, user_id, field_changed, old_value, new_value)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          existingResult.rows[0].event_id,
          req.user?.id || null,
          "expense_status",
          `Pending (ID: ${expenseId}, Category: ${existingResult.rows[0].category}, Amount: ${existingResult.rows[0].amount})`,
          status
        ]
      );

      await client.query("COMMIT");
      res.json(result.rows[0]);
    } catch (error: any) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("[patch-expense-review] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

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
      await insertSavedViewAuditLog(
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

    await insertSavedViewAuditLog(
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

// GET /events/:id/profit - Profit calculations for a single event
router.get("/:id/profit", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!canAccessProfitReports(req)) {
      res.status(403).json({ error: "Forbidden: Missing profit report access permission" });
      return;
    }

    const eventQuery = `SELECT id, name, contract_price FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];
    const contractPrice = Number(event.contract_price || 0);

    const expensesQuery = `
      SELECT category, SUM(amount)::float AS amount
      FROM expenses
      WHERE event_id = $1 AND status = 'Approved'
      GROUP BY category
    `;
    const expensesResult = await pool.query(expensesQuery, [id]);

    const categoriesList = ["Fuel", "Labor", "Transportation", "Equipment Rental", "Consumables", "Other"];
    const eventExpenses: Record<string, number> = {};
    for (const cat of categoriesList) {
      eventExpenses[cat] = 0;
    }

    let totalExpenses = 0;
    for (const row of expensesResult.rows) {
      const { category, amount } = row;
      const normalizedCat = categoriesList.includes(category) ? category : "Other";
      eventExpenses[normalizedCat] = (eventExpenses[normalizedCat] || 0) + amount;
      totalExpenses += amount;
    }

    const netProfit = contractPrice - totalExpenses;
    const profitMargin = contractPrice > 0 ? Number(((netProfit / contractPrice) * 100).toFixed(2)) : 0;

    const categoryBreakdown = categoriesList.map(cat => ({
      category: cat,
      amount: Number((eventExpenses[cat] || 0).toFixed(2))
    }));

    res.json({
      eventId: event.id,
      name: event.name,
      contractPrice: Number(contractPrice.toFixed(2)),
      totalExpenses: Number(totalExpenses.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      profitMargin,
      categoryBreakdown
    });
  } catch (error: any) {
    console.error("[get-event-profit] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /events/:id - Get specific event with history logs
router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const eventQuery = `
      SELECT e.*, et.name as event_type_name, u.full_name as created_by_name
      FROM events e
      LEFT JOIN event_types et ON e.event_type_id = et.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = $1 AND e.deleted_at IS NULL
    `;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];

    const logsQuery = `
      SELECT el.*, u.full_name as user_full_name, u.username as user_username
      FROM event_logs el
      LEFT JOIN users u ON el.user_id = u.id
      WHERE el.event_id = $1
      ORDER BY el.changed_at DESC
    `;
    const logsResult = await pool.query(logsQuery, [id]);

    const filteredEvent = await redactEventForPermissions(event, req);

    res.json({
      event: filteredEvent,
      logs: logsResult.rows,
    });
  } catch (error: any) {
    console.error("[get-event-by-id] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events - Create a new event
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!hasPermission(req, "events:write")) {
      res.status(403).json({ error: "Forbidden: Insufficient privileges to create events" });
      return;
    }

    const validationResult = createEventSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const {
      name,
      client_name,
      client_phone,
      event_type_id,
      start_date,
      end_date,
      start_time,
      end_time,
      venue_location,
      contract_price,
    } = validationResult.data;

    const insertQuery = `
      INSERT INTO events (
        name, client_name, client_phone, event_type_id,
        start_date, end_date, start_time, end_time,
        venue_location, contract_price, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Planned', $11)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      name,
      client_name,
      client_phone || null,
      event_type_id || null,
      start_date,
      end_date,
      start_time || null,
      end_time || null,
      venue_location,
      contract_price,
      req.user?.id || null,
    ]);

    // Redact contract_price/estimated_design_cost if user doesn't have privileges
    const event = await redactEventForPermissions(result.rows[0], req);

    res.status(201).json({ event });
  } catch (error: any) {
    console.error("[create-event] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// PUT /events/:id - Update event details & status transitions
router.put("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!hasPermission(req, "events:write")) {
      res.status(403).json({ error: "Forbidden: Insufficient privileges to update events" });
      return;
    }

    // Fetch existing event
    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const currentEvent = eventResult.rows[0];

    // Auth validation: Completed event locking
    const isOverrideAuthorized = canOverrideCompleted(req);
    if (currentEvent.status === "Completed" && !isOverrideAuthorized) {
      res.status(403).json({
        error: "Completed events cannot be edited except by administrators or accountants",
      });
      return;
    }

    // Validate request body
    const validationResult = updateEventSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const updateData = validationResult.data;

    // Status transition validation
    if (updateData.status && updateData.status !== currentEvent.status) {
      const current = currentEvent.status;
      const target = updateData.status;

      // Planned -> Ongoing -> Completed
      if (current === "Planned" && target === "Completed" && !isOverrideAuthorized) {
        // Allowing Planned -> Completed directly for admins/accountants but optionally warn or restrict for Event Managers?
        // Actually, Planned -> Completed is generally fine, let's allow it but warn.
      }

      if (current === "Ongoing" && target === "Planned" && !isOverrideAuthorized) {
        res.status(400).json({
          error: "Cannot transition event status from Ongoing back to Planned",
        });
        return;
      }

      if (current === "Completed" && target !== "Completed" && !isOverrideAuthorized) {
        res.status(403).json({
          error: "Completed status cannot be changed except by administrators or accountants",
        });
        return;
      }
    }

    // Identify changed fields and insert into event_logs
    const fieldsToTrack = [
      "name",
      "client_name",
      "client_phone",
      "event_type_id",
      "start_date",
      "end_date",
      "start_time",
      "end_time",
      "venue_location",
      "contract_price",
      "status",
    ];

    const logPromises: Promise<any>[] = [];

    // Helper to format values for event log comparison
    const formatForLog = (field: string, val: any): string => {
      if (val === null || val === undefined) return "";
      if (val instanceof Date) {
        return val.toISOString().split("T")[0]; // YYYY-MM-DD
      }
      if (field === "start_date" || field === "end_date") {
        // Date objects from pg driver are Dates, but update input is string
        const d = new Date(val);
        return isNaN(d.getTime()) ? String(val) : d.toISOString().split("T")[0];
      }
      if (field === "contract_price") {
        return Number(val).toFixed(2);
      }
      return String(val);
    };

    for (const field of fieldsToTrack) {
      if (updateData[field as keyof typeof updateData] !== undefined) {
        const oldValue = formatForLog(field, currentEvent[field]);
        const newValue = formatForLog(field, updateData[field as keyof typeof updateData]);

        if (oldValue !== newValue) {
          const logInsert = `
            INSERT INTO event_logs (event_id, user_id, field_changed, old_value, new_value)
            VALUES ($1, $2, $3, $4, $5)
          `;
          logPromises.push(
            pool.query(logInsert, [
              id,
              req.user?.id || null,
              field,
              oldValue || null,
              newValue || null,
            ])
          );
        }
      }
    }

    await Promise.all(logPromises);

    // Build dynamic update query
    const setClauses: string[] = [];
    const updateParams: any[] = [];

    for (const [key, val] of Object.entries(updateData)) {
      if (val !== undefined) {
        updateParams.push(val);
        setClauses.push(`${key} = $${updateParams.length}`);
      }
    }

    if (setClauses.length > 0) {
      updateParams.push(id);
      const idPlaceholder = `$${updateParams.length}`;
      const updateQuery = `
        UPDATE events
        SET ${setClauses.join(", ")}, updated_at = NOW()
        WHERE id = ${idPlaceholder}
        RETURNING *
      `;
      const result = await pool.query(updateQuery, updateParams);
      const event = await redactEventForPermissions(result.rows[0], req);
      res.json({ event });
    } else {
      const event = await redactEventForPermissions(currentEvent, req);
      res.json({ event });
    }
  } catch (error: any) {
    console.error("[update-event] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// DELETE /events/:id - Soft delete event
router.delete("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE events SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("[delete-event] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /events/:id/workspace - Get event operational workspace data
router.get("/:id/workspace", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const eventQuery = `
      SELECT e.*, et.name as event_type_name, u.full_name as created_by_name
      FROM events e
      LEFT JOIN event_types et ON e.event_type_id = et.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = $1 AND e.deleted_at IS NULL
    `;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];

    const allocationsQuery = `
      SELECT
        ea.id,
        ea.event_id,
        ea.item_id,
        ea.quantity_allocated,
        ea.status,
        ea.notes,
        ea.created_by,
        ea.created_at,
        ea.updated_at,
        i.name AS item_name,
        i.description AS item_description,
        i.image_key,
        s.name AS store_name,
        COALESCE(
          i.quantity - (
            SELECT COALESCE(SUM(quantity_allocated), 0)
            FROM event_allocations
            WHERE item_id = ea.item_id AND status != 'Returned'
          ),
          0
        ) AS available_quantity
      FROM event_allocations ea
      JOIN items i ON ea.item_id = i.id
      LEFT JOIN stores s ON i.store_id = s.id
      WHERE ea.event_id = $1
    `;
    const allocationsResult = await pool.query(allocationsQuery, [id]);

    const checklistQuery = `
      SELECT * FROM event_checklist
      WHERE event_id = $1
      ORDER BY created_at ASC
    `;
    const checklistResult = await pool.query(checklistQuery, [id]);

    const assignmentsQuery = `
      SELECT ea.*, emp.full_name as employee_name, emp.phone as employee_phone
      FROM event_assignments ea
      JOIN employees emp ON ea.employee_id = emp.id
      WHERE ea.event_id = $1
    `;
    const assignmentsResult = await pool.query(assignmentsQuery, [id]);

    const vehicleAssignmentsQuery = `
      SELECT va.*, v.plate_number, v.vehicle_type, v.fuel_type, v.fuel_consumption_rate, emp.full_name as driver_name
      FROM vehicle_assignments va
      JOIN vehicles v ON va.vehicle_id = v.id
      LEFT JOIN employees emp ON va.driver_id = emp.id
      WHERE va.event_id = $1
    `;
    const vehicleAssignmentsResult = await pool.query(vehicleAssignmentsQuery, [id]);

    const isFinancial = canViewEventFinancials(req);

    let expenses: any[] = [];
    let trips: any[] = [];

    if (isFinancial) {
      const expensesQuery = `
        SELECT exp.*, submitter.full_name AS submitted_by_name, approver.full_name AS approved_by_name
        FROM expenses exp
        LEFT JOIN users submitter ON exp.created_by = submitter.id
        LEFT JOIN users approver ON exp.approved_by = approver.id
        WHERE exp.event_id = $1
        ORDER BY exp.created_at DESC
      `;
      const expensesResult = await pool.query(expensesQuery, [id]);
      expenses = expensesResult.rows;

      const tripsQuery = `
        SELECT
          t.*,
          va.event_id,
          va.vehicle_id,
          v.plate_number,
          v.vehicle_type,
          v.fuel_type,
          v.fuel_consumption_rate,
          emp.full_name AS driver_name
        FROM trips t
        JOIN vehicle_assignments va ON t.vehicle_assignment_id = va.id
        JOIN vehicles v ON va.vehicle_id = v.id
        LEFT JOIN employees emp ON va.driver_id = emp.id
        WHERE va.event_id = $1
        ORDER BY t.created_at DESC
      `;
      const tripsResult = await pool.query(tripsQuery, [id]);
      trips = tripsResult.rows;
    }

    const isPrivileged = canViewEventOperations(req);

    const filteredEvent = { ...event };
    if (!isFinancial) delete filteredEvent.contract_price;
    if (!isPrivileged) delete filteredEvent.estimated_design_cost;

    const filteredAssignments = assignmentsResult.rows.map((asg: any) => {
      const cloned = { ...asg };
      if (!isPrivileged) {
        delete cloned.commission_amount;
        delete cloned.employee_phone;
      }
      return cloned;
    });

    res.json({
      event: filteredEvent,
      allocations: allocationsResult.rows,
      checklist: checklistResult.rows,
      assignments: filteredAssignments,
      vehicleAssignments: vehicleAssignmentsResult.rows,
      expenses,
      trips,
    });
  } catch (error: any) {
    console.error("[get-event-workspace] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// PATCH /events/:id/design - Update package design details
router.patch("/:id/design", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!hasPermission(req, "events:write")) {
      res.status(403).json({ error: "Forbidden: Insufficient privileges to update event design" });
      return;
    }

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const currentEvent = eventResult.rows[0];

    const isOverrideAuthorized = canOverrideCompleted(req);
    if (currentEvent.status === "Completed" && !isOverrideAuthorized) {
      res.status(403).json({
        error: "Completed events cannot be edited except by administrators or accountants",
      });
      return;
    }

    const validationResult = updateEventDesignSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { package_design_notes, estimated_design_cost } = validationResult.data;

    const logPromises: Promise<any>[] = [];
    if (package_design_notes !== undefined && package_design_notes !== currentEvent.package_design_notes) {
      logPromises.push(
        pool.query(
          `INSERT INTO event_logs (event_id, user_id, field_changed, old_value, new_value) VALUES ($1, $2, $3, $4, $5)`,
          [id, req.user?.id || null, "package_design_notes", currentEvent.package_design_notes, package_design_notes]
        )
      );
    }
    if (estimated_design_cost !== undefined && Number(estimated_design_cost) !== Number(currentEvent.estimated_design_cost || 0)) {
      logPromises.push(
        pool.query(
          `INSERT INTO event_logs (event_id, user_id, field_changed, old_value, new_value) VALUES ($1, $2, $3, $4, $5)`,
          [id, req.user?.id || null, "estimated_design_cost", currentEvent.estimated_design_cost ? String(currentEvent.estimated_design_cost) : "0", String(estimated_design_cost)]
        )
      );
    }
    await Promise.all(logPromises);

    const setClauses: string[] = [];
    const updateParams: any[] = [];

    if (package_design_notes !== undefined) {
      updateParams.push(package_design_notes);
      setClauses.push(`package_design_notes = $${updateParams.length}`);
    }

    if (estimated_design_cost !== undefined) {
      updateParams.push(estimated_design_cost);
      setClauses.push(`estimated_design_cost = $${updateParams.length}`);
    }

    if (setClauses.length > 0) {
      updateParams.push(id);
      const updateQuery = `
        UPDATE events
        SET ${setClauses.join(", ")}, updated_at = NOW()
        WHERE id = $${updateParams.length}
        RETURNING *
      `;
      const result = await pool.query(updateQuery, updateParams);
      const event = await redactEventForPermissions(result.rows[0], req);
      res.json({ event });
    } else {
      const event = await redactEventForPermissions(currentEvent, req);
      res.json({ event });
    }
  } catch (error: any) {
    console.error("[patch-event-design] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/:id/allocations - Allocate a store item to the event
router.post("/:id/allocations", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!hasAnyPermission(req, ["event_allocations:write", "assets:write"])) {
      res.status(403).json({ error: "Forbidden: Insufficient inventory allocation privileges" });
      return;
    }

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const currentEvent = eventResult.rows[0];

    const isOverrideAuthorized = canOverrideCompleted(req);
    if (currentEvent.status === "Completed" && !isOverrideAuthorized) {
      res.status(403).json({
        error: "Completed events cannot be edited except by administrators or accountants",
      });
      return;
    }

    const validationResult = createEventAllocationSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { item_id, quantity_allocated, notes } = validationResult.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const itemQuery = `SELECT * FROM items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`;
      const itemResult = await client.query(itemQuery, [item_id]);

      if (itemResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Inventory item not found" });
        return;
      }

      const item = itemResult.rows[0];

      const activeAllocationsQuery = `
        SELECT COALESCE(SUM(quantity_allocated), 0) as total_allocated
        FROM event_allocations
        WHERE item_id = $1 AND status != 'Returned'
      `;
      const activeAllocationsResult = await client.query(activeAllocationsQuery, [item_id]);
      const totalAllocated = parseInt(activeAllocationsResult.rows[0].total_allocated, 10);

      const availableQuantity = item.quantity - totalAllocated;

      if (quantity_allocated > availableQuantity) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Requested quantity exceeds available stock" });
        return;
      }

      const insertAllocationQuery = `
        INSERT INTO event_allocations (event_id, item_id, quantity_allocated, status, notes, created_by)
        VALUES ($1, $2, $3, 'Reserved', $4, $5)
        RETURNING *
      `;
      const allocationResult = await client.query(insertAllocationQuery, [
        id,
        item_id,
        quantity_allocated,
        notes || null,
        req.user?.id || null,
      ]);

      await client.query("COMMIT");
      res.status(201).json(allocationResult.rows[0]);
    } catch (error: any) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("[post-event-allocation] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// DELETE /events/:id/allocations/:allocationId - Release/delete allocated inventory item
router.delete("/:id/allocations/:allocationId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id, allocationId } = req.params;
    if (!hasAnyPermission(req, ["event_allocations:write", "assets:write"])) {
      res.status(403).json({ error: "Forbidden: Insufficient inventory allocation privileges" });
      return;
    }

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const currentEvent = eventResult.rows[0];

    const isOverrideAuthorized = canOverrideCompleted(req);
    if (currentEvent.status === "Completed" && !isOverrideAuthorized) {
      res.status(403).json({
        error: "Completed events cannot be edited except by administrators or accountants",
      });
      return;
    }

    const deleteQuery = `
      DELETE FROM event_allocations
      WHERE id = $1 AND event_id = $2
      RETURNING *
    `;
    const result = await pool.query(deleteQuery, [allocationId, id]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Allocation not found" });
      return;
    }

    res.json({ success: true, allocation: result.rows[0] });
  } catch (error: any) {
    console.error("[delete-event-allocation] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/:id/checklist - Create a new checklist task item
router.post("/:id/checklist", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!hasPermission(req, "event_checklist:write")) {
      res.status(403).json({ error: "Forbidden: Insufficient checklist privileges" });
      return;
    }

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const validationResult = createEventChecklistItemSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { title, due_date, owner_name } = validationResult.data;

    const insertQuery = `
      INSERT INTO event_checklist (event_id, title, status, due_date, owner_name, created_by)
      VALUES ($1, $2, 'Todo', $3, $4, $5)
      RETURNING *
    `;
    const result = await pool.query(insertQuery, [
      id,
      title,
      due_date || null,
      owner_name || null,
      req.user?.id || null,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("[post-event-checklist] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// PATCH /events/:id/checklist/:itemId - Update checklist item details or status
router.patch("/:id/checklist/:itemId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id, itemId } = req.params;
    if (!hasPermission(req, "event_checklist:write")) {
      res.status(403).json({ error: "Forbidden: Insufficient checklist privileges" });
      return;
    }

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);

    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const validationResult = updateEventChecklistItemSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const updateData = validationResult.data;

    const setClauses: string[] = [];
    const updateParams: any[] = [];

    for (const [key, val] of Object.entries(updateData)) {
      if (val !== undefined) {
        updateParams.push(val);
        setClauses.push(`${key} = $${updateParams.length}`);
      }
    }

    if (setClauses.length > 0) {
      updateParams.push(itemId);
      const itemIdPlaceholder = `$${updateParams.length}`;
      updateParams.push(id);
      const eventIdPlaceholder = `$${updateParams.length}`;

      const updateQuery = `
        UPDATE event_checklist
        SET ${setClauses.join(", ")}, updated_at = NOW()
        WHERE id = ${itemIdPlaceholder} AND event_id = ${eventIdPlaceholder}
        RETURNING *
      `;
      const result = await pool.query(updateQuery, updateParams);

      if (result.rowCount === 0) {
        res.status(404).json({ error: "Checklist item not found" });
        return;
      }

      res.json(result.rows[0]);
    } else {
      const checklistQuery = `SELECT * FROM event_checklist WHERE id = $1 AND event_id = $2`;
      const checklistResult = await pool.query(checklistQuery, [itemId, id]);
      if (checklistResult.rowCount === 0) {
        res.status(404).json({ error: "Checklist item not found" });
        return;
      }
      res.json(checklistResult.rows[0]);
    }
  } catch (error: any) {
    console.error("[patch-event-checklist] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Helper functions for scheduling conflict checks
async function hasEmployeeConflict(employeeId: string, eventId: string, startDate: string, endDate: string, dbClient: Pool | PoolClient = pool): Promise<boolean> {
  const teamConflictQuery = `
    SELECT COUNT(*) FROM event_assignments ea
    JOIN events e ON ea.event_id = e.id
    WHERE ea.employee_id = $1
      AND e.deleted_at IS NULL
      AND e.id != $2
      AND e.start_date <= $3
      AND e.end_date >= $4
  `;
  const teamResult = await dbClient.query(teamConflictQuery, [employeeId, eventId, endDate, startDate]);
  if (parseInt(teamResult.rows[0].count, 10) > 0) return true;

  const driverConflictQuery = `
    SELECT COUNT(*) FROM vehicle_assignments va
    JOIN events e ON va.event_id = e.id
    WHERE va.driver_id = $1
      AND e.deleted_at IS NULL
      AND e.id != $2
      AND e.start_date <= $3
      AND e.end_date >= $4
  `;
  const driverResult = await dbClient.query(driverConflictQuery, [employeeId, eventId, endDate, startDate]);
  return parseInt(driverResult.rows[0].count, 10) > 0;
}

async function hasVehicleConflict(vehicleId: string, eventId: string, startDate: string, endDate: string, dbClient: Pool | PoolClient = pool): Promise<boolean> {
  const vehicleConflictQuery = `
    SELECT COUNT(*) FROM vehicle_assignments va
    JOIN events e ON va.event_id = e.id
    WHERE va.vehicle_id = $1
      AND e.deleted_at IS NULL
      AND e.id != $2
      AND e.start_date <= $3
      AND e.end_date >= $4
  `;
  const result = await dbClient.query(vehicleConflictQuery, [vehicleId, eventId, endDate, startDate]);
  return parseInt(result.rows[0].count, 10) > 0;
}

// GET /events/:id/assignments/available-employees - List employees available for this event's dates
router.get("/:id/assignments/available-employees", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const { start_date, end_date } = eventResult.rows[0];

    const availableEmployeesQuery = `
      SELECT emp.*, SL.level_name as salary_level_name
      FROM employees emp
      LEFT JOIN salary_levels SL ON emp.salary_level_id = SL.id
      WHERE emp.deleted_at IS NULL
        AND emp.id NOT IN (
          SELECT DISTINCT ea.employee_id FROM event_assignments ea
          JOIN events e ON ea.event_id = e.id
          WHERE e.deleted_at IS NULL AND e.id != $1 AND e.start_date <= $2 AND e.end_date >= $3
        )
        AND emp.id NOT IN (
          SELECT DISTINCT va.driver_id FROM vehicle_assignments va
          JOIN events e ON va.event_id = e.id
          WHERE e.deleted_at IS NULL AND va.driver_id IS NOT NULL AND e.id != $1 AND e.start_date <= $2 AND e.end_date >= $3
        )
      ORDER BY emp.full_name ASC
    `;
    const result = await pool.query(availableEmployeesQuery, [id, end_date, start_date]);
    res.json(result.rows);
  } catch (error: any) {
    console.error("[get-available-employees] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /events/:id/assignments/available-vehicles - List vehicles available for this event's dates
router.get("/:id/assignments/available-vehicles", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const { start_date, end_date } = eventResult.rows[0];

    const availableVehiclesQuery = `
      SELECT v.* FROM vehicles v
      WHERE v.deleted_at IS NULL AND v.is_active = TRUE
        AND v.id NOT IN (
          SELECT DISTINCT va.vehicle_id FROM vehicle_assignments va
          JOIN events e ON va.event_id = e.id
          WHERE e.deleted_at IS NULL AND e.id != $1 AND e.start_date <= $2 AND e.end_date >= $3
        )
      ORDER BY v.plate_number ASC
    `;
    const result = await pool.query(availableVehiclesQuery, [id, end_date, start_date]);
    res.json(result.rows);
  } catch (error: any) {
    console.error("[get-available-vehicles] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/:id/assignments/employees - Assign an employee
router.post("/:id/assignments/employees", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!hasPermission(req, "vehicle_assignments:write")) {
      res.status(403).json({ error: "Forbidden: Insufficient assignment privileges" });
      return;
    }

    const validationResult = createEventAssignmentSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { employee_id, role, commission_amount, attended } = validationResult.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`;
      const eventResult = await client.query(eventQuery, [id]);
      if (eventResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Event not found" });
        return;
      }

      const event = eventResult.rows[0];

      // Enforce completed-event locking
      if (event.status === "Completed" && !canOverrideCompleted(req)) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Completed event assignments cannot be modified except by administrators or accountants",
        });
        return;
      }

      // Lock employee row FOR UPDATE to serialize parallel assignment conflicts checks
      const empLockQuery = `SELECT id FROM employees WHERE id = $1 FOR UPDATE`;
      const empLockResult = await client.query(empLockQuery, [employee_id]);
      if (empLockResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Employee not found" });
        return;
      }

      // Check for scheduling conflict
      const conflict = await hasEmployeeConflict(employee_id, id, event.start_date, event.end_date, client);
      if (conflict) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Scheduling Conflict: This employee is already assigned to another event on these dates.",
        });
        return;
      }

      const insertQuery = `
        INSERT INTO event_assignments (event_id, employee_id, role, commission_amount, attended)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (event_id, employee_id) DO UPDATE
        SET role = EXCLUDED.role, commission_amount = EXCLUDED.commission_amount, attended = EXCLUDED.attended
        RETURNING *
      `;
      const result = await client.query(insertQuery, [
        id,
        employee_id,
        role,
        commission_amount,
        attended,
      ]);

      await client.query("COMMIT");
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("[post-employee-assignment] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// DELETE /events/:id/assignments/employees/:employeeId - Remove employee assignment
router.delete("/:id/assignments/employees/:employeeId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id, employeeId } = req.params;
    if (!hasPermission(req, "event_assignments:write")) {
      res.status(403).json({ error: "Forbidden: Insufficient assignment privileges" });
      return;
    }

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];

    // Enforce completed-event locking
    if (event.status === "Completed" && !canOverrideCompleted(req)) {
      res.status(400).json({
        error: "Completed event assignments cannot be modified except by administrators or accountants",
      });
      return;
    }

    const deleteQuery = `
      DELETE FROM event_assignments
      WHERE event_id = $1 AND employee_id = $2
      RETURNING *
    `;
    const result = await pool.query(deleteQuery, [id, employeeId]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    res.json({ message: "Employee assignment removed successfully" });
  } catch (error: any) {
    console.error("[delete-employee-assignment] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/:id/assignments/vehicles - Assign a vehicle and optional driver
router.post("/:id/assignments/vehicles", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!hasPermission(req, "event_assignments:write")) {
      res.status(403).json({ error: "Forbidden: Insufficient assignment privileges" });
      return;
    }

    const validationResult = createVehicleAssignmentSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { vehicle_id, driver_id, is_night_shift } = validationResult.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`;
      const eventResult = await client.query(eventQuery, [id]);
      if (eventResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Event not found" });
        return;
      }

      const event = eventResult.rows[0];

      // Enforce completed-event locking
      if (event.status === "Completed" && !canOverrideCompleted(req)) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Completed event assignments cannot be modified except by administrators or accountants",
        });
        return;
      }

      // Lock vehicle row FOR UPDATE to serialize conflicts
      const vehLockQuery = `SELECT id FROM vehicles WHERE id = $1 FOR UPDATE`;
      const vehLockResult = await client.query(vehLockQuery, [vehicle_id]);
      if (vehLockResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Vehicle not found" });
        return;
      }

      // Lock driver row FOR UPDATE if provided
      if (driver_id) {
        const drvLockQuery = `SELECT id FROM employees WHERE id = $1 FOR UPDATE`;
        const drvLockResult = await client.query(drvLockQuery, [driver_id]);
        if (drvLockResult.rowCount === 0) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Driver not found" });
          return;
        }
      }

      // Check for vehicle scheduling conflict
      const vehicleConflict = await hasVehicleConflict(vehicle_id, id, event.start_date, event.end_date, client);
      if (vehicleConflict) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Scheduling Conflict: This vehicle is already assigned to another event on these dates.",
        });
        return;
      }

      // Check for driver scheduling conflict (if driver is provided)
      if (driver_id) {
        const driverConflict = await hasEmployeeConflict(driver_id, id, event.start_date, event.end_date, client);
        if (driverConflict) {
          await client.query("ROLLBACK");
          res.status(400).json({
            error: "Scheduling Conflict: This driver is already assigned to another event on these dates.",
          });
          return;
        }
      }

      const insertQuery = `
        INSERT INTO vehicle_assignments (event_id, vehicle_id, driver_id, is_night_shift)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (event_id, vehicle_id) DO UPDATE
        SET driver_id = EXCLUDED.driver_id, is_night_shift = EXCLUDED.is_night_shift
        RETURNING *
      `;
      const result = await client.query(insertQuery, [
        id,
        vehicle_id,
        driver_id || null,
        is_night_shift,
      ]);

      await client.query("COMMIT");
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("[post-vehicle-assignment] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// DELETE /events/:id/assignments/vehicles/:vehicleId - Remove vehicle assignment
router.delete("/:id/assignments/vehicles/:vehicleId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id, vehicleId } = req.params;
    if (!hasAnyPermission(req, ["event_assignments:write", "vehicle_assignments:write"])) {
      res.status(403).json({ error: "Forbidden: Insufficient privileges" });
      return;
    }

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];

    // Enforce completed-event locking
    if (event.status === "Completed" && !canOverrideCompleted(req)) {
      res.status(400).json({
        error: "Completed event assignments cannot be modified except by administrators or accountants",
      });
      return;
    }

    const deleteQuery = `
      DELETE FROM vehicle_assignments
      WHERE event_id = $1 AND vehicle_id = $2
      RETURNING *
    `;
    const result = await pool.query(deleteQuery, [id, vehicleId]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    res.json({ message: "Vehicle assignment removed successfully" });
  } catch (error: any) {
    console.error("[delete-vehicle-assignment] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// PATCH /events/:id/assignments/employees/:employeeId/attendance - Toggle attendance
router.patch("/:id/assignments/employees/:employeeId/attendance", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id, employeeId } = req.params;
    if (!hasAnyPermission(req, ["event_assignments:write", "vehicle_assignments:write"])) {
      res.status(403).json({ error: "Forbidden: Insufficient privileges" });
      return;
    }

    const eventQuery = `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL`;
    const eventResult = await pool.query(eventQuery, [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];

    // Enforce completed-event locking
    if (event.status === "Completed" && !canOverrideCompleted(req)) {
      res.status(400).json({
        error: "Completed event assignments cannot be modified except by administrators or accountants",
      });
      return;
    }

    const { attended } = req.body;
    if (attended === undefined) {
      res.status(400).json({ error: "Attended field is required" });
      return;
    }

    const updateQuery = `
      UPDATE event_assignments
      SET attended = $1
      WHERE event_id = $2 AND employee_id = $3
      RETURNING *
    `;
    const result = await pool.query(updateQuery, [attended, id, employeeId]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error("[patch-employee-attendance] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/:id/expenses - submit a pending event expense
router.post("/:id/expenses", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!hasPermission(req, "expenses:write")) {
      res.status(403).json({ error: "Forbidden: Missing expense write permission" });
      return;
    }

    const eventResult = await pool.query("SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL", [id]);
    if (eventResult.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const event = eventResult.rows[0];
    if (event.status === "Completed" && !canOverrideCompleted(req)) {
      res.status(403).json({ error: "Completed event expenses cannot be changed except by administrators or accountants" });
      return;
    }

    const validationResult = createEventExpenseSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { category, amount, description, receipt_image_key } = validationResult.data;
    const result = await pool.query(
      `
        INSERT INTO expenses (event_id, category, amount, description, receipt_image_key, status, created_by)
        VALUES ($1, $2, $3, $4, $5, 'Pending', $6)
        RETURNING *
      `,
      [id, category, amount, description, receipt_image_key || null, req.user?.id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("[post-event-expense] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/:id/trips - log trip and generate pending fuel expense
router.post("/:id/trips", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!canLogTrips(req)) {
      res.status(403).json({ error: "Forbidden: Missing expense write permission" });
      return;
    }

    const validationResult = createTripLogSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ error: validationResult.error.errors[0].message });
      return;
    }

    const { vehicle_assignment_id, destination, distance_km, fuel_price_etb } = validationResult.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const assignmentResult = await client.query(
        `
          SELECT va.*, v.plate_number, v.vehicle_type, v.fuel_consumption_rate, e.status AS event_status
          FROM vehicle_assignments va
          JOIN vehicles v ON va.vehicle_id = v.id
          JOIN events e ON va.event_id = e.id
          WHERE va.id = $1 AND va.event_id = $2 AND e.deleted_at IS NULL
        `,
        [vehicle_assignment_id, id]
      );

      if (assignmentResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Vehicle assignment not found for this event" });
        return;
      }

      const assignment = assignmentResult.rows[0];
      if (req.user?.role?.toUpperCase() === "DRIVER") {
        const userResult = await client.query(
          "SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL",
          [req.user.id]
        );
        const userEmail = userResult.rows[0]?.email;
        if (!userEmail) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "Forbidden: Driver has no linked email to resolve employee record" });
          return;
        }

        const employeeResult = await client.query(
          "SELECT id FROM employees WHERE email = $1 AND deleted_at IS NULL",
          [userEmail]
        );
        const employeeId = employeeResult.rows[0]?.id;
        if (!employeeId) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "Forbidden: No linked employee record found for this driver" });
          return;
        }

        if (assignment.driver_id !== employeeId) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "Forbidden: You are not assigned as the driver for this vehicle assignment" });
          return;
        }
      }

      if (assignment.event_status === "Completed" && !canOverrideCompleted(req)) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "Completed event trips cannot be changed except by administrators or accountants" });
        return;
      }

      const fuelLitersUsed = Number((Number(distance_km) * Number(assignment.fuel_consumption_rate)).toFixed(2));
      const fuelCostEtb = Number((fuelLitersUsed * Number(fuel_price_etb)).toFixed(2));

      const tripResult = await client.query(
        `
          INSERT INTO trips (vehicle_assignment_id, destination, distance_km, fuel_liters_used, fuel_cost_etb)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [vehicle_assignment_id, destination, distance_km, fuelLitersUsed, fuelCostEtb]
      );

      const description = `Fuel for ${destination} (${distance_km} km, ${assignment.fuel_consumption_rate} L/km, ${fuel_price_etb} ETB/L)`;
      const expenseResult = await client.query(
        `
          INSERT INTO expenses (event_id, category, amount, description, status, created_by)
          VALUES ($1, 'Fuel', $2, $3, 'Pending', $4)
          RETURNING *
        `,
        [id, fuelCostEtb, description, req.user?.id || null]
      );

      await client.query("COMMIT");
      res.status(201).json({
        trip: tripResult.rows[0],
        expense: expenseResult.rows[0],
        fuel_liters_used: fuelLitersUsed,
        fuel_cost_etb: fuelCostEtb,
      });
    } catch (error: any) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("[post-event-trip] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/:id/expenses/generate-labor - create pending labor expense from assignments
router.post("/:id/expenses/generate-labor", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!hasPermission(req, "expenses:labor_generate")) {
      res.status(403).json({ error: "Forbidden: Insufficient labor expense privileges" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Lock parent event record FOR UPDATE to serialize concurrent generation calls
      const eventResult = await client.query("SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [id]);
      if (eventResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Event not found" });
        return;
      }
      if (eventResult.rows[0].status !== "Completed") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Labor expense can only be generated after event completion" });
        return;
      }

      const assignmentResult = await client.query(
        "SELECT COALESCE(SUM(commission_amount), 0) AS total FROM event_assignments WHERE event_id = $1 AND attended = true",
        [id]
      );
      const laborTotal = Number(assignmentResult.rows[0]?.total || 0);
      if (laborTotal <= 0) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "No attended labor assignments found for this event" });
        return;
      }

      const existingResult = await client.query(
        "SELECT id FROM expenses WHERE event_id = $1 AND category = 'Labor' AND description = $2 AND status != 'Rejected'",
        [id, "Auto-generated labor cost from attended event assignments"]
      );
      if ((existingResult.rowCount || 0) > 0) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Labor expense has already been generated for this event" });
        return;
      }

      const result = await client.query(
        `
          INSERT INTO expenses (event_id, category, amount, description, status, created_by)
          VALUES ($1, 'Labor', $2, $3, 'Pending', $4)
          RETURNING *
        `,
        [id, laborTotal, "Auto-generated labor cost from attended event assignments", req.user?.id || null]
      );

      await client.query("COMMIT");
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("[post-event-labor-expense] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});


export default router;
