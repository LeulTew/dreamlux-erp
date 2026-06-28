import { Pool, PoolClient } from "pg";
import { Router, Response } from "express";
import ExcelJS from "exceljs";
import { stringify } from "csv-stringify/sync";
import { pool } from "../db/pool";
import { requireAuth, AuthRequest, getEffectivePermissionSlugsFromUser } from "../middleware/auth";
import { hasPermissionSlug } from "../lib/permissions";
import { fetchHiddenFieldsForRoles } from "../lib/permissions-db";
import { createEventProposalsRouter } from "./events/proposals";
import { createEventProfitReportsRouter } from "./events/profit-reports";
import { createEventSavedViewsRouter } from "./events/saved-views";
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
  eventExportQuerySchema,
  eventImportPayloadSchema,
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

function validateEventStatusTransition(current: string, target: string, canOverride: boolean): string | null {
  if (current === target || canOverride) return null;

  const allowedTransitions: Record<string, string[]> = {
    Planned: ["Ongoing"],
    Ongoing: ["Completed"],
    Completed: [],
  };

  if (!allowedTransitions[current]?.includes(target)) {
    return `Cannot transition event status from ${current} to ${target}. Follow Planned -> Ongoing -> Completed.`;
  }

  return null;
}

function canViewEventFinancials(req: AuthRequest): boolean {
  return canAccessProfitReports(req);
}

function canViewEventOperations(req: AuthRequest): boolean {
  return hasAnyPermission(req, ["events:write", "event_assignments:write", "vehicle_assignments:write", "events:delete", "expenses:approve"]);
}

function canDeleteEvents(req: AuthRequest): boolean {
  return hasPermission(req, "events:delete");
}

function canLogTrips(req: AuthRequest): boolean {
  return hasPermission(req, "trips:create");
}

function canApproveExpenses(req: AuthRequest): boolean {
  return hasPermission(req, "expenses:approve");
}

function canExportEvents(req: AuthRequest): boolean {
  return hasPermission(req, "exports:read") && (hasPermission(req, "events:read") || canAccessProfitReports(req));
}

function canImportEvents(req: AuthRequest): boolean {
  return hasPermission(req, "events:write");
}

