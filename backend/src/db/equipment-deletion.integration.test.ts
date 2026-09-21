import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { isAbsolute } from "node:path";
import express from "express";
import request from "supertest";
import { Client, type Pool, type PoolClient, type QueryResult } from "pg";
import { attestDreamluxNativeTarget } from "./testing/dreamlux-native-target";
import { startDreamluxRestProxy } from "./testing/dreamlux-rest-proxy";

const enabled = !!process.env.DREAMLUX_NATIVE_TEST_ADMIN_URL;
const nativeTest = enabled ? test : test.skip;
const browserMode = process.env.DREAMLUX_EQUIPMENT_BROWSER_SERVER === "1";
if (browserMode && !enabled) throw new Error("Equipment browser QA requires an explicitly attested native target");
const browserKey = randomBytes(24).toString("hex");
let stopBrowser!: () => void;
const browserStopped = new Promise<void>((resolve) => { stopBrowser = resolve; });
let browserDescriptor: string | undefined;
const actorId = "25900000-0000-4000-8000-000000000001";
const roleId = "25900000-0000-4000-8000-000000000002";
const grants = {
  assets: ["read", "write", "delete", ...(browserMode ? ["reconcile"] : [])],
  ...(browserMode ? { event_allocations: ["write", "dispatch"] } : {}),
};
const slugs = Object.entries(grants).flatMap(([resource, actions]) => actions.map((action) => `${resource}:${action}`));
let observer: Client | undefined;
let appPool: Pool | undefined;
let server: Server | undefined;
let proxy: Awaited<ReturnType<typeof startDreamluxRestProxy>> | undefined;
let cookie = "";
let invalidatePermissions: (() => void) | undefined;
let removeImage: ReturnType<typeof spyOn<typeof import("../storage/storage"), "deleteImage">> | undefined;

function database() {
  if (!observer) throw new Error("Owned DreamLux equipment fixture is unavailable");
  return observer;
}

function http() {
  if (!server) throw new Error("Owned DreamLux equipment API is unavailable");
  return request(server);
}

function target() {
  const value = attestDreamluxNativeTarget(process.env.DATABASE_URL ?? "", "fixture");
  if (!/^\/dreamlux_ephemeral_equipment_259_[a-f0-9]{12}$/.test(value.pathname)) {
    throw new Error("Refusing a target outside the independent equipment259 fixture");
  }
  return value;
}

beforeAll(async () => {
  if (!enabled) return;
  expect(process.env.NODE_ENV).toBe("development");
  if (Reflect.get(globalThis, "__mockSupabase")) throw new Error("Equipment native QA cannot use mocked database clients");
  observer = new Client({ connectionString: target().href, ssl: { rejectUnauthorized: false } });
  await observer.connect();
  const identity = await observer.query<{ name: string; actor: string; port: number }>(
    "select current_database() as name,current_user as actor,inet_server_port() as port",
  );
  expect(identity.rows).toEqual([{ name: target().pathname.slice(1), actor: "dreamlux_parity", port: 55434 }]);
  await observer.query("truncate roles,permissions,users,items,events,activity_logs cascade");
  await observer.query("insert into roles(id,name,permissions) values($1,'SYNTHETIC_ASSET_OPERATOR_259',$2::jsonb)", [roleId, grants]);
  await observer.query(`insert into permissions(slug,description)
    select slug,'Synthetic equipment authority' from unnest($1::text[]) slug on conflict (slug) do nothing`, [slugs]);
  await observer.query(`insert into role_permissions(role_id,permission_id)
    select $1,id from permissions where slug=any($2::text[])`, [roleId, slugs]);
  const password = randomBytes(24).toString("base64url");
  await observer.query(`insert into users(id,username,password_hash,full_name,role_id)
    values($1,'synthetic.item.operator.259',crypt($3,gen_salt('bf')),'Synthetic equipment operator',$2)`, [actorId, roleId, password]);
  proxy = await startDreamluxRestProxy();
  const storage = await import("../storage/storage");
  removeImage = spyOn(storage, "deleteImage").mockResolvedValue();
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
  }
  app.use("/auth", (await import("../routes/auth")).default);
  app.use("/assets", (await import("../routes/assets")).default);
  if (browserMode) app.use("/events", (await import("../routes/events")).default);
  appPool = (await import("./pool")).pool;
  invalidatePermissions = (await import("../lib/permissions-cache")).invalidateAllCache;
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(browserMode ? 5326 : 0, "127.0.0.1", resolve);
  });
  const login = await http().post("/auth/login").send({ username: "synthetic.item.operator.259", password });
  expect(login.status).toBe(200);
  const cookies: unknown = login.headers["set-cookie"];
  if (!Array.isArray(cookies) || !cookies.every((entry): entry is string => typeof entry === "string")) {
    throw new Error("Synthetic DreamLux session cookie is missing");
  }
  cookie = cookies.map((entry) => entry.split(";")[0]).join("; ");
}, 45_000);

