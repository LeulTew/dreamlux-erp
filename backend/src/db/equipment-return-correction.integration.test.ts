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
const actorId = "27300000-0000-4000-8000-000000000001";
const roleId = "27300000-0000-4000-8000-000000000002";
const grants = { assets: ["read", "write", "reconcile"], event_allocations: ["write", "dispatch"] };
const slugs = ["assets:read", "assets:write", "assets:reconcile", "event_allocations:write", "event_allocations:dispatch"];
let observer: Client | undefined;
let appPool: Pool | undefined;
let server: Server | undefined;
let proxy: Awaited<ReturnType<typeof startDreamluxRestProxy>> | undefined;
let invalidatePermissions: (() => void) | undefined;
let cookie = "";

function database() {
  if (!observer) throw new Error("Owned DreamLux return observer is unavailable");
  return observer;
}

function http() {
  if (!server) throw new Error("Owned DreamLux return API is unavailable");
  return request(server);
}

function activePool() {
  if (!appPool) throw new Error("Owned DreamLux return pool is unavailable");
  return appPool;
}

function target() {
  const value = attestDreamluxNativeTarget(process.env.DATABASE_URL ?? "", "fixture");
  if (!/^\/dreamlux_ephemeral_equipment_259_[a-f0-9]{12}$/.test(value.pathname)) {
    throw new Error("Return QA requires the independently owned equipment fixture");
  }
  return value;
}

