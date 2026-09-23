import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { Socket } from "node:net";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { Client, type Pool, type PoolClient, type QueryResult } from "pg";
import { importFixtureDdl } from "./testing/dreamlux-import-fixture";
import { createDreamluxNativeFixture, reviewedSchemaTables } from "./testing/dreamlux-native-fixture";
import { attestDreamluxNativeTarget } from "./testing/dreamlux-native-target";
import { payrollFixtureDdl } from "./testing/dreamlux-payroll-fixture";
import { weeklyFormulaWorkbook } from "./testing/hisab-formula-workbook";

const adminUrl = process.env.DREAMLUX_NATIVE_TEST_ADMIN_URL?.trim();
if (process.env.DREAMLUX_NATIVE_IMPORT_REQUIRED === "1" && !adminUrl) {
  throw new Error("Native finance verification requires the explicitly attested independent DreamLux PostgreSQL target");
}
const nativeTest = adminUrl ? test : test.skip;
const actorId = "28800000-0000-4000-8000-000000000001";
const roleId = "28800000-0000-4000-8000-000000000002";
const slugs = [
  "finance:opex:write", "finance:opex:approve", "finance:overheads:write", "finance:overheads:approve",
  "finance:investments:write", "finance:investments:approve", "finance:imports:write", "finance:hisab:read",
];
const grants = Object.fromEntries([...new Set(slugs.map((slug) => slug.split(":").slice(0, 2).join(":")))]
  .map((resource) => [resource, slugs.filter((slug) => slug.startsWith(`${resource}:`)).map((slug) => slug.split(":")[2])]));
// Every activity_logs entity type written through insertFinanceAuditLog.
const FINANCE_AUDIT = "(entity_type like 'finance\\_%' or entity_type = 'capital_investment')";
let fixture: Awaited<ReturnType<typeof createDreamluxNativeFixture>> | undefined;
let observer: Client | undefined;
let appPool: Pool | undefined;
let invalidateAllCache: (() => void) | undefined;
let server: Server | undefined;
let cookie = "";
let seed = 0;
const ports = new Set<number>();
const denied: string[] = [];
const originalFetch = globalThis.fetch;
const originalConnect = Socket.prototype.connect;
let egressInstalled = false;

function database() {
  if (!observer) throw new Error("Owned finance audit database is unavailable");
  return observer;
}

function http() {
  if (!server) throw new Error("Owned finance audit HTTP service is unavailable");
  return request(server);
}

function pool() {
  if (!appPool) throw new Error("Finance audit application pool is unavailable");
  return appPool;
}

async function financeFixtureDdl() {
  const migration = (file: string) => readFile(join(__dirname, "migrations", file), "utf8");
  // The Hisab export joins event service scopes; the proposal junction in the
  // same migration references tables this fixture intentionally omits.
  const scopes = reviewedSchemaTables(await migration("event_service_scopes.sql"), ["event_service_scopes", "event_service_scope_links"]);
  return [await payrollFixtureDdl(), await importFixtureDdl(), ...scopes, await migration("inventory_movements.sql")].join("\n");
}