afterAll(async () => {
  removeImage?.mockRestore();
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  await appPool?.end();
  await observer?.end();
  await proxy?.close();
  if (browserDescriptor) await unlink(browserDescriptor);
});

beforeEach(async () => {
  if (!observer) return;
  removeImage?.mockReset();
  removeImage?.mockResolvedValue();
  await observer.query("update roles set permissions=$1::jsonb where id=$2", [grants, roleId]);
  await observer.query(`insert into role_permissions(role_id,permission_id)
    select $1,id from permissions where slug=any($2::text[]) on conflict do nothing`,
  [roleId, slugs]);
  if (!invalidatePermissions) throw new Error("Current permission cache invalidation is unavailable");
  invalidatePermissions();
});

async function item(trashed = true, id = crypto.randomUUID()) {
  await database().query(`insert into items(id,name,quantity,image_key,deleted_at)
    values($1,'Synthetic retained equipment',10,'synthetic/retained.webp',case when $2 then now() else null end)`, [id, trashed]);
  return id;
}

async function allocation(itemId: string, options: {
  departed?: boolean;
  deletedParent?: boolean;
  eventStatus?: "Planned" | "Ongoing" | "Completed";
  returned?: boolean;
} = {}) {
  const { departed = false, deletedParent = false, eventStatus = "Planned", returned = false } = options;
  const eventId = crypto.randomUUID();
  await database().query(`insert into events(id,name,client_name,start_date,end_date,venue_location,status,deleted_at)
    values($1,'Synthetic equipment event','Synthetic customer','2030-01-15','2030-01-15','Synthetic venue',$3,
      case when $2 then now() else null end)`, [eventId, deletedParent, eventStatus]);
  const { rows: [row] } = await database().query<{ id: string }>(`insert into event_allocations(
    event_id,item_id,quantity_allocated,status,departed_at,departed_by,created_by,returned_good_quantity,returned_at,returned_by)
    values($1,$2,10,case when $5 then 'Returned' when $3 then 'Pulled' else 'Reserved' end,
      case when $3 then now() else null end,case when $3 then $4::uuid else null end,$4,
      case when $5 then 10 else 0 end,case when $5 then now() else null end,case when $5 then $4::uuid else null end) returning id`,
  [eventId, itemId, departed, actorId, returned]);
  return { id: row.id, eventId };
}

const purge = (id: string) => http().delete(`/assets/${id}/permanent`).set("Cookie", cookie);
async function itemState(id: string) {
  const { rows: [row] } = await database().query(`select
    (select to_jsonb(i) from items i where id=$1) as item,
    (select coalesce(jsonb_agg(a order by a.id),'[]'::jsonb) from event_allocations a where item_id=$1) as allocations,
    (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from inventory_reconciliation_items r where item_id=$1) as recounts,
    (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from capital_investments r where asset_id=$1) as investments,
    (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from inventory_movements r where item_id=$1) as movements,
    (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from inventory_condition_resolutions r where item_id=$1) as resolutions,
    (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from event_return_receipts r where item_id=$1) as receipts,
    (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from event_return_corrections r where item_id=$1) as corrections,
    (select count(*)::int from activity_logs where entity_type='asset' and entity_id=$1::uuid and action='permanent_delete') as delete_audits`, [id]);
  return row;
}

