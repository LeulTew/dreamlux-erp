import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "../db/pool";
import { ELIGIBLE_COMMISSIONS_SQL, mapEligibleCommissionRows, type EligibleCommissionRow } from "../lib/eligible-payroll-commissions";
import { buildPayrollLines, toPayrollEventPayloads, toPayrollLinePayloads, type PayrollGeneratedLine } from "../lib/payroll-generation";

type Queryable = Pick<PoolClient, "query">;
type Bounds = { start: string; end: string };
export type PayrollPeriod = { bounds: Bounds; title: string; periodKind: "month" | "range" | "half_month" | "weekly" };
export type PayrollStatus = "draft" | "finalized" | "flagged_wrong" | "trashed";
type RunRow = {
  id: string;
  title: string;
  period_kind: string;
  period_start: string;
  period_end: string;
  status: string;
  updated_at: Date;
  deleted_at: Date | null;
  finalized_at: Date | null;
};
type Summary = { employeeCount: number; eventCount: number; total: number };
type Sources = {
  employees: Parameters<typeof buildPayrollLines>[0]["employees"];
  event_types: Parameters<typeof buildPayrollLines>[0]["eventTypes"];
  salary_levels: Parameters<typeof buildPayrollLines>[0]["salaryLevels"];
  commissions: EligibleCommissionRow[];
};

export class PayrollPersistenceError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 500 | 503,
    message: string,
    public readonly outcomeUncertain = false,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "PayrollPersistenceError";
  }
}

const runIdSchema = z.string().uuid();
const RUN_COLUMNS = `id,title,period_kind,period_start::text,period_end::text,
                     status,updated_at,deleted_at,finalized_at`;
const SOURCE_SQL = `
  with eligible as (${ELIGIBLE_COMMISSIONS_SQL})
  select
    coalesce((select jsonb_agg(e order by e.id) from (
      select id,full_name,salary_level,base_salary,profile_photo_key,event_prices,compensation_mode
        from public.employees where deleted_at is null
    ) e),'[]'::jsonb) as employees,
    coalesce((select jsonb_agg(e order by e.id) from (
      select id,name from public.event_types where deleted_at is null
    ) e),'[]'::jsonb) as event_types,
    coalesce((select jsonb_agg(s order by s.id) from (
      select id,code,amount_etb from public.salary_levels where deleted_at is null
    ) s),'[]'::jsonb) as salary_levels,
    coalesce((select jsonb_agg(eligible) from eligible),'[]'::jsonb) as commissions
`;

function validateBounds(bounds: Bounds) {
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!validDate(bounds.start) || !validDate(bounds.end) || bounds.start > bounds.end) {
    throw new PayrollPersistenceError(400, "Payroll requires a valid start date on or before its end date.");
  }
}

function validateId(id: string) {
  if (!runIdSchema.safeParse(id).success) throw new PayrollPersistenceError(400, "Invalid payroll run ID");
}

async function transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw new PayrollPersistenceError(500, "Payroll change could not be started.", false, error);
  }
  let committing = false;
  let discard = false;
  try {
    await client.query("begin isolation level read committed");
    await client.query("set local lock_timeout = '10s'");
    await client.query("set local statement_timeout = '30s'");
    const result = await operation(client);
    committing = true;
    await client.query("commit");
    return result;
  } catch (error) {
    discard = committing;
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      discard = true;
      console.error("[PayrollPersistence] Rollback failed; discarding connection", rollbackError);
    }
    // A ROLLBACK after a lost COMMIT acknowledgement cannot prove the write was undone.
    if (committing) {
      throw new PayrollPersistenceError(503, "Payroll change could not be confirmed. Reload before retrying.", true, error);
    }
    if (error && typeof error === "object" && "code" in error && error.code === "55P03") {
      throw new PayrollPersistenceError(503, "Payroll is being changed by another request. Reload and try again.", false, error);
    }
    if (error instanceof PayrollPersistenceError) throw error;
    throw new PayrollPersistenceError(500, "Payroll change failed before commit.", false, error);
  } finally {
    client.release(discard);
  }
}

async function lockPeriod(client: PoolClient, bounds: Bounds) {
  await client.query(
    "select pg_advisory_xact_lock(hashtext('dreamlux-payroll-period'),hashtext($1::text))",
    [`${bounds.start}:${bounds.end}`],
  );
}