beforeAll(async () => {
  if (!adminUrl) return;
  const target = attestDreamluxNativeTarget(adminUrl, "admin");
  if (Reflect.get(globalThis, "__mockSupabase")) throw new Error("Native finance QA cannot use mocked application clients");
  ports.add(Number(target.port));
  egressInstalled = true;
  Socket.prototype.connect = new Proxy(originalConnect, {
    apply(original, socket, args) {
      const first = Array.isArray(args[0]) ? args[0][0] : args[0];
      const options = first && typeof first === "object" ? first : { port: first, host: typeof args[1] === "string" ? args[1] : "localhost" };
      const host = "host" in options ? options.host : "localhost";
      const port = "port" in options ? Number(options.port) : NaN;
      if (!["127.0.0.1", "localhost", "::1"].includes(String(host)) || !ports.has(port)) {
        denied.push("unowned TCP");
        throw new Error("Finance fixture refused unowned TCP before connection");
      }
      return Reflect.apply(original, socket, args);
    },
  });
  const denyFetch = () => { denied.push("fetch"); throw new Error("Finance fixture forbids external fetch"); };
  globalThis.fetch = Object.assign(denyFetch, { preconnect: denyFetch });
  fixture = await createDreamluxNativeFixture(adminUrl, "finance_audit_288", await financeFixtureDdl());
  Object.assign(process.env, {
    NODE_ENV: "development",
    DATABASE_URL: fixture.url, DATABASE_DIRECT_URL: "", DATABASE_BACKUP_URL: "",
    SUPABASE_URL: "http://127.0.0.1:1",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-dreamlux-finance-key-not-a-provider-credential",
    JWT_SECRET: randomBytes(32).toString("hex"),
    ADMIN_PASSWORD: randomBytes(32).toString("hex"),
  });
  const fixtureTarget = attestDreamluxNativeTarget(fixture.url, "fixture");
  observer = new Client({ connectionString: fixtureTarget.href, ssl: { rejectUnauthorized: false } });
  await observer.connect();
  expect((await observer.query("select current_database() as name,current_user as actor,inet_server_port() as port")).rows)
    .toEqual([{ name: fixtureTarget.pathname.slice(1), actor: "dreamlux_parity", port: 55434 }]);
  const password = randomBytes(24).toString("base64url");
  await observer.query("insert into roles(id,name,permissions) values($1,'SYNTHETIC_FINANCE_OPERATOR_288',$2::jsonb)", [roleId, grants]);
  await observer.query("insert into permissions(slug) select unnest($1::text[]) on conflict(slug) do nothing", [slugs]);
  await setCurrentGrants();
  await observer.query(`insert into users(id,username,password_hash,full_name,role_id)
    values($1,'synthetic.finance.operator.288',crypt($3,gen_salt('bf')),'Synthetic finance operator',$2::uuid)`,
  [actorId, roleId, password]);
  appPool = (await import("./pool")).pool;
  invalidateAllCache = (await import("../lib/permissions-cache")).invalidateAllCache;
  const { requireAuth } = await import("../middleware/auth");
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/auth", (await import("../routes/auth")).default);
  app.use("/finance/overheads", requireAuth, (await import("../routes/finance-overheads")).default);
  app.use("/finance/investments", requireAuth, (await import("../routes/finance-investments")).default);
  app.use("/finance/imports", requireAuth, (await import("../routes/finance-imports")).default);
  app.use("/finance", requireAuth, (await import("../routes/finance")).default);
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Finance fixture did not bind a local port");
  ports.add(address.port);
  const login = await http().post("/auth/login").send({ username: "synthetic.finance.operator.288", password });
  expect(login.status).toBe(200);
  const cookies: unknown = login.headers["set-cookie"];
  if (!Array.isArray(cookies) || !cookies.every((value): value is string => typeof value === "string")) {
    throw new Error("Synthetic finance session is unavailable");
  }
  cookie = cookies.map((value) => value.split(";")[0]).join("; ");
}, 45_000);

afterAll(async () => {
  try {
    const results = await Promise.allSettled([
      server?.listening
        ? new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()))
        : Promise.resolve(),
      appPool?.end(),
      observer?.end(),
    ]);
    if (fixture) results.push(...await Promise.allSettled([fixture.dispose()]));
    const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, "Finance audit fixture cleanup failed");
    expect(denied).toEqual([]);
  } finally {
    if (egressInstalled) {
      globalThis.fetch = originalFetch;
      Socket.prototype.connect = originalConnect;
    }
  }
});

async function setCurrentGrants() {
  await database().query("delete from role_permissions where role_id=$1", [roleId]);
  await database().query(`insert into role_permissions(role_id,permission_id)
    select $1,id from permissions where slug=any($2::text[])`, [roleId, slugs]);
}

beforeEach(async () => {
  if (!observer) return;
  if (!invalidateAllCache) throw new Error("Native finance permission invalidation was not initialized");
  await observer.query("update roles set permissions=$1::jsonb where id=$2", [grants, roleId]);
  await setCurrentGrants();
  invalidateAllCache();
});

