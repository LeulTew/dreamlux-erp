import express from "express";
import { supabase } from "../db/supabase";
import { generatePayrollPreviewSchema, finalizePayrollRunSchema, savePayrollDraftSchema } from "../lib/validation";
import { getMonthlyBounds, getHalfMonthBounds, getWeeklyBounds } from "../utils/payroll-utils";
import { getPublicUrl } from "../storage/storage";
import { getEligibleCommissionRows } from "../lib/eligible-payroll-commissions";
import { AuthRequest, getEffectivePermissionSlugsFromUser } from "../middleware/auth";
import { NotificationsService } from "../services/notifications-service";
import { PayrollPersistenceError, PayrollPersistenceService, type PayrollPeriod } from "../services/payroll-persistence-service";
import { hasPermissionSlug } from "../lib/permissions";
import { getSettings } from "../lib/settings";
import { pool } from "../db/pool";

const router = express.Router();
const PAYROLL_RUN_SORT_FIELDS = new Set(["period_start", "period_end", "created_at", "updated_at", "finalized_at", "status", "total", "recent"]);
const DEFAULT_PAYROLL_RUN_LIMIT = 20;
const MAX_PAYROLL_RUN_LIMIT = 100;

function canReadPayroll(req: AuthRequest): boolean {
  return hasPermissionSlug(getEffectivePermissionSlugsFromUser(req.user), "payroll:read");
}

function canWritePayroll(req: AuthRequest): boolean {
  return hasPermissionSlug(getEffectivePermissionSlugsFromUser(req.user), "payroll:write");
}

function requirePayrollRead(req: AuthRequest, res: express.Response): boolean {
  if (!canReadPayroll(req)) {
    res.status(403).json({ error: "Forbidden: Missing payroll read permission" });
    return false;
  }
  return true;
}

function requirePayrollWrite(req: AuthRequest, res: express.Response): boolean {
  if (!canWritePayroll(req)) {
    res.status(403).json({ error: "Forbidden: Missing payroll write permission" });
    return false;
  }
  return true;
}

function toApiStatus(status: string | null | undefined): string {
  switch (status) {
    case "finalized":
      return "FINALIZED";
    case "flagged_wrong":
      return "FLAGGED_WRONG";
    case "trashed":
      return "TRASH";
    default:
      return (status ?? "draft").toUpperCase();
  }
}

