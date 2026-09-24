import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { Socket } from "node:net";
import express from "express";
import request from "supertest";
import { Client, type Pool } from "pg";
import { z } from "zod";
import { createDreamluxImportFixture } from "./testing/dreamlux-import-fixture";
import { attestDreamluxNativeTarget } from "./testing/dreamlux-native-target";
import { closeFixtureServer, trackFixtureSockets } from "./testing/fixture-http-server";
import { fourSheetFormulaWorkbook, weeklyFormulaWorkbook, wideRangeFormulaWorkbook } from "./testing/hisab-formula-workbook";

const adminUrl = process.env.DREAMLUX_NATIVE_TEST_ADMIN_URL?.trim();
if (process.env.DREAMLUX_NATIVE_IMPORT_REQUIRED === "1" && !adminUrl) {
  throw new Error("Native import verification requires the explicitly attested independent DreamLux PostgreSQL target");
}
const nativeTest = adminUrl ? test : test.skip;
const actorId = "26100000-0000-4000-8000-000000000001";
const roleId = "26100000-0000-4000-8000-000000000002";
const grants = { "finance:imports": ["write"] };
const previewSchema = z.object({
  workbookHash: z.string().regex(/^[a-f0-9]{64}$/),
  rows: z.array(z.object({ id: z.string(), kind: z.string(), rowNumber: z.number(), amount: z.number() }).passthrough()),
  blockingErrors: z.array(z.string()),
  formulaMismatches: z.array(z.unknown()),
  summary: z.object({ totalRows: z.number(), totalAmount: z.number() }).passthrough(),
  duplicate: z.object({ importId: z.string().uuid() }).passthrough().nullable(),
}).passthrough();
type Preview = z.infer<typeof previewSchema>;
const receiptSchema = z.object({ importId: z.string().uuid(), inserted: z.record(z.number().int().nonnegative()) });
let fixture: Awaited<ReturnType<typeof createDreamluxImportFixture>> | undefined;
let observer: Client | undefined;
let appPool: Pool | undefined;
let invalidateAllCache: (() => void) | undefined;
let server: Server | undefined;
let serverSockets: Set<Socket> | undefined;
let cookie = "";
const ports = new Set<number>();
const denied: string[] = [];
const originalFetch = globalThis.fetch;
const originalConnect = Socket.prototype.connect;
let egressInstalled = false;

function database() {
  if (!observer) throw new Error("Owned formula-import database is unavailable");
  return observer;
}

function http() {
  if (!server) throw new Error("Owned formula-import HTTP service is unavailable");
  return request(server);
}

async function setCurrentImportGrant(enabled: boolean) {
  await database().query("delete from role_permissions where role_id=$1", [roleId]);
  if (enabled) {
    await database().query(`insert into role_permissions(role_id,permission_id)
      select $1,id from permissions where slug='finance:imports:write'`, [roleId]);
  }
}

