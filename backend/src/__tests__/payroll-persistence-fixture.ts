import { mock } from "bun:test";
import { ELIGIBLE_COMMISSIONS_SQL, type EligibleCommissionRow } from "../lib/eligible-payroll-commissions";
import type { buildPayrollLines, toPayrollEventPayloads, toPayrollLinePayloads } from "../lib/payroll-generation";

export const PAYROLL_IDS = {
  employee: "550e8400-e29b-41d4-a716-446655440000",
  eventType: "660e8400-e29b-41d4-a716-446655440001",
  run: "770e8400-e29b-41d4-a716-446655440002",
  line: "880e8400-e29b-41d4-a716-446655440003",
  actor: "23900000-0000-4000-8000-000000000001",
};

export type PayrollSources = {
  employees: Parameters<typeof buildPayrollLines>[0]["employees"];
  event_types: Parameters<typeof buildPayrollLines>[0]["eventTypes"];
  salary_levels: Parameters<typeof buildPayrollLines>[0]["salaryLevels"];
  commissions: EligibleCommissionRow[];
};
export type StoredRun = {
  id: string;
  title: string;
  period_kind: string;
  period_start: string;
  period_end: string;
  status: string;
  created_by: string | null;
  updated_at: string;
  deleted_at: string | null;
  finalized_at: string | null;
};
type EmployeeLine = ReturnType<typeof toPayrollLinePayloads>[number] & { id: string };
type EventLine = ReturnType<typeof toPayrollEventPayloads>[number];
type Result = { rows: Record<string, unknown>[]; rowCount: number | null };
type State = {
  runs: StoredRun[];
  employeeLines: EmployeeLine[];
  events: EventLine[];
  audits: Record<string, unknown>[];
  activities: Record<string, unknown>[];
};
const NOW = "2026-04-20T12:00:00.000Z";
const ELIGIBLE_SQL = ELIGIBLE_COMMISSIONS_SQL.replace(/\s+/g, " ").trim().toLowerCase();

export function syntheticRun(overrides: Partial<StoredRun> = {}): StoredRun {
  return {
    id: PAYROLL_IDS.run, title: "Synthetic saved payroll", period_kind: "half_month",
    period_start: "2026-04-01", period_end: "2026-04-15", status: "draft",
    created_by: PAYROLL_IDS.actor, updated_at: "2026-04-16T12:00:00.000Z",
    deleted_at: null, finalized_at: null, ...overrides,
  };
}

// An in-memory protocol double, not a PostgreSQL/locking/constraint emulator.
export class PayrollPersistenceFixture {
  sources: PayrollSources = { employees: [], event_types: [], salary_levels: [], commissions: [] };
  state: State = { runs: [], employeeLines: [], events: [], audits: [], activities: [] };
  payloads: unknown[] = [];
  calls: Array<{ sql: string; values: unknown[] }> = [];
  nextRunId = PAYROLL_IDS.run;
  failAt: RegExp | null = null;
  failWith: Error = new Error("Synthetic database fault");
  loseCommitAcknowledgement = false;
  beforeQuery?: (sql: string, values: unknown[]) => void | Promise<void>;
  afterQuery?: (sql: string, result: Result) => Result;
  private checkpoint: State | null = null;
  private sequence = 1;
  private lineSequence = 0;

  release = mock((_discard?: boolean) => {});
  query = mock(async (text: string, values: unknown[] = []): Promise<Result> => {
    const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
    this.calls.push({ sql, values });
    await this.beforeQuery?.(sql, values);
    if (this.failAt?.test(sql)) throw this.failWith;
    const result = this.dispatch(sql, values);
    return this.afterQuery?.(sql, result) ?? result;
  });