async function ledger() {
  return (await database().query(`select
    (select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from finance_operational_expenses r) as opex,
    (select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from finance_overhead_expenses r) as overheads,
    (select coalesce(jsonb_agg(to_jsonb(r) order by r.month),'[]'::jsonb) from finance_overhead_month_closures r) as closures,
    (select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from capital_investments r) as investments,
    (select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from finance_import_batches r) as batches,
    (select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from items r) as items,
    (select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from inventory_movements r) as movements,
    (select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from activity_logs r
      where ${FINANCE_AUDIT.replaceAll("entity_type", "r.entity_type")}) as audits`)).rows[0];
}

async function withSuppressed<T>(table: string, action: "insert" | "update" | "delete", work: () => Promise<T>, where = "true") {
  await database().query(`create function public.synthetic_suppress_finance_write_288() returns trigger language plpgsql as $$
    begin if ${where} then return null; end if; return coalesce(new, old); end $$;
    create trigger synthetic_suppress_finance_write_288 before ${action} on ${table}
    for each row execute function public.synthetic_suppress_finance_write_288()`);
  try {
    return await work();
  } finally {
    await database().query(`drop trigger synthetic_suppress_finance_write_288 on ${table};
      drop function public.synthetic_suppress_finance_write_288()`);
  }
}

const suppressFinanceAudits = <T>(work: () => Promise<T>) =>
  withSuppressed("public.activity_logs", "insert", work, FINANCE_AUDIT.replaceAll("entity_type", "new.entity_type"));

function nextMonth() {
  seed += 1;
  return `20${String(40 + Math.floor(seed / 12)).padStart(2, "0")}-${String((seed % 12) + 1).padStart(2, "0")}`;
}

async function opex(status = "Pending") {
  return (await database().query<{ id: string }>(`insert into finance_operational_expenses
    (expense_date,category,amount,description,status,created_by) values('2031-03-04','Transport',120,'Synthetic transport',$1,$2)
    returning id`, [status, actorId])).rows[0].id;
}

async function overhead(month: string, status = "Pending") {
  return (await database().query<{ id: string }>(`insert into finance_overhead_expenses
    (expense_month,category,amount,scope,payment_kind,status,created_by) values($1::date,'Wifi',80,'Office','overhead',$2,$3)
    returning id`, [`${month}-01`, status, actorId])).rows[0].id;
}

async function stockItem(quantity = 5) {
  return (await database().query<{ id: string }>(`insert into items(name,quantity,unit_of_measurement)
    values('Synthetic purchased chafer',$1,'pcs') returning id`, [quantity])).rows[0].id;
}

async function investment(itemId: string | null, createsStock: boolean) {
  return (await database().query<{ id: string }>(`insert into capital_investments
    (purchase_date,item_name,category,quantity,unit,unit_cost,capex_classification,asset_id,creates_inventory_stock,status,created_by)
    values('2031-03-10','Synthetic chafer purchase','Equipment',3,'pcs',50,'Inventory Asset',$1,$2,'Pending',$3) returning id`,
  [itemId, createsStock, actorId])).rows[0].id;
}

