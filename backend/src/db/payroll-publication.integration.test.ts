import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import express from "express";
import { randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { Client, type Pool, type PoolClient } from "pg";
import request from "supertest";
import { attestDreamluxNativeTarget } from "./testing/dreamlux-native-target";
import { startDreamluxRestProxy } from "./testing/dreamlux-rest-proxy";
import { loadPayrollApiRuntime } from "./testing/payroll-api-runtime";

const enabled = !!process.env.DREAMLUX_NATIVE_TEST_ADMIN_URL;
const nativeTest = enabled ? test : test.skip;
const browserMode = process.env.DREAMLUX_NATIVE_BROWSER_SERVER === "1";
const browserKey = randomBytes(24).toString("hex");
let stopBrowser!: () => void;
const browserStopped = new Promise<void>((resolve) => { stopBrowser = resolve; });
let browserDescriptor: string | undefined;
const actorId = "23900000-0000-4000-8000-000000000001";
const readerId = "23900000-0000-4000-8000-000000000002";
const writerRoleId = "23900000-0000-4000-8000-000000000003";
const readerRoleId = "23900000-0000-4000-8000-000000000004";
const levelId = "23900000-0000-4000-8000-000000000005";
const plannerId = "23900000-0000-4000-8000-000000000006";
const leaderId = "23900000-0000-4000-8000-000000000007";
const eventTypeId = "23900000-0000-4000-8000-000000000008";
const trainingTypeId = "23900000-0000-4000-8000-000000000009";
const eventId = "23900000-0000-4000-8000-000000000010";
const trainingId = "23900000-0000-4000-8000-000000000011";
const period = { month: 4, year: 2026, period_kind: "month" };
let observer: Client | undefined;
let appPool: Pool | undefined;
let server: Server | undefined;
let proxy: Awaited<ReturnType<typeof startDreamluxRestProxy>> | undefined;
let writerCookie = "";
let readerCookie = "";
let restoreNotice: (() => void) | undefined;
let invalidatePermissions: (() => void) | undefined;
let notificationFailure = false;
let notificationCount = 0;

function database() {
  if (!observer) throw new Error("Independent DreamLux database is not ready");
  return observer;
}

function http() {
  if (!server) throw new Error("Independent DreamLux payroll API is not ready");
  return request(server);
}

async function login(username: string, password: string) {
  const result = await http().post("/auth/login").send({ username, password });
  expect(result.status).toBe(200);
  const cookies: unknown = result.headers["set-cookie"];
  if (!Array.isArray(cookies) || !cookies.every((value): value is string => typeof value === "string")) {
    throw new Error("DreamLux native login did not return session cookies");
  }
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

beforeAll(async () => {
  if (!enabled) return;
  expect(process.env.NODE_ENV).toBe("development");
  const target = attestDreamluxNativeTarget(process.env.DATABASE_URL ?? "", "fixture");
  if (Reflect.get(globalThis, "__mockSupabase")) throw new Error("Native QA cannot use mocked Supabase clients");
  observer = new Client({ connectionString: target.href, ssl: { rejectUnauthorized: false } });
  await observer.connect();
  const identity = await observer.query<{ name: string; actor: string; port: number }>(
    "select current_database() as name,current_user as actor,inet_server_port() as port",
  );
  expect(identity.rows).toEqual([{ name: target.pathname.slice(1), actor: "dreamlux_parity", port: 55434 }]);
  await observer.query(
    `truncate roles,permissions,users,employees,salary_levels,event_types,events,payroll_runs cascade;
     insert into roles(id,name,permissions) values
       ('${writerRoleId}','SYNTHETIC_PAYROLL_WRITER_239','{"payroll":["read","write"]}'),
       ('${readerRoleId}','SYNTHETIC_PAYROLL_READER_239','{"payroll":["read"]}');
     insert into permissions(slug,description) values
       ('payroll:read','Synthetic payroll read'),('payroll:write','Synthetic payroll write');
     insert into role_permissions(role_id,permission_id)
       select r.id,p.id from roles r cross join permissions p
        where r.id='${writerRoleId}' or p.slug='payroll:read';`,
  );
  const password = randomBytes(24).toString("base64url");
  await observer.query(
    `insert into users(id,username,password_hash,full_name,role_id) values
       ($1,'synthetic.payroll.writer.239',crypt($5,gen_salt('bf')),'Synthetic payroll writer',$3),
       ($2,'synthetic.payroll.reader.239',crypt($5,gen_salt('bf')),'Synthetic payroll reader',$4)`,
    [actorId, readerId, writerRoleId, readerRoleId, password],
  );
  // Amounts are the DreamLux DOCX Planner/Store Keeper and Team Leader event/training anchors.
  await observer.query("insert into salary_levels(id,code,amount_etb) values($1,'QA-PLANNER-239',14500)", [levelId]);
  await observer.query(
    `insert into employees(id,employee_id,full_name,salary_level,salary_level_id,base_salary,compensation_mode,position)
     values($1,'QA-239-PLANNER','Synthetic payroll planner','QA-PLANNER-239',$3,10000,'regular','Planner'),
           ($2,'QA-239-LEADER','Synthetic payroll team leader','QA-PLANNER-239',$3,10000,'commission_only','Team Leader')`,
    [plannerId, leaderId, levelId],
  );
  await observer.query(
    `insert into event_types(id,name) values($1,'Synthetic event 239'),($2,'Synthetic training 239')`,
    [eventTypeId, trainingTypeId],
  );
  await observer.query(
    `insert into events(id,name,client_name,start_date,end_date,venue_location,event_type_id,status)
     values($1,'Synthetic event 239','Synthetic client','2026-04-08','2026-04-08','Synthetic venue',$3,'Completed'),
           ($2,'Synthetic training 239','Synthetic client','2026-04-09','2026-04-09','Synthetic venue',$4,'Completed')`,
    [eventId, trainingId, eventTypeId, trainingTypeId],
  );
  await observer.query(
    `insert into event_assignments(event_id,employee_id,role,commission_amount,attended)
     values($1,$3,'Team Leader',2000,true),($2,$3,'Team Leader training',500,true)`,
    [eventId, trainingId, leaderId],
  );
  proxy = await startDreamluxRestProxy();
  const runtime = await loadPayrollApiRuntime();
  invalidatePermissions = runtime.invalidatePermissionCache;
  const { NotificationsService } = runtime;
  const notice = spyOn(NotificationsService, "emitNotificationToRoleOrPermission").mockImplementation(async () => {
    notificationCount += 1;
    if (notificationFailure) throw new Error("Synthetic notification delivery failure");
    return 0;
  });
  restoreNotice = () => notice.mockRestore();
  const app = express();
  app.use(express.json());
  if (browserMode) {
    app.post("/__qa/shutdown", (req, res) => {
      if (req.header("x-dreamlux-fixture-key") !== browserKey) {
        res.sendStatus(403);
        return;
      }
      res.sendStatus(204);
      stopBrowser();
    });
    app.post("/__qa/payroll-read", async (req, res) => {
      if (req.header("x-dreamlux-fixture-key") !== browserKey) {
        res.sendStatus(403);
        return;
      }
      if (typeof req.body?.enabled !== "boolean") {
        res.sendStatus(400);
        return;
      }
      try {
        await database().query("begin");
        await database().query(
          "update roles set permissions=$1::jsonb where id=$2",
          [JSON.stringify({ payroll: req.body.enabled ? ["read", "write"] : ["write"] }), writerRoleId],
        );
        if (req.body.enabled) {
          await database().query(
            "insert into role_permissions(role_id,permission_id) select $1,id from permissions where slug='payroll:read' on conflict do nothing",
            [writerRoleId],
          );
        } else {
          await database().query(
            "delete from role_permissions where role_id=$1 and permission_id in (select id from permissions where slug='payroll:read')",
            [writerRoleId],
          );
        }
        await database().query("commit");
        runtime.invalidatePermissionCache();
        res.sendStatus(204);
      } catch (error) {
        await database().query("rollback");
        console.error("Synthetic permission fixture update failed", error);
        res.sendStatus(500);
      }
    });
  }
  app.use("/auth", runtime.authRouter);
  app.use("/payroll", runtime.requireAuth, runtime.payrollRouter);
  appPool = runtime.pool;
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(browserMode ? 5326 : 0, "127.0.0.1", resolve);
  });
  writerCookie = await login("synthetic.payroll.writer.239", password);
  readerCookie = await login("synthetic.payroll.reader.239", password);
}, 30_000);