beforeAll(async () => {
  if (!adminUrl) return;
  const target = attestDreamluxNativeTarget(adminUrl, "admin");
  if (Reflect.get(globalThis, "__mockSupabase")) throw new Error("Native import QA cannot use mocked application clients");
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
        throw new Error("Formula fixture refused unowned TCP before connection");
      }
      return Reflect.apply(original, socket, args);
    },
  });
  const denyFetch = () => { denied.push("fetch"); throw new Error("Formula fixture forbids external fetch"); };
  globalThis.fetch = Object.assign(denyFetch, { preconnect: denyFetch });
  fixture = await createDreamluxImportFixture(adminUrl);
  Object.assign(process.env, {
    NODE_ENV: "development",
    DATABASE_URL: fixture.url, DATABASE_DIRECT_URL: "", DATABASE_BACKUP_URL: "",
    SUPABASE_URL: "http://127.0.0.1:1",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-dreamlux-formula-key-not-a-provider-credential",
    JWT_SECRET: randomBytes(32).toString("hex"),
    ADMIN_PASSWORD: randomBytes(32).toString("hex"),
  });
  const fixtureTarget = attestDreamluxNativeTarget(fixture.url, "fixture");
  observer = new Client({ connectionString: fixtureTarget.href, ssl: { rejectUnauthorized: false } });
  await observer.connect();
  expect((await observer.query("select current_database() as name,current_user as actor,inet_server_port() as port")).rows)
    .toEqual([{ name: fixtureTarget.pathname.slice(1), actor: "dreamlux_parity", port: 55434 }]);
  const password = randomBytes(24).toString("base64url");
  await observer.query("insert into roles(id,name,permissions) values($1,'SYNTHETIC_FORMULA_IMPORTER_261',$2::jsonb)", [roleId, grants]);
  await observer.query("insert into permissions(slug) values('finance:imports:write') on conflict(slug) do nothing");
  await setCurrentImportGrant(true);
  await observer.query(`insert into users(id,username,password_hash,full_name,role_id)
    values($1,'synthetic.formula.importer.261',crypt($3,gen_salt('bf')),
      'Synthetic formula operator',$2::uuid)`, [actorId, roleId, password]);
  appPool = (await import("./pool")).pool;
  invalidateAllCache = (await import("../lib/permissions-cache")).invalidateAllCache;
  const app = express();
  app.use(express.json());
  app.use("/auth", (await import("../routes/auth")).default);
  app.use("/finance/imports", (await import("../middleware/auth")).requireAuth, (await import("../routes/finance-imports")).default);
  server = createServer(app);
  serverSockets = trackFixtureSockets(server);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Formula fixture did not bind a local port");
  ports.add(address.port);
  const login = await http().post("/auth/login").send({ username: "synthetic.formula.importer.261", password });
  expect(login.status).toBe(200);
  const cookies: unknown = login.headers["set-cookie"];
  if (!Array.isArray(cookies) || !cookies.every((value) => typeof value === "string")) throw new Error("Synthetic formula cookie missing");
  cookie = cookies.map((value: string) => value.split(";")[0]).join("; ");
}, 45_000);

afterAll(async () => {
  try {
    // Keep the original order, but let each step run even if an earlier one fails,
    // so a stuck server cannot leave the owned database behind.
    const results = await Promise.allSettled([
      server && serverSockets ? closeFixtureServer(server, serverSockets) : Promise.resolve(),
    ]);
    if (fixture) {
      results.push(...await Promise.allSettled([appPool?.end()]));
      results.push(...await Promise.allSettled([observer?.end()]));
      results.push(...await Promise.allSettled([fixture.dispose()]));
    }
    const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, "Formula import fixture cleanup failed");
    expect(denied).toEqual([]);
  } finally {
    if (egressInstalled) {
      globalThis.fetch = originalFetch;
      Socket.prototype.connect = originalConnect;
    }
  }
});

beforeEach(async () => {
  if (!observer) return;
  if (!invalidateAllCache) throw new Error("Native import permission invalidation was not initialized");
  await observer.query("update roles set permissions=$1::jsonb where id=$2", [grants, roleId]);
  await setCurrentImportGrant(true);
  invalidateAllCache();
});

async function preview(buffer: Buffer, name = "synthetic-formulas.xlsx") {
  const result = await http().post("/finance/imports/hisab/preview").set("Cookie", cookie).attach("workbook", buffer, name);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return previewSchema.parse(result.body);
}

function commit(value: Preview, acceptFormulaMismatches = false, resolutions: Record<string, unknown> = {}) {
  return http().post("/finance/imports/hisab/commit").set("Cookie", cookie).send({
    workbookHash: value.workbookHash, preview: value, acceptFormulaMismatches, resolutions,
  });
}

async function ledgerCounts() {
  return (await database().query(`select
    (select count(*)::int from finance_import_batches) as batches,
    (select count(*)::int from expenses) as event_expenses,
    (select count(*)::int from finance_operational_expenses) as operational,
    (select count(*)::int from finance_overhead_expenses) as overhead,
    (select count(*)::int from capital_investments) as investments,
    (select count(*)::int from activity_logs where entity_type='finance_import_batch') as audits`)).rows[0];
}