function toDbStatus(status: string): "draft" | "finalized" | "flagged_wrong" | "trashed" {
  if (status === "DRAFT") return "draft";
  if (status === "FINALIZED") return "finalized";
  if (status === "FLAGGED_WRONG") return "flagged_wrong";
  return "trashed";
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function resolvePersistedPayrollPeriod(input: {
  month?: number;
  year?: number;
  periodKind?: "month" | "range" | "half_month" | "weekly";
  periodStart?: string;
  periodEnd?: string;
}) {
  const finalMonth = input.month || new Date().getUTCMonth() + 1;
  const finalYear = input.year || new Date().getUTCFullYear();

  if (input.periodKind === "weekly") {
    if (!input.periodStart) {
      throw new Error("Weekly payroll periods require period_start.");
    }

    const bounds = getWeeklyBounds(input.periodStart);
    return {
      bounds,
      title: `Payroll ${bounds.start} to ${bounds.end}`,
      periodKind: "weekly" as const,
    };
  }

  if (input.periodKind === "month") {
    const bounds = getMonthlyBounds(finalYear, finalMonth);
    return {
      bounds,
      title: `Payroll ${finalYear}-${String(finalMonth).padStart(2, "0")} Full Month`,
      periodKind: "month" as const,
    };
  }

  if (input.periodKind === "range") {
    if (!input.periodStart || !input.periodEnd) {
      throw new Error("Custom range payroll periods require period_start and period_end.");
    }
    const bounds = {
      start: input.periodStart,
      end: input.periodEnd,
    };
    return {
      bounds,
      title: `Payroll ${bounds.start} to ${bounds.end}`,
      periodKind: "range" as const,
    };
  }

  const isSecondHalf = input.periodStart ? new Date(input.periodStart).getUTCDate() > 15 : false;
  const bounds = getHalfMonthBounds(finalYear, finalMonth, isSecondHalf);
  return {
    bounds,
    title: `Payroll ${finalYear}-${String(finalMonth).padStart(2, "0")} ${isSecondHalf ? "H2" : "H1"}`,
    periodKind: "half_month" as const,
  };
}

function requestPeriod(input: {
  month?: number; year?: number; period_kind?: PayrollPeriod["periodKind"];
  period_start?: string; period_end?: string;
}): PayrollPeriod {
  try {
    return resolvePersistedPayrollPeriod({
      month: input.month, year: input.year, periodKind: input.period_kind,
      periodStart: input.period_start, periodEnd: input.period_end,
    });
  } catch (error) {
    throw new PayrollPersistenceError(400, error instanceof Error ? error.message : "Invalid payroll period", false, error);
  }
}

function payrollFailure(res: express.Response, error: unknown, message: string) {
  console.error(`[Payroll] ${message}`, error);
  if (error instanceof PayrollPersistenceError) {
    return res.status(error.status).json({
      error: error.status === 500 ? message : error.message,
      ...(error.status >= 500 ? { outcome_uncertain: error.outcomeUncertain } : {}),
    });
  }
  // An unexpected route/cleanup failure can occur after the database committed.
  return res.status(500).json({ error: message, outcome_uncertain: true });
}

// GET /payroll/runs — list runs with aggregated totals
// GET /payroll/settings — payroll cycle configuration for payroll users.
// The full GET /settings endpoint requires settings:write/users:manage, which
// accountants don't have; the Run Payroll page silently fell back to a weekly
// cycle whenever the configured cycle differed (issue #182).
router.get("/settings", async (req: AuthRequest, res) => {
  try {
    if (!requirePayrollRead(req, res)) return;
    const settings = await getSettings();
    res.json({
      payroll_cycle: settings.payroll_cycle,
      payroll_cycle_days: settings.payroll_cycle_days,
      payroll_calendar_type: settings.payroll_calendar_type,
      payroll_manual_start_date: settings.payroll_manual_start_date,
    });
  } catch (error) {
    console.error("Error fetching payroll settings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /payroll/eligible-commissions — authoritative attended work for a period.
router.get("/eligible-commissions", async (req: AuthRequest, res) => {
  if (!requirePayrollRead(req, res)) return;
  const start = String(req.query.period_start ?? "");
  const end = String(req.query.period_end ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    return res.status(400).json({ error: "Valid period_start and period_end are required" });
  }

  try {
    const rows = await getEligibleCommissionRows(start, end);

    res.json({
      period_start: start,
      period_end: end,
      lines: rows.map((row) => ({
        employee_id: row.employee_id,
        event_type_id: row.event_type_id,
        quantity: Number(row.quantity),
        commission_total: Number(row.commission_total),
      })),
    });
  } catch (error) {
    console.error("Error fetching eligible payroll commissions:", error);
    res.status(500).json({ error: "Failed to load verified attendance commissions" });
  }
});

router.get("/runs", async (req: AuthRequest, res) => {
  try {
    if (!requirePayrollRead(req, res)) return;

    const view = req.query.view === "trash" ? "trash" : "active";
    const statusFilter = req.query.status as string | undefined;
    const yearFilter = req.query.year as string | undefined;
    const page = parsePositiveInt(req.query.page, 1);
    const requestedLimit = parsePositiveInt(req.query.limit, DEFAULT_PAYROLL_RUN_LIMIT);
    const limit = Math.min(requestedLimit, MAX_PAYROLL_RUN_LIMIT);
    const offset = (page - 1) * limit;
    const sortBy = (req.query.sortBy as string) || "period_start";
    const resolvedSortBy = sortBy === "recent" ? "updated_at" : sortBy;
    const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";

    if (!PAYROLL_RUN_SORT_FIELDS.has(sortBy)) {
      return res.status(400).json({ error: `Unsupported payroll run sort field: ${sortBy}` });
    }

    if (resolvedSortBy === "total") {
      const whereParts: string[] = [];
      const params: Array<string | number> = [];

      if (view === "trash") {
        whereParts.push("pr.deleted_at IS NOT NULL");
      } else {
        whereParts.push("pr.deleted_at IS NULL");
      }

      if (statusFilter && statusFilter !== "ALL") {
        params.push(toDbStatus(statusFilter));
        whereParts.push(`pr.status = $${params.length}`);
      }

      if (yearFilter && yearFilter !== "ALL") {
        const year = parseInt(yearFilter);
        params.push(`${year}-01-01`);
        whereParts.push(`pr.period_start >= $${params.length}`);
        params.push(`${year}-12-31`);
        whereParts.push(`pr.period_start <= $${params.length}`);
      }

      params.push(limit);
      const limitParam = params.length;
      params.push(offset);
      const offsetParam = params.length;

      const totalSortDirection = sortOrder === "asc" ? "ASC" : "DESC";
      const totalQuery = `
        SELECT
          pr.id,
          pr.title,
          pr.period_kind,
          pr.period_start::text AS period_start,
          pr.period_end::text AS period_end,
          pr.status,
          pr.created_at,
          pr.updated_at,
          pr.finalized_at,
          pr.created_by,
          COALESCE(SUM(prel.employee_total_snapshot), 0)::numeric AS total_payroll_value,
          COUNT(*) OVER()::int AS total_count
        FROM public.payroll_runs pr
        LEFT JOIN public.payroll_run_employee_lines prel ON prel.run_id = pr.id
        WHERE ${whereParts.join(" AND ")}
        GROUP BY pr.id
        ORDER BY total_payroll_value ${totalSortDirection}, pr.period_start DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `;

      const { rows } = await pool.query(totalQuery, params);
      const total = Number(rows[0]?.total_count ?? 0);
      const result = rows.map((run: any) => {
        const d = new Date(run.period_start);
        return {
          id: run.id,
          month: d.getUTCMonth() + 1,
          year: d.getUTCFullYear(),
          period_start: run.period_start,
          period_end: run.period_end,
          created_at: run.created_at,
          updated_at: run.updated_at,
          status: toApiStatus(run.status),
          total_payroll_value: Number(run.total_payroll_value ?? 0),
          created_by_username: null,
        };
      });

      return res.json({
        runs: result,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    }

    let runsQuery = supabase
      .from("payroll_runs")
      .select("id, title, period_kind, period_start, period_end, status, created_at, updated_at, finalized_at, created_by", {
        count: "exact",
      });

    runsQuery = runsQuery.order(resolvedSortBy, { ascending: sortOrder === "asc" });

    runsQuery = view === "trash" ? runsQuery.not("deleted_at", "is", null) : runsQuery.is("deleted_at", null);

    if (statusFilter && statusFilter !== "ALL") {
      runsQuery = runsQuery.eq("status", toDbStatus(statusFilter));
    }

    if (yearFilter && yearFilter !== "ALL") {
      const year = parseInt(yearFilter);
      runsQuery = runsQuery.gte("period_start", `${year}-01-01`).lte("period_start", `${year}-12-31`);
    }

    runsQuery = runsQuery.range(offset, offset + limit - 1);

    const { data: runs, error: runsError, count } = await runsQuery;

    if (runsError) {
      console.error("Error fetching payroll runs:", runsError);
      return res.status(500).json({ error: runsError.message });
    }

    if (!runs || runs.length === 0) {
      return res.json({
        runs: [],
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
      });
    }

    // Fetch employee line totals for all run ids
    const runIds = runs.map((r: any) => r.id);
    const { data: lines, error: linesError } = await supabase
      .from("payroll_run_employee_lines")
      .select("run_id, employee_total_snapshot")
      .in("run_id", runIds);

    if (linesError) {
      console.error("Error fetching payroll lines:", linesError);
      return res.status(500).json({ error: "Failed to load saved payroll totals" });
    }

    // Aggregate totals per run
    const totalsByRunId = new Map<string, number>();
    for (const line of lines ?? []) {
      const current = totalsByRunId.get(line.run_id) ?? 0;
      totalsByRunId.set(line.run_id, current + Number(line.employee_total_snapshot ?? 0));
    }

    const result = runs.map((run: any) => {
      const d = new Date(run.period_start);
      return {
        id: run.id,
        month: d.getUTCMonth() + 1,
        year: d.getUTCFullYear(),
        period_start: run.period_start,
        period_end: run.period_end,
        created_at: run.created_at,
        updated_at: run.updated_at,
        status: toApiStatus(run.status),
        total_payroll_value: totalsByRunId.get(run.id) ?? 0,
        created_by_username: null,
      };
    });

    const total = count ?? result.length;
    res.json({
      runs: result,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("Error fetching payroll runs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /payroll/runs/:id — single run with lines and events
router.get("/runs/:id", async (req: AuthRequest, res) => {
  try {
    if (!requirePayrollRead(req, res)) return;

    const { id } = req.params;

    const { data: run, error: runError } = await supabase
      .from("payroll_runs")
      .select("id, period_start, period_end, status, created_at, updated_at, finalized_at")
      .eq("id", id)
      .maybeSingle();

    if (runError) {
      return res.status(500).json({ error: runError.message });
    }
    if (!run) {
      return res.status(404).json({ error: "Payroll run not found" });
    }

    const { data: lines, error: linesError } = await supabase
      .from("payroll_run_employee_lines")
      .select("id, employee_id, employee_name_snapshot, compensation_mode_snapshot, base_salary_snapshot, commission_total_snapshot, employee_total_snapshot")
      .eq("run_id", id)
      .order("employee_name_snapshot", { ascending: true });

    if (linesError) {
      return res.status(500).json({ error: linesError.message });
    }

    const employeeIds = [...new Set((lines ?? []).map((line: any) => line.employee_id).filter(Boolean))];
    const profilePhotoKeyByEmployeeId = new Map<string, string>();

    if (employeeIds.length > 0) {
      const { data: employeeRows, error: employeeError } = await supabase
        .from("employees")
        .select("id, profile_photo_key")
        .in("id", employeeIds);

      if (employeeError) {
        console.warn("Payroll detail photo lookup failed; continuing without photos:", employeeError.message);
      } else {
        for (const employeeRow of employeeRows ?? []) {
          if (employeeRow.profile_photo_key) {
            profilePhotoKeyByEmployeeId.set(employeeRow.id, employeeRow.profile_photo_key);
          }
        }
      }
    }

    const lineIds = (lines ?? []).map((l: any) => l.id);
    let events: Record<string, unknown>[] = [];
    if (lineIds.length > 0) {
      const { data: evData, error: evError } = await supabase
        .from("payroll_run_line_events")
        .select("id, employee_line_id, event_name_snapshot, quantity, unit_price_snapshot, line_total_snapshot, event_type_id, override_price_etb, override_reason")
        .in("employee_line_id", lineIds);

      if (evError) {
        console.error("Error fetching payroll events:", evError);
        return res.status(500).json({ error: "Failed to load saved payroll event snapshots" });
      }
      events = evData ?? [];
    }

    const totalPayrollValue = (lines ?? []).reduce((sum: number, l: any) => sum + Number(l.employee_total_snapshot ?? 0), 0);
    const d = new Date(run.period_start);

    const linesWithEvents = (lines ?? []).map((line: any) => ({
      id: line.id,
      employee_id: line.employee_id,
      employee_name_snapshot: line.employee_name_snapshot,
      compensation_mode_snapshot: line.compensation_mode_snapshot ?? "regular",
      profile_photo_url: profilePhotoKeyByEmployeeId.get(line.employee_id)
        ? getPublicUrl(profilePhotoKeyByEmployeeId.get(line.employee_id) as string)
        : null,
      snapshot_base_salary: Number(line.base_salary_snapshot ?? 0),
      total_events_value: Number(line.commission_total_snapshot ?? 0),
      total_line_pay: Number(line.employee_total_snapshot ?? 0),
      events: events
        .filter((e) => e.employee_line_id === line.id)
        .map((e) => ({
          id: e.id,
          employee_line_id: e.employee_line_id,
          event_type_id: e.event_type_id,
          event_name: e.event_name_snapshot,
          quantity: e.quantity,
          price_applied: Number(e.unit_price_snapshot ?? 0),
          total_price_for_type: Number(e.line_total_snapshot ?? 0),
          override_price_etb: e.override_price_etb,
          override_reason: e.override_reason,
        })),
    }));

    res.json({
      id: run.id,
      month: d.getUTCMonth() + 1,
      year: d.getUTCFullYear(),
      period_start: run.period_start,
      period_end: run.period_end,
      status: toApiStatus(run.status),
      total_payroll_value: totalPayrollValue,
      created_at: run.created_at,
      updated_at: run.updated_at,
      employee_lines: linesWithEvents,
    });
  } catch (error) {
    console.error("Error fetching payroll run:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /payroll/runs/:id/status
router.patch("/runs/:id/status", async (req: AuthRequest, res) => {
  try {
    if (!requirePayrollWrite(req, res)) return;

    const { id } = req.params;
    const { status } = req.body;

    if (!status || !["DRAFT", "FINALIZED", "FLAGGED_WRONG", "TRASH"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const { published, ...data } = await PayrollPersistenceService.changeStatus(id, toDbStatus(status), req.user?.id ?? null);
    if (published) {
      void Promise.resolve().then(() => NotificationsService.emitNotificationToRoleOrPermission({
        permissionSlug: "payroll:read",
        actor_id: req.user?.id,
        title: "Payroll Run Finalized",
        message: `Payroll run (ID: ${id}) has been finalized by ${req.user?.username || "Someone"}.`,
        entity_type: "payroll",
        entity_id: id,
        action_url: "/payroll",
      })).catch((error: unknown) => {
        console.error("[Payroll] Finalized-run notification delivery failed", { runId: id, actorId: req.user?.id, error });
      });
    }

    res.json({ ...data, status: toApiStatus(data.status) });
  } catch (error) {
    payrollFailure(res, error, "Failed to update payroll status");
  }
});

// DELETE /payroll/runs/:id
router.delete("/runs/:id", async (req: AuthRequest, res) => {
  try {
    if (!requirePayrollWrite(req, res)) return;

    res.json(await PayrollPersistenceService.remove(req.params.id, req.user?.id ?? null));
  } catch (error) {
    payrollFailure(res, error, "Failed to delete payroll run");
  }
});

// DELETE /payroll/runs/:id/permanent
router.delete("/runs/:id/permanent", async (req: AuthRequest, res) => {
  try {
    if (!requirePayrollWrite(req, res)) return;

    res.json(await PayrollPersistenceService.remove(req.params.id, req.user?.id ?? null, true));
  } catch (error) {
    payrollFailure(res, error, "Failed to permanently delete payroll run");
  }
});

// POST /payroll/preview
router.post("/preview", async (req: AuthRequest, res) => {
  try {
    if (!requirePayrollRead(req, res)) return;

    const result = generatePayrollPreviewSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { month, year } = result.data;
    const { totalPayrollValue, lines: processedLines } = await PayrollPersistenceService.preview(requestPeriod(result.data));

    res.json({
      month,
      year,
      total_payroll_value: totalPayrollValue,
      employee_lines: processedLines,
    });
  } catch (error) {
    payrollFailure(res, error, "Unable to load payroll inputs. Please try again.");
  }
});

// POST /payroll/drafts — save or update a draft run
router.post("/drafts", async (req: AuthRequest, res) => {
  try {
    if (!requirePayrollWrite(req, res)) return;

    const result = savePayrollDraftSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const saved = await PayrollPersistenceService.saveDraft(requestPeriod(result.data), req.user?.id ?? null);
    res.status(201).json({ ...saved, status: toApiStatus(saved.status) });
  } catch (error) {
    payrollFailure(res, error, "Payroll draft save failed. Please try again.");
  }
});

// POST /payroll/runs — finalize and persist a payroll run
router.post("/runs", async (req: AuthRequest, res) => {
  try {
    if (!requirePayrollWrite(req, res)) return;

    const result = finalizePayrollRunSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const published = await PayrollPersistenceService.publish(requestPeriod(result.data), req.user?.id ?? null);
    res.status(201).json({ ...published, status: toApiStatus(published.status) });
  } catch (error) {
    payrollFailure(res, error, "Payroll finalization failed. Please try again.");
  }
});

export default router;