beforeAll(async () => {
  if (!enabled) return;
  expect(process.env.NODE_ENV).toBe("development");
  if (Reflect.get(globalThis, "__mockSupabase")) throw new Error("Return QA cannot use mocked database clients");
  observer = new Client({ connectionString: target().href, ssl: { rejectUnauthorized: false } });
  await observer.connect();
  expect((await observer.query("select current_database() as name,current_user as actor,inet_server_port() as port")).rows)
    .toEqual([{ name: target().pathname.slice(1), actor: "dreamlux_parity", port: 55434 }]);
  expect((await observer.query("select current_setting('fsync') as fsync,current_setting('full_page_writes') as full_page_writes,current_setting('synchronous_commit') as synchronous_commit")).rows)
    .toEqual([{ fsync: "on", full_page_writes: "on", synchronous_commit: "on" }]);
  await observer.query("truncate roles,permissions,users,items,events,activity_logs cascade");
  await observer.query("create schema dreamlux_qa_return; revoke all on schema dreamlux_qa_return from public");
  await observer.query("insert into roles(id,name,permissions) values($1,'SYNTHETIC_RETURN_OPERATOR_273',$2::jsonb)", [roleId, grants]);
  await observer.query("insert into permissions(slug,description) select slug,'Synthetic return authority' from unnest($1::text[]) slug", [slugs]);
  await observer.query("insert into role_permissions(role_id,permission_id) select $1,id from permissions where slug=any($2::text[])", [roleId, slugs]);
  const password = randomBytes(24).toString("base64url");
  await observer.query(`insert into users(id,username,password_hash,full_name,role_id)
    values($1,'synthetic.return.operator.273',crypt($3,gen_salt('bf')),'Synthetic return operator',$2)`, [actorId, roleId, password]);
  proxy = await startDreamluxRestProxy();
  const app = express();
  app.use(express.json());
  app.use("/auth", (await import("../routes/auth")).default);
  app.use("/assets", (await import("../routes/assets")).default);
  app.use("/events", (await import("../routes/events")).default);
  appPool = (await import("./pool")).pool;
  invalidatePermissions = (await import("../lib/permissions-cache")).invalidateAllCache;
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const login = await http().post("/auth/login").send({ username: "synthetic.return.operator.273", password });
  expect(login.status).toBe(200);
  const cookies: unknown = login.headers["set-cookie"];
  if (!Array.isArray(cookies) || !cookies.every((value): value is string => typeof value === "string")) {
    throw new Error("Synthetic return session is unavailable");
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
  if (errors.length) throw new AggregateError(errors, "Owned return QA cleanup failed");
});

beforeEach(async () => {
  if (!observer) return;
  await observer.query("update roles set permissions=$1::jsonb where id=$2", [grants, roleId]);
  await observer.query(`insert into role_permissions(role_id,permission_id)
    select $1,id from permissions where slug=any($2::text[]) on conflict do nothing`, [roleId, slugs]);
  if (!invalidatePermissions) throw new Error("Current permission invalidation is unavailable");
  invalidatePermissions();
});

async function event(date = "2030-01-15") {
  const id = crypto.randomUUID();
  await database().query(`insert into events(id,name,client_name,start_date,end_date,venue_location)
    values($1,'Synthetic return event','Synthetic customer',$2,$2,'Synthetic venue')`, [id, date]);
  return id;
}

async function item(quantity = 20) {
  const id = crypto.randomUUID();
  await database().query("insert into items(id,name,quantity) values($1,'Synthetic return stock',$2)", [id, quantity]);
  return id;
}

type History = { itemId: string; eventId: string; allocationId: string; receiptId: string };
async function history(options: { owned?: number; good?: number; damaged?: number; lost?: number; repair?: number } = {}): Promise<History> {
  const { owned = 19, good = 6, damaged = 2, lost = 1, repair = 1 } = options;
  const itemId = await item(owned);
  const eventId = await event();
  const accounted = good + damaged + lost + repair;
  await database().query("update items set unavailable_damaged_quantity=$2,unavailable_repair_quantity=$3 where id=$1", [itemId, damaged, repair]);
  const { rows: [allocation] } = await database().query<{ id: string }>(`insert into event_allocations
    (event_id,item_id,quantity_allocated,status,departed_at,departed_by,created_by,
     returned_good_quantity,returned_damaged_quantity,returned_lost_quantity,returned_repair_quantity,returned_at,returned_by)
    values($1,$2,10,case when $7=10 then 'Returned' else 'Pulled' end,now(),$8,$8,
      $3,$4,$5,$6,case when $7=10 then now() else null end,case when $7=10 then $8::uuid else null end) returning id`,
  [eventId, itemId, good, damaged, lost, repair, accounted, actorId]);
  const { rows: [receipt] } = await database().query<{ id: string }>(`insert into event_return_receipts
    (allocation_id,event_id,item_id,good_quantity,damaged_quantity,lost_quantity,repair_quantity,
     outstanding_before,outstanding_after,created_by,notes)
    values($1,$2,$3,$4,$5,$6,$7,10,$8,$9,'Synthetic retained receipt') returning id`,
  [allocation.id, eventId, itemId, good, damaged, lost, repair, 10 - accounted, actorId]);
  return { itemId, eventId, allocationId: allocation.id, receiptId: receipt.id };
}

type State = {
  stock: { owned: number; damaged: number; repair: number };
  allocation: Record<string, unknown>;
  receipt: Record<string, unknown>;
  corrections: Record<string, unknown>[];
  movements: Record<string, unknown>[];
  logs: Record<string, unknown>[];
  demand: number;
};
async function state(f: History): Promise<State> {
  const { rows: [row] } = await database().query<State>(`select
    (select jsonb_build_object('owned',quantity,'damaged',unavailable_damaged_quantity,'repair',unavailable_repair_quantity) from items where id=$1) as stock,
    (select to_jsonb(a) from event_allocations a where id=$2) as allocation,
    (select to_jsonb(r) from event_return_receipts r where id=$3) as receipt,
    (select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]'::jsonb) from event_return_corrections c where item_id=$1) as corrections,
    (select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]'::jsonb) from inventory_movements m where item_id=$1) as movements,
    (select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]'::jsonb) from event_logs l where event_id=$4) as logs,
    (select coalesce(sum(quantity_allocated-returned_good_quantity-returned_damaged_quantity-returned_lost_quantity-returned_repair_quantity),0)::int
      from event_allocations where item_id=$1 and status<>'Returned') as demand`, [f.itemId, f.allocationId, f.receiptId, f.eventId]);
  return row;
}

const correct = (receiptId: string, payload: Record<string, unknown>) =>
  http().post(`/events/returns/${receiptId}/corrections`).set("Cookie", cookie)
    .send({ reason: "Synthetic receipt correction", ...payload }).timeout({ response: 13_000, deadline: 14_000 });
const reserve = (eventId: string, itemId: string, quantity: number) =>
  http().post(`/events/${eventId}/allocations`).set("Cookie", cookie).send({ item_id: itemId, quantity_allocated: quantity });

async function depart(eventId: string, allocationId: string) {
  expect((await http().patch(`/events/${eventId}/allocations/${allocationId}/dispatch-check`).set("Cookie", cookie)
    .send({ dispatch_checked: true })).status).toBe(200);
  const response = await http().post(`/events/${eventId}/dispatch/depart`).set("Cookie", cookie).send({});
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ success: true, departed_count: 1 });
}