async function importPreview(tag: string) {
  const response = await http().post("/finance/imports/hisab/preview").set("Cookie", cookie)
    .attach("workbook", await weeklyFormulaWorkbook("literal", { tag }), `synthetic-${tag}.xlsx`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as Record<string, unknown> & { workbookHash: string };
}

type Mutation = { label: string; created?: true; send: () => Promise<request.Response> };

async function mutations(): Promise<Mutation[]> {
  const openMonth = nextMonth();
  const closedMonth = nextMonth();
  await database().query("insert into finance_overhead_month_closures(month,closed_by) values($1::date,$2)", [`${closedMonth}-01`, actorId]);
  const [pendingOpex, editableOpex, removableOpex] = [await opex(), await opex(), await opex()];
  const [pendingOverhead, editableOverhead, removableOverhead] = [
    await overhead(openMonth), await overhead(openMonth), await overhead(openMonth),
  ];
  const item = await stockItem();
  const [stockInvestment, editableInvestment, removableInvestment] = [
    await investment(item, true), await investment(null, false), await investment(null, false),
  ];
  const preview = await importPreview(`suppressed-${seed}`);
  const as = (value: request.Test) => value.set("Cookie", cookie);
  return [
    { label: "operational expense create", created: true, send: () => as(http().post("/finance/operational-expenses")).send({ expense_date: "2031-03-05", category: "Rental", amount: 45, description: "Synthetic rental" }) },
    { label: "operational expense update", send: () => as(http().patch(`/finance/operational-expenses/${editableOpex}`)).send({ amount: 99 }) },
    { label: "operational expense delete", send: () => as(http().delete(`/finance/operational-expenses/${removableOpex}`)) },
    { label: "operational expense approval", send: () => as(http().post(`/finance/operational-expenses/${pendingOpex}/approve`)) },
    { label: "overhead create", created: true, send: () => as(http().post("/finance/overheads")).send({ expense_month: openMonth, category: "Fuel", amount: 30, scope: "Office", payment_kind: "overhead" }) },
    { label: "overhead update", send: () => as(http().patch(`/finance/overheads/${editableOverhead}`)).send({ amount: 81 }) },
    { label: "overhead delete", send: () => as(http().delete(`/finance/overheads/${removableOverhead}`)) },
    { label: "overhead rejection", send: () => as(http().post(`/finance/overheads/${pendingOverhead}/reject`)).send({ rejected_reason: "Synthetic duplicate" }) },
    { label: "overhead month close", send: () => as(http().post(`/finance/overheads/months/${nextMonth()}/close`)) },
    { label: "overhead month reopen", send: () => as(http().post(`/finance/overheads/months/${closedMonth}/reopen`)) },
    { label: "investment create", created: true, send: () => as(http().post("/finance/investments")).send({ purchase_date: "2031-03-11", item_name: "Synthetic tent", category: "Equipment", quantity: 1, unit: "pcs", unit_cost: 400, capex_classification: "Capital Asset" }) },
    { label: "investment update", send: () => as(http().patch(`/finance/investments/${editableInvestment}`)).send({ unit_cost: 55 }) },
    { label: "investment delete", send: () => as(http().delete(`/finance/investments/${removableInvestment}`)) },
    { label: "stock-creating investment approval", send: () => as(http().post(`/finance/investments/${stockInvestment}/approve`)) },
    { label: "workbook import commit", created: true, send: () => as(http().post("/finance/imports/hisab/commit")).send({ workbookHash: preview.workbookHash, preview, acceptFormulaMismatches: false, resolutions: {} }) },
  ];
}

async function loseAcknowledgement(command: "BEGIN" | "COMMIT" | "ROLLBACK") {
  const target = pool();
  const client = await target.connect();
  const { rows: [connection] } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
  const originalConnect = target.connect.bind(target);
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);
  let released = false;
  const connect = spyOn(target, "connect").mockImplementation(((...args: unknown[]) =>
    args.length ? Reflect.apply(originalConnect, target, args) : Promise.resolve(client)) as typeof target.connect);
  const queryTarget: { query: (sql: string, values?: unknown[]) => Promise<QueryResult<Record<string, unknown>>> } = client;
  const query = spyOn(queryTarget, "query").mockImplementation(async (sql, values) => {
    const result = await originalQuery(sql, values);
    if (sql.trim().toUpperCase() === command) throw new Error(`Synthetic finance ${command} acknowledgement loss`);
    return result;
  });
  const release = spyOn(client as PoolClient, "release").mockImplementation((discard) => {
    released = true;
    originalRelease(discard);
  });
  return {
    release,
    pid: connection.pid,
    restore() {
      query.mockRestore();
      connect.mockRestore();
      release.mockRestore();
      if (!released) originalRelease(true);
    },
  };
}

async function openFinanceTransactions() {
  return (await database().query<{ state: string }>(`select state from pg_stat_activity
    where datname=current_database() and pid<>pg_backend_pid() and state like 'idle in transaction%'`)).rows;
}

