import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { Socket } from "node:net";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { Client, type Pool } from "pg";
import { createDreamluxNativeFixture, reviewedSchemaTables } from "./testing/dreamlux-native-fixture";
import { equipmentFixtureDdl } from "./testing/dreamlux-equipment-fixture";
import { attestDreamluxNativeTarget } from "./testing/dreamlux-native-target";
import { closeFixtureServer, trackFixtureSockets } from "./testing/fixture-http-server";

const adminUrl = process.env.DREAMLUX_NATIVE_TEST_ADMIN_URL?.trim();
if (process.env.DREAMLUX_NATIVE_IMPORT_REQUIRED === "1" && !adminUrl) {
  throw new Error("Native event verification requires the explicitly attested independent DreamLux PostgreSQL target");
}
const nativeTest = adminUrl ? test : test.skip;
const actorId = "29900000-0000-4000-8000-000000000001";
const roleId = "29900000-0000-4000-8000-000000000002";
const slugs = ["events:read", "events:write"];
const grants = { events: ["read", "write"] };
let fixture: Awaited<ReturnType<typeof createDreamluxNativeFixture>> | undefined;
let observer: Client | undefined;
let appPool: Pool | undefined;
let invalidateAllCache: (() => void) | undefined;
let server: Server | undefined;
let serverSockets: Set<Socket> | undefined;
let cookie = "";
const scopeIds: Record<string, string> = {};
const ports = new Set<number>();
const denied: string[] = [];
const originalFetch = globalThis.fetch;
const originalConnect = Socket.prototype.connect;
let egressInstalled = false;

function database() {
  if (!observer) throw new Error("Owned event-editing database is unavailable");
  return observer;
}

function http() {
  if (!server) throw new Error("Owned event-editing HTTP service is unavailable");
  return request(server);
}

async function eventFixtureDdl() {
  const migration = (file: string) => readFile(join(__dirname, "migrations", file), "utf8");
  // The proposal junction in the scope migration references tables this fixture omits.
  const scopes = reviewedSchemaTables(await migration("event_service_scopes.sql"), ["event_service_scopes", "event_service_scope_links"]);
  const fieldPermissions = reviewedSchemaTables(await migration("rbac_scopes_metadata.sql"), ["field_permissions"]);
  return [await equipmentFixtureDdl(), ...scopes, ...fieldPermissions].join("\n");
}

beforeAll(async () => {
  if (!adminUrl) return;
  const target = attestDreamluxNativeTarget(adminUrl, "admin");
  if (Reflect.get(globalThis, "__mockSupabase")) throw new Error("Native event QA cannot use mocked application clients");
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
        throw new Error("Event fixture refused unowned TCP before connection");
      }
      return Reflect.apply(original, socket, args);
    },
  });
  const denyFetch = () => { denied.push("fetch"); throw new Error("Event fixture forbids external fetch"); };
  globalThis.fetch = Object.assign(denyFetch, { preconnect: denyFetch });
  fixture = await createDreamluxNativeFixture(adminUrl, "event_editing_299", await eventFixtureDdl());
  Object.assign(process.env, {
    NODE_ENV: "development",
    DATABASE_URL: fixture.url, DATABASE_DIRECT_URL: "", DATABASE_BACKUP_URL: "",
    SUPABASE_URL: "http://127.0.0.1:1",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-dreamlux-event-key-not-a-provider-credential",
    JWT_SECRET: randomBytes(32).toString("hex"),
    ADMIN_PASSWORD: randomBytes(32).toString("hex"),
  });
  const fixtureTarget = attestDreamluxNativeTarget(fixture.url, "fixture");
  observer = new Client({ connectionString: fixtureTarget.href, ssl: { rejectUnauthorized: false } });
  await observer.connect();
  expect((await observer.query("select current_database() as name,current_user as actor,inet_server_port() as port")).rows)
    .toEqual([{ name: fixtureTarget.pathname.slice(1), actor: "dreamlux_parity", port: 55434 }]);
  const password = randomBytes(24).toString("base64url");
  await observer.query("insert into roles(id,name,permissions) values($1,'SYNTHETIC_EVENT_EDITOR_299',$2::jsonb)", [roleId, grants]);
  await observer.query("insert into permissions(slug) select unnest($1::text[]) on conflict(slug) do nothing", [slugs]);
  await observer.query(`insert into role_permissions(role_id,permission_id)
    select $1,id from permissions where slug=any($2::text[])`, [roleId, slugs]);
  await observer.query(`insert into users(id,username,password_hash,full_name,role_id)
    values($1,'synthetic.event.editor.299',crypt($3,gen_salt('bf')),'Synthetic event editor',$2::uuid)`,
  [actorId, roleId, password]);
  const scopes = await observer.query<{ id: string; code: string }>(
    `insert into event_service_scopes(code,name_en,name_am,display_order)
     values('FULL','Full','ሙሉ',1),('SETUP','Setup','ሴታፕ',3) returning id, code`,
  );
  for (const scope of scopes.rows) scopeIds[scope.code] = scope.id;
  appPool = (await import("./pool")).pool;
  invalidateAllCache = (await import("../lib/permissions-cache")).invalidateAllCache;
  const app = express();
  app.use(express.json());
  app.use("/auth", (await import("../routes/auth")).default);
  app.use("/events", (await import("../routes/events")).default);
  server = createServer(app);
  serverSockets = trackFixtureSockets(server);
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Event fixture did not bind a local port");
  ports.add(address.port);
  const login = await http().post("/auth/login").send({ username: "synthetic.event.editor.299", password });
  expect(login.status).toBe(200);
  const cookies: unknown = login.headers["set-cookie"];
  if (!Array.isArray(cookies) || !cookies.every((value): value is string => typeof value === "string")) {
    throw new Error("Synthetic event session is unavailable");
  }
  cookie = cookies.map((value) => value.split(";")[0]).join("; ");
}, 45_000);