async function lockRun(client: PoolClient, id: string, allowMissing = false): Promise<RunRow | null> {
  const initial = (await client.query<RunRow>(
    `select ${RUN_COLUMNS} from public.payroll_runs where id=$1::uuid`, [id],
  )).rows[0];
  if (!initial) {
    if (allowMissing) return null;
    throw new PayrollPersistenceError(404, "Payroll run not found");
  }
  await lockPeriod(client, { start: initial.period_start, end: initial.period_end });
  const current = (await client.query<RunRow>(
    `select ${RUN_COLUMNS} from public.payroll_runs where id=$1::uuid for update`, [id],
  )).rows[0];
  if (!current) {
    if (allowMissing) return null;
    throw new PayrollPersistenceError(404, "Payroll run not found");
  }
  if (current.period_start !== initial.period_start || current.period_end !== initial.period_end) {
    throw new PayrollPersistenceError(409, "The payroll period changed. Reload before retrying.");
  }
  return current;
}

async function noPublishedRun(client: PoolClient, bounds: Bounds, exceptId: string | null = null) {
  const result = await client.query<{ id: string }>(
    `select id from public.payroll_runs
      where period_start=$1::date and period_end=$2::date and status='finalized'
        and deleted_at is null and ($3::uuid is null or id<>$3::uuid)
      limit 1`,
    [bounds.start, bounds.end, exceptId],
  );
  if (result.rows.length) {
    throw new PayrollPersistenceError(409, "A finalized payroll run already exists for this period. To redo it, trash the existing one first.");
  }
}

async function calculate(client: Queryable, bounds: Bounds) {
  // READ COMMITTED plus one statement gives current, coherent inputs after any lock wait.
  const sources = (await client.query<Sources>(SOURCE_SQL, [bounds.start, bounds.end])).rows[0];
  if (!sources || !Array.isArray(sources.employees) || !Array.isArray(sources.event_types)
      || !Array.isArray(sources.salary_levels) || !Array.isArray(sources.commissions)) {
    throw new Error("Payroll source query returned an incomplete result");
  }
  return buildPayrollLines({
    employees: sources.employees,
    eventTypes: sources.event_types,
    salaryLevels: sources.salary_levels,
    employeeLineEvents: mapEligibleCommissionRows(sources.commissions, sources.employees.map((employee) => employee.id)),
  });
}

async function summarize(client: Queryable, id: string): Promise<Summary> {
  const row = (await client.query<{ employee_count: number; event_count: number; total: string }>(
    `select count(*)::int as employee_count,coalesce(sum(employee_total_snapshot),0)::text as total,
            (select count(*)::int from public.payroll_run_line_events e
               join public.payroll_run_employee_lines l on l.id=e.employee_line_id
               where l.run_id=$1::uuid) as event_count
       from public.payroll_run_employee_lines where run_id=$1::uuid`,
    [id],
  )).rows[0];
  if (!row || !Number.isInteger(row.employee_count) || row.employee_count < 0
      || !Number.isInteger(row.event_count) || row.event_count < 0 || !Number.isFinite(Number(row.total))) {
    throw new Error("Payroll summary could not be confirmed");
  }
  return { employeeCount: row.employee_count, eventCount: row.event_count, total: Number(row.total) };
}

async function audit(
  client: PoolClient, id: string, actorId: string | null, action: string,
  bounds: Bounds, status: string, summary: Summary, metadata: Record<string, unknown>,
) {
  const result = await client.query(
    `insert into public.payroll_audit_logs
      (payroll_run_id,user_id,action,period_start,period_end,status_snapshot,
       employee_count,total_payroll_snapshot,metadata)
     values($1::uuid,$2::uuid,$3,$4::date,$5::date,$6,$7,$8,$9::jsonb)`,
    [id, actorId, action, bounds.start, bounds.end, status, summary.employeeCount, summary.total, JSON.stringify(metadata)],
  );
  if (result.rowCount !== 1) throw new Error("Payroll audit was not persisted");
}

async function activity(client: PoolClient, id: string, actorId: string | null, action: string, note: string) {
  const result = await client.query(
    "insert into public.activity_logs(entity_type,entity_id,user_id,action,note) values('payroll',$1,$2::uuid,$3,$4)",
    [id, actorId, action, note],
  );
  if (result.rowCount !== 1) throw new Error("Payroll activity was not persisted");
}