// Holds a conflicting change open until the API request is observed waiting
// on it, then commits, forcing the exact interleaving under test.
async function raceAgainst(sql: string, values: unknown[], send: () => request.Test) {
  if (!fixture) throw new Error("Owned finance audit database is unavailable");
  const rival = new Client({ connectionString: attestDreamluxNativeTarget(fixture.url, "fixture").href, ssl: { rejectUnauthorized: false } });
  await rival.connect();
  try {
    await rival.query("begin");
    await rival.query(sql, values);
    const pending = send().then((response) => response);
    const deadline = Date.now() + 5_000;
    while ((await database().query(`select count(*)::int as waiting from pg_stat_activity
      where datname=current_database() and wait_event_type='Lock'`)).rows[0].waiting === 0) {
      if (Date.now() > deadline) throw new Error("The finance request never waited on the rival transaction");
      await Bun.sleep(20);
    }
    await rival.query("commit");
    return await pending;
  } finally {
    await rival.end();
  }
}

describe("native DreamLux finance audit acknowledgement", () => {
  nativeTest("keeps every finance mutation family successful with exactly one audit row", async () => {
    for (const mutation of await mutations()) {
      const before = (await ledger()).audits.length;
      const response = await mutation.send();
      expect({ label: mutation.label, status: response.status, error: response.body?.error })
        .toEqual({ label: mutation.label, status: mutation.created ? 201 : 200, error: undefined });
      expect({ label: mutation.label, audits: (await ledger()).audits.length - before }).toEqual({ label: mutation.label, audits: 1 });
    }
  }, 60_000);

  nativeTest("never acknowledges a finance mutation whose required audit row was suppressed", async () => {
    for (const mutation of await mutations()) {
      const before = await ledger();
      const response = await suppressFinanceAudits(mutation.send);
      expect({ label: mutation.label, status: response.status, outcome_uncertain: response.body.outcome_uncertain })
        .toEqual({ label: mutation.label, status: 500, outcome_uncertain: false });
      expect({ label: mutation.label, ledger: await ledger() }).toEqual({ label: mutation.label, ledger: before });
    }
    expect(await openFinanceTransactions()).toEqual([]);
  }, 60_000);

  nativeTest("refuses report exports whose required audit row was suppressed", async () => {
    const exportCsv = () => http().get("/finance/hisab/export?start_date=2031-03-01&end_date=2031-03-31&format=csv").set("Cookie", cookie);
    const control = await ledger();
    const allowed = await exportCsv();
    expect({ status: allowed.status, disposition: allowed.headers["content-disposition"] })
      .toEqual({ status: 200, disposition: expect.stringContaining("attachment") });
    expect((await ledger()).audits.length).toBe(control.audits.length + 1);
    const before = await ledger();
    const response = await suppressFinanceAudits(exportCsv);
    expect(response.status).toBe(500);
    expect(response.headers["content-disposition"]).toBeUndefined();
    expect(await ledger()).toEqual(before);
  });

  nativeTest.each([
    { label: "movement ledger", table: "inventory_movements", action: "insert" as const },
    { label: "owned stock", table: "items", action: "update" as const },
    { label: "investment status", table: "capital_investments", action: "update" as const },
  ])("does not approve stock-creating capex without its acknowledged $label", async ({ table, action }) => {
    const target = await investment(await stockItem(), true);
    const before = await ledger();
    const response = await withSuppressed(table, action, () =>
      http().post(`/finance/investments/${target}/approve`).set("Cookie", cookie));
    expect(response.status).toBe(500);
    expect(await ledger()).toEqual(before);
  });

  nativeTest.each([
    { label: "operational expense", table: "finance_operational_expenses", path: async () => `/finance/operational-expenses/${await opex()}` },
    { label: "overhead", table: "finance_overhead_expenses", path: async () => `/finance/overheads/${await overhead(nextMonth())}` },
    { label: "investment", table: "capital_investments", path: async () => `/finance/investments/${await investment(null, false)}` },
  ])("does not report an unacknowledged $label deletion as deleted", async ({ table, path }) => {
    const target = await path();
    const before = await ledger();
    const response = await withSuppressed(table, "update", () => http().delete(target).set("Cookie", cookie));
    expect(response.status).toBe(500);
    expect(response.body.deleted).toBeUndefined();
    expect(await ledger()).toEqual(before);
  });

  nativeTest("does not close a month whose closure row was suppressed", async () => {
    const before = await ledger();
    const response = await withSuppressed("finance_overhead_month_closures", "insert", () =>
      http().post(`/finance/overheads/months/${nextMonth()}/close`).set("Cookie", cookie));
    expect(response.status).toBe(500);
    expect(await ledger()).toEqual(before);
  });

  nativeTest("does not commit a workbook whose ledger rows were suppressed", async () => {
    const preview = await importPreview("suppressed-rows");
    const before = await ledger();
    const response = await withSuppressed("finance_operational_expenses", "insert", () =>
      http().post("/finance/imports/hisab/commit").set("Cookie", cookie)
        .send({ workbookHash: preview.workbookHash, preview, acceptFormulaMismatches: false, resolutions: {} }));
    expect(response.status).toBe(500);
    expect(await ledger()).toEqual(before);
  });

  nativeTest("reports a lost COMMIT acknowledgement as uncertain without replaying the write", async () => {
    const before = (await ledger()).opex.length;
    const fault = await loseAcknowledgement("COMMIT");
    try {
      const response = await http().post("/finance/operational-expenses").set("Cookie", cookie)
        .send({ expense_date: "2031-04-01", category: "Labour", amount: 70, description: "Synthetic uncertain labour" });
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ code: "FINANCE_OUTCOME_UNCERTAIN", outcome_uncertain: true });
      expect(response.body.expense).toBeUndefined();
      expect(fault.release).toHaveBeenCalledWith(true);
    } finally {
      fault.restore();
    }
    const saved = await database().query<{ audits: number }>(`select count(a.id)::int as audits
      from finance_operational_expenses e join activity_logs a on a.entity_id=e.id and a.entity_type='finance_operational_expense'
      where e.description='Synthetic uncertain labour'`);
    expect((await ledger()).opex.length).toBe(before + 1);
    expect(saved.rows).toEqual([{ audits: 1 }]);
  });

  nativeTest("discards the connection when a ROLLBACK acknowledgement is lost", async () => {
    const target = await opex();
    const before = await ledger();
    const fault = await loseAcknowledgement("ROLLBACK");
    try {
      const response = await suppressFinanceAudits(() =>
        http().post(`/finance/operational-expenses/${target}/approve`).set("Cookie", cookie).timeout({ deadline: 5_000 }));
      expect(response.status).toBe(500);
      expect(response.body.outcome_uncertain).toBe(false);
      expect(fault.release).toHaveBeenCalledWith(true);
    } finally {
      fault.restore();
    }
    expect(await ledger()).toEqual(before);
  });

  nativeTest("returns a reusable idle connection when a BEGIN acknowledgement is lost", async () => {
    const before = await ledger();
    const fault = await loseAcknowledgement("BEGIN");
    try {
      const response = await http().post("/finance/overheads").set("Cookie", cookie)
        .send({ expense_month: nextMonth(), category: "Fuel", amount: 30, scope: "Office", payment_kind: "overhead" });
      expect(response.status).toBe(500);
      expect(await ledger()).toEqual(before);
      expect((await database().query("select state from pg_stat_activity where pid=$1", [fault.pid])).rows)
        .toEqual([{ state: "idle" }]);
    } finally {
      fault.restore();
    }
  });

  nativeTest("surfaces finance pool acquisition failure without hanging or writing", async () => {
    const before = await ledger();
    const target = pool();
    const originalConnect = target.connect.bind(target);
    const connect = spyOn(target, "connect").mockImplementation(((...args: unknown[]) =>
      args.length ? Reflect.apply(originalConnect, target, args) : Promise.reject(new Error("Synthetic finance pool outage"))) as typeof target.connect);
    try {
      const response = await http().post("/finance/investments").set("Cookie", cookie).timeout({ deadline: 3_000 })
        .send({ purchase_date: "2031-03-11", item_name: "Synthetic outage", category: "Equipment", quantity: 1, unit: "pcs", unit_cost: 5, capex_classification: "Capital Asset" });
      expect(response.status).toBe(500);
      expect(response.body.outcome_uncertain).toBe(false);
    } finally {
      connect.mockRestore();
    }
    expect(await ledger()).toEqual(before);
  });

  nativeTest("keeps concurrent acknowledged and suppressed writes isolated with healthy connections", async () => {
    const tag = `Synthetic concurrent ${seed += 1}`;
    const responses = await withSuppressed("public.activity_logs", "insert", () => Promise.all(
      Array.from({ length: 12 }, (_, index) => http().post("/finance/operational-expenses").set("Cookie", cookie)
        .send({ expense_date: "2031-05-01", category: "Transport", amount: 10 + index, description: `${tag} ${index % 2 ? "suppress" : "keep"} ${index}` })),
    ), `${FINANCE_AUDIT.replaceAll("entity_type", "new.entity_type")} and new.note like '%suppress%'`);
    expect(responses.map((response) => response.status).sort()).toEqual([...Array(6).fill(201), ...Array(6).fill(500)]);
    const saved = await database().query<{ description: string; audits: number }>(`select e.description, count(a.id)::int as audits
      from finance_operational_expenses e left join activity_logs a on a.entity_id=e.id and a.entity_type='finance_operational_expense'
      where e.description like $1 group by e.description order by e.description`, [`${tag}%`]);
    expect(saved.rows.every((row) => row.description.includes("keep") && row.audits === 1)).toBe(true);
    expect(saved.rows).toHaveLength(6);
    expect(await openFinanceTransactions()).toEqual([]);
  });

  nativeTest("approves one of two racing reviews and audits only the winner", async () => {
    const target = await opex();
    const responses = await Promise.all([1, 2].map(() =>
      http().post(`/finance/operational-expenses/${target}/approve`).set("Cookie", cookie)));
    expect(responses.map((response) => `${response.status} ${response.body?.error ?? ""}`.trim()).sort())
      .toEqual(["200", "409 Only pending expenses can be reviewed (current status: Approved)"]);
    const audits = await database().query("select action from activity_logs where entity_type='finance_operational_expense' and entity_id=$1", [target]);
    expect(audits.rows).toEqual([{ action: "approve" }]);
    expect(await openFinanceTransactions()).toEqual([]);
  });

  nativeTest("reports a close that loses to a concurrent close as already closed", async () => {
    const month = nextMonth();
    const before = await ledger();
    const response = await raceAgainst(
      "insert into finance_overhead_month_closures(month,closed_by) values($1::date,$2)", [`${month}-01`, actorId],
      () => http().post(`/finance/overheads/months/${month}/close`).set("Cookie", cookie));
    expect({ status: response.status, body: response.body }).toEqual({ status: 409, body: { error: `Month ${month} is already closed` } });
    const after = await ledger();
    expect(after.audits).toEqual(before.audits);
    expect(after.closures).toHaveLength(before.closures.length + 1);
    expect(await openFinanceTransactions()).toEqual([]);
  });

  nativeTest("reports a reopen that loses to a concurrent reopen as not closed", async () => {
    const month = nextMonth();
    await database().query("insert into finance_overhead_month_closures(month,closed_by) values($1::date,$2)", [`${month}-01`, actorId]);
    const before = await ledger();
    const response = await raceAgainst(
      "delete from finance_overhead_month_closures where month=$1::date", [`${month}-01`],
      () => http().post(`/finance/overheads/months/${month}/reopen`).set("Cookie", cookie));
    expect({ status: response.status, body: response.body }).toEqual({ status: 409, body: { error: `Month ${month} is not closed` } });
    const after = await ledger();
    expect(after.audits).toEqual(before.audits);
    expect(after.closures).toHaveLength(before.closures.length - 1);
    expect(await openFinanceTransactions()).toEqual([]);
  });
});