afterAll(async () => {
  try {
    const results = await Promise.allSettled([
      server?.listening && serverSockets ? closeFixtureServer(server, serverSockets) : Promise.resolve(),
    ]);
    if (fixture) {
      results.push(...await Promise.allSettled([appPool?.end()]));
      results.push(...await Promise.allSettled([observer?.end()]));
      results.push(...await Promise.allSettled([fixture.dispose()]));
    }
    const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, "Event editing fixture cleanup failed");
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
  if (!invalidateAllCache) throw new Error("Native event permission invalidation was not initialized");
  invalidateAllCache();
  await database().query("delete from event_logs");
  await database().query("delete from vehicle_assignments");
  await database().query("delete from event_assignments");
  await database().query("delete from event_service_scope_links");
  await database().query("delete from events");
  await database().query("delete from vehicles");
  await database().query("delete from employees");
});

async function createEvent(name: string, startDate: string, endDate: string): Promise<string> {
  const result = await database().query<{ id: string }>(
    `insert into events(name,client_name,start_date,end_date,venue_location,contract_price,status,created_by)
     values($1,'Synthetic client',$2,$3,'Synthetic venue',1000,'Planned',$4) returning id`,
    [name, startDate, endDate, actorId],
  );
  return result.rows[0].id;
}

async function createEmployee(code: string): Promise<string> {
  return (await database().query<{ id: string }>(
    "insert into employees(full_name,employee_id) values($1,$2) returning id", [`Synthetic ${code}`, code],
  )).rows[0].id;
}

async function assignEmployee(eventId: string, employeeId: string) {
  await database().query("insert into event_assignments(event_id,employee_id,role) values($1,$2,'Decorator')", [eventId, employeeId]);
}

async function assignVehicle(eventId: string, vehicleId: string) {
  await database().query("insert into vehicle_assignments(event_id,vehicle_id) values($1,$2)", [eventId, vehicleId]);
}

async function storedEvent(eventId: string) {
  return (await database().query<{ name: string; start_date: string; end_date: string }>(
    "select name, start_date::text as start_date, end_date::text as end_date from events where id=$1", [eventId],
  )).rows[0];
}

function editSheetPayload(overrides: Record<string, unknown>) {
  return {
    name: "Synthetic wedding", event_type_id: null, client_name: "Synthetic client", client_phone: "",
    contract_price: 1000, status: "Planned", start_date: "2035-01-10", end_date: "2035-01-12",
    start_time: "", end_time: "", venue_location: "Synthetic venue", service_scope_ids: [],
    ...overrides,
  };
}

