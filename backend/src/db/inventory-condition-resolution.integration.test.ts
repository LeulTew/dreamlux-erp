import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import express from "express";
import request from "supertest";
import { Client, type Pool, type QueryResult } from "pg";
import { attestDreamluxNativeTarget } from "./testing/dreamlux-native-target";
import { startDreamluxRestProxy } from "./testing/dreamlux-rest-proxy";

const enabled = !!process.env.DREAMLUX_NATIVE_TEST_ADMIN_URL;
const nativeTest = enabled ? test : test.skip;
const actorId = "26800000-0000-4000-8000-000000000001";
const roleId = "26800000-0000-4000-8000-000000000002";
const grants = { assets: ["read", "reconcile"] };
const slugs = ["assets:read", "assets:reconcile"];
let observer: Client | undefined;
let appPool: Pool | undefined;
let server: Server | undefined;
let proxy: Awaited<ReturnType<typeof startDreamluxRestProxy>> | undefined;
let invalidatePermissions: (() => void) | undefined;
let cookie = "";

function database() {
  if (!observer) throw new Error("Owned DreamLux condition fixture is unavailable");
  return observer;
}

function http() {
  if (!server) throw new Error("Owned DreamLux condition API is unavailable");
  return request(server);
}

function activePool() {
  if (!appPool) throw new Error("Owned DreamLux condition pool is unavailable");
  return appPool;
}

function target() {
  const value = attestDreamluxNativeTarget(process.env.DATABASE_URL ?? "", "fixture");
  if (!/^\/dreamlux_ephemeral_equipment_259_[a-f0-9]{12}$/.test(value.pathname)) {
    throw new Error("Condition QA requires the independently owned equipment fixture");
  }
  return value;
}

beforeAll(async () => {
  if (!enabled) return;
  expect(process.env.NODE_ENV).toBe("development");
  if (Reflect.get(globalThis, "__mockSupabase")) throw new Error("Condition QA cannot use mocked database clients");
  observer = new Client({ connectionString: target().href, ssl: { rejectUnauthorized: false } });
  await observer.connect();
  const identity = await observer.query<{ name: string; actor: string; port: number }>(
    "select current_database() as name,current_user as actor,inet_server_port() as port",
  );
  expect(identity.rows).toEqual([{ name: target().pathname.slice(1), actor: "dreamlux_parity", port: 55434 }]);
  await observer.query("truncate roles,permissions,users,items,events,activity_logs cascade");
  await observer.query("create schema dreamlux_qa_condition; revoke all on schema dreamlux_qa_condition from public");
  await observer.query("insert into roles(id,name,permissions) values($1,'SYNTHETIC_CONDITION_OPERATOR_268',$2::jsonb)", [roleId, grants]);
  await observer.query(`insert into permissions(slug,description) values
    ('assets:read','Synthetic inventory read'),('assets:reconcile','Synthetic inventory reconciliation')`);
  await observer.query(`insert into role_permissions(role_id,permission_id)
    select $1,id from permissions where slug=any($2::text[])`, [roleId, slugs]);
  const password = randomBytes(24).toString("base64url");
  await observer.query(`insert into users(id,username,password_hash,full_name,role_id)
    values($1,'synthetic.condition.operator.268',crypt($3,gen_salt('bf')),'Synthetic condition operator',$2)`, [actorId, roleId, password]);
  proxy = await startDreamluxRestProxy();
  const app = express();
  app.use(express.json());
  app.use("/auth", (await import("../routes/auth")).default);
  app.use("/events", (await import("../routes/events/returns")).createEventReturnsRouter());
  appPool = (await import("./pool")).pool;
  invalidatePermissions = (await import("../lib/permissions-cache")).invalidateAllCache;
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const login = await http().post("/auth/login").send({ username: "synthetic.condition.operator.268", password });
  expect(login.status).toBe(200);
  const cookies: unknown = login.headers["set-cookie"];
  if (!Array.isArray(cookies) || !cookies.every((value): value is string => typeof value === "string")) {
    throw new Error("Synthetic condition session is unavailable");
  }
  cookie = cookies.map((value) => value.split(";")[0]).join("; ");
}, 45_000);

afterAll(async () => {
  const cleanups = await Promise.allSettled([
    server?.listening
      ? new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()))
      : Promise.resolve(),
    appPool?.end(), observer?.end(), proxy?.close(),
  ]);
  const errors = cleanups.filter((result) => result.status === "rejected").map((result) => result.reason);
  if (errors.length) throw new AggregateError(errors, "Owned condition QA cleanup failed");
});

