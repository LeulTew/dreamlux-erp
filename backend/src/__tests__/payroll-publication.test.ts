import { afterEach, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import express from "express";
import request from "supertest";
import "./setup";
import { pool } from "../db/pool";
import { supabase } from "../db/supabase";
import type { AuthRequest } from "../middleware/auth";
import { NotificationsService } from "../services/notifications-service";
import { PAYROLL_IDS, PayrollPersistenceFixture, syntheticRun, type PayrollSources } from "./payroll-persistence-fixture";

let unavailableSource = "";
const legacySourceReads: string[] = [];
let db: PayrollPersistenceFixture;
let actor: AuthRequest["user"];
const notify = mock(async (_input: Parameters<typeof NotificationsService.emitNotificationToRoleOrPermission>[0]) => 0);
const payload = () => ({ month: 4, year: 2026, period_kind: "half_month", employeeLineEvents: [] });
const id = (suffix: number) => `23900000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

function docxSources(): PayrollSources {
  return {
    employees: [
      { id: PAYROLL_IDS.employee, full_name: "Synthetic Operations Manager", salary_level: "OPS", base_salary: 0 },
      { id: id(2), full_name: "Synthetic Planner", salary_level: "PLAN", base_salary: 0 },
      { id: id(3), full_name: "Synthetic Store Keeper", salary_level: "STORE", base_salary: 0 },
      { id: id(4), full_name: "Synthetic Guard Loader", salary_level: "retired-code", base_salary: 7000 },
      { id: id(5), full_name: "Synthetic General Manager", salary_level: "GM", base_salary: 0 },
      { id: id(6), full_name: "Synthetic Team Leader", salary_level: "OPS", base_salary: 35000, compensation_mode: "commission_only" },
    ],
    event_types: [{ id: PAYROLL_IDS.eventType, name: "Synthetic event" }, { id: id(202), name: "Synthetic training attendance" }],
    salary_levels: [
      { id: id(101), code: "OPS", amount_etb: "35000.00" },
      { id: id(102), code: "PLAN", amount_etb: "14500.00" },
      { id: id(103), code: "STORE", amount_etb: "10000.00" },
      { id: id(104), code: "GUARD", amount_etb: "7000.00" },
      { id: id(105), code: "GM", amount_etb: "70000.00" },
    ],
    commissions: [
      { employee_id: id(6), event_type_id: PAYROLL_IDS.eventType, quantity: 2, commission_total: 4000 },
      { employee_id: id(6), event_type_id: id(202), quantity: 1, commission_total: 500 },
    ],
  };
}

function seedDraft() {
  db.state.runs = [syntheticRun()];
  db.state.employeeLines = [{
    id: PAYROLL_IDS.line, run_id: PAYROLL_IDS.run, employee_id: PAYROLL_IDS.employee,
    employee_name_snapshot: "Synthetic previous snapshot", salary_level_snapshot: "GUARD",
    compensation_mode_snapshot: "regular", base_salary_snapshot: 7000,
    commission_total_snapshot: 2000, employee_total_snapshot: 9000,
  }];
  db.state.events = [{
    employee_line_id: PAYROLL_IDS.line, event_type_id: PAYROLL_IDS.eventType,
    event_name_snapshot: "Synthetic saved event", quantity: 1, unit_price_snapshot: 2000,
    line_total_snapshot: 2000, override_price_etb: null, override_reason: null,
  }];
}

let app: express.Application;
beforeAll(async () => {
  const { default: payroll } = await import("../routes/payroll");
  app = express();
  app.use(express.json());
  app.use((req: AuthRequest, _res, next) => {
    req.user = actor;
    next();
  });
  app.use("/payroll", payroll);
});

beforeEach(() => {
  db = new PayrollPersistenceFixture();
  db.sources = docxSources();
  actor = { id: PAYROLL_IDS.actor, username: "synthetic-payroll-reviewer", role: "PAYROLL_REVIEWER",
    permission_slugs: ["payroll:read", "payroll:write"] };
  unavailableSource = "";
  legacySourceReads.length = 0;
  notify.mockClear();
  spyOn(console, "error").mockImplementation(() => {});
  spyOn(pool, "query").mockImplementation(db.query as unknown as typeof pool.query);
  spyOn(pool, "connect").mockImplementation(mock(async () => ({
    query: db.query, release: db.release,
  })) as unknown as typeof pool.connect).mockClear();
  spyOn(NotificationsService, "emitNotificationToRoleOrPermission").mockImplementation(notify);
  spyOn(supabase, "from").mockImplementation(((table: string) => {
    legacySourceReads.push(table);
    const chain = {
      select: () => chain,
      is: () => chain,
      then: (resolve: (result: unknown) => unknown) => resolve({
        data: table === unavailableSource ? null : db.sources[table as keyof PayrollSources] ?? [],
        error: table === unavailableSource ? { message: `${table} lookup unavailable` } : null,
      }),
    };
    return chain;
  }) as typeof supabase.from);
});

afterEach(() => mock.restore());

describe("payroll publication required sources", () => {
  test.each(["employees", "event_types", "salary_levels"])("fails closed when %s cannot be read", async (table) => {
    unavailableSource = table;
    db.failAt = /^with eligible as/;
    db.failWith = new Error(`${table} lookup unavailable`);
    const response = await request(app).post("/payroll/preview").send({
      month: 4,
      year: 2026,
      employeeLineEvents: [],
    });

    expect(response.status).toBe(500);
    expect(response.body.outcome_uncertain).toBe(false);
    expect(response.body).not.toHaveProperty("employee_lines");
    expect(response.body).not.toHaveProperty("total_payroll_value");
  });

  test("reads all four authoritative sources in one statement without writing a preview", async () => {
    const response = await request(app).post("/payroll/preview").send(payload());
    expect(response.status).toBe(200);
    expect(response.body.total_payroll_value).toBe(141000);
    expect(response.body.employee_lines).toHaveLength(6);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].sql).toContain("with eligible as");
    expect(db.calls[0].sql).toContain("from public.employees where deleted_at is null");
    expect(db.calls[0].sql).toContain("ea.attended is true");
    expect(db.calls[0].sql).toContain("count(distinct ea.event_id)");
    expect(db.calls[0].values).toEqual(["2026-04-01", "2026-04-15"]);
    expect(legacySourceReads).toEqual([]);
    expect(db.state.runs).toEqual([]);
  });

  test.each(["employees", "event_types", "salary_levels", "commissions"])("rejects an incomplete %s source result", async (field) => {
    db.afterQuery = (sql, result) => sql.startsWith("with eligible as")
      ? { rows: [{ ...db.sources, [field]: null }], rowCount: 1 } : result;
    const response = await request(app).post("/payroll/drafts").send(payload());
    expect(response.status).toBe(500);
    expect(db.state.runs).toEqual([]);
    expect(db.calls.at(-1)?.sql).toBe("rollback");
  });
});

describe("payroll publication snapshots and contracts", () => {
  test.each(["drafts", "runs", "preview"])("keeps the monthly /%s default for a body containing only month and year", async (route) => {
    const response = await request(app).post(`/payroll/${route}`).send({ month: 4, year: 2026 });
    expect(response.status).toBe(route === "preview" ? 200 : 201);
    expect(db.calls.filter((call) => call.sql.startsWith("with eligible as")).map((call) => call.values))
      .toEqual([["2026-04-01", "2026-04-30"]]);
    expect(response.body.total_payroll_value).toBe(141000);
    if (route === "preview") {
      expect(response.body).toMatchObject({ month: 4, year: 2026 });
      expect(response.body.employee_lines).toHaveLength(6);
      expect(db.state.runs).toEqual([]);
      expect(db.state.audits).toEqual([]);
    } else {
      expect(response.body).toMatchObject({
        title: "Payroll 2026-04 Full Month", status: route === "drafts" ? "DRAFT" : "FINALIZED",
      });
      expect(db.state.runs[0]).toMatchObject({
        period_kind: "month", period_start: "2026-04-01", period_end: "2026-04-30",
        title: "Payroll 2026-04 Full Month",
      });
    }
  });

  test.each([
    { label: "H1", start: "2026-04-01", end: "2026-04-15" },
    { label: "H2", start: "2026-04-16", end: "2026-04-30" },
  ])("retains explicit half-month $label preview bounds", async ({ start, end }) => {
    const response = await request(app).post("/payroll/preview").send({
      month: 4, year: 2026, period_kind: "half_month", period_start: start,
    });
    expect(response.status).toBe(200);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].values).toEqual([start, end]);
    expect(db.state.runs).toEqual([]);
  });

  const periods = [
    { label: "existing request-schema default", input: {}, start: "2026-04-01", end: "2026-04-30", kind: "month", title: "Payroll 2026-04 Full Month" },
    { label: "explicit first half", input: { period_kind: "half_month" }, start: "2026-04-01", end: "2026-04-15", kind: "half_month", title: "Payroll 2026-04 H1" },
    { label: "second half from start day", input: { period_kind: "half_month", period_start: "2026-04-24", period_end: "2026-05-10" },
      start: "2026-04-16", end: "2026-04-30", kind: "half_month", title: "Payroll 2026-04 H2" },
    { label: "weekly month boundary", input: { period_kind: "weekly", period_start: "2026-04-29", period_end: "2026-04-30" },
      start: "2026-04-29", end: "2026-05-05", kind: "weekly", title: "Payroll 2026-04-29 to 2026-05-05" },
    { label: "month ignores explicit endpoints", input: { month: 2, year: 2024, period_kind: "month", period_start: "2026-04-03", period_end: "2026-04-09" },
      start: "2024-02-01", end: "2024-02-29", kind: "month", title: "Payroll 2024-02 Full Month" },
    { label: "custom range uses explicit endpoints", input: { period_kind: "range", period_start: "2026-04-03", period_end: "2026-04-09" },
      start: "2026-04-03", end: "2026-04-09", kind: "range", title: "Payroll 2026-04-03 to 2026-04-09" },
  ];
  test.each(periods)("preserves DreamLux period policy: $label", async ({ input, start, end, kind, title }) => {
    const body = { month: 4, year: 2026, employeeLineEvents: [], ...input };
    const draft = await request(app).post("/payroll/drafts").send(body);
    const published = await request(app).post("/payroll/runs").send(body);
    expect([draft.status, published.status]).toEqual([201, 201]);
    expect(draft.body.title).toBe(title);
    expect(published.body.title).toBe(title);
    expect(db.state.runs.every((row) => row.period_start === start && row.period_end === end && row.period_kind === kind)).toBe(true);
    expect(db.calls.filter((call) => call.sql.startsWith("with eligible as")).map((call) => call.values))
      .toEqual([[start, end], [start, end]]);
  });

  test.each(["drafts", "runs"])("persists authoritative DOCX-anchored snapshots and mandatory audit through /%s", async (route) => {
    const response = await request(app).post(`/payroll/${route}`).send({
      ...payload(), created_by_user_id: id(999),
      employeeLineEvents: [{ employee_id: PAYROLL_IDS.employee, events: [{ event_type_id: PAYROLL_IDS.eventType, quantity: 99, price_override: 1 }] }],
    });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: PAYROLL_IDS.run, title: "Payroll 2026-04 H1", status: route === "drafts" ? "DRAFT" : "FINALIZED",
      total_payroll_value: 141000, employee_count: 6,
    });
    expect(db.state.runs[0].created_by).toBe(PAYROLL_IDS.actor);
    expect(db.state.employeeLines.map((line) => line.base_salary_snapshot)).toEqual([35000, 14500, 10000, 7000, 70000, 0]);
    const leader = db.state.employeeLines.find((line) => line.employee_id === id(6));
    expect(leader).toMatchObject({ compensation_mode_snapshot: "commission_only", commission_total_snapshot: 4500, employee_total_snapshot: 4500 });
    expect(db.state.events.map((event) => [event.unit_price_snapshot, event.quantity, event.line_total_snapshot]))
      .toEqual([[2000, 2, 4000], [500, 1, 500]]);
    expect(db.state.events.every((event) => event.employee_line_id === leader?.id)).toBe(true);
    expect(db.state.audits).toEqual([expect.objectContaining({
      payroll_run_id: PAYROLL_IDS.run, user_id: PAYROLL_IDS.actor, employee_count: 6, total_payroll_snapshot: 141000,
      action: route === "drafts" ? "draft_saved" : "finalized",
    })]);
    expect(db.calls[0].sql).toBe("begin isolation level read committed");
    expect(db.calls.at(-1)?.sql).toBe("commit");
    expect(db.calls.filter((call) => call.sql.startsWith("with eligible as"))).toHaveLength(1);
    expect(db.calls.filter((call) => call.sql.startsWith("insert into public.payroll_run_employee_lines"))).toHaveLength(1);
    expect(db.calls.filter((call) => call.sql.startsWith("insert into public.payroll_run_line_events"))).toHaveLength(1);
    expect(db.release).toHaveBeenCalledWith(false);
    expect(legacySourceReads).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  test("replaces only the most recent active same-period draft", async () => {
    seedDraft();
    db.state.runs.push(syntheticRun({ id: id(301), updated_at: "2026-04-10T00:00:00Z" }));
    const response = await request(app).post("/payroll/drafts").send(payload());
    expect(response.status).toBe(201);
    expect(response.body.id).toBe(PAYROLL_IDS.run);
    expect(db.state.runs).toHaveLength(2);
    expect(db.state.employeeLines).toHaveLength(6);
    expect(db.state.events).toHaveLength(2);
    expect(db.state.audits[0].metadata).toEqual({ existing_draft_updated: true });
  });

  test("links events by employee identity even when INSERT returns employees in a different order", async () => {
    db.afterQuery = (sql, result) => sql.startsWith("insert into public.payroll_run_employee_lines")
      ? { ...result, rows: [...result.rows].reverse() } : result;
    const response = await request(app).post("/payroll/runs").send(payload());
    expect(response.status).toBe(201);
    const leader = db.state.employeeLines.find((line) => line.employee_id === id(6));
    expect(db.state.events.every((event) => event.employee_line_id === leader?.id)).toBe(true);
    expect(db.state.audits[0].total_payroll_snapshot).toBe(141000);
  });

  test("detail finalization recalculates but preserves the saved period, title and status response shape", async () => {
    seedDraft();
    db.state.runs[0].title = "Synthetic custom title";
    db.state.runs[0].period_kind = "range";
    const response = await request(app).patch(`/payroll/runs/${PAYROLL_IDS.run}/status`).send({ status: "FINALIZED" });
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(["deleted_at", "finalized_at", "id", "status", "updated_at"]);
    expect(response.body.status).toBe("FINALIZED");
    expect(db.state.runs[0]).toMatchObject({ title: "Synthetic custom title", period_kind: "range", period_start: "2026-04-01", period_end: "2026-04-15" });
    expect(db.state.employeeLines).toHaveLength(6);
    expect(db.state.audits[0]).toMatchObject({ action: "finalized", total_payroll_snapshot: 141000 });
    expect(db.state.activities[0].action).toBe("update_status");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ permissionSlug: "payroll:read", entity_id: PAYROLL_IDS.run, action_url: "/payroll" });
  });

  test("repeated active-finalized requests never recalculate or rewrite immutable snapshots and notifications", async () => {
    seedDraft();
    await request(app).patch(`/payroll/runs/${PAYROLL_IDS.run}/status`).send({ status: "FINALIZED" });
    const published = structuredClone(db.state);
    db.calls.length = 0;
    notify.mockClear();
    db.sources.salary_levels[0].amount_etb = 70000;
    const response = await request(app).patch(`/payroll/runs/${PAYROLL_IDS.run}/status`).send({ status: "FINALIZED" });
    expect(response.status).toBe(200);
    expect(db.state).toEqual(published);
    expect(db.calls.some((call) => /^(with|insert|update|delete)/.test(call.sql))).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  test.each(["rejected promise", "synchronous exception"])("contains a notification %s after committed status finalization", async (failure) => {
    seedDraft();
    const notificationError = new Error("Synthetic optional notification failure");
    if (failure === "rejected promise") notify.mockRejectedValueOnce(notificationError);
    else notify.mockImplementationOnce(() => { throw notificationError; });

    const response = await request(app).patch(`/payroll/runs/${PAYROLL_IDS.run}/status`).send({ status: "FINALIZED" });
    await Promise.resolve();
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("FINALIZED");
    expect(db.state.runs[0].status).toBe("finalized");
    expect(db.state.audits[0].action).toBe("finalized");
    expect(db.calls.at(-1)?.sql).toBe("commit");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "[Payroll] Finalized-run notification delivery failed",
      { runId: PAYROLL_IDS.run, actorId: PAYROLL_IDS.actor, error: notificationError },
    );
  });

  test.each(["drafts", "runs", "status"])("takes current inputs after waiting for the period lock in %s", async (route) => {
    if (route === "status") seedDraft();
    db.beforeQuery = (sql) => {
      if (sql.startsWith("select pg_advisory_xact_lock")) db.sources.salary_levels[0].amount_etb = 70000;
    };
    const response = route === "status"
      ? await request(app).patch(`/payroll/runs/${PAYROLL_IDS.run}/status`).send({ status: "FINALIZED" })
      : await request(app).post(`/payroll/${route}`).send(payload());
    expect(response.status).toBe(route === "status" ? 200 : 201);
    expect(db.state.audits[0].total_payroll_snapshot).toBe(176000);
    const lock = db.calls.findIndex((call) => call.sql.startsWith("select pg_advisory_xact_lock"));
    expect(db.calls.findIndex((call) => call.sql.startsWith("with eligible as"))).toBeGreaterThan(lock);
    expect(db.calls[lock]).toMatchObject({ values: ["2026-04-01:2026-04-15"] });
    expect(db.calls[lock].sql).toContain("hashtext('dreamlux-payroll-period')");
  });

  test("allows a genuinely empty successful source snapshot, with a mandatory zero-employee audit", async () => {
    db.sources = { employees: [], salary_levels: [], event_types: [], commissions: [] };
    const response = await request(app).post("/payroll/runs").send(payload());
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ employee_count: 0, total_payroll_value: 0 });
    expect(db.state.audits).toHaveLength(1);
    expect(db.state.audits[0]).toMatchObject({ employee_count: 0, total_payroll_snapshot: 0 });
    expect(db.calls.some((call) => call.sql.includes("jsonb_to_recordset"))).toBe(false);
  });
});

describe("payroll publication rollback protocol", () => {
  test("explicitly acknowledges that an audit failure happened before COMMIT", async () => {
    seedDraft();
    const before = structuredClone(db.state);
    db.failAt = /^insert into public.payroll_audit_logs/;
    const response = await request(app).post("/payroll/drafts").send(payload());
    expect(response.status).toBe(500);
    expect(response.body.outcome_uncertain).toBe(false);
    expect(db.state).toEqual(before);
    expect(db.calls.some((call) => call.sql === "commit")).toBe(false);
  });

  test("never writes when a connection cannot be acquired", async () => {
    spyOn(pool, "connect").mockImplementationOnce(() => { throw new Error("Synthetic connection unavailable"); });
    const response = await request(app).post("/payroll/runs").send(payload());
    expect(response.status).toBe(500);
    expect(db.calls).toEqual([]);
    expect(db.state.runs).toEqual([]);
    expect(response.body.outcome_uncertain).toBe(false);
  });

  const phases = [
    { label: "draft lookup", pattern: /^select id from public.payroll_runs where period_start=/ },
    { label: "source snapshot", pattern: /^with eligible as/ },
    { label: "header", pattern: /^update public.payroll_runs set title=/ },
    { label: "prior employee removal", pattern: /^delete from public.payroll_run_employee_lines/ },
    { label: "employee snapshots", pattern: /^insert into public.payroll_run_employee_lines/ },
    { label: "event snapshots", pattern: /^insert into public.payroll_run_line_events/ },
    { label: "persisted summary", pattern: /^select count\(\*\)::int as employee_count/ },
    { label: "mandatory audit", pattern: /^insert into public.payroll_audit_logs/ },
  ];
  test.each(phases)("retains the entire prior draft when $label fails", async ({ pattern }) => {
    seedDraft();
    const before = structuredClone(db.state);
    db.failAt = pattern;
    const response = await request(app).post("/payroll/drafts").send(payload());
    expect(response.status).toBe(500);
    expect(response.body).not.toHaveProperty("id");
    expect(response.body.outcome_uncertain).toBe(false);
    expect(db.state).toEqual(before);
    expect(db.calls.at(-1)?.sql).toBe("rollback");
    expect(db.calls.some((call) => call.sql === "commit")).toBe(false);
    expect(db.release).toHaveBeenCalledWith(false);
  });

  test.each(["runs", "status"])("rolls back every new snapshot if mandatory audit fails in %s", async (route) => {
    if (route === "status") seedDraft();
    const before = structuredClone(db.state);
    db.failAt = /^insert into public.payroll_audit_logs/;
    const response = route === "status"
      ? await request(app).patch(`/payroll/runs/${PAYROLL_IDS.run}/status`).send({ status: "FINALIZED" })
      : await request(app).post(`/payroll/${route}`).send(payload());
    expect(response.status).toBe(500);
    expect(db.state).toEqual(before);
    expect(notify).not.toHaveBeenCalled();
  });

  test.each(["employee count", "wrong employee", "duplicate employee", "duplicate line", "event count", "persisted employee count", "persisted event count", "audit count"])(
    "rejects an unconfirmed %s rather than committing", async (fault) => {
      seedDraft();
      const before = structuredClone(db.state);
      db.afterQuery = (sql, result) => {
        if (sql.startsWith("insert into public.payroll_run_employee_lines")) {
          if (fault === "employee count") return { ...result, rowCount: 0 };
          if (fault === "wrong employee") result.rows[0].employee_id = id(999);
          if (fault === "duplicate employee") result.rows[0].employee_id = result.rows[1].employee_id;
          if (fault === "duplicate line") result.rows[0].id = result.rows[1].id;
        }
        if (fault === "event count" && sql.startsWith("insert into public.payroll_run_line_events")) return { ...result, rowCount: 0 };
        if (fault === "persisted employee count" && sql.startsWith("select count(*)")) result.rows[0].employee_count = 1;
        if (fault === "persisted event count" && sql.startsWith("select count(*)")) result.rows[0].event_count = 0;
        if (fault === "audit count" && sql.startsWith("insert into public.payroll_audit_logs")) return { ...result, rowCount: 0 };
        return result;
      };
      const response = await request(app).post("/payroll/drafts").send(payload());
      expect(response.status).toBe(500);
      expect(db.state).toEqual(before);
      expect(db.calls.at(-1)?.sql).toBe("rollback");
    },
  );

  test("does not report a suppressed header write as success", async () => {
    db.afterQuery = (sql, result) => sql.startsWith("insert into public.payroll_runs(") ? { rows: [], rowCount: 0 } : result;
    const response = await request(app).post("/payroll/runs").send(payload());
    expect(response.status).toBe(500);
    expect(db.state.runs).toEqual([]);
  });

  test("reports lock timeout as confirmed failure and permits a deliberate retry", async () => {
    seedDraft();
    const before = structuredClone(db.state);
    db.failAt = /^select pg_advisory_xact_lock/;
    db.failWith = Object.assign(new Error("Synthetic lock timeout"), { code: "55P03" });
    const response = await request(app).post("/payroll/drafts").send(payload());
    expect(response.status).toBe(503);
    expect(response.body.outcome_uncertain).toBe(false);
    expect(db.state).toEqual(before);
    db.failAt = null;
    const retry = await request(app).post("/payroll/drafts").send(payload());
    expect(retry.status).toBe(201);
  });

  test.each(["drafts", "runs", "status", "delete", "permanent"])("reports a lost %s commit acknowledgement as unknown, never rolled back", async (route) => {
    if (["status", "delete", "permanent"].includes(route)) seedDraft();
    const before = structuredClone(db.state);
    db.loseCommitAcknowledgement = true;
    const response = route === "status"
      ? await request(app).patch(`/payroll/runs/${PAYROLL_IDS.run}/status`).send({ status: "FINALIZED" })
      : route === "delete" || route === "permanent"
        ? await request(app).delete(`/payroll/runs/${PAYROLL_IDS.run}${route === "permanent" ? "/permanent" : ""}`)
        : await request(app).post(`/payroll/${route}`).send(payload());
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ outcome_uncertain: true });
    expect(response.body.error).toContain("Reload before retrying");
    expect(response.body).not.toHaveProperty("id");
    expect(db.state).not.toEqual(before);
    expect(db.calls.slice(-2).map((call) => call.sql)).toEqual(["commit", "rollback"]);
    expect(db.release).toHaveBeenCalledWith(true);
    expect(notify).not.toHaveBeenCalled();
  });

  test("discards a broken rollback connection without pretending COMMIT was attempted", async () => {
    db.failAt = /^with eligible as/;
    db.beforeQuery = (sql) => { if (sql === "rollback") throw new Error("Synthetic rollback disconnect"); };
    const response = await request(app).post("/payroll/runs").send(payload());
    expect(response.status).toBe(500);
    expect(response.body.outcome_uncertain).toBe(false);
    expect(db.calls.some((call) => call.sql === "commit")).toBe(false);
    expect(db.release).toHaveBeenCalledWith(true);
  });

  test("never labels a post-COMMIT cleanup exception as a confirmed rollback", async () => {
    db.release.mockImplementationOnce(() => { throw new Error("Synthetic post-COMMIT release failure"); });
    const response = await request(app).post("/payroll/runs").send(payload());
    expect(response.status).toBe(500);
    expect(response.body.outcome_uncertain).toBe(true);
    expect(response.body.error).not.toContain("Synthetic post-COMMIT");
    expect(db.state.runs[0].status).toBe("finalized");
    expect(db.state.audits[0].action).toBe("finalized");
    expect(db.calls.at(-1)?.sql).toBe("commit");
    expect(db.calls.some((call) => call.sql === "rollback")).toBe(false);
  });
});

describe("official payroll writer coordination", () => {
  test.each(["runs", "status"])("rejects an active exact-period publication through %s without modifying its history", async (route) => {
    seedDraft();
    db.state.runs.push(syntheticRun({ id: id(301), status: "finalized", period_kind: "range" }));
    const before = structuredClone(db.state);
    const response = route === "status"
      ? await request(app).patch(`/payroll/runs/${PAYROLL_IDS.run}/status`).send({ status: "FINALIZED" })
      : await request(app).post("/payroll/runs").send(payload());
    expect(response.status).toBe(409);
    expect(db.state).toEqual(before);
    expect(db.calls.findIndex((call) => call.sql.startsWith("select pg_advisory_xact_lock")))
      .toBeLessThan(db.calls.findIndex((call) => call.sql.includes("status='finalized'")));
  });

  test("does not add an overlapping-period policy", async () => {
    db.state.runs = [syntheticRun({ id: id(301), period_end: "2026-04-14", status: "finalized" })];
    const response = await request(app).post("/payroll/runs").send(payload());
    expect(response.status).toBe(201);
  });

  test.each(["DRAFT", "FLAGGED_WRONG", "TRASH"])("coordinates %s without recalculating stored snapshots", async (status) => {
    seedDraft();
    db.state.runs[0].status = "finalized";
    db.state.runs[0].finalized_at = "2026-04-16T00:00:00.000Z";
    db.state.runs[0].deleted_at = status === "DRAFT" ? "2026-04-17T00:00:00.000Z" : null;
    const lines = structuredClone(db.state.employeeLines);
    const response = await request(app).patch(`/payroll/runs/${PAYROLL_IDS.run}/status`).send({ status });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe(status);
    expect(db.state.employeeLines).toEqual(lines);
    expect(db.state.runs[0].finalized_at).toBe("2026-04-16T00:00:00.000Z");
    expect(Boolean(response.body.deleted_at)).toBe(status === "TRASH");
    const lock = db.calls.findIndex((call) => call.sql.startsWith("select pg_advisory_xact_lock"));
    const rowLock = db.calls.findIndex((call) => call.sql.endsWith("for update"));
    expect(rowLock).toBeGreaterThan(lock);
    expect(db.calls.findIndex((call) => call.sql.startsWith("update public.payroll_runs"))).toBeGreaterThan(rowLock);
    expect(db.calls.some((call) => call.sql.startsWith("with eligible as"))).toBe(false);
    expect(db.state.audits).toHaveLength(1);
  });

  test.each(["", "/permanent"])("coordinates deletion%s and retains mandatory audit", async (suffix) => {
    seedDraft();
    const response = await request(app).delete(`/payroll/runs/${PAYROLL_IDS.run}${suffix}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, id: PAYROLL_IDS.run });
    const lock = db.calls.findIndex((call) => call.sql.startsWith("select pg_advisory_xact_lock"));
    expect(db.calls.findIndex((call) => call.sql.endsWith("for update"))).toBeGreaterThan(lock);
    expect(db.state.audits[0]).toMatchObject({ metadata: { run_id: PAYROLL_IDS.run }, employee_count: 1, total_payroll_snapshot: 9000 });
    if (suffix) {
      expect(db.state.runs).toEqual([]);
      expect(db.state.employeeLines).toEqual([]);
      expect(db.state.events).toEqual([]);
      expect(db.state.audits[0].payroll_run_id).toBeNull();
    } else {
      expect(db.state.runs[0]).toMatchObject({ status: "draft" });
      expect(db.state.runs[0].deleted_at).not.toBeNull();
      expect(db.state.employeeLines).toHaveLength(1);
    }
  });

  test.each(["activity", "status", "delete", "permanent"])("rolls back an unconfirmed official %s write", async (fault) => {
    seedDraft();
    const before = structuredClone(db.state);
    db.afterQuery = (sql, result) => {
      if ((fault === "activity" && sql.startsWith("insert into public.activity_logs("))
          || (fault === "status" && sql.startsWith("update public.payroll_runs set status="))
          || (fault === "delete" && sql.startsWith("update public.payroll_runs set deleted_at="))
          || (fault === "permanent" && sql.startsWith("delete from public.payroll_runs "))) return { rows: [], rowCount: 0 };
      return result;
    };
    const response = fault === "activity" || fault === "status"
      ? await request(app).patch(`/payroll/runs/${PAYROLL_IDS.run}/status`).send({ status: "TRASH" })
      : await request(app).delete(`/payroll/runs/${PAYROLL_IDS.run}${fault === "permanent" ? "/permanent" : ""}`);
    expect(response.status).toBe(500);
    expect(db.state).toEqual(before);
  });

  test("preserves idempotent permanent deletion and reports missing mutable runs", async () => {
    expect((await request(app).delete(`/payroll/runs/${PAYROLL_IDS.run}/permanent`)).status).toBe(200);
    expect((await request(app).delete(`/payroll/runs/${PAYROLL_IDS.run}`)).status).toBe(404);
    expect((await request(app).patch(`/payroll/runs/${PAYROLL_IDS.run}/status`).send({ status: "DRAFT" })).status).toBe(404);
  });

  test("rejects a period changed during the lock wait", async () => {
    seedDraft();
    db.beforeQuery = (sql) => { if (sql.startsWith("select pg_advisory_xact_lock")) db.state.runs[0].period_end = "2026-04-30"; };
    const response = await request(app).patch(`/payroll/runs/${PAYROLL_IDS.run}/status`).send({ status: "FINALIZED" });
    expect(response.status).toBe(409);
    expect(db.calls.some((call) => call.sql.startsWith("with eligible as"))).toBe(false);
  });

  test("validates dates and UUIDs before acquiring a client", async () => {
    const badDate = await request(app).post("/payroll/runs").send({ ...payload(), period_kind: "range", period_start: "2026-02-30", period_end: "2026-03-01" });
    const badId = await request(app).delete("/payroll/runs/not-a-uuid");
    expect(badDate.status).toBe(400);
    expect(badId.status).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
    expect(db.calls).toEqual([]);
  });

  test("preserves secondary-role authority and ignores a client-supplied actor", async () => {
    actor = { id: PAYROLL_IDS.actor, username: "synthetic-multi-role", role: "DECORATOR", roles: ["DECORATOR", "ACCOUNTANT"] };
    const response = await request(app).post("/payroll/drafts").send({ ...payload(), created_by_user_id: id(999) });
    expect(response.status).toBe(201);
    expect(db.state.runs[0].created_by).toBe(PAYROLL_IDS.actor);
    expect(db.state.audits[0].user_id).toBe(PAYROLL_IDS.actor);
  });

  test("denies write requests before any client acquisition for a read-only actor", async () => {
    actor = { id: PAYROLL_IDS.actor, username: "synthetic-read-only", role: "ACCOUNTANT", permission_slugs: ["payroll:read"] };
    const responses = [
      await request(app).post("/payroll/drafts").send(payload()),
      await request(app).post("/payroll/runs").send(payload()),
      await request(app).patch(`/payroll/runs/${PAYROLL_IDS.run}/status`).send({ status: "FINALIZED" }),
      await request(app).delete(`/payroll/runs/${PAYROLL_IDS.run}`),
      await request(app).delete(`/payroll/runs/${PAYROLL_IDS.run}/permanent`),
    ];
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403]);
    expect(pool.connect).not.toHaveBeenCalled();
    expect(db.calls).toEqual([]);
  });
});