describe("native DreamLux formula workbook preview-to-commit workflow", () => {
  nativeTest("persists both literal and formula transactions as exact Pending rows with provenance", async () => {
    const value = await preview(await weeklyFormulaWorkbook("cached", { tag: "normal-native", namedSubtotal: true }));
    expect(value.summary).toMatchObject({ totalRows: 2, totalAmount: 200 });
    expect(value.rows.map((row) => row.rowNumber)).toEqual([2, 3]);
    const response = await commit(value);
    expect(response.status).toBe(201);
    const receipt = receiptSchema.parse(response.body);
    expect(receipt.inserted.operationalExpenses).toBe(2);
    const saved = await database().query("select amount::text,status,created_by,source_import_id from finance_operational_expenses where source_import_id=$1 order by expense_date", [receipt.importId]);
    expect(saved.rows).toEqual([1, 2].map(() => ({ amount: "100.00", status: "Pending", created_by: actorId, source_import_id: receipt.importId })));
    expect((await database().query("select workbook_hash,row_counts from finance_import_batches where id=$1", [receipt.importId])).rows[0]).toMatchObject({
      workbook_hash: value.workbookHash, row_counts: { totalRows: 2, totalAmount: 200 },
    });
    expect((await database().query("select user_id,action from activity_logs where entity_type='finance_import_batch' and entity_id=$1", [receipt.importId])).rows).toEqual([{ user_id: actorId, action: "commit" }]);
  });

  nativeTest("retains all four supported calculated layouts without changing explicit investment quantity", async () => {
    const value = await preview(await fourSheetFormulaWorkbook("cached", "four-native"));
    expect(value.summary).toMatchObject({ totalRows: 4, totalAmount: 650 });
    const response = await commit(value);
    expect(response.status).toBe(201);
    const receipt = receiptSchema.parse(response.body);
    expect(receipt.inserted).toEqual({ eventExpenses: 0, operationalExpenses: 1, overheads: 2, investments: 1 });
    expect((await database().query("select quantity::text,unit_cost::text,total_cost::text,status,creates_inventory_stock from capital_investments where source_import_id=$1", [receipt.importId])).rows).toEqual([
      { quantity: "2.0000", unit_cost: "100.00", total_cost: "200.00", status: "Pending", creates_inventory_stock: false },
    ]);
    expect((await database().query("select amount::text,status from finance_overhead_expenses where source_import_id=$1 order by amount", [receipt.importId])).rows).toEqual([
      { amount: "150.00", status: "Pending" }, { amount: "200.00", status: "Pending" },
    ]);
  });

  nativeTest("commits the same exact Pending amounts when a subtotal references many empty rows", async () => {
    const value = await preview(await wideRangeFormulaWorkbook());
    expect(value.summary).toMatchObject({ totalRows: 2, totalAmount: 200 });
    expect(value.formulaMismatches).toEqual([]);
    const response = await commit(value);
    expect(response.status).toBe(201);
    const receipt = receiptSchema.parse(response.body);
    expect(receipt.inserted.operationalExpenses).toBe(2);
    expect((await database().query(`select amount::text,status,created_by,source_import_id
      from finance_operational_expenses where source_import_id=$1 order by expense_date`, [receipt.importId])).rows)
      .toEqual([1, 2].map(() => ({ amount: "100.00", status: "Pending", created_by: actorId, source_import_id: receipt.importId })));
  });

  nativeTest("requires event mapping and persists the calculated event expense under the resolved event", async () => {
    const event = await database().query<{ id: string }>(`insert into events
      (name,client_name,start_date,end_date,venue_location,status,created_by)
      values('Synthetic formula wedding','Synthetic customer','2026-05-05','2026-05-05',
        'Synthetic formula venue','Planned',$1) returning id`, [actorId]);
    const value = await preview(await weeklyFormulaWorkbook("cached", { event: true, tag: "event-native" }));
    const row = value.rows.find((entry) => entry.kind === "event_expense");
    if (!row) throw new Error("The calculated event expense was omitted");
    expect(row).toMatchObject({ amount: 100, requiresResolution: [{ kind: "event", value: "Synthetic wedding transport" }] });
    const before = await ledgerCounts();
    expect((await commit(value)).status).toBe(400);
    expect(await ledgerCounts()).toEqual(before);
    const response = await commit(value, false, { events: { [row.id]: { eventId: event.rows[0].id, eventName: "Synthetic formula wedding" } } });
    expect(response.status).toBe(201);
    const receipt = receiptSchema.parse(response.body);
    expect(receipt.inserted).toEqual({ eventExpenses: 1, operationalExpenses: 1, overheads: 0, investments: 0 });
    expect((await database().query(`select event_id,category,amount::text,status,created_by,source_import_id
      from expenses where source_import_id=$1`, [receipt.importId])).rows).toEqual([{
      event_id: event.rows[0].id, category: "Transportation", amount: "100.00", status: "Pending",
      created_by: actorId, source_import_id: receipt.importId,
    }]);
  });

  for (const mode of ["missing", "error", "text"] as const) {
    nativeTest(`blocks ${mode} formula results even when mismatch review is accepted`, async () => {
      const value = await preview(await weeklyFormulaWorkbook(mode, { tag: `invalid-${mode}` }));
      expect(value.blockingErrors.some((message) => message.includes("C3"))).toBe(true);
      const before = await ledgerCounts();
      const response = await commit(value, true);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: "Preview has blocking errors" });
      expect(await ledgerCounts()).toEqual(before);
    });
  }

  nativeTest("retains explicit subtotal mismatch review without importing the subtotal", async () => {
    const value = await preview(await weeklyFormulaWorkbook("cached", { mismatch: true, tag: "mismatch-native" }));
    expect(value.formulaMismatches).toHaveLength(1);
    const before = await ledgerCounts();
    expect((await commit(value)).status).toBe(400);
    expect(await ledgerCounts()).toEqual(before);
    const accepted = await commit(value, true);
    expect(accepted.status).toBe(201);
    expect(receiptSchema.parse(accepted.body).inserted.operationalExpenses).toBe(2);
  });

  nativeTest("preserves unresolved-category blocking and explicit resolution", async () => {
    const value = await preview(await weeklyFormulaWorkbook("cached", { unmatched: true, tag: "mapping-native" }));
    const row = value.rows.find((entry) => entry.rowNumber === 3);
    if (!row) throw new Error("The calculated mapping row was omitted");
    const before = await ledgerCounts();
    expect((await commit(value)).status).toBe(400);
    expect(await ledgerCounts()).toEqual(before);
    expect((await commit(value, false, { categories: { [row.id]: "Lunch" } })).status).toBe(201);
  });

  nativeTest("does not replay or rewrite an already committed partial historical workbook", async () => {
    const bytes = await weeklyFormulaWorkbook("cached", { tag: "historical-partial" });
    const value = await preview(bytes);
    const batch = await database().query<{ id: string }>(`insert into finance_import_batches
      (workbook_hash,source_filename,layout_version,status,row_counts,mismatch_count,unmatched_count,created_by,committed_at)
      values($1,'synthetic-prior-partial.xlsx','legacy-hisab-v1','Committed',$2::jsonb,0,0,$3,now()) returning id`,
    [value.workbookHash, { totalRows: 1, totalAmount: 100 }, actorId]);
    await database().query(`insert into finance_operational_expenses(expense_date,category,amount,description,status,created_by,source_import_id)
      values('2026-05-04','Lunch',100,'Synthetic retained prior row','Pending',$1,$2)`, [actorId, batch.rows[0].id]);
    const before = await ledgerCounts();
    const duplicate = await preview(bytes);
    expect(duplicate.summary.totalRows).toBe(2);
    expect(duplicate.duplicate?.importId).toBe(batch.rows[0].id);
    expect((await commit(duplicate)).status).toBe(409);
    expect(await ledgerCounts()).toEqual(before);
    expect((await database().query("select row_counts from finance_import_batches where id=$1", [batch.rows[0].id])).rows[0].row_counts).toEqual({ totalRows: 1, totalAmount: 100 });
  });

  nativeTest("rolls the complete import back if its audit write fails", async () => {
    const value = await preview(await weeklyFormulaWorkbook("cached", { tag: "rollback-native" }));
    const before = await ledgerCounts();
    await database().query(`create function public.synthetic_reject_import_audit_261() returns trigger language plpgsql as $$
      begin raise exception 'Synthetic formula import audit failure'; end $$;
      create trigger synthetic_reject_import_audit_261 before insert on public.activity_logs
      for each row when(new.entity_type='finance_import_batch') execute function public.synthetic_reject_import_audit_261()`);
    try {
      expect((await commit(value)).status).toBe(500);
      expect(await ledgerCounts()).toEqual(before);
    } finally {
      await database().query("drop trigger synthetic_reject_import_audit_261 on public.activity_logs; drop function public.synthetic_reject_import_audit_261()");
    }
  });

  nativeTest("retains permission denial without touching the workbook ledger", async () => {
    if (!invalidateAllCache) throw new Error("Native import permission invalidation was not initialized");
    const before = await ledgerCounts();
    await setCurrentImportGrant(false);
    invalidateAllCache();
    const response = await http().post("/finance/imports/hisab/preview").set("Cookie", cookie)
      .attach("workbook", await weeklyFormulaWorkbook("cached", { tag: "denied-native" }), "synthetic-denied.xlsx");
    expect(response.status).toBe(403);
    expect(await ledgerCounts()).toEqual(before);
  });
});