function canReadEvents(req: AuthRequest): boolean {
  return hasPermission(req, "events:read");
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

const AUTO_LABOR_EXPENSE_DESCRIPTION = "Auto-generated labor cost from attended event assignments";

type LaborGenerationResult =
  | { status: "created"; expense: any; laborTotal: number }
  | { status: "already_exists"; expenseId: string | null }
  | { status: "event_not_found" }
  | { status: "event_not_completed" }
  | { status: "no_labor"; laborTotal: number };

async function generateLaborExpenseFromAssignments(
  client: PoolClient,
  eventId: string,
  userId: string | null,
): Promise<LaborGenerationResult> {
  const eventResult = await client.query("SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [eventId]);
  if (eventResult.rowCount === 0) return { status: "event_not_found" };
  if (eventResult.rows[0].status !== "Completed") return { status: "event_not_completed" };

  const assignmentResult = await client.query(
    "SELECT COALESCE(SUM(commission_amount), 0) AS total FROM event_assignments WHERE event_id = $1 AND attended = true",
    [eventId],
  );
  const laborTotal = Number(assignmentResult.rows[0]?.total || 0);
  if (laborTotal <= 0) return { status: "no_labor", laborTotal };

  const existingResult = await client.query(
    "SELECT id FROM expenses WHERE event_id = $1 AND category = 'Labor' AND description = $2 AND status != 'Rejected'",
    [eventId, AUTO_LABOR_EXPENSE_DESCRIPTION],
  );
  if ((existingResult.rowCount || 0) > 0) {
    return { status: "already_exists", expenseId: existingResult.rows[0]?.id ?? null };
  }

  let result;
  try {
    result = await client.query(
      `
        INSERT INTO expenses (event_id, category, amount, description, status, created_by)
        VALUES ($1, 'Labor', $2, $3, 'Pending', $4)
        RETURNING *
      `,
      [eventId, laborTotal, AUTO_LABOR_EXPENSE_DESCRIPTION, userId],
    );
  } catch (error: any) {
    if (error?.code === "23505" && String(error?.constraint || "").includes("idx_expenses_auto_labor_once_per_event")) {
      const duplicateResult = await client.query(
        "SELECT id FROM expenses WHERE event_id = $1 AND category = 'Labor' AND description = $2 AND status != 'Rejected'",
        [eventId, AUTO_LABOR_EXPENSE_DESCRIPTION],
      );
      return { status: "already_exists", expenseId: duplicateResult.rows[0]?.id ?? null };
    }
    throw error;
  }

  return { status: "created", expense: result.rows[0], laborTotal };
}

async function auditLaborGenerationOutcome(
  client: PoolClient,
  eventId: string,
  userId: string | null,
  result: LaborGenerationResult,
  source: "event_completion" | "manual",
): Promise<void> {
  const generatedExpenseId = result.status === "created" ? result.expense?.id : result.status === "already_exists" ? result.expenseId : null;
  const total = result.status === "created" || result.status === "no_labor" ? result.laborTotal : null;
  await insertEventAuditLog(
    client,
    eventId,
    userId,
    "labor_expense_generation",
    source,
    JSON.stringify({
      outcome: result.status,
      generatedExpenseId,
      laborTotal: total,
    }),
  );
}

async function reversePendingAutoLaborExpense(
  client: PoolClient,
  eventId: string,
  userId: string | null,
  reason: string,
): Promise<{ status: "reversed"; expense: any } | { status: "not_found" } | { status: "approved_locked"; expenseId: string }> {
  const eventResult = await client.query("SELECT id FROM events WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [eventId]);
  if (eventResult.rowCount === 0) return { status: "not_found" };

  const existingResult = await client.query(
    "SELECT id, status FROM expenses WHERE event_id = $1 AND category = 'Labor' AND description = $2 AND status != 'Rejected' FOR UPDATE",
    [eventId, AUTO_LABOR_EXPENSE_DESCRIPTION],
  );
  if (existingResult.rowCount === 0) return { status: "not_found" };
  if (existingResult.rows[0].status === "Approved") {
    return { status: "approved_locked", expenseId: existingResult.rows[0].id };
  }

  const updateResult = await client.query(
    `
      UPDATE expenses
      SET status = 'Rejected',
          rejected_reason = $1
      WHERE id = $2
      RETURNING *
    `,
    [reason, existingResult.rows[0].id],
  );

  await insertEventAuditLog(
    client,
    eventId,
    userId,
    "labor_expense_reversal",
    existingResult.rows[0].id,
    JSON.stringify({ outcome: "reversed", reason }),
  );

  return { status: "reversed", expense: updateResult.rows[0] };
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

// GET /events - List events (filtered, paginated)
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canReadEvents(req)) {
      res.status(403).json({ error: "Forbidden: Insufficient privileges to view events" });
      return;
    }

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

router.use(createEventProposalsRouter());
router.use(createEventSavedViewsRouter());
router.use(createEventProfitReportsRouter());

// Helper to build filters for expenses
function buildExpensesQuery(req: AuthRequest, statusMode: "Pending" | "History") {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 15;
  const offset = (page - 1) * limit;

  const params: any[] = [];
  const whereClauses: string[] = [];

  if (statusMode === "Pending") {
    whereClauses.push("exp.status = 'Pending'");
  } else {
    if (req.query.status && (req.query.status === "Approved" || req.query.status === "Rejected")) {
      params.push(req.query.status);
      whereClauses.push(`exp.status = $${params.length}`);
    } else {
      whereClauses.push("exp.status IN ('Approved', 'Rejected')");
    }
  }

  whereClauses.push("e.deleted_at IS NULL");

  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    const pIdx = params.length;
    whereClauses.push(`(
      e.name ILIKE $${pIdx} OR 
      exp.category ILIKE $${pIdx} OR 
      submitter.full_name ILIKE $${pIdx}
    )`);
  }

  if (req.query.category) {
    params.push(req.query.category);
    whereClauses.push(`exp.category = $${params.length}`);
  }

  if (req.query.date_from) {
    params.push(req.query.date_from);
    whereClauses.push(`exp.created_at >= $${params.length}::timestamp`);
  }
  if (req.query.date_to) {
    params.push(`${req.query.date_to} 23:59:59.999`);
    whereClauses.push(`exp.created_at <= $${params.length}::timestamp`);
  }

  if (req.query.amount_min) {
    params.push(parseFloat(req.query.amount_min as string));
    whereClauses.push(`exp.amount >= $${params.length}`);
  }
  if (req.query.amount_max) {
    params.push(parseFloat(req.query.amount_max as string));
    whereClauses.push(`exp.amount <= $${params.length}`);
  }

  if (statusMode === "History" && req.query.reviewer) {
    params.push(`%${req.query.reviewer}%`);
    whereClauses.push(`reviewer.full_name ILIKE $${params.length}`);
  }

  let sortSql = "exp.created_at";
  let sortDir = statusMode === "Pending" ? "ASC" : "DESC";

  if (req.query.sort_by) {
    const allowedSortFields = ["amount", "created_at", "approved_at", "category", "event_name"];
    const sortBy = req.query.sort_by as string;
    if (allowedSortFields.includes(sortBy)) {
      if (sortBy === "event_name") {
        sortSql = "e.name";
      } else {
        sortSql = `exp.${sortBy}`;
      }
    }
    const order = req.query.sort_order as string;
    if (order === "asc" || order === "desc") {
      sortDir = order.toUpperCase();
    }
  }

  const whereClause = whereClauses.length > 0 ? whereClauses.join(" AND ") : "1=1";

  return {
    params,
    whereClause,
    sortSql,
    sortDir,
    limit,
    offset,
    page
  };
}

// GET /events/expenses/pending - accountant approval queue (paginated & filtered)
router.get("/expenses/pending", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canApproveExpenses(req)) {
      res.status(403).json({ error: "Forbidden: Missing expense approval permission" });
      return;
    }

    const { params, whereClause, sortSql, sortDir, limit, offset, page } = buildExpensesQuery(req, "Pending");

    const countQuery = `
      SELECT COUNT(*)::integer AS count
      FROM expenses exp
      JOIN events e ON exp.event_id = e.id
      LEFT JOIN users submitter ON exp.created_by = submitter.id
      LEFT JOIN users reviewer ON exp.approved_by = reviewer.id
      WHERE ${whereClause}
    `;
    const countRes = await pool.query(countQuery, params);
    const total = countRes.rows[0].count;

    const dataParams = [...params];
    dataParams.push(limit);
    const limitPlaceholder = `$${dataParams.length}`;
    dataParams.push(offset);
    const offsetPlaceholder = `$${dataParams.length}`;

    const dataQuery = `
      SELECT
        exp.*,
        e.name AS event_name,
        e.client_name,
        e.venue_location,
        submitter.full_name AS submitted_by_name,
        reviewer.full_name AS approved_by_name
      FROM expenses exp
      JOIN events e ON exp.event_id = e.id
      LEFT JOIN users submitter ON exp.created_by = submitter.id
      LEFT JOIN users reviewer ON exp.approved_by = reviewer.id
      WHERE ${whereClause}
      ORDER BY ${sortSql} ${sortDir}
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;
    const dataRes = await pool.query(dataQuery, dataParams);

    res.json({
      data: dataRes.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error: any) {
    console.error("[get-pending-expenses] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// GET /events/expenses/history - accountant expense history queue (paginated & filtered)
router.get("/expenses/history", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canApproveExpenses(req)) {
      res.status(403).json({ error: "Forbidden: Missing expense approval permission" });
      return;
    }

    const { params, whereClause, sortSql, sortDir, limit, offset, page } = buildExpensesQuery(req, "History");

    const countQuery = `
      SELECT COUNT(*)::integer AS count
      FROM expenses exp
      JOIN events e ON exp.event_id = e.id
      LEFT JOIN users submitter ON exp.created_by = submitter.id
      LEFT JOIN users reviewer ON exp.approved_by = reviewer.id
      WHERE ${whereClause}
    `;
    const countRes = await pool.query(countQuery, params);
    const total = countRes.rows[0].count;

    const dataParams = [...params];
    dataParams.push(limit);
    const limitPlaceholder = `$${dataParams.length}`;
    dataParams.push(offset);
    const offsetPlaceholder = `$${dataParams.length}`;

    const dataQuery = `
      SELECT
        exp.*,
        e.name AS event_name,
        e.client_name,
        e.venue_location,
        submitter.full_name AS submitted_by_name,
        reviewer.full_name AS approved_by_name
      FROM expenses exp
      JOIN events e ON exp.event_id = e.id
      LEFT JOIN users submitter ON exp.created_by = submitter.id
      LEFT JOIN users reviewer ON exp.approved_by = reviewer.id
      WHERE ${whereClause}
      ORDER BY ${sortSql} ${sortDir}
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;
    const dataRes = await pool.query(dataQuery, dataParams);

    res.json({
      data: dataRes.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error: any) {
    console.error("[get-expense-history] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
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

// GET /events/trash - Deleted events visible only to users who can read events
router.get("/trash/list", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canReadEvents(req)) {
      res.status(403).json({ error: "Forbidden: Insufficient privileges to view events" });
      return;
    }

    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 10, 1), 100);
    const offset = (page - 1) * limit;

    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM events WHERE deleted_at IS NOT NULL`);
    const result = await pool.query(
      `
        SELECT e.*, et.name as event_type_name, u.full_name as created_by_name
        FROM events e
        LEFT JOIN event_types et ON e.event_type_id = et.id
        LEFT JOIN users u ON e.created_by = u.id
        WHERE e.deleted_at IS NOT NULL
        ORDER BY e.deleted_at DESC, e.updated_at DESC
        LIMIT $1 OFFSET $2
      `,
      [limit, offset],
    );
    const events = await Promise.all(result.rows.map((event) => redactEventForPermissions(event, req)));
    const total = Number(countResult.rows[0]?.count || 0);
    res.json({ events, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error: any) {
    console.error("[events-trash-list] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /events/:id/restore - Restore a soft-deleted event
router.post("/:id/restore", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!canDeleteEvents(req)) {
      res.status(403).json({ error: "Forbidden: Missing event delete permission" });
      return;
    }

    const { id } = req.params;
    const result = await pool.query(
      `UPDATE events SET deleted_at = NULL, updated_at = NOW() WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`,
      [id],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Deleted event not found" });
      return;
    }

    await insertEventAuditLog(pool, id, req.user?.id || null, "event_restored", "deleted", "active");
    const event = await redactEventForPermissions(result.rows[0], req);
    res.json({ event });
  } catch (error: any) {
    console.error("[events-restore] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// DELETE /events/:id/permanent - Hard delete only empty, already-trashed events
router.delete("/:id/permanent", requireAuth, async (req: AuthRequest, res: Response) => {
  if (!canDeleteEvents(req)) {
    res.status(403).json({ error: "Forbidden: Missing event delete permission" });
    return;
  }

  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query("BEGIN");
    const eventResult = await client.query(`SELECT * FROM events WHERE id = $1 AND deleted_at IS NOT NULL FOR UPDATE`, [id]);
    if (eventResult.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Deleted event not found" });
      return;
    }

    const dependencyResult = await client.query(
      `
        SELECT
          (SELECT COUNT(*)::int FROM event_assignments WHERE event_id = $1) AS assignments,
          (SELECT COUNT(*)::int FROM vehicle_assignments WHERE event_id = $1) AS vehicle_assignments,
          (SELECT COUNT(*)::int FROM expenses WHERE event_id = $1) AS expenses,
          (SELECT COUNT(*)::int FROM event_allocations WHERE event_id = $1) AS allocations,
          (SELECT COUNT(*)::int FROM event_checklist WHERE event_id = $1) AS checklist_items,
          (SELECT COUNT(*)::int FROM event_proposals WHERE converted_event_id = $1) AS converted_proposals
      `,
      [id],
    );
    const dependencies = dependencyResult.rows[0] || {};
    const blockingDependencies = Object.entries(dependencies)
      .filter(([, value]) => Number(value || 0) > 0)
      .map(([key, value]) => ({ key, count: Number(value) }));

    if (blockingDependencies.length > 0) {
      await insertEventAuditLog(client, id, req.user?.id || null, "event_permanent_delete_blocked", "trashed", JSON.stringify(blockingDependencies));
      await client.query("COMMIT");
      res.status(409).json({
        error: "Event has operational history and cannot be permanently deleted",
        dependencies: blockingDependencies,
      });
      return;
    }

    await insertEventAuditLog(client, id, req.user?.id || null, "event_permanent_deleted", "trashed", "deleted");
    await client.query(`DELETE FROM events WHERE id = $1`, [id]);
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[events-permanent-delete] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  } finally {
    client.release();
  }
});

// GET /events/:id - Get specific event with history logs
router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!canReadEvents(req)) {
      res.status(403).json({ error: "Forbidden: Insufficient privileges to view events" });
      return;
    }

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
    const shouldGenerateLaborOnCompletion = updateData.status === "Completed" && currentEvent.status !== "Completed";

    if (updateData.status && updateData.status !== currentEvent.status) {
      const transitionError = validateEventStatusTransition(currentEvent.status, updateData.status, isOverrideAuthorized);
      if (transitionError) {
        res.status(400).json({
          error: transitionError,
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
      if (shouldGenerateLaborOnCompletion) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const generationResult = await generateLaborExpenseFromAssignments(client, id, req.user?.id || null);
          await auditLaborGenerationOutcome(client, id, req.user?.id || null, generationResult, "event_completion");
          await client.query("COMMIT");
        } catch (generationError) {
          await client.query("ROLLBACK");
          throw generationError;
        } finally {
          client.release();
        }
      }
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
    if (!canDeleteEvents(req)) {
      res.status(403).json({ error: "Forbidden: Missing event delete permission" });
      return;
    }

    const result = await pool.query(
      `UPDATE events SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    await insertEventAuditLog(pool, id, req.user?.id || null, "event_deleted", "active", "deleted");
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
    if (!canReadEvents(req)) {
      res.status(403).json({ error: "Forbidden: Insufficient privileges to view events" });
      return;
    }

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

      const generationResult = await generateLaborExpenseFromAssignments(client, id, req.user?.id || null);
      if (generationResult.status === "event_not_found") {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Event not found" });
        return;
      }
      if (generationResult.status === "event_not_completed") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Labor expense can only be generated after event completion" });
        return;
      }
      if (generationResult.status === "no_labor") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "No attended labor assignments found for this event" });
        return;
      }
      if (generationResult.status === "already_exists") {
        await auditLaborGenerationOutcome(client, id, req.user?.id || null, generationResult, "manual");
        await client.query("COMMIT");
        res.status(409).json({ error: "Labor expense has already been generated for this event" });
        return;
      }

      await auditLaborGenerationOutcome(client, id, req.user?.id || null, generationResult, "manual");
      await client.query("COMMIT");
      res.status(201).json(generationResult.expense);
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

// POST /events/:id/expenses/reverse-auto-labor - reject pending generated labor after correction
router.post("/:id/expenses/reverse-auto-labor", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!hasPermission(req, "expenses:labor_generate")) {
      res.status(403).json({ error: "Forbidden: Insufficient labor expense privileges" });
      return;
    }

    const reason = typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : "Auto-generated labor expense reversed after event correction";

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const reversalResult = await reversePendingAutoLaborExpense(client, id, req.user?.id || null, reason);
      if (reversalResult.status === "not_found") {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Pending auto-generated labor expense not found" });
        return;
      }
      if (reversalResult.status === "approved_locked") {
        await insertEventAuditLog(
          client,
          id,
          req.user?.id || null,
          "labor_expense_reversal",
          reversalResult.expenseId,
          JSON.stringify({ outcome: "approved_locked", reason }),
        );
        await client.query("COMMIT");
        res.status(409).json({ error: "Approved labor expenses are locked and cannot be reversed automatically" });
        return;
      }

      await client.query("COMMIT");
      res.json(reversalResult.expense);
    } catch (error: any) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("[post-event-labor-expense-reversal] Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});


export default router;