async function replaceSnapshots(client: PoolClient, id: string, lines: PayrollGeneratedLine[], replacing: boolean) {
  if (replacing) await client.query("delete from public.payroll_run_employee_lines where run_id=$1::uuid", [id]);
  const payloads = toPayrollLinePayloads(id, lines);
  const expectedEventCount = lines.reduce((count, line) => count + line.events.length, 0);
  if (payloads.length) {
    const inserted = await client.query<{ id: string; employee_id: string }>(
      `insert into public.payroll_run_employee_lines
        (run_id,employee_id,employee_name_snapshot,salary_level_snapshot,compensation_mode_snapshot,
         base_salary_snapshot,commission_total_snapshot,employee_total_snapshot)
       select run_id,employee_id,employee_name_snapshot,salary_level_snapshot,compensation_mode_snapshot,
              base_salary_snapshot,commission_total_snapshot,employee_total_snapshot
         from jsonb_to_recordset($1::jsonb) as row(
           run_id uuid,employee_id uuid,employee_name_snapshot text,salary_level_snapshot text,
           compensation_mode_snapshot text,base_salary_snapshot numeric,commission_total_snapshot numeric,
           employee_total_snapshot numeric)
       returning id,employee_id`,
      [JSON.stringify(payloads)],
    );
    const expectedEmployeeIds = new Set(lines.map((line) => line.employee_id));
    if (inserted.rowCount !== lines.length || inserted.rows.length !== lines.length
        || expectedEmployeeIds.size !== lines.length
        || new Set(inserted.rows.map((line) => line.employee_id)).size !== lines.length
        || new Set(inserted.rows.map((line) => line.id)).size !== lines.length
        || inserted.rows.some((line) => !expectedEmployeeIds.has(line.employee_id) || !runIdSchema.safeParse(line.id).success)) {
      throw new Error("Payroll employee snapshots were not fully persisted or linked");
    }
    const events = toPayrollEventPayloads(lines, inserted.rows);
    if (events.length !== expectedEventCount) {
      throw new Error("Payroll event snapshots could not be linked to every employee");
    }
    if (events.length) {
      const result = await client.query(
        `insert into public.payroll_run_line_events
          (employee_line_id,event_type_id,event_name_snapshot,unit_price_snapshot,quantity,
           line_total_snapshot,override_price_etb,override_reason)
         select employee_line_id,event_type_id,event_name_snapshot,unit_price_snapshot,quantity,
                line_total_snapshot,override_price_etb,override_reason
           from jsonb_to_recordset($1::jsonb) as row(
             employee_line_id uuid,event_type_id uuid,event_name_snapshot text,unit_price_snapshot numeric,
             quantity numeric,line_total_snapshot numeric,override_price_etb numeric,override_reason text)`,
        [JSON.stringify(events)],
      );
      if (result.rowCount !== events.length) throw new Error("Payroll event snapshots were not fully persisted");
    }
  }
  const summary = await summarize(client, id);
  if (summary.employeeCount !== lines.length || summary.eventCount !== expectedEventCount) {
    throw new Error("Persisted payroll snapshot counts do not match the calculation");
  }
  return summary;
}

function statusResult(run: RunRow, published: boolean) {
  return {
    id: run.id, status: run.status, updated_at: run.updated_at,
    deleted_at: run.deleted_at, finalized_at: run.finalized_at, published,
  };
}

