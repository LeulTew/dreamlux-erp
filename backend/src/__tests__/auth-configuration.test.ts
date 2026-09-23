import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import express, { type Response } from "express";
import jwt from "jsonwebtoken";
import type { AuthRequest } from "../middleware/auth";
import { TEST_ADMIN_PASSWORD, TEST_JWT_SECRET, TEST_MANAGER_PASSWORD } from "./auth-test-config";

type Row = Record<string, unknown>;
type QueryResult = { rows: Row[] };
type RouteHandler = (req: AuthRequest, res: Response, next: () => void) => unknown;
type SecretName = "JWT_SECRET" | "ADMIN_PASSWORD" | "MANAGER_PASSWORD";
const userId = "verify-db-auth-configuration";
const signToken = jwt.sign.bind(jwt);
const routes = new Map<string, RouteHandler>();
const replies: Array<QueryResult | Error> = [];
const writes: Array<{ table: string; operation: string }> = [];
const query = mock(async (_sql: string, _params?: unknown[]): Promise<QueryResult> => {
  const reply = replies.shift();
  if (!reply) throw new Error("Unexpected synthetic query");
  if (reply instanceof Error) throw reply;
  return reply;
});
const from = mock((table: string) => {
  const filters = new Map<string, unknown>();
  let mutation: Row | null = null;
  let single = false;
  const result = () => {
    const rows = table === "roles"
      ? [{ id: "synthetic-role", name: filters.get("name") || "SYNTHETIC_ROLE" }]
      : mutation ? [{ id: "synthetic-account", ...mutation }] : [];
    return Promise.resolve({ data: single ? rows[0] : rows, error: null });
  };
  const chain = {
    select: (_columns: string) => chain,
    eq: (column: string, value: unknown) => { filters.set(column, value); return chain; },
    limit: (_count: number) => chain,
    single: () => { single = true; return chain; },
    insert: (row: Row) => { mutation = row; writes.push({ table, operation: "insert" }); return chain; },
    update: (row: Row) => { mutation = row; writes.push({ table, operation: "update" }); return chain; },
    then: (resolve: (value: Awaited<ReturnType<typeof result>>) => unknown) => result().then(resolve),
  };
  return chain;
});
const forbiddenNetwork = mock(() => { throw new Error("Provider network is forbidden"); });
const network = spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(forbiddenNetwork, { preconnect: forbiddenNetwork }),
);
const errorLog = spyOn(console, "error").mockImplementation(() => {});
const warningLog = spyOn(console, "warn").mockImplementation(() => {});
let middleware: typeof import("../middleware/auth");
let cache: typeof import("../lib/permissions-cache");
let bootstrap: ReturnType<typeof spyOn<typeof import("../lib/bootstrap-admin"), "ensureBootstrapAdmin">>;
let sign: ReturnType<typeof spyOn<typeof jwt, "sign">>;
let verify: ReturnType<typeof spyOn<typeof jwt, "verify">>;
let restoreProviders: () => void;
const previousEnvironment = new Map<SecretName, string | undefined>();
const administrator = {
  id: userId, username: "admin", full_name: "Synthetic Administrator",
  is_active: true, role_name: "SUPER_ADMIN", permissions: { all: true },
};

beforeAll(async () => {
  const shared = globalThis as typeof globalThis & { __mockSupabase?: { from: (table: string) => unknown } };
  if (!shared.__mockSupabase) throw new Error("Synthetic provider preload is required");
  for (const name of ["JWT_SECRET", "ADMIN_PASSWORD", "MANAGER_PASSWORD"] as const) {
    previousEnvironment.set(name, process.env[name]);
  }
  const { pool } = await import("../db/pool");
  const queryTarget: { query: (sql: string, params?: unknown[]) => Promise<QueryResult> } = pool;
  const querySpy = spyOn(queryTarget, "query").mockImplementation(query);
  const connectSpy = spyOn(pool, "connect").mockImplementation(forbiddenNetwork);
  const provider: { from: (table: string) => unknown } = (await import("../db/supabase")).supabase;
  const fromSpy = spyOn(provider, "from").mockImplementation(from);
  restoreProviders = () => { querySpy.mockRestore(); connectSpy.mockRestore(); fromSpy.mockRestore(); };
  bootstrap = spyOn(await import("../lib/bootstrap-admin"), "ensureBootstrapAdmin").mockResolvedValue(administrator);
  sign = spyOn(jwt, "sign");
  verify = spyOn(jwt, "verify");
  middleware = await import("../middleware/auth");
  cache = await import("../lib/permissions-cache");
  for (const { default: router } of [await import("../routes/auth"), await import("../routes/users")]) {
    const stack: Array<{ route?: { path: string; stack: Array<{ handle: RouteHandler }> } }> = router.stack;
    for (const layer of stack) {
      const handler = layer.route?.stack.at(-1)?.handle;
      if (layer.route && handler) routes.set(layer.route.path, handler);
    }
  }
});

