import { Client } from "pg";
import { attestDreamluxNativeTarget } from "./dreamlux-native-target";

const plannerId = "23900000-0000-4000-8000-000000000006";
const eventId = "23900000-0000-4000-8000-000000000010";
const trainingId = "23900000-0000-4000-8000-000000000011";
const allowed = new Set(["reset", "change-source", "reject-employee-inserts", "clear-fault", "state", "preview-roster", "empty-roster"]);

async function main() {
  const action = process.argv[2];
  if (!action || !allowed.has(action)) throw new Error("Unknown synthetic payroll control action");
  attestDreamluxNativeTarget(process.env.DREAMLUX_NATIVE_TEST_ADMIN_URL ?? "", "admin");
  const target = attestDreamluxNativeTarget(process.env.DATABASE_URL ?? "", "fixture");
  if (!/^\/dreamlux_ephemeral_payroll_239_[a-f0-9]{12}$/.test(target.pathname)) {
    throw new Error("Refusing a database outside the independently owned payroll239 fixture");
  }
  const client = new Client({ connectionString: target.href, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const identity = await client.query<{ database: string; actor: string; port: number }>(
      "select current_database() as database,current_user as actor,inet_server_port() as port",
    );
    if (identity.rows[0]?.database !== target.pathname.slice(1)
      || identity.rows[0].actor !== "dreamlux_parity" || identity.rows[0].port !== 55434) {
      throw new Error("Synthetic payroll target identity changed");
    }
    if (action === "clear-fault" || action === "reset") {
      await client.query(
        `drop trigger if exists dreamlux_browser_employee_failure_239 on payroll_run_employee_lines;
         drop function if exists dreamlux_browser_employee_failure_239()`,
      );
    }
    if (action === "reset") {
      await client.query("begin");
      try {
        await client.query("truncate payroll_runs,activity_logs cascade");
        await client.query("delete from employees where employee_id like 'QA-233-UI-ROSTER-%'");
        await client.query("update salary_levels set amount_etb=14500,deleted_at=null,is_active=true where code='QA-PLANNER-239'");
        await client.query(
          "update employees set deleted_at=null,base_salary=10000,compensation_mode=case when id=$1 then 'regular' else 'commission_only' end",
          [plannerId],
        );
        await client.query(
          "update event_assignments set attended=true,commission_amount=case when event_id=$1 then 2000 else 500 end",
          [eventId],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    if (action === "change-source") {
      await client.query("update employees set compensation_mode='commission_only' where id=$1", [plannerId]);
      await client.query("update event_assignments set attended=false where event_id=$1", [trainingId]);
    }
    if (action === "preview-roster") {
      await client.query(
        `insert into employees(employee_id,full_name,salary_level,base_salary,compensation_mode)
         select 'QA-233-UI-ROSTER-'||lpad(i::text,3,'0'),
                'Synthetic preview employee '||lpad(i::text,3,'0'),'QA-PLANNER-239',10000,'regular'
           from generate_series(1,248) i`,
      );
    }
    if (action === "empty-roster") await client.query("update employees set deleted_at=now()");
    if (action === "reject-employee-inserts") {
      await client.query(
        `create function dreamlux_browser_employee_failure_239() returns trigger language plpgsql as $$
           begin raise exception 'Synthetic browser employee snapshot failure'; end $$;
         create trigger dreamlux_browser_employee_failure_239 before insert on payroll_run_employee_lines
           for each row execute function dreamlux_browser_employee_failure_239()`,
      );
    }
    const state = await client.query<{
      runs: Array<{ id: string; status: string; total: string; employees: number }>;
      audits: number; lines: number; event_lines: number;
    }>(
      `select coalesce((select jsonb_agg(r) from (
         select id,status,
           coalesce((select sum(employee_total_snapshot) from payroll_run_employee_lines where run_id=p.id),0)::text as total,
           (select count(*)::int from payroll_run_employee_lines where run_id=p.id) as employees
           from payroll_runs p order by created_at,id limit 10
       ) r),'[]') as runs,
       (select count(*)::int from payroll_audit_logs) as audits,
       (select count(*)::int from payroll_run_employee_lines) as lines,
       (select count(*)::int from payroll_run_line_events) as event_lines`,
    );
    console.log(JSON.stringify(state.rows[0]));
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error("Synthetic payroll control failed:", error instanceof Error ? error.message : "Unknown fixture error");
  process.exitCode = 1;
});