afterAll(async () => {
  restoreNotice?.();
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  await appPool?.end();
  await observer?.end();
  await proxy?.close();
  if (browserDescriptor) await unlink(browserDescriptor);
});

beforeEach(async () => {
  if (!observer) return;
  notificationCount = 0;
  notificationFailure = false;
  await observer.query(
    `truncate payroll_runs,activity_logs cascade;
     update salary_levels set amount_etb=14500,deleted_at=null,is_active=true where id='${levelId}';
     update employees set salary_level='QA-PLANNER-239',salary_level_id='${levelId}',base_salary=10000,
       deleted_at=null,compensation_mode=case when id='${plannerId}' then 'regular' else 'commission_only' end;
     update events set deleted_at=null;
     update event_assignments set attended=true,
       commission_amount=case when event_id='${eventId}' then 2000 else 500 end;`,
  );
});

async function createRun(path: "drafts" | "runs" = "drafts", payload: object = period) {
  const response = await http().post(`/payroll/${path}`).set("Cookie", writerCookie).send(payload);
  expect(response.status).toBe(201);
  const id: unknown = response.body.id;
  if (typeof id !== "string") throw new Error("Expected a persisted DreamLux payroll identifier");
  return id;
}

async function counts() {
  const result = await database().query<{
    runs: number; lines: number; events: number; audits: number; finalized: number;
  }>(`select
    (select count(*)::int from payroll_runs) as runs,
    (select count(*)::int from payroll_run_employee_lines) as lines,
    (select count(*)::int from payroll_run_line_events) as events,
    (select count(*)::int from payroll_audit_logs) as audits,
    (select count(*)::int from payroll_runs where status='finalized' and deleted_at is null) as finalized`);
  return result.rows[0];
}

async function snapshot(id: string) {
  const result = await database().query<{
    status: string; period_kind: string; period_start: string; period_end: string; title: string;
    deleted_at: string | null; finalized_at: string | null; updated_at: string; total: string;
    lines: Array<{ id: string; employee_id: string; base: string; commission: string; total: string; mode: string }>;
  }>(
    `select status,period_kind,period_start::text,period_end::text,title,
            deleted_at::text,finalized_at::text,updated_at::text,
            coalesce((select sum(employee_total_snapshot) from payroll_run_employee_lines where run_id=$1),0)::text as total,
            coalesce((select jsonb_agg(jsonb_build_object(
              'id',id,'employee_id',employee_id,'base',base_salary_snapshot::text,
              'commission',commission_total_snapshot::text,'total',employee_total_snapshot::text,
              'mode',compensation_mode_snapshot) order by employee_id)
              from payroll_run_employee_lines where run_id=$1),'[]') as lines
       from payroll_runs where id=$1`,
    [id],
  );
  if (!result.rows[0]) throw new Error("Expected a persisted synthetic DreamLux payroll run");
  return result.rows[0];
}