beforeEach(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;
  process.env.MANAGER_PASSWORD = TEST_MANAGER_PASSWORD;
  cache.invalidateAllCache(0);
  replies.length = 0;
  writes.length = 0;
  query.mockClear();
  from.mockClear();
  sign.mockClear();
  verify.mockClear();
  bootstrap.mockReset();
  bootstrap.mockResolvedValue(administrator);
  errorLog.mockClear();
  warningLog.mockClear();
});

afterAll(() => {
  expect(forbiddenNetwork).not.toHaveBeenCalled();
  for (const [name, value] of previousEnvironment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  cache?.invalidateAllCache(0);
  bootstrap?.mockRestore();
  sign?.mockRestore();
  verify?.mockRestore();
  restoreProviders?.();
  network.mockRestore();
  errorLog.mockRestore();
  warningLog.mockRestore();
});

function configure(name: SecretName, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function response() {
  const res: Response & { body: unknown } = Object.create(express.response);
  res.statusCode = 200;
  res.body = undefined;
  res.status = (status) => { res.statusCode = status; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.cookie = mock(() => res);
  return res;
}

async function route(path: string, body: unknown = {}) {
  const handler = routes.get(path);
  if (!handler) throw new Error(`Missing synthetic route: ${path}`);
  const res = response();
  await handler({
    body,
    user: { id: userId, username: "synthetic-admin", role: "SUPER_ADMIN", permission_slugs: ["*"] },
  } as AuthRequest, res, () => {});
  return res;
}

async function authenticate(token: string) {
  const req = { method: "GET", headers: { cookie: `token=${token}` } } as AuthRequest;
  const res = response();
  const next = mock(() => {});
  await middleware.requireAuth(req, res, next);
  return { req, res, next };
}

function ordinaryLoginRows(username = "synthetic-user") {
  replies.push(
    { rows: [{
      id: userId, username, full_name: "Synthetic User", is_active: true,
      role_name: "SYNTHETIC_CURRENT", permissions: {}, permission_slugs: ["events:read"],
    }] },
    { rows: [{ role_id: "role", role_ids: [], is_active: true, deleted_at: null }] },
    { rows: [{ name: "SYNTHETIC_CURRENT", permissions: {}, permission_slugs: ["events:read"] }] },
  );
}

function assertNoSecretDisclosure(values: Array<string | undefined>, body?: unknown) {
  const recorded = JSON.stringify({ errors: errorLog.mock.calls, warnings: warningLog.mock.calls, body });
  expect(values.filter((value): value is string => Boolean(value?.trim()))
    .some((value) => recorded.includes(value) || recorded.includes(JSON.stringify(value).slice(1, -1)))).toBe(false);
}

const invalidSigning = [
  { label: "missing", value: undefined },
  { label: "blank", value: "" },
  { label: "whitespace", value: "   " },
  { label: "historical source default", value: "dev-secret" },
  { label: "31-byte boundary", value: TEST_JWT_SECRET.slice(0, 31) },
  { label: "31-byte UTF-8 boundary", value: Array.from({ length: 15 }, (_, index) => String.fromCodePoint(0x410 + index)).join("") + "Z" },
  { label: "placeholder", value: "replace-this-with-your-generated-jwt-secret" },
  { label: "single-character repetition", value: "x".repeat(64) },
  { label: "short-pattern repetition", value: "abcd".repeat(16) },
  { label: "embedded newline", value: `${TEST_JWT_SECRET}\nextra-line` },
  { label: "control character", value: `${TEST_JWT_SECRET}\u0000` },
];

describe("explicit signing configuration", () => {
  test.each(invalidSigning)("rejects $label before issuing a token or touching account state", async ({ value }) => {
    configure("JWT_SECRET", value);
    ordinaryLoginRows();
    const res = await route("/login", { username: "synthetic-user", password: "synthetic-db-input" });
    expect(res.statusCode).toBe(503);
    expect(sign).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(bootstrap).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
    assertNoSecretDisclosure([value], res.body);
  });

  test.each(invalidSigning)("rejects $label before verifying identifier-less wildcard claims", async ({ value }) => {
    configure("JWT_SECRET", value);
    const token = signToken({ username: "synthetic", role: "SUPER_ADMIN", permission_slugs: ["*"] },
      value || "dev-secret", { expiresIn: "1h" });
    const { res, next } = await authenticate(token);
    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
    assertNoSecretDisclosure([value, token], res.body);
  });

  test.each([
    { label: "32 ASCII bytes", key: TEST_JWT_SECRET.slice(0, 32) },
    { label: "32 UTF-8 bytes", key: Array.from({ length: 16 }, (_, index) => String.fromCodePoint(0x410 + index)).join("") },
    { label: "full synthetic fixture", key: TEST_JWT_SECRET },
  ])("accepts $label consistently for signing and verification", async ({ key }) => {
    process.env.JWT_SECRET = key;
    ordinaryLoginRows();
    const login = await route("/login", { username: "synthetic-user", password: "synthetic-db-input" });
    expect(login.statusCode).toBe(200);
    const payload = sign.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ id: userId, permission_slugs: ["events:read"] });
    const token = signToken(payload || {}, key, { expiresIn: "1h" });
    cache.setCachedUserPermissions(userId, { roleNames: ["SYNTHETIC_CURRENT"], permissionSlugs: ["events:read"] });
    expect((await authenticate(token)).next).toHaveBeenCalledTimes(1);
  });

  test("does not impose a distinct-character quota on a nontrivially arranged provisioned key", async () => {
    const key = "abbbbaababaaabbaabbbababbaaaaabab".padEnd(32, "b").slice(0, 32);
    expect(Buffer.byteLength(key)).toBe(32);
    process.env.JWT_SECRET = key;
    const token = signToken({ username: "synthetic", permission_slugs: ["events:read"] }, key);
    expect((await authenticate(token)).next).toHaveBeenCalledTimes(1);
  });

  test.each(["wrong key", "expired"] as const)("rejects a %s token under valid signing configuration", async (scenario) => {
    const token = signToken({ username: "synthetic", permission_slugs: ["*"] },
      scenario === "wrong key" ? `${TEST_JWT_SECRET}-different` : TEST_JWT_SECRET,
      { expiresIn: scenario === "expired" ? "-1h" : "1h" });
    const { res, next } = await authenticate(token);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  test.each(["test", "development", "production"])("does not bypass signing validation in %s mode", async (mode) => {
    const previousMode = process.env.NODE_ENV;
    process.env.NODE_ENV = mode;
    delete process.env.JWT_SECRET;
    try {
      const token = signToken({ username: "synthetic", permission_slugs: ["*"] }, TEST_JWT_SECRET);
      const { res, next } = await authenticate(token);
      expect(res.statusCode).toBe(503);
      expect(next).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
    } finally {
      if (previousMode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousMode;
    }
  });

  test.each(["single", "double"])("normalizes %s enclosing quotes consistently without truncating the key", async (style) => {
    const quote = style === "single" ? "'" : '"';
    process.env.JWT_SECRET = `  ${quote}${TEST_JWT_SECRET}${quote}  `;
    const token = signToken({ username: "synthetic", permission_slugs: ["events:read"] }, TEST_JWT_SECRET);
    expect((await authenticate(token)).next).toHaveBeenCalledTimes(1);
    ordinaryLoginRows();
    expect((await route("/login", { username: "synthetic-user", password: "synthetic-db-input" })).statusCode).toBe(200);
    expect(sign.mock.calls[0]?.[1] === TEST_JWT_SECRET).toBe(true);
  });

  test("cannot provision or issue recovery authority when the signing configuration is missing", async () => {
    delete process.env.JWT_SECRET;
    const res = await route("/login", { username: "admin", password: TEST_ADMIN_PASSWORD });
    expect(res.statusCode).toBe(503);
    expect(bootstrap).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });
});

const invalidRecovery = [
  { label: "missing", value: undefined },
  { label: "blank", value: "" },
  { label: "historical source default", value: "admin" },
  { label: "15-byte boundary", value: TEST_ADMIN_PASSWORD.slice(0, 15) },
  { label: "placeholder", value: "replace-with-admin-password" },
  { label: "trivial repetition", value: "abc".repeat(12) },
  { label: "multiline", value: `${TEST_ADMIN_PASSWORD}\nignored` },
];

describe("explicit optional administrator recovery", () => {
  test.each(invalidRecovery)("keeps ordinary DB login working with $label recovery configuration", async ({ value }) => {
    configure("ADMIN_PASSWORD", value);
    ordinaryLoginRows("admin");
    const res = await route("/login", { username: "admin", password: "synthetic-db-input" });
    expect(res.statusCode).toBe(200);
    expect(sign.mock.calls[0]?.[0]).toMatchObject({ id: userId, permission_slugs: ["events:read"] });
    expect(bootstrap).not.toHaveBeenCalled();
  });

  test.each(invalidRecovery)("does not mutate or issue recovery authority with $label configuration", async ({ value }) => {
    configure("ADMIN_PASSWORD", value);
    replies.push({ rows: [] });
    const res = await route("/login", { username: "admin", password: value || "admin" });
    expect(res.statusCode).toBe(401);
    expect(bootstrap).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
    assertNoSecretDisclosure([value], res.body);
  });

  test.each(invalidRecovery)("does not turn a query failure into $label recovery access", async ({ value }) => {
    configure("ADMIN_PASSWORD", value);
    replies.push(new Error("Synthetic authority unavailable"));
    const res = await route("/login", { username: "admin", password: value || "admin" });
    expect(res.statusCode).toBe(500);
    expect(bootstrap).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
    assertNoSecretDisclosure([value], res.body);
  });

  test("a wrong credential cannot activate explicitly provisioned recovery", async () => {
    replies.push({ rows: [] });
    const res = await route("/login", { username: "admin", password: "synthetic-wrong-input" });
    expect(res.statusCode).toBe(401);
    expect(bootstrap).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  test("correct explicit configuration preserves administrator provisioning", async () => {
    replies.push({ rows: [] });
    const res = await route("/login", { username: "admin", password: TEST_ADMIN_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(sign.mock.calls[0]?.[0]).toMatchObject({
      id: userId, role: "SUPER_ADMIN", permission_slugs: ["*"],
    });
    expect(sign.mock.calls[0]?.[2]).toMatchObject({ expiresIn: "7d" });
  });

  test.each(["helper failure", "query failure"])("preserves the configured no-ID recovery boundary after %s", async (failure) => {
    if (failure === "helper failure") {
      replies.push({ rows: [] });
      bootstrap.mockRejectedValueOnce(new Error("Synthetic bootstrap unavailable"));
    } else {
      replies.push(new Error("Synthetic query unavailable"));
    }
    const res = await route("/login", { username: "admin", password: TEST_ADMIN_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(sign.mock.calls[0]?.[0]).toMatchObject({ role: "SUPER_ADMIN", permission_slugs: ["*"] });
    expect(sign.mock.calls[0]?.[0]).not.toHaveProperty("id");
    expect(sign.mock.calls[0]?.[2]).toMatchObject({ expiresIn: "7d" });
  });

  test.each([
    { label: "16 ASCII bytes", password: TEST_JWT_SECRET.slice(0, 16) },
    { label: "16 UTF-8 bytes", password: Array.from({ length: 8 }, (_, index) => String.fromCodePoint(0x410 + index)).join("") },
  ])("accepts an explicitly provisioned $label recovery credential", async ({ password }) => {
    process.env.ADMIN_PASSWORD = password;
    replies.push({ rows: [] });
    const res = await route("/login", { username: "admin", password });
    expect(res.statusCode).toBe(200);
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  test("does not accept the first line of invalid multiline recovery configuration", async () => {
    process.env.ADMIN_PASSWORD = `${TEST_ADMIN_PASSWORD}\nadditional`;
    replies.push({ rows: [] });
    const res = await route("/login", { username: "admin", password: TEST_ADMIN_PASSWORD });
    expect(res.statusCode).toBe(401);
    expect(bootstrap).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  test("retains acceptance and seven-day expiry of a properly configured identifier-less recovery token", async () => {
    replies.push(new Error("Synthetic query unavailable"));
    const res = await route("/login", { username: "admin", password: TEST_ADMIN_PASSWORD });
    const body = res.body as { token: string };
    const decoded = jwt.decode(body.token);
    if (!decoded || typeof decoded === "string") throw new Error("Expected synthetic JWT claims");
    expect(decoded.exp! - decoded.iat!).toBe(7 * 24 * 60 * 60);
    expect(decoded).not.toHaveProperty("id");
    const result = await authenticate(body.token);
    expect(result.next).toHaveBeenCalledTimes(1);
    expect(result.req.admin).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("authenticated dual-account provisioning preflight", () => {
  test.each([
    { name: "ADMIN_PASSWORD" as const, label: "missing administrator", value: undefined },
    { name: "ADMIN_PASSWORD" as const, label: "weak administrator", value: "admin" },
    { name: "MANAGER_PASSWORD" as const, label: "missing manager", value: undefined },
    { name: "MANAGER_PASSWORD" as const, label: "weak manager", value: "manager123" },
  ])("rejects $label before either account writer", async ({ name, value }) => {
    configure(name, value);
    const res = await route("/bootstrap-admin");
    expect(res.statusCode).toBe(503);
    expect(bootstrap).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
    assertNoSecretDisclosure([value], res.body);
  });

  test.each([false, true])("preserves properly configured provisioning (alternate transport=%s)", async (alternate) => {
    if (alternate) bootstrap.mockRejectedValueOnce(Object.assign(
      new Error("Synthetic pool unavailable"), { code: "ENOTFOUND" },
    ));
    const res = await route("/bootstrap-admin");
    expect(res.statusCode).toBe(200);
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(writes.filter((write) => write.table === "users")).toHaveLength(alternate ? 2 : 1);
  });
});
