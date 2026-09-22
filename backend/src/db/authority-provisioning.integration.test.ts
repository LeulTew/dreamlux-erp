import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import express from "express";
import request from "supertest";
import { compare } from "bcryptjs";
import { Client, type Pool, type QueryResult } from "pg";
import { attestDreamluxNativeTarget } from "./testing/dreamlux-native-target";
import { startDreamluxRestProxy } from "./testing/dreamlux-rest-proxy";

const enabled = Boolean(process.env.DREAMLUX_NATIVE_TEST_ADMIN_URL);
const nativeTest = enabled ? test : test.skip;
const actor = "27800000-0000-4000-8000-000000000001";
const role = "27800000-0000-4000-8000-000000000002";
const managerRole = "27800000-0000-4000-8000-000000000003";
let observer: Client | undefined;
let appPool: Pool | undefined;
let server: Server | undefined;
let proxy: Awaited<ReturnType<typeof startDreamluxRestProxy>> | undefined;
let invalidate: (() => void) | undefined;
let password = "";
let managerPassword = "";
let cookie = "";
let provisionRole: typeof import("../lib/provision-system-manager-role").provisionSystemManagerRole;

function db() {
  if (!observer) throw new Error("Independent authority fixture unavailable");
  return observer;
}

function api() {
  if (!server) throw new Error("Independent authority API unavailable");
  return request(server);
}

async function confirmProvisionedCredential() {
  const stored = await db().query<{ password_hash: string; sql_matches: boolean }>(
    "select password_hash, password_hash=crypt($1,password_hash) as sql_matches from users where username='manager'",
    [managerPassword],
  );
  expect(stored.rows).toHaveLength(1);
  const evidence = {
    javascriptVerifierMatches: await compare(managerPassword, stored.rows[0].password_hash),
    sqlVerifierMatches: stored.rows[0].sql_matches,
  };
  expect(evidence.javascriptVerifierMatches).toBe(true);
}

beforeAll(async () => {
  if (!enabled) return;
  expect(process.env.NODE_ENV).toBe("development");
  if (Reflect.get(globalThis, "__mockSupabase")) throw new Error("Native authority proof cannot use mocked providers");
  const target = attestDreamluxNativeTarget(process.env.DATABASE_URL ?? "", "fixture");
  if (!/^\/dreamlux_ephemeral_equipment_259_[a-f0-9]{12}$/.test(target.pathname)) throw new Error("Dedicated authority fixture required");
  observer = new Client({ connectionString: target.href, ssl: { rejectUnauthorized: false } });
  await observer.connect();
  expect((await observer.query("select current_database() as name")).rows[0].name).toBe(target.pathname.slice(1));
  password = randomBytes(32).toString("hex");
  managerPassword = randomBytes(32).toString("hex");
  process.env.ADMIN_PASSWORD = password;
  process.env.MANAGER_PASSWORD = managerPassword;
  proxy = await startDreamluxRestProxy();
  const app = express();
  app.use(express.json());
  app.use("/auth", (await import("../routes/auth")).default);
  app.use("/users", (await import("../routes/users")).default);
  appPool = (await import("./pool")).pool;
  provisionRole = (await import("../lib/provision-system-manager-role")).provisionSystemManagerRole;
  invalidate = (await import("../lib/permissions-cache")).invalidateAllCache;
  server = createServer(app);
  await new Promise<void>((resolve, reject) => { server!.once("error", reject); server!.listen(0, "127.0.0.1", resolve); });
}, 45_000);

beforeEach(async () => {
  if (!enabled) return;
  await db().query("truncate roles,permissions,users cascade");
  await db().query("insert into roles(id,name,permissions) values($1,'SUPER_ADMIN','{}')", [role]);
  await db().query(`insert into permissions(slug,description) values
    ('users:manage','Synthetic user administration'),('settings:write','Synthetic settings'),('events:read','Synthetic event read')`);
  await db().query(`insert into users(id,username,password_hash,full_name,role_id)
    values($1,'admin',crypt($3,gen_salt('bf')),'Synthetic Administrator',$2)`, [actor, role, password]);
  if (!invalidate) throw new Error("Current permission invalidation unavailable");
  invalidate();
  const login = await api().post("/auth/login").send({ username: "admin", password });
  expect(login.status).toBe(200);
  const cookies: unknown = login.headers["set-cookie"];
  if (!Array.isArray(cookies) || !cookies.every((value): value is string => typeof value === "string")) {
    throw new Error("Synthetic administrator cookie unavailable");
  }
  cookie = cookies.map((value) => value.split(";")[0]).join("; ");
});