beforeEach(async () => {
  if (!observer) return;
  await observer.query("update roles set permissions=$1::jsonb where id=$2", [grants, roleId]);
  await observer.query(`insert into role_permissions(role_id,permission_id)
    select $1,id from permissions where slug=any($2::text[]) on conflict do nothing`, [roleId, slugs]);
  if (!invalidatePermissions) throw new Error("Current permission invalidation is unavailable");
  invalidatePermissions();
});

async function item(trashed = false) {
  const id = crypto.randomUUID();
  await database().query(`insert into items(id,name,quantity,unavailable_damaged_quantity,unavailable_repair_quantity,deleted_at)
    values($1,'Synthetic condition stock',20,5,4,case when $2 then now() else null end)`, [id, trashed]);
  return id;
}

async function state(id: string) {
  return (await database().query(`select
    (select jsonb_build_object('owned',quantity,'damaged',unavailable_damaged_quantity,'repair',unavailable_repair_quantity,
      'available',quantity-unavailable_damaged_quantity-unavailable_repair_quantity) from items where id=$1) as stock,
    (select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from inventory_condition_resolutions r where item_id=$1) as resolutions,
    (select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]'::jsonb) from inventory_movements m where item_id=$1) as movements`, [id])).rows[0];
}

const resolve = (id: string, payload: Record<string, unknown>) =>
  http().post(`/events/returns/items/${id}/condition-resolutions`).set("Cookie", cookie).send(payload);
const transitions = (["damaged", "repair"] as const).flatMap((source) =>
  (["good", "damaged", "repair", "lost"] as const).map((outcome) => ({ source, outcome })));

async function loseAcknowledgement(command: "BEGIN" | "COMMIT" | "ROLLBACK") {
  const pool = activePool();
  const client = await pool.connect();
  const { rows: [connection] } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
  const originalConnect = pool.connect.bind(pool);
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);
  let released = false;
  // Authentication uses callback leases; fault only the route's transaction lease.
  const connect = spyOn(pool, "connect").mockImplementation(((...args: unknown[]) =>
    args.length ? Reflect.apply(originalConnect, pool, args) : Promise.resolve(client)) as typeof pool.connect);
  const queryTarget: { query: (sql: string, values?: unknown[]) => Promise<QueryResult<Record<string, unknown>>> } = client;
  const query = spyOn(queryTarget, "query").mockImplementation(async (sql, values) => {
    const result = await originalQuery(sql, values);
    if (sql.trim().toUpperCase() === command) throw new Error(`Synthetic condition ${command} acknowledgement loss`);
    return result;
  });
  const release = spyOn(client, "release").mockImplementation((discard) => {
    released = true;
    originalRelease(discard);
  });
  return {
    release,
    pid: connection.pid,
    rollback: () => originalQuery("ROLLBACK"),
    restore() {
      query.mockRestore();
      connect.mockRestore();
      release.mockRestore();
      if (!released) originalRelease(true);
    },
  };
}