async function availability(itemId: string, eventId: string, expected: number) {
  const assets = await http().get("/assets").query({ limit: 100 }).set("Cookie", cookie);
  expect(assets.status).toBe(200);
  expect(assets.body.items.find((row: { id: string }) => row.id === itemId)?.available_quantity).toBe(expected);
  const workspace = await http().get(`/events/${eventId}/workspace`).set("Cookie", cookie);
  expect(workspace.status).toBe(200);
  const allocation = workspace.body.allocations.find((row: { item_id: string }) => row.item_id === itemId);
  expect(Number(allocation?.available_quantity)).toBe(expected);
}

async function loseAcknowledgement(command: "BEGIN" | "COMMIT" | "ROLLBACK") {
  const pool = activePool();
  const client = await pool.connect();
  const { rows: [connection] } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
  const originalConnect = pool.connect.bind(pool);
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);
  let released = false;
  const commands: string[] = [];
  // Authentication uses callback leases; only the mutation's lease loses acknowledgements.
  const connect = spyOn(pool, "connect").mockImplementation(((...args: unknown[]) =>
    args.length ? Reflect.apply(originalConnect, pool, args) : Promise.resolve(client)) as typeof pool.connect);
  const queryTarget: { query: (sql: string, values?: unknown[]) => Promise<QueryResult<Record<string, unknown>>> } = client;
  const query = spyOn(queryTarget, "query").mockImplementation(async (sql, values) => {
    const result = await originalQuery(sql, values);
    commands.push(sql.trim().toUpperCase());
    if (sql.trim().toUpperCase() === command) throw new Error(`Synthetic return ${command} acknowledgement loss`);
    return result;
  });
  const release = spyOn(client, "release").mockImplementation((discard) => {
    released = true;
    originalRelease(discard);
  });
  return {
    release, commands, pid: connection.pid,
    rollback: () => originalQuery("ROLLBACK"),
    restore() {
      query.mockRestore();
      connect.mockRestore();
      release.mockRestore();
      if (!released) originalRelease(true);
    },
  };
}