async function save(period: PayrollPeriod, actorId: string | null, status: "draft" | "finalized") {
  validateBounds(period.bounds);
  return transaction(async (client) => {
    await lockPeriod(client, period.bounds);
    let existing: { id: string } | undefined;
    if (status === "finalized") {
      await noPublishedRun(client, period.bounds);
    } else {
      existing = (await client.query<{ id: string }>(
        `select id from public.payroll_runs
          where period_start=$1::date and period_end=$2::date and status='draft' and deleted_at is null
          order by updated_at desc,id limit 1 for update`,
        [period.bounds.start, period.bounds.end],
      )).rows[0];
    }
    const generated = await calculate(client, period.bounds);
    const result = existing
      ? await client.query<{ id: string }>(
        `update public.payroll_runs set title=$2,period_kind=$3,status='draft',
          updated_at=now(),deleted_at=null,finalized_at=null,created_by=coalesce($4::uuid,created_by)
          where id=$1::uuid returning id`,
        [existing.id, period.title, period.periodKind, actorId],
      )
      : await client.query<{ id: string }>(
        `insert into public.payroll_runs(title,period_kind,period_start,period_end,status,finalized_at,created_by)
         values($1,$2,$3::date,$4::date,$5,case when $5='finalized' then now() else null end,$6::uuid)
         returning id`,
        [period.title, period.periodKind, period.bounds.start, period.bounds.end, status, actorId],
      );
    const run = result.rows[0];
    if (result.rowCount !== 1 || result.rows.length !== 1 || !run || !runIdSchema.safeParse(run.id).success) {
      throw new Error("Payroll header was not persisted");
    }
    const summary = await replaceSnapshots(client, run.id, generated.lines, Boolean(existing));
    await audit(client, run.id, actorId, status === "draft" ? "draft_saved" : "finalized",
      period.bounds, status, summary,
      status === "draft" ? { existing_draft_updated: Boolean(existing) } : { duplicate_guard_checked: true });
    return {
      id: run.id, title: period.title, status,
      total_payroll_value: summary.total, employee_count: summary.employeeCount,
    };
  });
}

export const PayrollPersistenceService = {
  async preview(period: PayrollPeriod) {
    validateBounds(period.bounds);
    try {
      return await calculate(pool, period.bounds);
    } catch (error) {
      throw new PayrollPersistenceError(500, "Payroll inputs could not be loaded.", false, error);
    }
  },

  saveDraft(period: PayrollPeriod, actorId: string | null) {
    return save(period, actorId, "draft");
  },

  publish(period: PayrollPeriod, actorId: string | null) {
    return save(period, actorId, "finalized");
  },

  async changeStatus(id: string, status: PayrollStatus, actorId: string | null) {
    validateId(id);
    return transaction(async (client) => {
      const current = await lockRun(client, id);
      if (!current) throw new PayrollPersistenceError(404, "Payroll run not found");
      if (status === "finalized" && current.status === "finalized" && current.deleted_at === null) {
        return statusResult(current, false);
      }
      const bounds = { start: current.period_start, end: current.period_end };
      let summary: Summary;
      if (status === "finalized") {
        validateBounds(bounds);
        await noPublishedRun(client, bounds, id);
        const generated = await calculate(client, bounds);
        summary = await replaceSnapshots(client, id, generated.lines, true);
      } else {
        summary = await summarize(client, id);
      }
      const result = await client.query<RunRow>(
        `update public.payroll_runs set status=$2,updated_at=now(),
          deleted_at=case when $2='trashed' then now() else null end,
          finalized_at=case when $2='finalized' then now() else finalized_at end
          where id=$1::uuid returning ${RUN_COLUMNS}`,
        [id, status],
      );
      const updated = result.rows[0];
      if (result.rowCount !== 1 || result.rows.length !== 1 || !updated) throw new Error("Payroll status was not persisted");
      await audit(client, id, actorId, status === "finalized" ? "finalized" : "update_status",
        bounds, status, summary, { previous_status: current.status, run_id: id });
      await activity(client, id, actorId, "update_status", `Payroll run status changed to "${status}".`);
      return statusResult(updated, status === "finalized");
    });
  },

  async remove(id: string, actorId: string | null, permanent = false) {
    validateId(id);
    return transaction(async (client) => {
      const current = await lockRun(client, id, permanent);
      if (!current) return { success: true, id };
      const summary = await summarize(client, id);
      await audit(client, id, actorId, permanent ? "permanent_delete" : "delete",
        { start: current.period_start, end: current.period_end }, current.status, summary, { run_id: id });
      await activity(client, id, actorId, permanent ? "permanent_delete" : "delete",
        permanent ? "Payroll run permanently deleted." : "Payroll run moved to trash.");
      const result = permanent
        ? await client.query("delete from public.payroll_runs where id=$1::uuid", [id])
        : await client.query("update public.payroll_runs set deleted_at=now() where id=$1::uuid", [id]);
      if (result.rowCount !== 1) throw new Error("Payroll deletion was not persisted");
      return { success: true, id };
    });
  },
};