afterAll(async () => {
  if (!enabled) return;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.MANAGER_PASSWORD;
  const outcomes = await Promise.allSettled([
    server?.listening ? new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve())) : Promise.resolve(),
    appPool?.end(), observer?.end(), proxy?.close(),
  ]);
  const failed = outcomes.filter((outcome) => outcome.status === "rejected").map((outcome) => outcome.reason);
  if (failed.length) throw new AggregateError(failed, "Authority fixture cleanup failed");
});

nativeTest("preserves an existing editable manager role's explicit current grants during configured account recovery", async () => {
  await db().query(`insert into roles(id,name,description,permissions)
    values($1,'SYSTEM_MANAGER','Synthetic customized manager','{"settings":"write","users":"write"}')`, [managerRole]);
  await db().query(`insert into role_permissions(role_id,permission_id)
    select $1,id from permissions where slug='events:read'`, [managerRole]);
  const response = await api().post("/users/bootstrap-admin").set("Cookie", cookie);
  expect(response.status).toBe(200);
  await confirmProvisionedCredential();
  const login = await api().post("/auth/login").send({ username: "manager", password: managerPassword });
  expect(login.status).toBe(200);
  expect(login.body.user.permission_slugs).toEqual(["events:read"]);
});

nativeTest("a newly provisioned manager receives its explicit advertised users and settings grants", async () => {
  const response = await api().post("/users/bootstrap-admin").set("Cookie", cookie);
  expect(response.status).toBe(200);
  await confirmProvisionedCredential();
  const login = await api().post("/auth/login").send({ username: "manager", password: managerPassword });
  expect(login.status).toBe(200);
  expect(login.body.user.permission_slugs.sort()).toEqual(["settings:write", "users:manage"]);
  const current = await db().query(`select p.slug from role_permissions rp join permissions p on p.id=rp.permission_id
    join roles r on r.id=rp.role_id where r.name='SYSTEM_MANAGER' order by p.slug`);
  expect(current.rows).toEqual([{ slug: "settings:write" }, { slug: "users:manage" }]);
});

nativeTest("preserves an intentionally empty existing manager grant set", async () => {
  await db().query(`insert into roles(id,name,permissions)
    values($1,'SYSTEM_MANAGER','{"settings":"write","users":"write"}')`, [managerRole]);
  expect((await api().post("/users/bootstrap-admin").set("Cookie", cookie)).status).toBe(200);
  const login = await api().post("/auth/login").send({ username: "manager", password: managerPassword });
  expect(login.status).toBe(200);
  expect(login.body.user.permission_slugs).toEqual([]);
});

nativeTest("rejects wrong provisioned bcrypt and original pgcrypto passwords without disclosing hashes", async () => {
  expect((await api().post("/users/bootstrap-admin").set("Cookie", cookie)).status).toBe(200);
  for (const username of ["admin", "manager"]) {
    expect((await api().post("/auth/login").send({ username, password: "deliberately-wrong-synthetic-credential" })).status).toBe(401);
  }
  const login = await api().post("/auth/login").send({ username: "manager", password: managerPassword });
  expect(login.status).toBe(200);
  expect(login.body.user).not.toHaveProperty("password_hash");
  expect(JSON.stringify(login.body)).not.toContain(managerPassword);
});

