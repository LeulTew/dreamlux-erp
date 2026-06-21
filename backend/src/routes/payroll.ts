import express from "express";
import { supabase } from "../db/supabase";
import { generatePayrollPreviewSchema, finalizePayrollRunSchema, savePayrollDraftSchema } from "../lib/validation";
import { getMonthlyBounds, getHalfMonthBounds } from "../utils/payroll-utils";
import { getPublicUrl } from "../storage/storage";
import { buildPayrollLines, toPayrollEventPayloads, toPayrollLinePayloads } from "../lib/payroll-generation";

const router = express.Router();

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

async function insertPayrollAuditLog(input: {
  payrollRunId: string;
  userId?: string | null;
  action: "draft_saved" | "finalized";
  periodStart: string;
  periodEnd: string;
  statusSnapshot: "draft" | "finalized";
  employeeCount: number;
  totalPayrollSnapshot: number;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("payroll_audit_logs").insert({
    payroll_run_id: input.payrollRunId,
    user_id: input.userId ?? null,
    action: input.action,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    status_snapshot: input.statusSnapshot,
    employee_count: input.employeeCount,
    total_payroll_snapshot: input.totalPayrollSnapshot,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.warn(`Payroll audit log insert failed for ${input.action}:`, error.message);
  }
}

// GET /payroll/runs — list runs with aggregated totals
router.get("/runs", async (req, res) => {
  try {
    const view = req.query.view === "trash" ? "trash" : "active";
    const statusFilter = req.query.status as string | undefined;
    const yearFilter = req.query.year as string | undefined;
    const sortBy = (req.query.sortBy as string) || "period_start";
    const sortOrder = (req.query.sortOrder as string) || "desc";

    let runsQuery = supabase
      .from("payroll_runs")
      .select("id, title, period_kind, period_start, period_end, status, created_at, updated_at, finalized_at, created_by");

    // Sorting - We'll handle 'total' sorting in memory after aggregation if needed,
    // but default to period_start
    if (sortBy !== "total") {
      runsQuery = runsQuery.order(sortBy, { ascending: sortOrder === "asc" });
    }

    runsQuery = view === "trash" ? runsQuery.not("deleted_at", "is", null) : runsQuery.is("deleted_at", null);

    if (statusFilter && statusFilter !== "ALL") {
      runsQuery = runsQuery.eq("status", toDbStatus(statusFilter));
    }

    if (yearFilter && yearFilter !== "ALL") {
      const year = parseInt(yearFilter);
      runsQuery = runsQuery.gte("period_start", `${year}-01-01`).lte("period_start", `${year}-12-31`);
    }

    const { data: runs, error: runsError } = await runsQuery;

    if (runsError) {
      console.error("Error fetching payroll runs:", runsError);
      return res.status(500).json({ error: runsError.message });
    }

    if (!runs || runs.length === 0) {
      return res.json([]);
    }

    // Fetch employee line totals for all run ids
    const runIds = runs.map((r: any) => r.id);
    const { data: lines, error: linesError } = await supabase
      .from("payroll_run_employee_lines")
      .select("run_id, employee_total_snapshot")
      .in("run_id", runIds);

    if (linesError) {
      console.error("Error fetching payroll lines:", linesError);
      // Continue without totals rather than failing completely
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

    if (sortBy === "total") {
      result.sort((a: any, b: any) => {
        return sortOrder === "asc"
          ? a.total_payroll_value - b.total_payroll_value
          : b.total_payroll_value - a.total_payroll_value;
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Error fetching payroll runs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /payroll/runs/:id — single run with lines and events
router.get("/runs/:id", async (req, res) => {
  try {
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
      .select("id, employee_id, employee_name_snapshot, base_salary_snapshot, commission_total_snapshot, employee_total_snapshot")
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
      } else {
        events = evData ?? [];
      }
    }

    const totalPayrollValue = (lines ?? []).reduce((sum: number, l: any) => sum + Number(l.employee_total_snapshot ?? 0), 0);
    const d = new Date(run.period_start);

    const linesWithEvents = (lines ?? []).map((line: any) => ({
      id: line.id,
      employee_id: line.employee_id,
      employee_name_snapshot: line.employee_name_snapshot,
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
router.patch("/runs/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !["DRAFT", "FINALIZED", "FLAGGED_WRONG", "TRASH"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const mappedStatus = toDbStatus(status);
    const updates: Record<string, unknown> = {
      status: mappedStatus,
      updated_at: new Date().toISOString(),
    };

    if (mappedStatus === "trashed") {
      updates.deleted_at = new Date().toISOString();
    } else {
      updates.deleted_at = null;
    }
    if (mappedStatus === "finalized") {
      updates.finalized_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("payroll_runs")
      .update(updates)
      .eq("id", id)
      .select("id, status, updated_at, deleted_at, finalized_at")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: "Payroll run not found" });
    }

    res.json({ ...data, status: toApiStatus(data.status) });
  } catch (error) {
    console.error("Error updating payroll run status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /payroll/runs/:id
router.delete("/runs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("payroll_runs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: "Payroll run not found" });
    }

    res.json({ success: true, id: data.id });
  } catch (error) {
    console.error("Error deleting payroll run:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /payroll/runs/:id/permanent
router.delete("/runs/:id/permanent", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("payroll_runs")
      .delete()
      .eq("id", id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, id });
  } catch (error) {
    console.error("Error permanently deleting payroll run:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /payroll/preview
router.post("/preview", async (req, res) => {
  try {
    const result = generatePayrollPreviewSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { month, year, period_kind, period_start, period_end, employeeLineEvents } = result.data;

    const finalMonth = month || new Date().getUTCMonth() + 1;
    const finalYear = year || new Date().getUTCFullYear();

    if (period_kind === "half_month" && month && year) {
      // Check if it's first or second half based on start date if provided, default to first
      const isSecondHalf = period_start ? new Date(period_start).getUTCDate() > 15 : false;
      getHalfMonthBounds(year, month, isSecondHalf);
    } else if (period_kind === "range" && period_start && period_end) {
      // Bounds logic kept for structural consistency even if not heavily used in basic preview
    } else if (month && year) {
      getMonthlyBounds(year, month);
    } else {
      getMonthlyBounds(finalYear, finalMonth);
    }

    const { data: eventsMaster } = await supabase
      .from("event_types")
      .select("id, name")
      .is("deleted_at", null);

    const { data: employees } = await supabase
      .from("employees")
      .select("id, full_name, salary_level, base_salary, profile_photo_key, event_prices")
      .is("deleted_at", null);

    const { data: salaryLevels } = await supabase
      .from("salary_levels")
      .select("id, code, amount_etb")
      .is("deleted_at", null);

    const { totalPayrollValue, lines: processedLines } = buildPayrollLines({
      employeeLineEvents,
      eventTypes: eventsMaster ?? [],
      employees: employees ?? [],
      salaryLevels: salaryLevels ?? [],
    });

    res.json({
      month,
      year,
      total_payroll_value: totalPayrollValue,
      employee_lines: processedLines,
    });
  } catch (error) {
    console.error("Error generating payroll preview:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /payroll/drafts — save or update a draft run
router.post("/drafts", async (req, res) => {
  try {
    const result = savePayrollDraftSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { month, year, period_kind, period_start, employeeLineEvents, created_by_user_id } = result.data;

    const finalMonth = month || new Date().getUTCMonth() + 1;
    const finalYear = year || new Date().getUTCFullYear();

    if (period_kind !== "half_month") {
      return res.status(400).json({ error: "Only half-month payroll periods (1-15, 16-end) are supported." });
    }

    const isSecondHalf = period_start ? new Date(period_start).getUTCDate() > 15 : false;
    const bounds = getHalfMonthBounds(finalYear, finalMonth, isSecondHalf);
    const title = `Payroll ${finalYear}-${String(finalMonth).padStart(2, "0")} ${isSecondHalf ? "H2" : "H1"}`;

    const { data: existingDraft, error: draftLookupError } = await supabase
      .from("payroll_runs")
      .select("id")
      .eq("period_start", bounds.start)
      .eq("period_end", bounds.end)
      .eq("status", "draft")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (draftLookupError) {
      console.error("Error checking for existing draft:", draftLookupError);
    }

    const { data: eventsMaster } = await supabase
      .from("event_types")
      .select("id, name")
      .is("deleted_at", null);

    const { data: employees } = await supabase
      .from("employees")
      .select("id, full_name, salary_level, base_salary, event_prices")
      .is("deleted_at", null);

    const { data: salaryLevels } = await supabase
      .from("salary_levels")
      .select("id, code, amount_etb")
      .is("deleted_at", null);

    const { lines: processedLines } = buildPayrollLines({
      employeeLineEvents,
      eventTypes: eventsMaster ?? [],
      employees: employees ?? [],
      salaryLevels: salaryLevels ?? [],
    });

    const insertPayload = {
      title,
      period_kind: period_kind || "half_month",
      period_start: bounds.start,
      period_end: bounds.end,
      status: "draft",
      created_by: created_by_user_id || null,
    };

    const updatePayload: Record<string, unknown> = {
      title,
      period_kind: period_kind || "half_month",
      period_start: bounds.start,
      period_end: bounds.end,
      status: "draft",
      updated_at: new Date().toISOString(),
      deleted_at: null,
      finalized_at: null,
    };

    if (created_by_user_id) {
      updatePayload.created_by = created_by_user_id;
    }

    const { data: runData, error: runError } = existingDraft
      ? await supabase.from("payroll_runs").update(updatePayload).eq("id", existingDraft.id).select("id").single()
      : await supabase.from("payroll_runs").insert(insertPayload).select("id").single();

    if (runError || !runData) {
      console.error("Error saving payroll draft:", runError);
      return res.status(500).json({ error: runError?.message ?? "Failed to save payroll draft" });
    }

    const runId = runData.id;

    try {
      if (existingDraft) {
        const { error: deleteError } = await supabase
          .from("payroll_run_employee_lines")
          .delete()
          .eq("run_id", runId);

        if (deleteError) {
          throw new Error(`Failed to clear existing draft lines: ${deleteError.message}`);
        }
      }

      const linePayloads = toPayrollLinePayloads(runId, processedLines);

      let insertedLines: Array<{ id: string; employee_id: string }> = [];
      if (linePayloads.length > 0) {
        const { data: lineData, error: lineError } = await supabase
          .from("payroll_run_employee_lines")
          .insert(linePayloads)
          .select("id, employee_id");

        if (lineError || !lineData) {
          throw new Error(`Failed to insert employee lines: ${lineError?.message}`);
        }

        insertedLines = lineData as Array<{ id: string; employee_id: string }>;
      }

      const allEventRows = toPayrollEventPayloads(processedLines, insertedLines);

      if (allEventRows.length > 0) {
        const { error: evError } = await supabase.from("payroll_run_line_events").insert(allEventRows);
        if (evError) {
          throw new Error(`Failed to insert event entries: ${evError.message}`);
        }
      }

      const totalPayrollValue = processedLines.reduce((acc, curr) => acc + curr.total_line_pay, 0);
      await insertPayrollAuditLog({
        payrollRunId: runId,
        userId: created_by_user_id,
        action: "draft_saved",
        periodStart: bounds.start,
        periodEnd: bounds.end,
        statusSnapshot: "draft",
        employeeCount: processedLines.length,
        totalPayrollSnapshot: totalPayrollValue,
        metadata: { existing_draft_updated: Boolean(existingDraft) },
      });

      res.status(201).json({
        id: runId,
        title,
        status: "DRAFT",
        total_payroll_value: totalPayrollValue,
        employee_count: processedLines.length,
      });
    } catch (err: any) {
      console.error("Error saving payroll draft lines:", err);
      res.status(500).json({ error: "Payroll draft save failed. Please try again.", details: err.message });
    }
  } catch (error) {
    console.error("Error saving payroll draft:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /payroll/runs — finalize and persist a payroll run
router.post("/runs", async (req, res) => {
  try {
    const result = finalizePayrollRunSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { month, year, period_kind, period_start, employeeLineEvents, created_by_user_id } = result.data;

    const finalMonth = month || new Date().getUTCMonth() + 1;
    const finalYear = year || new Date().getUTCFullYear();

    if (period_kind !== "half_month") {
      return res.status(400).json({ error: "Only half-month payroll periods (1-15, 16-end) are supported." });
    }

    const isSecondHalf = period_start ? new Date(period_start).getUTCDate() > 15 : false;
    const bounds = getHalfMonthBounds(finalYear, finalMonth, isSecondHalf);
    const title = `Payroll ${finalYear}-${String(finalMonth).padStart(2, "0")} ${isSecondHalf ? "H2" : "H1"}`;

    // 1. Duplicate Run Guard: Check if a finalized run already exists for this exact period
    const { data: existingRun, error: checkError } = await supabase
      .from("payroll_runs")
      .select("id")
      .eq("period_start", bounds.start)
      .eq("period_end", bounds.end)
      .eq("status", "finalized")
      .is("deleted_at", null)
      .maybeSingle();

    if (checkError) {
      console.error("Error checking for duplicate payroll run:", checkError);
    }

    if (existingRun) {
      return res.status(409).json({
        error: "A finalized payroll run already exists for this period. To redo it, trash the existing one first."
      });
    }

    const { data: eventsMaster } = await supabase
      .from("event_types")
      .select("id, name")
      .is("deleted_at", null);

    const { data: employees } = await supabase
      .from("employees")
      .select("id, full_name, salary_level, base_salary, event_prices")
      .is("deleted_at", null);

    const { data: salaryLevels } = await supabase
      .from("salary_levels")
      .select("id, code, amount_etb")
      .is("deleted_at", null);

    const { lines: processedLines } = buildPayrollLines({
      employeeLineEvents,
      eventTypes: eventsMaster ?? [],
      employees: employees ?? [],
      salaryLevels: salaryLevels ?? [],
    });

    // Insert payroll run header
    const { data: runData, error: runError } = await supabase
      .from("payroll_runs")
      .insert({
        title,
        period_kind: period_kind || "month",
        period_start: bounds.start,
        period_end: bounds.end,
        status: "finalized",
        finalized_at: new Date().toISOString(),
        created_by: created_by_user_id || null,
      })
      .select("id")
      .single();

    if (runError || !runData) {
      console.error("Error creating payroll run:", runError);
      return res.status(500).json({ error: runError?.message ?? "Failed to create payroll run" });
    }

    const runId = runData.id;

    try {
      // 2. Batched Insert: Employee Lines (O(1) roundtrip)
      const linePayloads = toPayrollLinePayloads(runId, processedLines);

      const { data: insertedLines, error: lineError } = await supabase
        .from("payroll_run_employee_lines")
        .insert(linePayloads)
        .select("id, employee_id");

      if (lineError || !insertedLines) {
        throw new Error(`Failed to insert employee lines: ${lineError?.message}`);
      }

      // 3. Batched Insert: Line Events (O(1) roundtrip)
      const allEventRows = toPayrollEventPayloads(processedLines, insertedLines);

      if (allEventRows.length > 0) {
        const { error: evError } = await supabase
          .from("payroll_run_line_events")
          .insert(allEventRows);

        if (evError) {
          throw new Error(`Failed to insert event entries: ${evError.message}`);
        }
      }

      const totalPayrollValue = processedLines.reduce((acc, curr) => acc + curr.total_line_pay, 0);
      await insertPayrollAuditLog({
        payrollRunId: runId,
        userId: created_by_user_id,
        action: "finalized",
        periodStart: bounds.start,
        periodEnd: bounds.end,
        statusSnapshot: "finalized",
        employeeCount: processedLines.length,
        totalPayrollSnapshot: totalPayrollValue,
        metadata: { duplicate_guard_checked: true },
      });

      res.status(201).json({
        id: runId,
        title,
        status: "FINALIZED", // Match frontend expectation
        total_payroll_value: totalPayrollValue,
        employee_count: processedLines.length
      });

    } catch (err: any) {
      console.error("Critical error during payroll finalization:", err);

      // Attempt cleanup (soft rollback)
      await supabase.from("payroll_runs").update({ status: "failed", deleted_at: new Date().toISOString() }).eq("id", runId);

      res.status(500).json({
        error: "Payroll finalization partially failed. The run has been marked as failed and hidden. Please try again.",
        details: err.message
      });
    }
  } catch (error) {
    console.error("Error finalizing payroll run:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