async function withWriteFailure(
  table: "payroll_run_employee_lines" | "payroll_run_line_events" | "payroll_audit_logs" | "activity_logs",
  operation: () => Promise<void>,
  silentlySkip = false,
) {
  await database().query(
    `create function dreamlux_payroll_write_failure_239() returns trigger language plpgsql as $$
       begin ${silentlySkip ? "return null;" : "raise exception 'Synthetic DreamLux payroll write failure';"} end $$;
     create trigger dreamlux_payroll_write_failure_239 before insert on ${table}
       for each row execute function dreamlux_payroll_write_failure_239()`,
  );
  try {
    await operation();
  } finally {
    await database().query(`drop trigger dreamlux_payroll_write_failure_239 on ${table}; drop function dreamlux_payroll_write_failure_239()`);
  }
}

async function waitForBlockedSessions(minimum: number) {
  const deadline = Date.now() + 4_000;
  let blocked = 0;
  // Bounded polling observes the fixture barrier, not per-record production work.
  while (blocked < minimum && Date.now() < deadline) {
    await database().query("select pg_stat_clear_snapshot()");
    blocked = (await database().query<{ count: number }>(
      `select count(*)::int from pg_locks where not granted and pid in
         (select pid from pg_stat_activity where datname=current_database())`,
    )).rows[0].count;
    if (blocked < minimum) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect(blocked).toBeGreaterThanOrEqual(minimum);
}

async function concurrentPublications(draftId?: string) {
  await database().query(
    `create function dreamlux_publication_barrier_239() returns trigger language plpgsql as $$
       begin if new.status='finalized' then perform pg_advisory_xact_lock(239,239); end if; return new; end $$;
     create trigger dreamlux_publication_barrier_239 before insert or update on payroll_runs
       for each row execute function dreamlux_publication_barrier_239()`,
  );
  await database().query("begin");
  await database().query("select pg_advisory_xact_lock(239,239)");
  let holding = true;
  const first = http().post("/payroll/runs").set("Cookie", writerCookie).send(period);
  const second = draftId
    ? http().patch(`/payroll/runs/${draftId}/status`).set("Cookie", writerCookie).send({ status: "FINALIZED" })
    : http().post("/payroll/runs").set("Cookie", writerCookie).send(period);
  const pending = Promise.all([first, second]);
  try {
    await waitForBlockedSessions(2);
    await database().query("commit");
    holding = false;
    return await pending;
  } finally {
    if (holding) await database().query("rollback");
    await Promise.allSettled([pending]);
    await database().query("drop trigger dreamlux_publication_barrier_239 on payroll_runs; drop function dreamlux_publication_barrier_239()");
  }
}

async function withLostAcknowledgement(command: "COMMIT" | "ROLLBACK", operation: (probe: {
  commitAttempts: () => number;
  waitForDiscard: () => Promise<void>;
}) => Promise<void>) {
  if (!appPool || !proxy) throw new Error("The real database/REST clients are not ready");
  const descriptors = new Map<PoolClient, PropertyDescriptor | undefined>();
  let lostNativeReplies = 0;
  let commitAttempts = 0;
  let lostClient: PoolClient | undefined;
  let resolveDiscard!: () => void;
  const discarded = new Promise<void>((resolve) => { resolveDiscard = resolve; });
  const removed = (client: PoolClient) => {
    if (client === lostClient) resolveDiscard();
  };
  const acquire = (client: PoolClient) => {
    if (descriptors.has(client)) return;
    descriptors.set(client, Object.getOwnPropertyDescriptor(client, "query"));
    const original = client.query;
    Object.defineProperty(client, "query", {
      configurable: true,
      writable: true,
      value: function (this: PoolClient, ...args: unknown[]) {
        const statement = typeof args[0] === "string" ? args[0].trim().toUpperCase() : "";
        if (statement === "COMMIT") commitAttempts += 1;
        if (command === "ROLLBACK" && statement === command && !lostNativeReplies) {
          lostNativeReplies += 1;
          lostClient = client;
          throw new Error("Synthetic unavailable DreamLux ROLLBACK connection");
        }
        const result = Reflect.apply(original, this, args);
        if (statement === command && !lostNativeReplies) {
          return Promise.resolve(result).then(() => {
            lostNativeReplies += 1;
            lostClient = client;
            throw new Error(`Synthetic lost DreamLux ${command} acknowledgement`);
          });
        }
        return result;
      },
    });
  };
  appPool.on("acquire", acquire);
  appPool.on("remove", removed);
  if (command === "COMMIT") proxy.dropNextRunAcknowledgement();
  try {
    await operation({
      commitAttempts: () => commitAttempts,
      async waitForDiscard() {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            discarded,
            new Promise<void>((_, reject) => {
              timeout = setTimeout(() => reject(new Error("Failed rollback connection was not discarded")), 3_000);
            }),
          ]);
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      },
    });
    expect(lostNativeReplies + proxy.clearLostAcknowledgement()).toBe(1);
  } finally {
    appPool.off("acquire", acquire);
    appPool.off("remove", removed);
    proxy.clearLostAcknowledgement();
    for (const [client, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(client, "query", descriptor);
      else Reflect.deleteProperty(client, "query");
    }
  }
}