describe("event editing against native DreamLux PostgreSQL", () => {
  nativeTest("saves an ordinary edit-sheet payload, including its service scopes", async () => {
    const eventId = await createEvent("Synthetic wedding", "2035-01-10", "2035-01-12");
    await database().query("insert into event_service_scope_links(event_id,service_scope_id) values($1,$2)", [eventId, scopeIds.FULL]);
    const response = await http().put(`/events/${eventId}`).set("Cookie", cookie)
      .send(editSheetPayload({ name: "Synthetic wedding renamed", service_scope_ids: [scopeIds.SETUP] }));
    expect(response.status).toBe(200);
    expect(response.body.event).toMatchObject({ name: "Synthetic wedding renamed", start_date: "2035-01-10", end_date: "2035-01-12" });
    expect(await storedEvent(eventId)).toEqual({ name: "Synthetic wedding renamed", start_date: "2035-01-10", end_date: "2035-01-12" });
    const links = await database().query("select service_scope_id from event_service_scope_links where event_id=$1", [eventId]);
    expect(links.rows).toEqual([{ service_scope_id: scopeIds.SETUP }]);
    const logs = await database().query("select field_changed from event_logs where event_id=$1 order by field_changed", [eventId]);
    expect(logs.rows.map((row) => row.field_changed)).toEqual(["name", "service_scopes"]);
  });

  nativeTest("rejects a reschedule that partially overlaps an assigned employee's other event", async () => {
    const eventId = await createEvent("Synthetic target", "2035-01-10", "2035-01-12");
    const otherId = await createEvent("Synthetic other", "2035-01-14", "2035-01-16");
    const employeeId = await createEmployee("SYN-299-E1");
    await assignEmployee(eventId, employeeId);
    await assignEmployee(otherId, employeeId);
    const response = await http().put(`/events/${eventId}`).set("Cookie", cookie)
      .send({ start_date: "2035-01-13", end_date: "2035-01-15" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("assigned employees or drivers have conflicting assignments");
    expect(await storedEvent(eventId)).toMatchObject({ start_date: "2035-01-10", end_date: "2035-01-12" });
  });

  nativeTest("rejects a reschedule that partially overlaps an assigned vehicle's other event", async () => {
    const eventId = await createEvent("Synthetic target", "2035-02-10", "2035-02-12");
    const otherId = await createEvent("Synthetic other", "2035-02-08", "2035-02-10");
    const vehicleId = (await database().query<{ id: string }>(
      "insert into vehicles(plate_number,vehicle_type,fuel_type,fuel_consumption_rate) values('SYN-299-V1','Van','Diesel',0.12) returning id",
    )).rows[0].id;
    await assignVehicle(eventId, vehicleId);
    await assignVehicle(otherId, vehicleId);
    const response = await http().put(`/events/${eventId}`).set("Cookie", cookie)
      .send({ start_date: "2035-02-09", end_date: "2035-02-11" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("assigned vehicles have conflicting assignments");
    expect(await storedEvent(eventId)).toMatchObject({ start_date: "2035-02-10", end_date: "2035-02-12" });
  });

  nativeTest("does not treat unchanged calendar dates as a reschedule", async () => {
    const eventId = await createEvent("Synthetic target", "2035-03-10", "2035-03-12");
    const containingId = await createEvent("Synthetic containing", "2035-03-09", "2035-03-13");
    const employeeId = await createEmployee("SYN-299-E2");
    await assignEmployee(eventId, employeeId);
    await assignEmployee(containingId, employeeId);
    const response = await http().put(`/events/${eventId}`).set("Cookie", cookie)
      .send(editSheetPayload({ name: "Synthetic target renamed", start_date: "2035-03-10", end_date: "2035-03-12" }));
    expect(response.status).toBe(200);
    const logs = await database().query("select field_changed from event_logs where event_id=$1 order by field_changed", [eventId]);
    expect(logs.rows.map((row) => row.field_changed)).toEqual(["name"]);
  });

  nativeTest("validates a partial date edit against the retained start date", async () => {
    const eventId = await createEvent("Synthetic target", "2035-04-10", "2035-04-12");
    const response = await http().put(`/events/${eventId}`).set("Cookie", cookie).send({ end_date: "2035-04-05" });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("End date must be on or after start date");
    expect(await storedEvent(eventId)).toMatchObject({ start_date: "2035-04-10", end_date: "2035-04-12" });
  });

  nativeTest("leaves the event unchanged when a requested scope is invalid", async () => {
    const eventId = await createEvent("Synthetic target", "2035-05-10", "2035-05-12");
    const response = await http().put(`/events/${eventId}`).set("Cookie", cookie)
      .send(editSheetPayload({ name: "Must not persist", start_date: "2035-05-10", end_date: "2035-05-12", service_scope_ids: ["NOT_A_SCOPE"] }));
    expect(response.status).toBe(400);
    expect((await storedEvent(eventId)).name).toBe("Synthetic target");
    expect((await database().query("select count(*)::int as count from event_logs where event_id=$1", [eventId])).rows[0].count).toBe(0);
  });
});