  private dispatch(sql: string, values: unknown[]): Result {
    const rows = (data: Record<string, unknown>[]): Result => ({ rows: structuredClone(data), rowCount: data.length });
    const changed = (count: number): Result => ({ rows: [], rowCount: count });
    if (sql === "begin isolation level read committed") {
      this.checkpoint = structuredClone(this.state);
      return changed(0);
    }
    if (sql === "set local lock_timeout = '10s'" || sql === "set local statement_timeout = '30s'") return changed(0);
    if (sql === "rollback") {
      if (this.checkpoint) this.state = this.checkpoint;
      this.checkpoint = null;
      return changed(0);
    }
    if (sql === "commit") {
      this.checkpoint = null;
      if (this.loseCommitAcknowledgement) throw new Error("Synthetic lost COMMIT acknowledgement");
      return changed(0);
    }
    if (sql.startsWith("select pg_advisory_xact_lock(")) return rows([{ pg_advisory_xact_lock: null }]);
    if (sql === ELIGIBLE_SQL) return rows(this.sources.commissions);
    if (sql.startsWith("with eligible as (")) return rows([this.sources]);
    if (sql.startsWith("select ") && sql.includes("from public.payroll_runs where id=")) {
      return rows(this.state.runs.filter((run) => run.id === values[0]));
    }
    if (sql.startsWith("select id from public.payroll_runs where period_start=")) {
      const status = sql.includes("status='draft'") ? "draft" : "finalized";
      return rows(this.state.runs.filter((run) => run.period_start === values[0] && run.period_end === values[1]
        && run.status === status && run.deleted_at === null && run.id !== values[2])
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id)).slice(0, 1));
    }
    if (sql.startsWith("insert into public.payroll_runs(")) {
      const run = syntheticRun({
        id: this.nextRunId, title: String(values[0]), period_kind: String(values[1]),
        period_start: String(values[2]), period_end: String(values[3]), status: String(values[4]),
        finalized_at: values[4] === "finalized" ? NOW : null, created_by: values[5] as string | null,
      });
      this.state.runs.push(run);
      this.payloads.push({ ...run });
      this.nextRunId = `23900000-0000-4000-8000-${String(this.sequence++).padStart(12, "0")}`;
      return rows([{ id: run.id }]);
    }
    if (sql.startsWith("update public.payroll_runs set title=")) {
      const run = this.state.runs.find((item) => item.id === values[0]);
      if (!run) return changed(0);
      Object.assign(run, {
        title: String(values[1]), period_kind: String(values[2]), status: "draft", updated_at: NOW,
        deleted_at: null, finalized_at: null, created_by: values[3] ?? run.created_by,
      });
      return rows([{ id: run.id }]);
    }
    if (sql.startsWith("update public.payroll_runs set status=")) {
      const run = this.state.runs.find((item) => item.id === values[0]);
      if (!run) return changed(0);
      Object.assign(run, {
        status: String(values[1]), updated_at: NOW, deleted_at: values[1] === "trashed" ? NOW : null,
        finalized_at: values[1] === "finalized" ? NOW : run.finalized_at,
      });
      return rows([run]);
    }
    if (sql.startsWith("delete from public.payroll_run_employee_lines where run_id=")) {
      const removed = this.state.employeeLines.filter((line) => line.run_id === values[0]);
      this.state.employeeLines = this.state.employeeLines.filter((line) => line.run_id !== values[0]);
      this.state.events = this.state.events.filter((event) => !removed.some((line) => line.id === event.employee_line_id));
      return changed(removed.length);
    }
    if (sql.startsWith("insert into public.payroll_run_employee_lines ")) {
      const payloads = JSON.parse(String(values[0])) as ReturnType<typeof toPayrollLinePayloads>;
      const inserted = payloads.map((line) => ({
        ...line, id: `880e8400-e29b-41d4-a716-${String(446655440003 + this.lineSequence++).padStart(12, "0")}`,
      }));
      this.state.employeeLines.push(...inserted);
      this.payloads.push(payloads);
      return rows(inserted.map(({ id, employee_id }) => ({ id, employee_id })));
    }
    if (sql.startsWith("insert into public.payroll_run_line_events ")) {
      const payloads = JSON.parse(String(values[0])) as EventLine[];
      this.state.events.push(...payloads);
      this.payloads.push(payloads);
      return changed(payloads.length);
    }
    if (sql.startsWith("select count(*)::int as employee_count,")) {
      const lines = this.state.employeeLines.filter((line) => line.run_id === values[0]);
      return rows([{
        employee_count: lines.length,
        event_count: this.state.events.filter((event) => lines.some((line) => line.id === event.employee_line_id)).length,
        total: lines.reduce((total, line) => total + Number(line.employee_total_snapshot), 0).toFixed(2),
      }]);
    }
    if (sql.startsWith("insert into public.payroll_audit_logs ")) {
      const audit = {
        payroll_run_id: values[0], user_id: values[1], action: values[2], period_start: values[3],
        period_end: values[4], status_snapshot: values[5], employee_count: values[6],
        total_payroll_snapshot: values[7], metadata: JSON.parse(String(values[8])) as unknown,
      };
      this.state.audits.push(audit);
      this.payloads.push(audit);
      return changed(1);
    }
    if (sql.startsWith("insert into public.activity_logs(")) {
      this.state.activities.push({ entity_type: "payroll", entity_id: values[0], user_id: values[1], action: values[2], note: values[3] });
      return changed(1);
    }
    if (sql.startsWith("update public.payroll_runs set deleted_at=now()")) {
      const run = this.state.runs.find((item) => item.id === values[0]);
      if (!run) return changed(0);
      run.deleted_at = NOW;
      return changed(1);
    }
    if (sql.startsWith("delete from public.payroll_runs where id=")) {
      const count = this.state.runs.filter((run) => run.id === values[0]).length;
      this.state.runs = this.state.runs.filter((run) => run.id !== values[0]);
      const removed = this.state.employeeLines.filter((line) => line.run_id === values[0]);
      this.state.employeeLines = this.state.employeeLines.filter((line) => line.run_id !== values[0]);
      this.state.events = this.state.events.filter((event) => !removed.some((line) => line.id === event.employee_line_id));
      this.state.audits.forEach((audit) => { if (audit.payroll_run_id === values[0]) audit.payroll_run_id = null; });
      return changed(count);
    }
    throw new Error(`Unexpected SQL in payroll protocol test: ${sql}`);
  }
}