if (browserMode) nativeTest("serves the isolated browser payroll fixture", async () => {
  const descriptor = process.env.DREAMLUX_NATIVE_BROWSER_DESCRIPTOR;
  if (!descriptor) throw new Error("The browser fixture needs its explicit private descriptor path");
  if (await Bun.file(descriptor).exists()) throw new Error("Refusing to overwrite a previous browser fixture descriptor");
  await database().query(
    "insert into app_settings(id,payroll_cycle,payroll_calendar_type) values(1,'weekly','gregorian') on conflict(id) do update set payroll_cycle='weekly',payroll_calendar_type='gregorian'",
  );
  await Bun.write(descriptor, JSON.stringify({
    apiOrigin: "http://127.0.0.1:5326",
    writerCookie,
    readerCookie,
    shutdownKey: browserKey,
    database: attestDreamluxNativeTarget(process.env.DATABASE_URL ?? "", "fixture").pathname.slice(1),
  }));
  browserDescriptor = descriptor;
  console.log("[native DreamLux] Browser payroll fixture is ready on loopback5326; private credentials are not logged.");
  await browserStopped;
}, 3_600_000);

if (!browserMode) describe("independent DreamLux payroll API and PostgreSQL", () => {
  nativeTest("previews SRD salary and attended commissions without writing or trusting client event overrides", async () => {
    const response = await http().post("/payroll/preview").set("Cookie", writerCookie).send({
      ...period,
      employeeLineEvents: [{ employee_id: leaderId, events: [{ event_type_id: eventTypeId, quantity: 9, price_override: 70000 }] }],
    });
    expect(response.status).toBe(200);
    expect(response.body.total_payroll_value).toBe(17000);
    expect(response.body.employee_lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ employee_id: plannerId, snapshot_base_salary: 14500, total_events_value: 0 }),
      expect.objectContaining({ employee_id: leaderId, snapshot_base_salary: 0, total_events_value: 2500 }),
    ]));
    expect(await counts()).toEqual({ runs: 0, lines: 0, events: 0, audits: 0, finalized: 0 });
  });

  nativeTest("publishes complete current employee, event and financial audit snapshots", async () => {
    const id = await createRun("runs");
    expect(await counts()).toEqual({ runs: 1, lines: 2, events: 2, audits: 1, finalized: 1 });
    expect(await snapshot(id)).toMatchObject({ status: "finalized", total: "17000.00" });
    const audit = await database().query(
      "select user_id,action,total_payroll_snapshot::text,employee_count from payroll_audit_logs where payroll_run_id=$1",
      [id],
    );
    expect(audit.rows).toEqual([{ user_id: actorId, action: "finalized", total_payroll_snapshot: "17000.00", employee_count: 2 }]);
  });

  nativeTest("uses the authenticated actor rather than a submitted creator identity", async () => {
    const id = await createRun("runs", { ...period, created_by_user_id: readerId });
    const created = await database().query(
      "select created_by,(select user_id from payroll_audit_logs where payroll_run_id=$1 limit 1) as audit_actor from payroll_runs where id=$1",
      [id],
    );
    expect(created.rows).toEqual([{ created_by: actorId, audit_actor: actorId }]);
  });

  nativeTest("replaces a draft from current values without duplicating its header", async () => {
    const id = await createRun();
    await database().query("update salary_levels set amount_etb=35000 where id=$1", [levelId]);
    expect(await createRun()).toBe(id);
    expect(await snapshot(id)).toMatchObject({ status: "draft", total: "37500.00" });
    expect(await counts()).toEqual({ runs: 1, lines: 2, events: 2, audits: 2, finalized: 0 });
  });

  nativeTest("detail finalization uses current compensation and attendance rather than stale draft snapshots", async () => {
    const id = await createRun();
    await database().query("update employees set compensation_mode='commission_only' where id=$1", [plannerId]);
    await database().query("update event_assignments set attended=false where event_id=$1", [trainingId]);
    const response = await http().patch(`/payroll/runs/${id}/status`).set("Cookie", writerCookie).send({ status: "FINALIZED" });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("FINALIZED");
    expect(await snapshot(id)).toMatchObject({ status: "finalized", total: "2000.00" });
    expect((await counts()).events).toBe(1);
    expect((await counts()).audits).toBe(2);
  });

  nativeTest("reads coherent current salaries and attendance after waiting for a writer lock", async () => {
    const id = await createRun();
    await database().query("begin");
    await database().query("select id from payroll_runs where id=$1 for update", [id]);
    let holding = true;
    const publication = http().patch(`/payroll/runs/${id}/status`).set("Cookie", writerCookie)
      .send({ status: "FINALIZED" }).then((response) => response);
    try {
      await waitForBlockedSessions(1);
      await database().query("update salary_levels set amount_etb=35000 where id=$1", [levelId]);
      await database().query("update event_assignments set attended=false where event_id=$1", [trainingId]);
      await database().query("commit");
      holding = false;
      expect((await publication).status).toBe(200);
      expect(await snapshot(id)).toMatchObject({ total: "37000.00" });
    } finally {
      if (holding) await database().query("rollback");
      await Promise.allSettled([publication]);
    }
  });

  nativeTest("an optional notification failure does not change the acknowledged finalized payroll", async () => {
    const id = await createRun();
    notificationFailure = true;
    const response = await http().patch(`/payroll/runs/${id}/status`).set("Cookie", writerCookie).send({ status: "FINALIZED" });
    expect(response.status).toBe(200);
    expect(await snapshot(id)).toMatchObject({ status: "finalized", total: "17000.00" });
    expect(notificationCount).toBe(1);
    const repeat = await http().patch(`/payroll/runs/${id}/status`).set("Cookie", writerCookie).send({ status: "FINALIZED" });
    expect(repeat.status).toBe(200);
    expect(notificationCount).toBe(1);
  });

  nativeTest.each([
    { label: "omitted kind", input: {}, kind: "month", start: "2026-04-01", end: "2026-04-30" },
    { label: "explicit H1", input: { period_kind: "half_month" }, kind: "half_month", start: "2026-04-01", end: "2026-04-15" },
    { label: "explicit H2", input: { period_kind: "half_month", period_start: "2026-04-16" }, kind: "half_month", start: "2026-04-16", end: "2026-04-30" },
    { label: "weekly", input: { period_kind: "weekly", period_start: "2026-04-06", period_end: "2026-04-30" }, kind: "weekly", start: "2026-04-06", end: "2026-04-12" },
    { label: "range", input: { period_kind: "range", period_start: "2026-04-02", period_end: "2026-04-28" }, kind: "range", start: "2026-04-02", end: "2026-04-28" },
    { label: "explicit month", input: { period_kind: "month" }, kind: "month", start: "2026-04-01", end: "2026-04-30" },
  ])("preserves DreamLux canonical period resolution for $label", async ({ input, kind, start, end }) => {
    const id = await createRun("drafts", { month: 4, year: 2026, ...input });
    expect(await snapshot(id)).toMatchObject({ period_kind: kind, period_start: start, period_end: end });
  });

  nativeTest("retains the direct publication route's full-month default when kind is omitted", async () => {
    const id = await createRun("runs", { month: 4, year: 2026 });
    expect(await snapshot(id)).toMatchObject({ period_kind: "month", period_start: "2026-04-01", period_end: "2026-04-30" });
  });

  nativeTest("retains the preview route's default inclusion of second-half attended work", async () => {
    await database().query("update events set start_date='2026-04-20',end_date='2026-04-20' where id=$1", [trainingId]);
    try {
      const response = await http().post("/payroll/preview").set("Cookie", writerCookie).send({ month: 4, year: 2026 });
      expect(response.status).toBe(200);
      expect(response.body.total_payroll_value).toBe(17000);
      expect((await counts()).runs).toBe(0);
    } finally {
      await database().query("update events set start_date='2026-04-09',end_date='2026-04-09' where id=$1", [trainingId]);
    }
  });

  nativeTest("retains code-based fallback pay and commission-only zero base", async () => {
    await database().query("update employees set salary_level='UNMAPPED-SYNTHETIC-239' where id=$1", [plannerId]);
    const id = await createRun("runs");
    expect(await snapshot(id)).toMatchObject({ total: "12500.00" });
  });

  nativeTest("denies missing authentication and read-only actors before any write", async () => {
    const id = await createRun();
    const before = await snapshot(id);
    expect((await http().post("/payroll/runs").send(period)).status).toBe(401);
    expect((await http().post("/payroll/drafts").set("Cookie", readerCookie).send(period)).status).toBe(403);
    expect((await http().post("/payroll/runs").set("Cookie", readerCookie).send(period)).status).toBe(403);
    expect((await http().patch(`/payroll/runs/${id}/status`).set("Cookie", readerCookie).send({ status: "FINALIZED" })).status).toBe(403);
    expect(await snapshot(id)).toEqual(before);
  });

  nativeTest.each([
    { table: "employees", column: "full_name" },
    { table: "salary_levels", column: "amount_etb" },
    { table: "event_types", column: "name" },
  ])("refuses publication when required $table data cannot be read", async ({ table, column }) => {
    await database().query(`alter table ${table} rename column ${column} to unavailable_dreamlux_column_239`);
    try {
      const response = await http().post("/payroll/runs").set("Cookie", writerCookie).send(period);
      expect(response.status).toBe(500);
      expect(await counts()).toEqual({ runs: 0, lines: 0, events: 0, audits: 0, finalized: 0 });
    } finally {
      await database().query(`alter table ${table} rename column unavailable_dreamlux_column_239 to ${column}`);
    }
  });

  nativeTest.each([
    { table: "payroll_run_employee_lines" as const },
    { table: "payroll_run_line_events" as const },
    { table: "payroll_audit_logs" as const },
  ])("rolls back the complete publication when $table rejects a write", async ({ table }) => {
    await withWriteFailure(table, async () => {
      const response = await http().post("/payroll/runs").set("Cookie", writerCookie).send(period);
      expect(response.status).toBe(500);
      expect(await counts()).toEqual({ runs: 0, lines: 0, events: 0, audits: 0, finalized: 0 });
    });
  });

  nativeTest.each([
    { table: "payroll_run_employee_lines" as const },
    { table: "payroll_run_line_events" as const },
    { table: "payroll_audit_logs" as const },
  ])("does not claim success when $table silently omits required rows", async ({ table }) => {
    await withWriteFailure(table, async () => {
      const response = await http().post("/payroll/runs").set("Cookie", writerCookie).send(period);
      expect(response.status).toBe(500);
      expect(await counts()).toEqual({ runs: 0, lines: 0, events: 0, audits: 0, finalized: 0 });
    }, true);
  });

  nativeTest("retains the original draft when replacement snapshot insertion fails", async () => {
    const id = await createRun();
    const before = await snapshot(id);
    const beforeCounts = await counts();
    await database().query("update salary_levels set amount_etb=35000 where id=$1", [levelId]);
    await withWriteFailure("payroll_run_employee_lines", async () => {
      const response = await http().post("/payroll/drafts").set("Cookie", writerCookie).send(period);
      expect(response.status).toBe(500);
      expect(await snapshot(id)).toEqual(before);
      expect(await counts()).toEqual(beforeCounts);
    });
  });

  nativeTest("keeps a draft unpublished if its required financial audit fails", async () => {
    const id = await createRun();
    const before = await snapshot(id);
    await withWriteFailure("payroll_audit_logs", async () => {
      const response = await http().patch(`/payroll/runs/${id}/status`).set("Cookie", writerCookie).send({ status: "FINALIZED" });
      expect(response.status).toBe(500);
      expect(await snapshot(id)).toEqual(before);
      expect((await counts()).finalized).toBe(0);
    });
  });

  nativeTest("coordinates two simultaneous direct publications for the exact same period", async () => {
    const responses = await concurrentPublications();
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect((await counts()).finalized).toBe(1);
  });

  nativeTest("coordinates direct publication with simultaneous detail finalization", async () => {
    const id = await createRun();
    const responses = await concurrentPublications(id);
    expect(responses.filter(({ status }) => status === 200 || status === 201)).toHaveLength(1);
    expect(responses.filter(({ status }) => status === 409)).toHaveLength(1);
    expect((await counts()).finalized).toBe(1);
  });

  nativeTest("does not overwrite active finalized history on either publication entry point", async () => {
    const id = await createRun("runs");
    const before = await snapshot(id);
    await database().query("update salary_levels set amount_etb=35000 where id=$1", [levelId]);
    const duplicate = await http().post("/payroll/runs").set("Cookie", writerCookie).send(period);
    expect(duplicate.status).toBe(409);
    const repeat = await http().patch(`/payroll/runs/${id}/status`).set("Cookie", writerCookie).send({ status: "FINALIZED" });
    expect(repeat.status).toBe(200);
    expect(await snapshot(id)).toEqual(before);
    expect((await counts()).audits).toBe(1);
  });

  nativeTest("a draft save queued behind finalization creates a new draft instead of downgrading published history", async () => {
    const id = await createRun();
    await database().query("begin");
    await database().query("select id from payroll_runs where id=$1 for update", [id]);
    let holding = true;
    const publication = http().patch(`/payroll/runs/${id}/status`).set("Cookie", writerCookie)
      .send({ status: "FINALIZED" }).then((response) => response);
    let draft: Promise<request.Response> | undefined;
    try {
      await waitForBlockedSessions(1);
      draft = http().post("/payroll/drafts").set("Cookie", writerCookie).send(period).then((response) => response);
      await waitForBlockedSessions(2);
      await database().query("commit");
      holding = false;
      expect((await publication).status).toBe(200);
      const saved = await draft;
      expect(saved.status).toBe(201);
      expect(saved.body.id).not.toBe(id);
      expect((await snapshot(id)).status).toBe("finalized");
      expect((await counts()).finalized).toBe(1);
    } finally {
      if (holding) await database().query("rollback");
      await Promise.allSettled([publication, ...(draft ? [draft] : [])]);
    }
  });

  nativeTest("retains explicit flag, trash and restore-to-draft controls without rewriting snapshots", async () => {
    const id = await createRun("runs");
    const before = (await snapshot(id)).lines;
    for (const status of ["FLAGGED_WRONG", "TRASH", "DRAFT"]) {
      const result = await http().patch(`/payroll/runs/${id}/status`).set("Cookie", writerCookie).send({ status });
      expect(result.status).toBe(200);
      expect(result.body.status).toBe(status);
      expect((await snapshot(id)).lines).toEqual(before);
    }
    expect(await snapshot(id)).toMatchObject({ status: "draft", deleted_at: null });
  });

  nativeTest("retains legitimate empty payrolls without manufacturing employees", async () => {
    await database().query("update employees set deleted_at=now()");
    const response = await http().post("/payroll/runs").set("Cookie", writerCookie).send(period);
    expect(response.status).toBe(201);
    expect(response.body.employee_count).toBe(0);
    expect(response.body.total_payroll_value).toBe(0);
    expect(await counts()).toEqual({ runs: 1, lines: 0, events: 0, audits: 1, finalized: 1 });
  });

  nativeTest("keeps replacement runs and audit evidence across soft and permanent deletion", async () => {
    const original = await createRun("runs");
    expect((await http().delete(`/payroll/runs/${original}`).set("Cookie", writerCookie)).status).toBe(200);
    expect((await snapshot(original)).deleted_at).not.toBeNull();
    const replacement = await createRun("runs");
    expect((await http().delete(`/payroll/runs/${original}/permanent`).set("Cookie", writerCookie)).status).toBe(200);
    expect(await counts()).toEqual({ runs: 1, lines: 2, events: 2, audits: 4, finalized: 1 });
    expect(await snapshot(replacement)).toMatchObject({ status: "finalized", total: "17000.00" });
  });

  nativeTest("rolls back deletion when its required financial audit cannot be stored", async () => {
    const id = await createRun("runs");
    const before = await snapshot(id);
    await withWriteFailure("payroll_audit_logs", async () => {
      expect((await http().delete(`/payroll/runs/${id}`).set("Cookie", writerCookie)).status).toBe(500);
      expect(await snapshot(id)).toEqual(before);
      expect((await http().delete(`/payroll/runs/${id}/permanent`).set("Cookie", writerCookie)).status).toBe(500);
      expect(await snapshot(id)).toEqual(before);
    });
  });

  nativeTest("rolls back status changes when their activity audit fails", async () => {
    const id = await createRun("runs");
    const before = await snapshot(id);
    await withWriteFailure("activity_logs", async () => {
      const response = await http().patch(`/payroll/runs/${id}/status`).set("Cookie", writerCookie).send({ status: "FLAGGED_WRONG" });
      expect(response.status).toBe(500);
      expect(await snapshot(id)).toEqual(before);
    });
  });

  nativeTest.each([
    { start: "2026-04-30", end: "2026-04-01" },
    { start: "2026-02-30", end: "2026-03-02" },
  ])("rejects invalid ranges $start through $end without persistence", async ({ start, end }) => {
    const response = await http().post("/payroll/runs").set("Cookie", writerCookie)
      .send({ period_kind: "range", period_start: start, period_end: end });
    expect(response.status).toBe(400);
    expect((await counts()).runs).toBe(0);
  });

  nativeTest("reports an absent run instead of a status-change success", async () => {
    const response = await http().patch(`/payroll/runs/${crypto.randomUUID()}/status`)
      .set("Cookie", writerCookie).send({ status: "FINALIZED" });
    expect(response.status).toBe(404);
  });

  nativeTest("distinguishes a lost commit acknowledgement from a confirmed rollback", async () => {
    await withLostAcknowledgement("COMMIT", async () => {
      const response = await http().post("/payroll/runs").set("Cookie", writerCookie).send(period);
      expect(response.status).toBe(503);
      expect(response.body.outcome_uncertain).toBe(true);
      expect(response.body.error).toMatch(/reload/i);
      expect(await counts()).toEqual({ runs: 1, lines: 2, events: 2, audits: 1, finalized: 1 });
    });
  });

  nativeTest("discards an unreachable pre-commit rollback connection and permits a safe manual retry", async () => {
    await withWriteFailure("payroll_run_employee_lines", async () => {
      await withLostAcknowledgement("ROLLBACK", async (probe) => {
        const response = await http().post("/payroll/runs").set("Cookie", writerCookie).send(period);
        expect(response.status).toBe(500);
        expect(probe.commitAttempts()).toBe(0);
        await probe.waitForDiscard();
        expect(await counts()).toEqual({ runs: 0, lines: 0, events: 0, audits: 0, finalized: 0 });
      });
    });
    const retry = await createRun("runs");
    expect(await snapshot(retry)).toMatchObject({ status: "finalized", total: "17000.00" });
  });

  nativeTest("publishes all five thousand employees within the native budget", async () => {
    await database().query(
      `insert into employees(employee_id,full_name,salary_level,base_salary,compensation_mode)
       select 'QA-239-SCALE-'||i::text,'Synthetic scale payroll '||i::text,'QA-PLANNER-239',10000,'regular'
         from generate_series(1,4998) i`,
    );
    try {
      const started = performance.now();
      const id = await createRun("runs");
      const duration = performance.now() - started;
      const result = await counts();
      expect(result.lines).toBe(5000);
      expect(result.audits).toBe(1);
      expect(Number((await snapshot(id)).total)).toBe(4999 * 14500 + 2500);
      expect(duration).toBeLessThan(10_000);
      console.log(`[native DreamLux] Complete 5000-employee publication: ${duration.toFixed(1)}ms`);
    } finally {
      await database().query("delete from employees where employee_id like 'QA-239-SCALE-%'");
    }
  });
});

