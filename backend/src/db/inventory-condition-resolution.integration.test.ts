import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
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
  app.use("/events", (await import("../routes/events")).default);
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
  await observer.query("delete from role_permissions where role_id=$1", [roleId]);
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

const inspect = (id: string, query: Record<string, unknown> = {}) =>
  http().get(`/events/returns/items/${id}/condition-stock`).set("Cookie", cookie).query(query);
const listStock = (query: Record<string, unknown> = {}) =>
  http().get("/events/returns/condition-stock").set("Cookie", cookie).query(query);

async function currentGrants(next: readonly string[]) {
  await database().query("delete from role_permissions where role_id=$1", [roleId]);
  await database().query("insert into permissions(slug) select value from unnest($1::text[]) value on conflict(slug) do nothing", [next]);
  await database().query(`insert into role_permissions(role_id,permission_id)
    select $1,id from permissions where slug=any($2::text[])`, [roleId, next]);
  if (!invalidatePermissions) throw new Error("Current permission invalidation unavailable");
  invalidatePermissions();
}

async function withTimeZone(zone: string, operation: () => Promise<void>) {
  const maximum = activePool().options.max;
  if (typeof maximum !== "number" || maximum < 1) throw new Error("Native pool size unavailable");
  const clients = await Promise.all(Array.from({ length: maximum }, () => activePool().connect()));
  try {
    const changed = await Promise.all(clients.map((client) => client.query("select set_config('TimeZone',$1,false)", [zone])));
    expect(changed.every((result) => result.rows[0].set_config === zone)).toBe(true);
  } finally { clients.forEach((client) => client.release()); }
  try { await operation(); }
  finally {
    const reset = await Promise.all(Array.from({ length: maximum }, () => activePool().connect()));
    try { await Promise.all(reset.map((client) => client.query("reset timezone"))); }
    finally { reset.forEach((client) => client.release()); }
  }
}