nativeTest("retains provisioned bcrypt login through the explicit missing-profile-column path", async () => {
  expect((await api().post("/users/bootstrap-admin").set("Cookie", cookie)).status).toBe(200);
  await db().query("alter table users drop column profile_image_url");
  try {
    const login = await api().post("/auth/login").send({ username: "manager", password: managerPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.permission_slugs.sort()).toEqual(["settings:write", "users:manage"]);
    expect((await api().post("/auth/login").send({ username: "manager", password: "wrong-synthetic-credential" })).status).toBe(401);
  } finally {
    await db().query("alter table users add column profile_image_url text");
  }
});

async function rejectRequiredWrite(table: "role_permissions" | "activity_logs") {
  await db().query(`create function public.reject_manager_provisioning() returns trigger language plpgsql as $$
    begin return null; end $$`);
  await db().query(`create trigger reject_manager_provisioning before insert on ${table}
    for each row execute function public.reject_manager_provisioning()`);
  return async () => {
    await db().query(`drop trigger reject_manager_provisioning on ${table}`);
    await db().query("drop function public.reject_manager_provisioning()");
  };
}

nativeTest.each(["role_permissions", "activity_logs"] as const)(
  "rolls back new role authority when required %s is suppressed, then recovers normally",
  async (table) => {
    const remove = await rejectRequiredWrite(table);
    try {
      const response = await api().post("/users/bootstrap-admin").set("Cookie", cookie);
      expect(response.status).toBe(503);
      expect(response.body.outcome_uncertain).toBe(false);
      expect((await db().query("select id from roles where name='SYSTEM_MANAGER'")).rowCount).toBe(0);
      expect((await db().query("select id from users where username='manager'")).rowCount).toBe(0);
    } finally { await remove(); }
    expect((await api().post("/users/bootstrap-admin").set("Cookie", cookie)).status).toBe(200);
    expect((await api().post("/auth/login").send({ username: "manager", password: managerPassword })).status).toBe(200);
  },
);

nativeTest("concurrent role initializers create one fully granted role and one required audit", async () => {
  const results = await Promise.all([provisionRole(actor), provisionRole(actor)]);
  expect(results[0]).toEqual(results[1]);
  expect((await db().query("select id from roles where name='SYSTEM_MANAGER'")).rowCount).toBe(1);
  expect((await db().query("select permission_id from role_permissions where role_id=$1", [results[0].id])).rowCount).toBe(2);
  expect((await db().query("select id from activity_logs where entity_type='role' and entity_id=$1", [results[0].id])).rowCount).toBe(1);
});

nativeTest.each(["BEGIN", "COMMIT", "ROLLBACK"] as const)(
  "preserves transaction ownership after actual %s acknowledgement loss",
  async (command) => {
    if (!appPool) throw new Error("Authority pool unavailable");
    const pool = appPool;
    const client = await pool.connect();
    const originalConnect = pool.connect.bind(pool);
    const originalQuery = client.query.bind(client);
    const originalRelease = client.release.bind(client);
    let released = false;
    let discarded = false;
    const commands: string[] = [];
    const connect = spyOn(pool, "connect").mockImplementation(((...args: unknown[]) =>
      args.length ? Reflect.apply(originalConnect, pool, args) : Promise.resolve(client)) as typeof pool.connect);
    const queryTarget: { query: (sql: string, values?: unknown[]) => Promise<QueryResult<Record<string, unknown>>> } = client;
    const query = spyOn(queryTarget, "query").mockImplementation(async (sql, values) => {
      const result = await originalQuery(sql, values);
      commands.push(sql.trim().toUpperCase());
      if (sql.trim().toUpperCase() === command) throw new Error("Synthetic command acknowledgement loss");
      return result;
    });
    const release = spyOn(client, "release").mockImplementation((discard) => {
      released = true;
      discarded = Boolean(discard);
      originalRelease(discard);
    });
    const remove = command === "ROLLBACK" ? await rejectRequiredWrite("role_permissions") : undefined;
    try {
      await expect(provisionRole(actor)).rejects.toMatchObject({ uncertain: command === "COMMIT" });
      expect(commands).toContain("ROLLBACK");
      expect(released).toBe(true);
      expect(discarded).toBe(command === "ROLLBACK");
      expect((await db().query("select id from roles where name='SYSTEM_MANAGER'")).rowCount).toBe(command === "COMMIT" ? 1 : 0);
    } finally {
      query.mockRestore();
      connect.mockRestore();
      release.mockRestore();
      if (!released) originalRelease(true);
      await remove?.();
    }
  },
);