if (!browserMode) describe("authoritative DreamLux preview read contract", () => {
  nativeTest.each([
    { label: "monthly", input: { period_kind: "month" }, kind: "month", start: "2026-04-01", end: "2026-04-30" },
    { label: "omitted kind", input: { period_kind: undefined }, kind: "month", start: "2026-04-01", end: "2026-04-30" },
    { label: "first half", input: { period_kind: "half_month", period_start: "2026-04-01" }, kind: "half_month", start: "2026-04-01", end: "2026-04-15" },
    { label: "second half", input: { period_kind: "half_month", period_start: "2026-04-16" }, kind: "half_month", start: "2026-04-16", end: "2026-04-30" },
    { label: "canonical week", input: { period_kind: "weekly", period_start: "2026-04-08", period_end: "2026-04-30" }, kind: "weekly", start: "2026-04-08", end: "2026-04-14" },
    { label: "explicit range", input: { period_kind: "range", period_start: "2026-04-02", period_end: "2026-04-28" }, kind: "range", start: "2026-04-02", end: "2026-04-28" },
  ])("returns the server-resolved $label period without writing payroll", async ({ input, kind, start, end }) => {
    const response = await http().post("/payroll/preview").set("Cookie", readerCookie).send({ ...period, ...input });
    expect(response.status).toBe(200);
    expect(await counts()).toEqual({ runs: 0, lines: 0, events: 0, audits: 0, finalized: 0 });
    expect(response.body).toMatchObject({ period_kind: kind, period_start: start, period_end: end });
  });

  nativeTest("returns current employee codes rather than historical or client-provided identities", async () => {
    await database().query("update employees set employee_id='QA-233-PLANNER-UPDATED' where id=$1", [plannerId]);
    try {
      const response = await http().post("/payroll/preview").set("Cookie", readerCookie).send({
        ...period, employeeLineEvents: [{ employee_id: plannerId, employee_code_snapshot: "UNTRUSTED", events: [] }],
      });
      expect(response.status).toBe(200);
      expect(await counts()).toEqual({ runs: 0, lines: 0, events: 0, audits: 0, finalized: 0 });
      expect(response.body.employee_lines).toEqual(expect.arrayContaining([
        expect.objectContaining({ employee_id: plannerId, employee_code_snapshot: "QA-233-PLANNER-UPDATED", snapshot_base_salary: 14500 }),
        expect.objectContaining({ employee_id: leaderId, employee_code_snapshot: "QA-239-LEADER", snapshot_base_salary: 0, total_events_value: 2500 }),
      ]));
    } finally {
      await database().query("update employees set employee_id='QA-239-PLANNER' where id=$1", [plannerId]);
    }
  });

  nativeTest("a legacy blank employee code remains a read-only UUID-identifiable preview", async () => {
    await database().query("update employees set employee_id='' where id=$1", [plannerId]);
    try {
      const response = await http().post("/payroll/preview").set("Cookie", readerCookie).send(period);
      expect(response.status).toBe(200);
      expect(response.body.employee_lines).toEqual(expect.arrayContaining([
        expect.objectContaining({ employee_id: plannerId, employee_code_snapshot: null, snapshot_base_salary: 14500 }),
      ]));
      expect(await counts()).toEqual({ runs: 0, lines: 0, events: 0, audits: 0, finalized: 0 });
    } finally {
      await database().query("update employees set employee_id='QA-239-PLANNER' where id=$1", [plannerId]);
    }
  });

  nativeTest("new preview identity metadata does not change saved-line mappings", async () => {
    const response = await http().post("/payroll/preview").set("Cookie", writerCookie).send(period);
    expect(response.status).toBe(200);
    expect((await counts()).runs).toBe(0);
    const id = await createRun();
    const persisted = await database().query(
      "select employee_id,employee_code_snapshot from payroll_run_employee_lines where run_id=$1 order by employee_id",
      [id],
    );
    expect(persisted.rows).toEqual([
      { employee_id: plannerId, employee_code_snapshot: null },
      { employee_id: leaderId, employee_code_snapshot: null },
    ]);
  });

  nativeTest("a 250-person preview returns the whole roster without creating a saved payroll", async () => {
    await database().query(
      `insert into employees(employee_id,full_name,salary_level,base_salary,compensation_mode)
       select 'QA-233-ROSTER-'||i::text,'Synthetic preview employee '||i::text,'QA-PLANNER-239',10000,'regular'
         from generate_series(1,248) i`,
    );
    try {
      const response = await http().post("/payroll/preview").set("Cookie", readerCookie).send(period);
      expect(response.status).toBe(200);
      expect(response.body.employee_lines).toHaveLength(250);
      expect(response.body.total_payroll_value).toBe(249 * 14500 + 2500);
      expect(await counts()).toEqual({ runs: 0, lines: 0, events: 0, audits: 0, finalized: 0 });
    } finally {
      await database().query("delete from employees where employee_id like 'QA-233-ROSTER-%'");
    }
  });
});