describe("native DreamLux inventory condition resolution", () => {
  nativeTest.each(transitions)("records $source to $outcome with exact owned/unavailable arithmetic", async ({ source, outcome }) => {
    const id = await item();
    const response = await resolve(id, { source_condition: source, outcome, quantity: 2, notes: "Synthetic inspection", idempotency_key: "normal" });
    const stored = await state(id);
    const lost = outcome === "lost" ? 2 : 0;
    const damaged = 5 - (source === "damaged" ? 2 : 0) + (outcome === "damaged" ? 2 : 0);
    const repair = 4 - (source === "repair" ? 2 : 0) + (outcome === "repair" ? 2 : 0);
    expect({ status: response.status, stock: stored.stock }).toEqual({
      status: 201, stock: { owned: 20 - lost, damaged, repair, available: 20 - lost - damaged - repair },
    });
    expect(response.body).toEqual({ resolved: 2, outcome });
    expect(stored.resolutions).toHaveLength(1);
    expect(stored.resolutions[0]).toMatchObject({
      item_id: id, source_condition: source, outcome, quantity: 2, created_by: actorId, notes: "Synthetic inspection", idempotency_key: "normal",
    });
    if (lost) {
      expect(stored.movements).toHaveLength(1);
      expect(stored.movements[0]).toMatchObject({
        item_id: id, quantity_delta: -2, quantity_before: 20, quantity_after: 18,
        source_type: "condition_resolution", source_id: stored.resolutions[0].id, created_by: actorId,
      });
    } else expect(stored.movements).toEqual([]);
  });

  nativeTest("retains invalid-input, over-balance and missing/trashed-item controls", async () => {
    const id = await item();
    const before = await state(id);
    expect((await resolve(id, { source_condition: "repair", outcome: "good", quantity: 0 })).status).toBe(400);
    expect((await resolve(id, { source_condition: "repair", outcome: "good", quantity: 5 })).status).toBe(409);
    expect((await resolve(crypto.randomUUID(), { source_condition: "repair", outcome: "good", quantity: 1 })).status).toBe(404);
    expect((await resolve(await item(true), { source_condition: "repair", outcome: "good", quantity: 1 })).status).toBe(404);
    expect(await state(id)).toEqual(before);
  });

  nativeTest("rejects missing current reconciliation authority without changing stock", async () => {
    const id = await item();
    const before = await state(id);
    await database().query("update roles set permissions=$1::jsonb where id=$2", [{ assets: ["read"] }, roleId]);
    await database().query(`delete from role_permissions where role_id=$1
      and permission_id=(select id from permissions where slug='assets:reconcile')`, [roleId]);
    if (!invalidatePermissions) throw new Error("Missing permission cache invalidation");
    invalidatePermissions();
    expect((await resolve(id, { source_condition: "damaged", outcome: "good", quantity: 1 })).status).toBe(403);
    expect((await http().post(`/events/returns/items/${id}/condition-resolutions`).send({ source_condition: "repair", outcome: "good", quantity: 1 })).status).toBe(401);
    expect(await state(id)).toEqual(before);
  });

  nativeTest("rejects a malformed item identifier without changing stock", async () => {
    const id = await item();
    const before = await state(id);
    expect((await resolve("not-a-uuid", { source_condition: "repair", outcome: "good", quantity: 1 })).status).toBe(400);
    expect(await state(id)).toEqual(before);
  });

  nativeTest("keeps a recorded idempotency key from applying stock twice", async () => {
    const id = await item();
    const payload = { source_condition: "damaged", outcome: "lost", quantity: 2, idempotency_key: "once-only" };
    expect((await resolve(id, payload)).status).toBe(201);
    const saved = await state(id);
    expect((await resolve(id, payload)).status).toBe(409);
    expect(await state(id)).toEqual(saved);
  });

  nativeTest("serializes competing resolutions against the remaining balance", async () => {
    const id = await item();
    const results = await Promise.all([
      resolve(id, { source_condition: "damaged", outcome: "good", quantity: 4, idempotency_key: "first" }),
      resolve(id, { source_condition: "damaged", outcome: "good", quantity: 4, idempotency_key: "second" }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const stored = await state(id);
    expect(stored.stock).toEqual({ owned: 20, damaged: 1, repair: 4, available: 15 });
    expect(stored.resolutions).toHaveLength(1);
  });

  nativeTest("bounds a real competing item lock without changing stock or evidence", async () => {
    const id = await item();
    const before = await state(id);
    const blocker = new Client({ connectionString: target().href, ssl: { rejectUnauthorized: false } });
    await blocker.connect();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Promise<request.Response> | undefined;
    try {
      await blocker.query("begin");
      await blocker.query("select id from items where id=$1 for update", [id]);
      const started = performance.now();
      const released = new Promise<void>((resolveRelease, reject) => {
        timer = setTimeout(() => { void blocker.query("rollback").then(() => resolveRelease(), reject); }, 11_500);
      });
      pending = resolve(id, { source_condition: "repair", outcome: "good", quantity: 1 }).then((response) => response);
      const response = await pending;
      const elapsed = performance.now() - started;
      await released;
      expect(response.status).toBe(409);
      expect(response.body.code).toBe("CONDITION_RESOLUTION_BUSY");
      expect(elapsed).toBeGreaterThanOrEqual(9_000);
      expect(elapsed).toBeLessThan(11_300);
      expect(await state(id)).toEqual(before);
    } finally {
      clearTimeout(timer);
      await blocker.query("rollback");
      await pending;
      await blocker.end();
    }
  }, 15_000);

  nativeTest.each([
    { label: "resolution row for restored goods", outcome: "good", table: "inventory_condition_resolutions", trigger: "insert", body: "return null;" },
    { label: "resolution row for loss", outcome: "lost", table: "inventory_condition_resolutions", trigger: "insert", body: "return null;" },
    { label: "stock row", outcome: "lost", table: "items", trigger: "update", body: "return null;" },
    { label: "loss movement", outcome: "lost", table: "inventory_movements", trigger: "insert", body: "return null;" },
    { label: "stock database error", outcome: "lost", table: "items", trigger: "update", body: "raise exception 'Synthetic condition write failure';" },
  ])("does not acknowledge a missing $label", async ({ outcome, table, trigger, body }) => {
    const id = await item();
    const before = await state(id);
    await database().query(`create function dreamlux_qa_condition.reject_write() returns trigger language plpgsql as $$
      begin ${body} end $$; create trigger reject_condition_write_268 before ${trigger} on ${table}
      for each row execute function dreamlux_qa_condition.reject_write()`);
    try {
      const response = await resolve(id, { source_condition: "damaged", outcome, quantity: 2 });
      expect({ status: response.status, stored: await state(id) }).toEqual({ status: 500, stored: before });
    } finally {
      await database().query(`drop trigger reject_condition_write_268 on ${table}; drop function dreamlux_qa_condition.reject_write()`);
    }
  });

  nativeTest("does not return an open transaction to the pool after a lost BEGIN acknowledgement", async () => {
    const id = await item();
    const before = await state(id);
    const fault = await loseAcknowledgement("BEGIN");
    try {
      const response = await resolve(id, { source_condition: "repair", outcome: "good", quantity: 1 });
      expect(response.status).toBe(500);
      expect(await state(id)).toEqual(before);
      const connection = await database().query<{ state: string }>("select state from pg_stat_activity where pid=$1", [fault.pid]);
      expect(connection.rows).toEqual([{ state: "idle" }]);
      expect(fault.release).toHaveBeenCalledWith(false);
    } finally {
      try {
        await fault.rollback();
      } finally {
        fault.restore();
      }
    }
  });

  nativeTest("does not report a known failure after the real COMMIT acknowledgement is lost", async () => {
    const id = await item();
    const fault = await loseAcknowledgement("COMMIT");
    try {
      const response = await resolve(id, { source_condition: "damaged", outcome: "lost", quantity: 2, idempotency_key: "uncertain" });
      const stored = await state(id);
      expect({ status: response.status, stock: stored.stock }).toEqual({
        status: 503, stock: { owned: 18, damaged: 3, repair: 4, available: 11 },
      });
      expect(response.body).toMatchObject({ code: "CONDITION_RESOLUTION_UNCONFIRMED", outcome_uncertain: true });
      expect(response.body.resolved).toBeUndefined();
      expect(stored.resolutions).toHaveLength(1);
      expect(stored.movements).toHaveLength(1);
      expect(fault.release).toHaveBeenCalledWith(true);
    } finally {
      fault.restore();
    }
    const saved = await state(id);
    expect((await resolve(id, { source_condition: "damaged", outcome: "lost", quantity: 2, idempotency_key: "uncertain" })).status).toBe(409);
    expect(await state(id)).toEqual(saved);
  });

  nativeTest("surfaces a transaction-client acquisition failure without persisting a resolution", async () => {
    const id = await item();
    const before = await state(id);
    const pool = activePool();
    const original = pool.connect.bind(pool);
    const connect = spyOn(pool, "connect").mockImplementation(((...args: unknown[]) =>
      args.length ? Reflect.apply(original, pool, args) : Promise.reject(new Error("Synthetic condition pool outage"))) as typeof pool.connect);
    try {
      const response = await resolve(id, { source_condition: "repair", outcome: "good", quantity: 1 }).timeout({ deadline: 3_000 });
      expect(response.status).toBe(500);
      expect(await state(id)).toEqual(before);
    } finally {
      connect.mockRestore();
    }
  });

  nativeTest("discards a connection after a rollback acknowledgement failure", async () => {
    const id = await item();
    const before = await state(id);
    await database().query(`create function dreamlux_qa_condition.reject_stock() returns trigger language plpgsql as $$
      begin raise exception 'Synthetic stock write failure'; end $$;
      create trigger reject_condition_stock_268 before update on items
      for each row execute function dreamlux_qa_condition.reject_stock()`);
    const fault = await loseAcknowledgement("ROLLBACK");
    try {
      const response = await resolve(id, { source_condition: "damaged", outcome: "lost", quantity: 2 }).timeout({ deadline: 3_000 });
      expect(response.status).toBe(500);
      expect(await state(id)).toEqual(before);
      expect(fault.release).toHaveBeenCalledWith(true);
    } finally {
      fault.restore();
      await database().query("drop trigger reject_condition_stock_268 on items; drop function dreamlux_qa_condition.reject_stock()");
    }
  });
});