async function waitForBlockedClient(blocker: number) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const { rowCount } = await database().query(
      "select pid from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))", [blocker],
    );
    if (rowCount) return;
    await Bun.sleep(10);
  }
  throw new Error("The expected independent database lock wait never occurred");
}

if (browserMode) {
  nativeTest("provides only the independently owned equipment browser infrastructure", async () => {
    const descriptor = process.env.DREAMLUX_EQUIPMENT_BROWSER_DESCRIPTOR;
    if (!descriptor || !isAbsolute(descriptor)) throw new Error("Missing absolute private equipment browser descriptor");
    await writeFile(descriptor, JSON.stringify({
      purpose: "dreamlux-equipment-259", apiOrigin: "http://127.0.0.1:5326",
      database: target().pathname.slice(1), writerCookie: cookie, shutdownKey: browserKey,
    }), { mode: 0o600, flag: "wx" });
    browserDescriptor = descriptor;
    await browserStopped;
  }, 150_000);
} else describe("DreamLux native permanent equipment deletion", () => {
  nativeTest("keeps unused trash restorable before any permanent deletion", async () => {
    const id = await item();
    expect((await http().post(`/assets/${id}/recover`).set("Cookie", cookie).send({ quantity: 10 })).status).toBe(200);
    expect((await itemState(id)).item.deleted_at).toBeNull();
    expect(removeImage).not.toHaveBeenCalled();
  });

  nativeTest("keeps ordinary unused-trash deletion available", async () => {
    const id = await item();
    expect((await purge(id)).status).toBe(200);
    expect((await itemState(id)).item).toBeNull();
  });

  nativeTest("deletes only unused trash and commits its attributable audit before image cleanup", async () => {
    const id = await item();
    removeImage?.mockImplementation(async () => {
      expect(await itemState(id)).toMatchObject({ item: null, delete_audits: 1 });
    });
    const response = await purge(id);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, permanently_deleted: true });
    expect(removeImage).toHaveBeenCalledWith("synthetic/retained.webp", { requireSuccess: true });
    const { rows: [audit] } = await database().query("select user_id,old_value from activity_logs where entity_id=$1 and action='permanent_delete'", [id]);
    expect(audit.user_id).toBe(actorId);
    expect(JSON.parse(audit.old_value)).toMatchObject({ name: "Synthetic retained equipment", quantity: 10, image_key: "synthetic/retained.webp" });
  });

  nativeTest("reports cleanup failure separately after a confirmed deletion", async () => {
    const id = await item();
    removeImage?.mockRejectedValueOnce(new Error("Synthetic image cleanup failure"));
    const response = await purge(id);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, permanently_deleted: true, storage_cleanup_pending: true });
    expect(await itemState(id)).toMatchObject({ item: null, delete_audits: 1 });
  });

  nativeTest("retains canonical audit identity for uppercase UUID input", async () => {
    const id = await item(true, "25900000-0000-4000-8000-0000000000ab");
    expect((await purge(id.toUpperCase())).status).toBe(200);
    expect(await itemState(id)).toMatchObject({ item: null, delete_audits: 1 });
  });

  nativeTest("rejects active, malformed and missing IDs without changing data", async () => {
    const id = await item(false);
    const before = await itemState(id);
    expect((await purge(id)).status).toBe(409);
    expect((await purge("not-a-uuid")).status).toBe(400);
    expect((await purge(crypto.randomUUID())).status).toBe(404);
    expect(await itemState(id)).toEqual(before);
    expect(removeImage).not.toHaveBeenCalled();
  });

  nativeTest.each([
    { label: "untouched reservation", departed: false, deletedParent: false },
    { label: "outstanding dispatch", departed: true, deletedParent: false },
    { label: "historical parent", departed: true, deletedParent: true },
    { label: "ongoing parent", departed: true, eventStatus: "Ongoing" as const },
    { label: "completed return", departed: true, eventStatus: "Completed" as const, returned: true },
  ])("preserves $label custody and every existing audit field", async (options) => {
    const id = await item();
    await allocation(id, options);
    const before = await itemState(id);
    const response = await purge(id);
    const after = await itemState(id);
    expect({ status: response.status, retained: after.item !== null, allocations: after.allocations.length })
      .toEqual({ status: 409, retained: true, allocations: before.allocations.length });
    expect(response.body.code).toBe("ITEM_HAS_HISTORY");
    expect(after).toEqual(before);
    expect(removeImage).not.toHaveBeenCalled();
  });

  nativeTest.each(["recount", "investment", "movement", "condition", "receipt", "correction"])(
    "preserves retained %s evidence", async (kind) => {
      const id = await item();
      if (kind === "recount") {
        await database().query(`with run as (insert into inventory_reconciliation_runs(item_count) values(1) returning id)
          insert into inventory_reconciliation_items(run_id,item_id,previous_quantity,counted_quantity,delta)
          select id,$1,9,10,1 from run`, [id]);
      } else if (kind === "investment") {
        await database().query(`insert into capital_investments(purchase_date,item_name,category,quantity,unit,unit_cost,asset_id,deleted_at)
          values('2030-01-01','Synthetic retained investment','Equipment',10,'pcs',10,$1,now())`, [id]);
      } else if (kind === "movement") {
        await database().query(`insert into inventory_movements(item_id,quantity_delta,quantity_before,quantity_after,source_type,source_id)
          values($1,1,9,10,'synthetic_fixture',$2)`, [id, crypto.randomUUID()]);
      } else if (kind === "condition") {
        await database().query(`insert into inventory_condition_resolutions(item_id,source_condition,outcome,quantity)
          values($1,'repair','good',1)`, [id]);
      } else {
        const allocated = await allocation(id, { departed: true });
        const { rows: [receipt] } = await database().query<{ id: string }>(`insert into event_return_receipts
          (allocation_id,event_id,item_id,good_quantity,outstanding_before,outstanding_after)
          values($1,$2,$3,1,10,9) returning id`, [allocated.id, allocated.eventId, id]);
        if (kind === "correction") {
          await database().query(`insert into event_return_corrections(receipt_id,allocation_id,event_id,item_id,good_delta,outstanding_before,outstanding_after,reason)
            values($1,$2,$3,$4,1,9,8,'Synthetic correction')`, [receipt.id, allocated.id, allocated.eventId, id]);
        }
      }
      const before = await itemState(id);
      const response = await purge(id);
      const after = await itemState(id);
      expect({ status: response.status, retained: after.item !== null }).toEqual({ status: 409, retained: true });
      expect(after).toEqual(before);
      expect(removeImage).not.toHaveBeenCalled();
    },
  );

  nativeTest("requires current delete authority and an authenticated session", async () => {
    const id = await item();
    const before = await itemState(id);
    await database().query("update roles set permissions=$1::jsonb where id=$2", [{ assets: ["read"] }, roleId]);
    await database().query(`delete from role_permissions where role_id=$1
      and permission_id in (select id from permissions where slug='assets:delete')`, [roleId]);
    invalidatePermissions!();
    expect((await purge(id)).status).toBe(403);
    expect((await http().delete(`/assets/${id}/permanent`)).status).toBe(401);
    expect(await itemState(id)).toEqual(before);
    expect(removeImage).not.toHaveBeenCalled();
  });

  nativeTest.each([
    { label: "raises an error", body: "raise exception 'Synthetic audit failure';" },
    { label: "silently suppresses the row", body: "return null;" },
    { label: "fails its actor foreign key", body: "new.user_id='25900000-0000-4000-8000-000000000099'::uuid;" },
  ])("rolls back when the required audit $label without misreporting item history", async ({ body }) => {
    const id = await item();
    const before = await itemState(id);
    await database().query(`create function fail_item_delete_audit_259() returns trigger language plpgsql as $$
      begin if new.action='permanent_delete' then ${body} end if; return new; end $$;
      create trigger fail_item_delete_audit_259 before insert on activity_logs for each row execute function fail_item_delete_audit_259()`);
    try {
      const response = await purge(id);
      const after = await itemState(id);
      expect({ status: response.status, retained: after.item !== null, audits: after.delete_audits })
        .toEqual({ status: 500, retained: true, audits: before.delete_audits });
      expect(response.body).toEqual({ error: "Permanent delete failed" });
      expect(after).toEqual(before);
      expect(removeImage).not.toHaveBeenCalled();
    } finally {
      await database().query("drop trigger fail_item_delete_audit_259 on activity_logs; drop function fail_item_delete_audit_259()");
    }
  });

  nativeTest("serializes a concurrent retained-reference insert before deciding deletion", async () => {
    const id = await item();
    const writer = new Client({ connectionString: target().href, ssl: { rejectUnauthorized: false } });
    await writer.connect();
    let pending: Promise<Awaited<ReturnType<typeof purge>>> | undefined;
    try {
      await writer.query("begin");
      const { rows: [pid] } = await writer.query<{ pid: number }>("select pg_backend_pid() as pid");
      await writer.query(`insert into capital_investments(purchase_date,item_name,category,quantity,unit,unit_cost,asset_id)
        values('2030-01-01','Synthetic racing investment','Equipment',1,'pcs',10,$1)`, [id]);
      pending = purge(id).then((response) => response);
      await waitForBlockedClient(pid.pid);
      await writer.query("commit");
      expect((await pending).status).toBe(409);
      expect((await itemState(id)).item).not.toBeNull();
      expect((await database().query("select id from capital_investments where asset_id=$1", [id])).rowCount).toBe(1);
      expect(removeImage).not.toHaveBeenCalled();
    } finally {
      await writer.query("rollback");
      await pending;
      await writer.end();
    }
  });

  nativeTest("bounds a real row-lock wait and leaves the busy item unchanged", async () => {
    const id = await item();
    const before = await itemState(id);
    const writer = new Client({ connectionString: target().href, ssl: { rejectUnauthorized: false } });
    await writer.connect();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Promise<Awaited<ReturnType<typeof purge>>> | undefined;
    try {
      await writer.query("begin");
      await writer.query("select id from items where id=$1 for update", [id]);
      const { rows: [pid] } = await writer.query<{ pid: number }>("select pg_backend_pid() as pid");
      const started = performance.now();
      pending = purge(id).then((response) => response);
      await waitForBlockedClient(pid.pid);
      const released = new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => { void writer.query("rollback").then(() => resolve(), reject); }, 11_500);
      });
      const response = await pending;
      const elapsed = performance.now() - started;
      await released;
      expect(response.status).toBe(409);
      expect(response.body.code).toBe("ITEM_DELETE_BUSY");
      expect(elapsed).toBeGreaterThanOrEqual(9_000);
      expect(elapsed).toBeLessThan(11_300);
      expect(await itemState(id)).toEqual(before);
      expect(removeImage).not.toHaveBeenCalled();
    } finally {
      clearTimeout(timer);
      await writer.query("rollback");
      await pending;
      await writer.end();
    }
  }, 15_000);

  nativeTest("rejects a new reference when the locked unused-item deletion commits first", async () => {
    const id = await item();
    const gate = new Client({ connectionString: target().href, ssl: { rejectUnauthorized: false } });
    const writer = new Client({ connectionString: target().href, ssl: { rejectUnauthorized: false } });
    await gate.connect();
    await writer.connect();
    let deletion: Promise<Awaited<ReturnType<typeof purge>>> | undefined;
    let insertion: Promise<string> | undefined;
    await database().query(`create function hold_item_delete_259() returns trigger language plpgsql as $$
      begin perform pg_advisory_xact_lock(259,1); return old; end $$;
      create trigger hold_item_delete_259 before delete on items for each row execute function hold_item_delete_259()`);
    try {
      await gate.query("select pg_advisory_lock(259,1)");
      const { rows: [gatePid] } = await gate.query<{ pid: number }>("select pg_backend_pid() as pid");
      deletion = purge(id).then((response) => response);
      await waitForBlockedClient(gatePid.pid);
      const { rows: [deletionPid] } = await database().query<{ pid: number }>(
        "select pid from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))", [gatePid.pid],
      );
      insertion = writer.query(`insert into capital_investments(purchase_date,item_name,category,quantity,unit,unit_cost,asset_id)
        values('2030-01-01','Synthetic late investment','Equipment',1,'pcs',10,$1)`, [id]).then(
        () => "inserted",
        (error: unknown) => {
          if (error && typeof error === "object" && "code" in error) return String(error.code);
          throw error;
        },
      );
      await waitForBlockedClient(deletionPid.pid);
      await gate.query("select pg_advisory_unlock(259,1)");
      expect((await deletion).status).toBe(200);
      expect(await insertion).toBe("23503");
      expect((await database().query("select id from capital_investments where asset_id=$1", [id])).rowCount).toBe(0);
      expect(await itemState(id)).toMatchObject({ item: null, delete_audits: 1 });
    } finally {
      await gate.query("select pg_advisory_unlock(259,1)");
      await deletion;
      await insertion;
      await writer.end();
      await gate.end();
      await database().query("drop trigger hold_item_delete_259 on items; drop function hold_item_delete_259()");
    }
  });

  nativeTest("does not clean storage or report success when a real COMMIT acknowledgement is lost", async () => {
    const id = await item();
    if (!appPool) throw new Error("Owned application pool is unavailable");
    const realConnect = appPool.connect.bind(appPool);
    const connectionTarget: { connect: () => Promise<PoolClient> } = appPool;
    const restoreQueries: Array<() => void> = [];
    const instrumented = new WeakSet<PoolClient>();
    const connect = spyOn(connectionTarget, "connect").mockImplementation((...args: unknown[]) => {
      // Pool.query uses callbacks; inject only into explicitly leased transactions.
      if (args.length) return Reflect.apply(realConnect, appPool, args);
      return realConnect().then((client) => {
        if (instrumented.has(client)) return client;
        instrumented.add(client);
        const realQuery = client.query.bind(client);
        const queryTarget: { query: (text: string, values?: unknown[]) => Promise<QueryResult<Record<string, unknown>>> } = client;
        let deletingItem = false;
        const query = spyOn(queryTarget, "query").mockImplementation(async (text, values) => {
          const result = await realQuery(text, values);
          if (/^delete from items\b/i.test(text.trim())) deletingItem = true;
          if (text === "commit" && deletingItem) throw new Error("Synthetic lost COMMIT acknowledgement");
          return result;
        });
        restoreQueries.push(() => query.mockRestore());
        return client;
      });
    });
    try {
      const response = await purge(id);
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("ITEM_DELETE_UNCONFIRMED");
      expect(await itemState(id)).toMatchObject({ item: null, delete_audits: 1 });
      expect(removeImage).not.toHaveBeenCalled();
    } finally {
      for (const restore of restoreQueries) restore();
      connect.mockRestore();
    }
  });

  nativeTest("covers every restrictive, cascading and set-null item reference in the reviewed schema", async () => {
    const { rows } = await database().query<{ reference: string }>(`select c.conrelid::regclass::text as reference
      from pg_constraint c where c.contype='f' and c.confrelid='public.items'::regclass order by reference`);
    expect(rows.map((row) => row.reference)).toEqual([
      "capital_investments", "event_allocations", "event_return_corrections", "event_return_receipts",
      "inventory_condition_resolutions", "inventory_movements", "inventory_reconciliation_items",
    ]);
  });
});