describe("native DreamLux return corrections and global availability", () => {
  nativeTest("uses native DreamLux columns rather than importing Koti additive dispatch fields", async () => {
    const fields = await database().query(`select column_name from information_schema.columns where table_schema='public'
      and table_name='event_allocations' and column_name in ('quantity_dispatched','cancelled_at')`);
    expect(fields.rows).toEqual([]);
  });

  nativeTest("preserves ordinary reservation, dispatch, mixed return and newly reusable stock", async () => {
    const itemId = await item();
    const eventId = await event();
    const reserved = await reserve(eventId, itemId, 10);
    expect(reserved.status).toBe(201);
    await availability(itemId, eventId, 10);
    await depart(eventId, reserved.body.id);
    await availability(itemId, eventId, 10);
    const returned = await http().post(`/events/${eventId}/allocations/${reserved.body.id}/returns`).set("Cookie", cookie)
      .send({ good_quantity: 6, damaged_quantity: 2, lost_quantity: 1, repair_quantity: 1, idempotency_key: "ordinary-return" });
    expect(returned.status).toBe(201);
    expect(returned.body).toMatchObject({ fully_returned: true, outstanding_quantity: 0 });
    const receipts = await database().query<{ id: string }>("select id from event_return_receipts where allocation_id=$1", [reserved.body.id]);
    const stored = await state({ itemId, eventId, allocationId: reserved.body.id, receiptId: receipts.rows[0].id });
    expect(stored.stock).toEqual({ owned: 19, damaged: 2, repair: 1 });
    expect(stored.allocation).toMatchObject({ status: "Returned", returned_by: actorId });
    expect(stored.movements).toHaveLength(1);
    await availability(itemId, eventId, 16);
    const nextEvent = await event("2031-04-01");
    expect((await reserve(nextEvent, itemId, 17)).status).toBe(400);
    const reused = await reserve(nextEvent, itemId, 16);
    expect(reused.status).toBe(201);
    await depart(nextEvent, reused.body.id);
    await availability(itemId, eventId, 0);
    expect((await state({ itemId, eventId, allocationId: reserved.body.id, receiptId: receipts.rows[0].id })).receipt).toEqual(stored.receipt);
  });

  nativeTest.each([
    { label: "disjoint future event", eventStatus: "Planned", trashed: false, status: "Reserved", good: 0, expected: 13 },
    { label: "completed event reservation", eventStatus: "Completed", trashed: false, status: "Reserved", good: 0, expected: 13 },
    { label: "trashed event reservation", eventStatus: "Planned", trashed: true, status: "Reserved", good: 0, expected: 13 },
    { label: "partially returned custody", eventStatus: "Completed", trashed: false, status: "Pulled", good: 3, expected: 16 },
    { label: "retained legacy Returned row", eventStatus: "Completed", trashed: false, status: "Returned", good: 0, expected: 20 },
  ])("retains global read/allocation/dispatch policy for a $label", async ({ eventStatus, trashed, status, good, expected }) => {
    const itemId = await item();
    const oldEvent = await event("2029-01-01");
    await database().query("update events set status=$2,deleted_at=case when $3 then now() else null end where id=$1", [oldEvent, eventStatus, trashed]);
    await database().query(`insert into event_allocations(event_id,item_id,quantity_allocated,status,returned_good_quantity)
      values($1,$2,7,$3,$4)`, [oldEvent, itemId, status, good]);
    const nextEvent = await event("2032-01-01");
    // The first reservation gives the real workspace a row without relying on an empty response.
    const first = await reserve(nextEvent, itemId, 1);
    expect(first.status).toBe(201);
    await availability(itemId, nextEvent, expected - 1);
    expect((await reserve(await event("2033-01-01"), itemId, expected)).status).toBe(400);
    const grown = await http().patch(`/events/${nextEvent}/allocations/${first.body.id}`).set("Cookie", cookie).send({ quantity_allocated: expected });
    expect(grown.status).toBe(200);
    await availability(itemId, nextEvent, 0);
    await depart(nextEvent, first.body.id);
    await availability(itemId, nextEvent, 0);
  });

  nativeTest("acknowledges a closing correction with a native UUID returned_by", async () => {
    const f = await history({ good: 5, damaged: 0, lost: 0, repair: 0, owned: 20 });
    const original = await state(f);
    const result = await correct(f.receiptId, { good_delta: 5 });
    expect(result.status).toBe(201);
    expect(result.body.outstanding_quantity).toBe(0);
    const stored = await state(f);
    expect(stored.allocation).toMatchObject({ status: "Returned", returned_good_quantity: 10, returned_by: actorId });
    expect(stored.receipt).toEqual(original.receipt);
    expect(stored.corrections).toHaveLength(1);
    expect(stored.logs).toHaveLength(1);
    expect(stored.movements).toHaveLength(0);
  });

  nativeTest("reopens retained completed-event history without changing the original receipt", async () => {
    const f = await history();
    await database().query("update events set status='Completed' where id=$1", [f.eventId]);
    const before = await state(f);
    expect((await correct(f.receiptId, { good_delta: -1 })).status).toBe(201);
    const after = await state(f);
    expect(after.allocation).toMatchObject({ status: "Pulled", returned_good_quantity: 5, returned_at: null, returned_by: null });
    expect(after.receipt).toEqual(before.receipt);
    expect(after.stock).toEqual(before.stock);
    expect(after.demand).toBe(1);
    await availability(f.itemId, f.eventId, 15);
  });

  nativeTest("commits stock, movement, allocation and audit effects of a legitimate loss correction once", async () => {
    const f = await history();
    const before = await state(f);
    expect((await correct(f.receiptId, { good_delta: -1, lost_delta: 1 })).status).toBe(201);
    const after = await state(f);
    expect(after.stock).toEqual({ owned: 18, damaged: 2, repair: 1 });
    expect(after.movements).toHaveLength(1);
    expect(after.movements[0]).toMatchObject({ quantity_delta: -1, quantity_before: 19, quantity_after: 18, source_type: "event_return_correction" });
    expect(after.corrections).toHaveLength(1);
    expect(after.logs).toHaveLength(1);
    expect(after.receipt).toEqual(before.receipt);
    await availability(f.itemId, f.eventId, 15);
  });

  nativeTest("serializes competing corrections against current receipt and allocation balances", async () => {
    const f = await history();
    const results = await Promise.all([
      correct(f.receiptId, { good_delta: -4, damaged_delta: 4, idempotency_key: "competing-a" }),
      correct(f.receiptId, { good_delta: -4, damaged_delta: 4, idempotency_key: "competing-b" }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const stored = await state(f);
    expect(stored.corrections).toHaveLength(1);
    expect(stored.allocation).toMatchObject({ returned_good_quantity: 2, returned_damaged_quantity: 6 });
  });

  nativeTest("refreshes per-receipt balances after waiting behind a concurrent correction", async () => {
    const f = await history({ owned: 20, good: 2, damaged: 0, lost: 0, repair: 0 });
    await database().query(`insert into event_return_receipts
      (allocation_id,event_id,item_id,good_quantity,outstanding_before,outstanding_after,created_by)
      values($1,$2,$3,8,8,0,$4)`, [f.allocationId, f.eventId, f.itemId, actorId]);
    await database().query(`update event_allocations set returned_good_quantity=10,status='Returned',returned_at=now(),returned_by=$2
      where id=$1`, [f.allocationId, actorId]);
    const blocker = new Client({ connectionString: target().href, ssl: { rejectUnauthorized: false } });
    await blocker.connect();
    let pending: Array<Promise<request.Response>> = [];
    try {
      await blocker.query("begin");
      await blocker.query("select id from event_return_receipts where id=$1 for update", [f.receiptId]);
      pending = ["receipt-a", "receipt-b"].map((idempotency_key) =>
        correct(f.receiptId, { good_delta: -2, damaged_delta: 2, idempotency_key }).then((response) => response));
      const until = Date.now() + 2_000;
      let waiting = 0;
      while (waiting < 2 && Date.now() < until) {
        const locks = await database().query<{ count: number }>(`select count(*)::int as count from pg_stat_activity
          where datname=current_database() and wait_event_type='Lock' and query like '%FROM event_return_receipts r%'`);
        waiting = locks.rows[0].count;
        if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(2);
      await blocker.query("rollback");
      const responses = await Promise.all(pending);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const saved = await state(f);
      expect(saved.corrections).toHaveLength(1);
      expect(saved.allocation).toMatchObject({ returned_good_quantity: 8, returned_damaged_quantity: 2 });
    } finally {
      await blocker.query("rollback");
      await Promise.allSettled(pending);
      await blocker.end();
    }
  });

  nativeTest("keeps a correction idempotency key from applying stock twice", async () => {
    const f = await history();
    const input = { good_delta: -1, lost_delta: 1, idempotency_key: "return-once-only" };
    expect((await correct(f.receiptId, input)).status).toBe(201);
    const saved = await state(f);
    expect((await correct(f.receiptId, input)).status).toBe(409);
    expect(await state(f)).toEqual(saved);
  });

  nativeTest("preserves input, missing-history, receipt-balance and trashed-item controls", async () => {
    const f = await history();
    const before = await state(f);
    expect((await correct(f.receiptId, { good_delta: 0 })).status).toBe(400);
    expect((await correct(f.receiptId, { good_delta: -1, reason: "" })).status).toBe(400);
    expect((await correct(f.receiptId, { good_delta: 1 })).status).toBe(409);
    expect((await correct(f.receiptId, { good_delta: -7 })).status).toBe(409);
    expect((await correct(crypto.randomUUID(), { good_delta: -1 })).status).toBe(404);
    expect(await state(f)).toEqual(before);
    await database().query("update events set deleted_at=now() where id=$1", [f.eventId]);
    expect((await correct(f.receiptId, { good_delta: -1 })).status).toBe(404);
    await database().query("update events set deleted_at=null where id=$1", [f.eventId]);
    await database().query("update items set deleted_at=now() where id=$1", [f.itemId]);
    expect((await correct(f.receiptId, { good_delta: -1 })).status).toBe(409);
    expect(await state(f)).toEqual(before);
  });

  nativeTest("checks current authority rather than trusting an already issued session", async () => {
    const f = await history();
    const before = await state(f);
    await database().query("update roles set permissions=$1::jsonb where id=$2", [{ assets: ["read", "write"] }, roleId]);
    await database().query("delete from role_permissions where role_id=$1 and permission_id=(select id from permissions where slug='assets:reconcile')", [roleId]);
    invalidatePermissions!();
    expect((await correct(f.receiptId, { good_delta: -1 })).status).toBe(403);
    expect((await http().post(`/events/returns/${f.receiptId}/corrections`).send({ good_delta: -1, reason: "No session" })).status).toBe(401);
    expect(await state(f)).toEqual(before);
  });

  nativeTest("rejects a malformed receipt identifier without a transaction", async () => {
    const f = await history();
    const before = await state(f);
    expect((await correct("not-a-uuid", { good_delta: -1 })).status).toBe(400);
    expect(await state(f)).toEqual(before);
  });

  nativeTest.each([
    { label: "reopened custody", input: { good_delta: -1 } },
    { label: "new loss", input: { good_delta: -1, lost_delta: 1 } },
    { label: "new damaged stock", input: { good_delta: -1, damaged_delta: 1 } },
    { label: "new repair stock", input: { good_delta: -1, repair_delta: 1 } },
  ])("does not reclaim capacity already reallocated through $label", async ({ input }) => {
    const f = await history({ owned: 10, good: 10, damaged: 0, lost: 0, repair: 0 });
    expect((await reserve(await event("2035-01-01"), f.itemId, 10)).status).toBe(201);
    const before = await state(f);
    const response = await correct(f.receiptId, input);
    expect(response.status).toBe(409);
    expect(response.body.error).toContain("reserved");
    expect(await state(f)).toEqual(before);
  });

  nativeTest("allows capacity-releasing corrections that reduce an existing shortage", async () => {
    const f = await history();
    await database().query("insert into event_allocations(event_id,item_id,quantity_allocated) values($1,$2,20)", [await event(), f.itemId]);
    const before = await state(f);
    expect(before.demand - before.stock.owned + before.stock.damaged + before.stock.repair).toBe(4);
    expect((await correct(f.receiptId, { good_delta: 1, lost_delta: -1 })).status).toBe(201);
    const after = await state(f);
    expect(after.stock).toEqual({ owned: 20, damaged: 2, repair: 1 });
    expect(after.demand - after.stock.owned + after.stock.damaged + after.stock.repair).toBe(3);
    expect(after.receipt).toEqual(before.receipt);
  });

  nativeTest("allows capacity-neutral condition corrections despite an existing shortage", async () => {
    const f = await history();
    await database().query("insert into event_allocations(event_id,item_id,quantity_allocated) values($1,$2,20)", [await event(), f.itemId]);
    expect((await correct(f.receiptId, { damaged_delta: -1, repair_delta: 1 })).status).toBe(201);
    expect((await state(f)).stock).toEqual({ owned: 19, damaged: 1, repair: 2 });
  });

  nativeTest("does not worsen an existing global shortage", async () => {
    const f = await history();
    await database().query("insert into event_allocations(event_id,item_id,quantity_allocated) values($1,$2,20)", [await event(), f.itemId]);
    const before = await state(f);
    expect((await correct(f.receiptId, { good_delta: -1, lost_delta: 1 })).status).toBe(409);
    expect(await state(f)).toEqual(before);
  });

  nativeTest("serializes a competing reservation and return correction on the shared item lock", async () => {
    const f = await history({ owned: 10, good: 10, damaged: 0, lost: 0, repair: 0 });
    const otherEvent = await event("2034-01-01");
    const [correction, reservation] = await Promise.all([
      correct(f.receiptId, { good_delta: -1 }), reserve(otherEvent, f.itemId, 10),
    ]);
    expect([[201, 400], [409, 201]]).toContainEqual([correction.status, reservation.status]);
    const after = await state(f);
    expect(after.stock.owned - after.stock.damaged - after.stock.repair - after.demand).toBeGreaterThanOrEqual(0);
    expect(after.corrections.length).toBe(correction.status === 201 ? 1 : 0);
  });

  nativeTest.each([
    { label: "correction row", table: "event_return_corrections", trigger: "insert", body: "return null;" },
    { label: "stock row", table: "items", trigger: "update", body: "return null;" },
    { label: "loss movement", table: "inventory_movements", trigger: "insert", body: "return null;" },
    { label: "allocation row", table: "event_allocations", trigger: "update", body: "return null;" },
    { label: "event audit", table: "event_logs", trigger: "insert", body: "return null;" },
    { label: "stock database error", table: "items", trigger: "update", body: "raise exception 'Synthetic return write failure';" },
  ])("does not acknowledge a missing $label", async ({ table, trigger, body }) => {
    const f = await history();
    const before = await state(f);
    await database().query(`create function dreamlux_qa_return.reject_write() returns trigger language plpgsql as $$
      begin ${body} end $$; create trigger reject_return_write_273 before ${trigger} on ${table}
      for each row execute function dreamlux_qa_return.reject_write()`);
    try {
      const response = await correct(f.receiptId, { good_delta: -1, lost_delta: 1 });
      expect({ status: response.status, stored: await state(f) }).toEqual({ status: 500, stored: before });
    } finally {
      await database().query(`drop trigger reject_return_write_273 on ${table}; drop function dreamlux_qa_return.reject_write()`);
    }
  });

  nativeTest("does not return an open transaction after a lost BEGIN acknowledgement", async () => {
    const f = await history();
    const before = await state(f);
    const fault = await loseAcknowledgement("BEGIN");
    try {
      expect((await correct(f.receiptId, { good_delta: -1 })).status).toBe(500);
      expect(await state(f)).toEqual(before);
      expect((await database().query("select state from pg_stat_activity where pid=$1", [fault.pid])).rows).toEqual([{ state: "idle" }]);
      expect(fault.release).toHaveBeenCalledTimes(1);
      expect(fault.release.mock.calls[0]?.[0]).not.toBe(true);
    } finally {
      try { await fault.rollback(); } finally { fault.restore(); }
    }
  });

  nativeTest("reports uncertain real COMMIT acknowledgement loss without automatic replay", async () => {
    const f = await history();
    const input = { good_delta: -1, lost_delta: 1, idempotency_key: "uncertain-return" };
    const fault = await loseAcknowledgement("COMMIT");
    try {
      const response = await correct(f.receiptId, input);
      const saved = await state(f);
      expect({ status: response.status, stock: saved.stock }).toEqual({ status: 503, stock: { owned: 18, damaged: 2, repair: 1 } });
      expect(response.body).toMatchObject({ code: "RETURN_CORRECTION_UNCONFIRMED", outcome_uncertain: true });
      expect(response.body.correction).toBeUndefined();
      expect(saved.corrections).toHaveLength(1);
      expect(saved.movements).toHaveLength(1);
      expect(saved.logs).toHaveLength(1);
      expect(fault.commands.filter((command) => command === "COMMIT")).toHaveLength(1);
      expect(fault.commands.filter((command) => command === "BEGIN")).toHaveLength(1);
      expect(fault.release).toHaveBeenCalledWith(true);
    } finally {
      fault.restore();
    }
    const saved = await state(f);
    expect((await correct(f.receiptId, input)).status).toBe(409);
    expect(await state(f)).toEqual(saved);
  });

  nativeTest("surfaces transaction-client acquisition failure without losing the HTTP error boundary", async () => {
    const f = await history();
    const before = await state(f);
    const pool = activePool();
    const original = pool.connect.bind(pool);
    const connect = spyOn(pool, "connect").mockImplementation(((...args: unknown[]) =>
      args.length ? Reflect.apply(original, pool, args) : Promise.reject(new Error("Synthetic return acquisition failure"))) as typeof pool.connect);
    try {
      const response = await correct(f.receiptId, { good_delta: -1 }).timeout({ response: 1_500, deadline: 2_000 });
      expect(response.status).toBe(500);
      expect(await state(f)).toEqual(before);
    } finally {
      connect.mockRestore();
    }
  });

  nativeTest("discards the connection after actual rollback acknowledgement failure", async () => {
    const f = await history();
    const before = await state(f);
    const fault = await loseAcknowledgement("ROLLBACK");
    try {
      const response = await correct(f.receiptId, { good_delta: -99 }).timeout({ response: 1_500, deadline: 2_000 });
      expect(response.status).toBe(500);
      expect(await state(f)).toEqual(before);
      expect(fault.release).toHaveBeenCalledWith(true);
    } finally {
      fault.restore();
    }
  });

  nativeTest("bounds a real competing item lock without changing correction history", async () => {
    const f = await history();
    const before = await state(f);
    const blocker = new Client({ connectionString: target().href, ssl: { rejectUnauthorized: false } });
    await blocker.connect();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Promise<request.Response> | undefined;
    try {
      await blocker.query("begin");
      await blocker.query("select id from items where id=$1 for update", [f.itemId]);
      const started = performance.now();
      const released = new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => { void blocker.query("rollback").then(() => resolve(), reject); }, 11_500);
      });
      pending = correct(f.receiptId, { good_delta: -1 }).then((response) => response);
      const response = await pending;
      const elapsed = performance.now() - started;
      await released;
      expect(response.status).toBe(409);
      expect(response.body.code).toBe("RETURN_CORRECTION_BUSY");
      expect(elapsed).toBeGreaterThanOrEqual(9_000);
      expect(elapsed).toBeLessThan(11_300);
      expect(await state(f)).toEqual(before);
    } finally {
      clearTimeout(timer);
      await blocker.query("rollback");
      await pending;
      await blocker.end();
    }
  }, 15_000);
});