if (!browserMode) describe("current grant authorization for payroll preview", () => {
  function invalidate() {
    if (!invalidatePermissions) throw new Error("The real permission cache has not been loaded");
    invalidatePermissions();
  }

  nativeTest("does not revive a revoked read grant from the signed token map", async () => {
    await database().query("update roles set permissions=$1::jsonb where id=$2", [{ payroll: ["write"] }, writerRoleId]);
    await database().query(
      "delete from role_permissions where role_id=$1 and permission_id in (select id from permissions where slug='payroll:read')",
      [writerRoleId],
    );
    invalidate();
    try {
      const current = await http().get("/auth/permissions").set("Cookie", writerCookie);
      expect(current.status).toBe(200);
      expect(current.body.permission_slugs).toEqual(["payroll:write"]);
      const identity = await http().get("/auth/me").set("Cookie", writerCookie);
      expect(identity.status).toBe(200);
      expect(identity.body.user.permission_slugs).toEqual(["payroll:write"]);
      expect((await http().post("/payroll/preview").set("Cookie", writerCookie).send(period)).status).toBe(403);
      expect(await counts()).toEqual({ runs: 0, lines: 0, events: 0, audits: 0, finalized: 0 });
    } finally {
      await database().query("update roles set permissions=$1::jsonb where id=$2", [{ payroll: ["read", "write"] }, writerRoleId]);
      await database().query(
        "insert into role_permissions(role_id,permission_id) select $1,id from permissions where slug='payroll:read' on conflict do nothing",
        [writerRoleId],
      );
      invalidate();
    }
  });

  nativeTest("treats a now-unassigned account as having no grants, not its old token roles", async () => {
    await database().query("update users set role_id=null where id=$1", [actorId]);
    invalidate();
    try {
      const denied = await http().post("/payroll/preview").set("Cookie", writerCookie).send(period);
      expect(denied.status).toBe(403);
      expect((await counts()).runs).toBe(0);
    } finally {
      await database().query("update users set role_id=$1 where id=$2", [writerRoleId, actorId]);
      invalidate();
    }
  });

  nativeTest("cannot use a custom route guard to bypass an unavailable permission lookup", async () => {
    await database().query("alter table roles rename column name to unavailable_role_name_242");
    invalidate();
    try {
      const denied = await http().post("/payroll/preview").set("Cookie", writerCookie).send(period);
      expect(denied.status).toBe(503);
      expect(denied.body.error).toBe("Permission lookup unavailable");
      expect(denied.body.outcome_uncertain).toBe(false);
      expect((await counts()).runs).toBe(0);
    } finally {
      await database().query("alter table roles rename column unavailable_role_name_242 to name");
      invalidate();
    }
  });
});