describe("native DreamLux condition-stock operator", () => {
  nativeTest("completes an actual unavailable return, resolution, global reuse and loss without rewriting receipts", async () => {
    await currentGrants([...slugs, "assets:write", "event_allocations:write"]);
    const id = await item();
    const events = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const allocation = crypto.randomUUID();
    await database().query("update items set quantity=10,unavailable_damaged_quantity=0,unavailable_repair_quantity=0 where id=$1", [id]);
    await database().query(`insert into events(id,name,client_name,start_date,end_date,venue_location,status)
      select id,'Synthetic condition event','Synthetic customer',day,day,'Synthetic location','Planned'
      from unnest($1::uuid[],$2::date[]) input(id,day)`, [events, ["2031-01-01", "2032-01-01", "2033-01-01"]]);
    await database().query(`insert into event_allocations(id,event_id,item_id,quantity_allocated,status,departed_at,departed_by,created_by)
      values($1,$2,$3,6,'Pulled',now(),$4,$4)`, [allocation, events[0], id, actorId]);
    const returned = await http().post(`/events/${events[0]}/allocations/${allocation}/returns`).set("Cookie", cookie)
      .send({ good_quantity: 2, damaged_quantity: 3, repair_quantity: 1, idempotency_key: "actual-unavailable-return" });
    expect(returned.status).toBe(201);
    const receipts = await database().query("select to_jsonb(r) as receipt from event_return_receipts r where item_id=$1", [id]);
    expect(receipts.rows).toHaveLength(1);
    expect((await inspect(id)).body.item).toMatchObject({ quantity: 10, unavailable_damaged_quantity: 3, unavailable_repair_quantity: 1 });
    const recovered = await resolve(id, { source_condition: "damaged", outcome: "good", quantity: 2, idempotency_key: "repaired" });
    expect(recovered.status).toBe(201);
    expect(recovered.body.resolution).toMatchObject({ item_id: id, created_by: actorId, idempotency_key: "repaired", quantity: 2, outcome: "good" });
    const reuse = await http().post(`/events/${events[1]}/allocations`).set("Cookie", cookie).send({ item_id: id, quantity_allocated: 8 });
    expect(reuse.status).toBe(201);
    // DreamLux reserves globally: a non-overlapping date is not a free second stock pool.
    expect((await http().post(`/events/${events[2]}/allocations`).set("Cookie", cookie)
      .send({ item_id: id, quantity_allocated: 1 })).status).toBe(400);
    expect((await resolve(id, { source_condition: "damaged", outcome: "lost", quantity: 1, idempotency_key: "lost" })).status).toBe(201);
    const saved = await state(id);
    expect(saved.stock).toEqual({ owned: 9, damaged: 0, repair: 1, available: 8 });
    expect(saved.movements).toEqual([expect.objectContaining({ quantity_delta: -1, quantity_before: 10, quantity_after: 9, source_type: "condition_resolution" })]);
    expect((await database().query("select to_jsonb(r) as receipt from event_return_receipts r where item_id=$1", [id])).rows).toEqual(receipts.rows);
    expect((await database().query("select condition_status from items where id=$1", [id])).rows).toEqual([{ condition_status: "Good" }]);
  });

  nativeTest("distinguishes same-name items using joined location/unit/UUID and leaves the peer untouched", async () => {
    const ids = [await item(), await item()].sort();
    const stores = [crypto.randomUUID(), crypto.randomUUID()];
    const name = `Synthetic duplicate ${ids[0]}`;
    await database().query("insert into stores(id,name,is_active) values($1,$2,true),($3,$4,false)",
      [stores[0], `East ${name}`, stores[1], `West ${name}`]);
    await database().query(`update items i set name=$1,store_id=v.store_id,unit_of_measurement=v.unit
      from (values($2::uuid,$3::uuid,'pcs'),($4::uuid,$5::uuid,'sets')) v(id,store_id,unit) where i.id=v.id`,
    [name, ids[0], stores[0], ids[1], stores[1]]);
    const list = await listStock({ search: name, limit: 1 });
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ items: [{
      id: ids[0], name, quantity: 20, unit_of_measurement: "pcs", store_id: stores[0], store_name: `East ${name}`,
      store_is_active: true, unavailable_damaged_quantity: 5, unavailable_repair_quantity: 4, deleted_at: null,
    }], next_cursor: ids[0] });
    const next = await listStock({ search: name, after: ids[0], limit: 1 });
    expect(next.body.items).toEqual([expect.objectContaining({ id: ids[1], store_name: `West ${name}`, unit_of_measurement: "sets", store_is_active: false })]);
    expect(next.body.next_cursor).toBeNull();
    const peer = await database().query("select to_jsonb(i) as item from items i where id=$1", [ids[0]]);
    expect((await resolve(ids[1], { source_condition: "damaged", outcome: "lost", quantity: 1, idempotency_key: "identified" })).status).toBe(201);
    expect((await database().query("select to_jsonb(i) as item from items i where id=$1", [ids[0]])).rows).toEqual(peer.rows);
    expect((await state(ids[0])).resolutions).toEqual([]);
  });

  nativeTest("keeps NULL-key history, archived metadata and exact keyed recovery in one statement", async () => {
    const id = await item();
    const intent = { source_condition: "repair", outcome: "repair", quantity: 1, notes: null, idempotency_key: "retained" };
    expect((await resolve(id, intent)).status).toBe(201);
    await database().query(`insert into inventory_condition_resolutions(item_id,source_condition,outcome,quantity,created_at)
      values($1,'damaged','damaged',1,null)`, [id]);
    await database().query("update items set deleted_at=now(),unit_of_measurement=null where id=$1", [id]);
    const query = spyOn(activePool(), "query");
    try {
      const detail = await inspect(id, { idempotency_key: "retained" });
      expect(detail.status).toBe(200);
      expect(detail.body.item).toMatchObject({ id, store_id: null, store_name: null, store_is_active: null, unit_of_measurement: null });
      expect(detail.body.item.deleted_at).not.toBeNull();
      expect(detail.body.recovery).toMatchObject({ ...intent, item_id: id, created_by: actorId });
      expect(detail.body.history).toHaveLength(2);
      expect(detail.body.history[1]).toMatchObject({ created_at: null, idempotency_key: null });
      expect(query.mock.calls.filter(([sql]) => typeof sql === "string" && sql.includes("condition-stock detail"))).toHaveLength(1);
    } finally { query.mockRestore(); }
    expect((await inspect(id, { idempotency_key: "absent" })).body.recovery).toBeNull();
    expect((await resolve(id, { ...intent, idempotency_key: "new" })).status).toBe(404);
  });

  nativeTest("accepts uppercase item links and rejects malformed or unbounded read inputs explicitly", async () => {
    const id = await item();
    expect((await inspect(id.toUpperCase())).body.item.id).toBe(id);
    expect((await inspect("not-a-uuid")).status).toBe(400);
    expect((await inspect(crypto.randomUUID())).status).toBe(404);
    for (const query of [{ limit: 0 }, { limit: 51 }, { limit: 1.5 }, { search: "x".repeat(101) }, { after: "invalid" }]) {
      expect((await listStock(query)).status).toBe(400);
    }
    for (const query of [{ before_id: id }, { before_id: id, before_time: "invalid" }, { idempotency_key: "x".repeat(121) }]) {
      expect((await inspect(id, query)).status).toBe(400);
    }
  });

  nativeTest.each([
    { permissions: ["assets:read"], read: 200, write: 403 },
    { permissions: ["assets:reconcile"], read: 200, write: 201 },
    { permissions: ["event_allocations:write"], read: 403, write: 403 },
    { permissions: [], read: 403, write: 403 },
  ])("uses current read/reconcile grants without inheriting return authority: $permissions", async ({ permissions, read, write }) => {
    await database().query("update roles set permissions='{}'::jsonb where id=$1", [roleId]);
    await currentGrants(permissions);
    const id = await item();
    expect((await listStock({ search: id })).status).toBe(read);
    expect((await inspect(id)).status).toBe(read);
    expect((await resolve(id, { source_condition: "repair", outcome: "good", quantity: 1 })).status).toBe(write);
  });

  nativeTest("does not restore a revoked current grant from a role name or stale role map", async () => {
    const id = await item();
    const before = await state(id);
    await database().query("update roles set name='INVENTORY_CONTROLLER' where id=$1", [roleId]);
    try {
      await currentGrants(["assets:read"]);
      expect((await resolve(id, { source_condition: "damaged", outcome: "lost", quantity: 1 })).status).toBe(403);
      expect(await state(id)).toEqual(before);
    } finally {
      await database().query("update roles set name='SYNTHETIC_CONDITION_OPERATOR_268' where id=$1", [roleId]);
    }
  });

  nativeTest("rejects identity-less signed sessions and mismatched actors without creating evidence", async () => {
    const id = await item();
    const before = await state(id);
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("Synthetic signing secret unavailable");
    const legacy = jwt.sign({ username: "synthetic.legacy.279", role: "SUPER_ADMIN", permission_slugs: ["*"] }, secret);
    expect((await http().get("/events/returns/condition-stock").set("Cookie", `token=${legacy}`)).status).toBe(401);
    expect((await http().post(`/events/returns/items/${id}/condition-resolutions`).set("Cookie", `token=${legacy}`)
      .send({ source_condition: "damaged", outcome: "lost", quantity: 1 })).status).toBe(401);
    expect((await inspect(id).set("X-Condition-Actor", crypto.randomUUID())).status).toBe(403);
    expect((await resolve(id, { source_condition: "repair", outcome: "good", quantity: 1 })
      .set("X-Condition-Actor", crypto.randomUUID())).status).toBe(403);
    expect(await state(id)).toEqual(before);
  });

  nativeTest("rejects an inactive current actor without reading or resolving stock", async () => {
    const id = await item();
    const before = await state(id);
    await database().query("update users set is_active=false where id=$1", [actorId]);
    try {
      await currentGrants(slugs);
      expect((await inspect(id)).status).toBe(401);
      expect((await resolve(id, { source_condition: "repair", outcome: "good", quantity: 1 })).status).toBe(401);
      expect(await state(id)).toEqual(before);
    } finally { await database().query("update users set is_active=true where id=$1", [actorId]); }
  });

  nativeTest("observes DreamLux's actual naive microsecond timestamp type rather than assuming timestamptz", async () => {
    expect((await database().query(`select data_type,datetime_precision,is_nullable from information_schema.columns
      where table_schema='public' and table_name='inventory_condition_resolutions' and column_name='created_at'`)).rows)
      .toEqual([{ data_type: "timestamp without time zone", datetime_precision: 6, is_nullable: "YES" }]);
  });

  nativeTest("accepts the exact million-unit boundary without inventing owned stock and rejects invalid quantities", async () => {
    const id = await item();
    await database().query("update items set quantity=1000000,unavailable_damaged_quantity=1000000,unavailable_repair_quantity=0 where id=$1", [id]);
    const before = await state(id);
    for (const quantity of [0, -1, 1.5, 1_000_001]) {
      expect((await resolve(id, { source_condition: "damaged", outcome: "good", quantity })).status).toBe(400);
    }
    expect(await state(id)).toEqual(before);
    expect((await resolve(id, { source_condition: "damaged", outcome: "good", quantity: 1_000_000,
      notes: "n".repeat(1000), idempotency_key: "k".repeat(120) })).status).toBe(201);
    expect((await state(id)).stock).toEqual({ owned: 1_000_000, damaged: 0, repair: 0, available: 1_000_000 });
  });

  nativeTest("surfaces failed reads as unavailable rather than empty balances/history", async () => {
    const id = await item();
    const pool = activePool();
    const original = pool.query.bind(pool);
    const query = spyOn(pool, "query").mockImplementation(((...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("/* condition-stock")) return Promise.reject(new Error("Synthetic condition read outage"));
      return Reflect.apply(original, pool, args);
    }) as typeof pool.query);
    try {
      const list = await listStock();
      const detail = await inspect(id);
      expect(list.status).toBe(503);
      expect(detail.status).toBe(503);
      expect(list.body.items).toBeUndefined();
      expect(detail.body.history).toBeUndefined();
    } finally { query.mockRestore(); }
  });

  nativeTest("uses bounded history including NULL keys through the full item history index", async () => {
    const seeded = await database().query<{ id: string }>(`insert into items(name,quantity,unavailable_damaged_quantity)
      select 'Synthetic history scale '||value,1000,1000 from generate_series(1,100) value returning id`);
    await database().query(`insert into inventory_condition_resolutions(item_id,source_condition,outcome,quantity,created_at)
      select item,'damaged','damaged',1,'2031-01-01'::timestamp + value*interval '1 second'
      from unnest($1::uuid[]) item cross join generate_series(1,1000) value`, [seeded.rows.map((row) => row.id)]);
    await database().query("analyze inventory_condition_resolutions");
    const query = spyOn(activePool(), "query");
    let statement: string;
    let parameters: unknown[];
    try {
      const response = await inspect(seeded.rows[0].id, { limit: 25 });
      expect(response.status).toBe(200);
      expect(response.body.history).toHaveLength(25);
      expect(response.body.history.every((row: { idempotency_key: unknown }) => row.idempotency_key === null)).toBe(true);
      const calls = query.mock.calls.filter(([sql]) => typeof sql === "string" && sql.includes("condition-stock detail"));
      expect(calls).toHaveLength(1);
      const [sql, args] = calls[0];
      if (typeof sql !== "string" || !Array.isArray(args)) throw new Error("Production read was not observed");
      statement = sql; parameters = args;
    } finally { query.mockRestore(); }
    const plan = (await database().query(`explain(analyze,buffers,format json) ${statement}`, parameters)).rows[0]["QUERY PLAN"][0];
    expect(JSON.stringify(plan.Plan)).toContain("idx_inventory_condition_resolutions_item");
    expect(plan["Execution Time"]).toBeLessThan(250);
    console.info("[condition-stock-plan]", JSON.stringify({ rows: 100000, returned: 25, executionMs: plan["Execution Time"] }));
  }, 10000);

  nativeTest.each(["UTC", "Africa/Addis_Ababa", "America/New_York"])(
    "preserves stored clock values and equivalent microsecond offset cursors under %s", async (zone) => {
      const id = await item();
      const ids = Array.from({ length: 4 }, () => crypto.randomUUID()).sort().reverse();
      const times = ["2031-11-02T06:15:00.654321", "2031-11-02T05:30:00.123456", "2031-11-02T05:30:00.123455", null];
      await database().query(`insert into inventory_condition_resolutions(id,item_id,source_condition,outcome,quantity,created_at)
        select r.id,$1,'repair','repair',1,r.created_at from unnest($2::uuid[],$3::timestamp[]) r(id,created_at)`, [id, ids, times]);
      await withTimeZone(zone, async () => {
        const page = await inspect(id, { limit: 2 });
        expect(page.status).toBe(200);
        expect(page.body.history.map((row: { created_at: string | null }) => row.created_at)).toEqual(times.slice(0, 2).map((time) => `${time}Z`));
        const params = { before_id: ids[1], limit: 2 };
        const utc = await inspect(id, { ...params, before_time: `${times[1]}Z` });
        const offset = await inspect(id, { ...params, before_time: "2031-11-02T08:30:00.123456+03:00" });
        expect(offset.body).toEqual(utc.body);
        expect(utc.body.history.map((row: { id: string }) => row.id)).toEqual(ids.slice(2));
        expect(utc.body.history[1].created_at).toBeNull();
        expect(utc.body.next_cursor).toBeNull();
        const lower = (await database().query(`select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') as value`)).rows[0].value;
        const saved = await resolve(id, { source_condition: "damaged", outcome: "damaged", quantity: 1, idempotency_key: `utc-${zone}` });
        expect(saved.status).toBe(201);
        expect(saved.body.resolution.created_at).toMatch(/\.\d{6}Z$/);
        const observed = await database().query(`select created_at between $2::timestamp and (clock_timestamp() at time zone 'UTC') as new_utc,
          to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as value from inventory_condition_resolutions where id=$1`,
        [saved.body.resolution.id, lower]);
        expect(observed.rows).toEqual([{ new_utc: true, value: saved.body.resolution.created_at }]);
      });
    },
  );
});

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
    expect({ resolved: response.body.resolved, outcome: response.body.outcome }).toEqual({ resolved: 2, outcome });
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
