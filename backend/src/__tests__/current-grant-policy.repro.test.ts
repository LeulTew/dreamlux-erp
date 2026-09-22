import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import express, { type Response } from "express";
import jwt from "jsonwebtoken";
import { TEST_ADMIN_PASSWORD, TEST_JWT_SECRET } from "./auth-test-config";
import type { AuthRequest } from "../middleware/auth";

// The standard synthetic preload is required; no app entrypoint is imported.
type Row = Record<string, unknown>;
type QueryResult = { rows: Row[] };
type QueryReply = QueryResult | Error | (() => Promise<QueryResult>);
type RouteHandler = (req: AuthRequest, res: Response, next: () => void) => unknown;
const routes = new Map<string, RouteHandler>();
const queryReplies: QueryReply[] = [];
const unexpectedQueries: string[] = [];
const query = mock(async (sql: string, _params?: unknown[]): Promise<QueryResult> => {
  const reply = queryReplies.shift();
  if (!reply) {
    unexpectedQueries.push(sql);
    throw new Error("Unconfigured synthetic query");
  }
  if (reply instanceof Error) throw reply;
  const result = typeof reply === "function" ? await reply() : reply;
  if (sql.includes("FROM users WHERE id = $1") && sql.includes("is_active = TRUE") && sql.includes("deleted_at IS NULL")) {
    return { rows: result.rows.filter((row) => row.is_active === true && row.deleted_at === null) };
  }
  return result;
});
const forbiddenProvider = mock(() => {
  throw new Error("Provider construction or network access is forbidden in phase one");
});
const network = spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(forbiddenProvider, { preconnect: forbiddenProvider }),
);
const fallbackReplies = new Map<string, { data: Row[] | null; error: unknown }>();
const fallbackFilters: Array<{ table: string; operation: string; column: string; value: unknown }> = [];
const fallbackFrom = mock((table: string) => {
  const filters: Array<{ column: string; value: unknown }> = [];
  const result = () => {
    const reply = fallbackReplies.get(table);
    if (!reply) throw new Error(`Unconfigured synthetic fallback: ${table}`);
    if (table === "users" && reply.data && !reply.error) {
      return Promise.resolve({
        ...reply,
        data: reply.data.filter((row) => filters.every(({ column, value }) => row[column] === value)),
      });
    }
    return Promise.resolve(reply);
  };
  const chain = {
    select: (_columns: string) => chain,
    eq: (column: string, value: unknown) => {
      filters.push({ column, value });
      fallbackFilters.push({ table, operation: "eq", column, value });
      return chain;
    },
    is: (column: string, value: unknown) => {
      filters.push({ column, value });
      fallbackFilters.push({ table, operation: "is", column, value });
      return chain;
    },
    in: (_column: string, _values: unknown[]) => result(),
    limit: (_count: number) => result(),
  };
  return chain;
});
const userId = "verify-db-issue278-synthetic";
const tokenUser = {
  id: userId,
  username: "synthetic",
  role: "OWNER",
  roles: ["OWNER"],
  permission_slugs: ["*"],
  permissions: { all: true },
};
let verifiedTokenUser: NonNullable<AuthRequest["user"]> = tokenUser;
const signTestToken = jwt.sign.bind(jwt);
const bootstrapUser = {
  id: userId, username: "admin", full_name: "Synthetic Administrator",
  is_active: true, role_name: "SUPER_ADMIN", permissions: { all: true },
};
let permissionDb: typeof import("../lib/permissions-db");
let middleware: typeof import("../middleware/auth");
let cache: typeof import("../lib/permissions-cache");
let NotificationsService: typeof import("../services/notifications-service").NotificationsService;
let actualCreateNotification: typeof NotificationsService.createNotification;
let delivery: ReturnType<typeof spyOn<typeof NotificationsService, "createNotification">>;
let bootstrap: ReturnType<typeof spyOn<typeof import("../lib/bootstrap-admin"), "ensureBootstrapAdmin">>;
let sign: ReturnType<typeof spyOn<typeof jwt, "sign">>;
let restoreProviders: () => void;
const loggedError = spyOn(console, "error").mockImplementation(() => {});
const loggedWarning = spyOn(console, "warn").mockImplementation(() => {});

beforeAll(async () => {
  const shared = globalThis as typeof globalThis & { __mockSupabase?: { from: (table: string) => unknown } };
  if (!shared.__mockSupabase) {
    throw new Error("Run with the backend synthetic test preload; provider imports are blocked otherwise");
  }
  const { pool } = await import("../db/pool");
  const queryTarget: { query: (sql: string, params?: unknown[]) => Promise<QueryResult> } = pool;
  const querySpy = spyOn(queryTarget, "query").mockImplementation(query);
  const connectSpy = spyOn(pool, "connect").mockImplementation(forbiddenProvider);
  const fromSpy = spyOn(shared.__mockSupabase, "from").mockImplementation(fallbackFrom);
  restoreProviders = () => { querySpy.mockRestore(); connectSpy.mockRestore(); fromSpy.mockRestore(); };
  const bootstrapModule = await import("../lib/bootstrap-admin");
  bootstrap = spyOn(bootstrapModule, "ensureBootstrapAdmin").mockResolvedValue(bootstrapUser);
  sign = spyOn(jwt, "sign");
  permissionDb = await import("../lib/permissions-db");
  middleware = await import("../middleware/auth");
  cache = await import("../lib/permissions-cache");
  ({ NotificationsService } = await import("../services/notifications-service"));
  actualCreateNotification = NotificationsService.createNotification.bind(NotificationsService);
  delivery = spyOn(NotificationsService, "createNotification").mockResolvedValue(true);
  const { default: router } = await import("../routes/auth");
  const stack: Array<{ route?: { path: string; stack: Array<{ handle: RouteHandler }> } }> = router.stack;
  for (const layer of stack) {
    const handler = layer.route?.stack.at(-1)?.handle;
    if (layer.route && handler) routes.set(layer.route.path, handler);
  }
});

function enqueueContext(roles: Row[], user: Row = {}) {
  queryReplies.push(
    { rows: [{ role_id: "primary-role", role_ids: [], is_active: true, deleted_at: null, ...user }] },
    { rows: roles },
  );
}

function makeResponse() {
  const response: Response & { body: unknown } = Object.create(express.response);
  response.statusCode = 200;
  response.body = undefined;
  response.status = (code) => { response.statusCode = code; return response; };
  response.json = (body: unknown) => { response.body = body; return response; };
  response.cookie = mock(() => response);
  return response;
}

async function authenticate() {
  const token = signTestToken(verifiedTokenUser, TEST_JWT_SECRET);
  const req = { method: "GET", headers: { cookie: `token=${token}` } } as AuthRequest;
  const response = makeResponse();
  const next = mock(() => {});
  await middleware.requireAuth(req, response as Response, next);
  return { req, response, next };
}

async function login(username = "synthetic", password = "synthetic-password") {
  const handler = routes.get("/login");
  if (!handler) throw new Error("Missing captured login route");
  const response = makeResponse();
  await handler({ body: { username, password } } as AuthRequest, response as Response, () => {});
  return response;
}

async function invokeEndpoint(path: string) {
  const result = await authenticate();
  expect(result.next).toHaveBeenCalledTimes(1);
  const handler = routes.get(path);
  if (!handler) throw new Error(`Missing captured route: ${path}`);
  await handler(result.req, result.response as Response, () => {});
  return result;
}

beforeEach(() => {
  cache.invalidateAllCache(0);
  queryReplies.length = 0;
  unexpectedQueries.length = 0;
  fallbackReplies.clear();
  fallbackFilters.length = 0;
  verifiedTokenUser = tokenUser;
  query.mockClear();
  fallbackFrom.mockClear();
  delivery.mockClear();
  loggedError.mockClear();
  loggedWarning.mockClear();
  sign.mockClear();
  bootstrap.mockReset();
  bootstrap.mockImplementation(async () => bootstrapUser);
});

afterEach(() => {
  expect(unexpectedQueries).toEqual([]);
  expect(forbiddenProvider).not.toHaveBeenCalled();
});

afterAll(() => {
  delivery?.mockRestore();
  loggedError.mockRestore();
  loggedWarning.mockRestore();
  network.mockRestore();
  cache?.invalidateAllCache(0);
  bootstrap?.mockRestore();
  sign?.mockRestore();
  restoreProviders?.();
});

describe("phase-one controls: intended behavior retained", () => {
  test("resolves primary and additional current roles without dropping or duplicating membership", async () => {
    enqueueContext([
      { name: "SYNTHETIC_PRIMARY", permissions: {}, permission_slugs: ["events:read"] },
      { name: "SYNTHETIC_SECONDARY", permissions: {}, permission_slugs: ["payroll:read"] },
    ], { role_ids: ["secondary-role", "primary-role", "secondary-role"] });
    const context = await permissionDb.fetchUserRoleContext(userId);
    expect(context.roleNames).toEqual(["SYNTHETIC_PRIMARY", "SYNTHETIC_SECONDARY"]);
    expect(context.permissionSlugs.sort()).toEqual(["events:read", "payroll:read"]);
    expect(query.mock.calls[1]?.[1]).toEqual([["secondary-role", "primary-role"]]);
  });

  test.each(["SUPER_ADMIN", "admin", "OWNER"])("preserves explicit full access for protected %s", async (name) => {
    enqueueContext([{ name, permissions: { all: true }, permission_slugs: [] }]);
    const context = await permissionDb.fetchUserRoleContext(userId);
    expect(context.permissionSlugs).toContain("*");
  });

  test("retains an explicit wildcard on a custom current role", async () => {
    enqueueContext([{ name: "SYNTHETIC_CUSTOM", permissions: {}, permission_slugs: ["*"] }]);
    expect((await permissionDb.fetchUserRoleContext(userId)).permissionSlugs).toEqual(["*"]);
  });

  test("replaces a stale owner token with current custom-role grants and reuses the cache", async () => {
    enqueueContext([{ name: "SYNTHETIC_CURRENT", permissions: {}, permission_slugs: ["events:read"] }]);
    for (let index = 0; index < 2; index += 1) {
      const result = await authenticate();
      expect(result.next).toHaveBeenCalledTimes(1);
      expect(result.req.admin).toBe(false);
      expect(middleware.getEffectivePermissionSlugsFromUser(result.req.user)).toEqual(["events:read"]);
    }
    expect(query).toHaveBeenCalledTimes(2);
  });

  test("rejects a missing user instead of using a stale owner token", async () => {
    queryReplies.push({ rows: [] });
    const result = await authenticate();
    expect(result.response.statusCode).toBe(401);
    expect(result.next).not.toHaveBeenCalled();
    expect(cache.getCachedUserPermissions(userId)).toBeNull();
  });

  test("fails closed when current authority cannot be read", async () => {
    queryReplies.push(new Error("Synthetic authority failure"));
    const result = await authenticate();
    expect(result.response.statusCode).toBe(503);
    expect(result.next).not.toHaveBeenCalled();
    expect(loggedError).toHaveBeenCalled();
    expect(cache.getCachedUserPermissions(userId)).toBeNull();
  });

  test("preserves the #277 same-clock invalidation revision guard", async () => {
    const clock = spyOn(Date, "now").mockReturnValue(123_000);
    let release!: (result: QueryResult) => void;
    let started!: () => void;
    const pending = new Promise<QueryResult>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { started = resolve; });
    queryReplies.push(
      { rows: [{ role_id: "primary-role", role_ids: [], is_active: true, deleted_at: null }] },
      () => { started(); return pending; },
    );
    try {
      const resultPromise = authenticate();
      await entered;
      cache.invalidateUserCache(userId);
      release({ rows: [{ name: "SYNTHETIC_CURRENT", permissions: {}, permission_slugs: ["events:read"] }] });
      const result = await resultPromise;
      expect(result.response.statusCode).toBe(503);
      expect(result.next).not.toHaveBeenCalled();
      expect(cache.getCachedUserPermissions(userId)).toBeNull();
    } finally {
      release({ rows: [] });
      clock.mockRestore();
    }
  });

  test.each([true, false])("preserves notification aliases, deduplication and include_actor=%s", async (include_actor) => {
    queryReplies.push({ rows: [
      { id: "actor", role_name: "synthetic", permissions: {}, slugs: ["hr:read"] },
      { id: "actor", role_name: "secondary", permissions: {}, slugs: ["hr:read"] },
      { id: "recipient", role_name: "synthetic", permissions: {}, slugs: ["hr:read"] },
    ] });
    const count = await NotificationsService.emitNotificationToRoleOrPermission({
      permissionSlug: "employees:read",
      actor_id: "actor",
      include_actor,
      title: "Synthetic update",
      message: "Synthetic message",
      entity_type: "employee",
    });
    expect(count).toBe(include_actor ? 2 : 1);
    expect(delivery.mock.calls.map(([params]) => params.recipient_id))
      .toEqual(include_actor ? ["actor", "recipient"] : ["recipient"]);
  });

  test("keeps singular notification categories subject to the user's existing preference", async () => {
    queryReplies.push({ rows: [{ in_app_enabled: true, categories: { proposals: false } }] });
    expect(await actualCreateNotification({
      recipient_id: "synthetic-recipient",
      title: "Synthetic proposal",
      message: "Synthetic message",
      entity_type: "proposal",
    })).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("phase-one red evidence: current-grant gaps", () => {
  test("a saved EVENT_MANAGER grant removal must deny the removed API operation", async () => {
    enqueueContext([{ name: "EVENT_MANAGER", permissions: {}, permission_slugs: ["events:read"] }]);
    const result = await authenticate();
    const allowed = mock(() => {});
    middleware.requirePermissionSlugs(["events:write"])(result.req, result.response as Response, allowed);
    expect(result.response.statusCode).toBe(403);
    expect(allowed).not.toHaveBeenCalled();
  });

  test("an empty current grant set must not revive the editor's untouched legacy JSON map", async () => {
    enqueueContext([{ name: "SYNTHETIC_CUSTOM", permissions: { expenses: ["approve"] }, permission_slugs: [] }]);
    const result = await authenticate();
    const allowed = mock(() => {});
    middleware.requirePermissionSlugs(["expenses:approve"])(result.req, result.response as Response, allowed);
    expect(result.response.statusCode).toBe(403);
    expect(allowed).not.toHaveBeenCalled();
  });

  test("an authoritative empty cache entry must not reactivate middleware role seeds", async () => {
    cache.setCachedUserPermissions(userId, { roleNames: ["EVENT_MANAGER"], permissionSlugs: [] });
    const result = await authenticate();
    expect(middleware.getEffectivePermissionSlugsFromUser(result.req.user)).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  test("/auth/me must not add seed permissions to a validated restricted cache entry", async () => {
    cache.setCachedUserPermissions(userId, { roleNames: ["EVENT_MANAGER"], permissionSlugs: ["events:read"] });
    const result = await invokeEndpoint("/me");
    expect(result.response.body).toMatchObject({ user: { permission_slugs: ["events:read"] } });
    expect(query).not.toHaveBeenCalled();
  });

  test("/auth/permissions reports the validated grants without an unguarded second lookup", async () => {
    cache.setCachedUserPermissions(userId, { roleNames: ["EVENT_MANAGER"], permissionSlugs: ["events:read"] });
    const result = await invokeEndpoint("/permissions");
    expect(result.response.body).toMatchObject({ permission_slugs: ["events:read"], is_superuser: false });
    expect(query).not.toHaveBeenCalled();
  });

  test.each([
    { label: "inactive", row: { is_active: false, deleted_at: null } },
    { label: "soft-deleted", row: { is_active: true, deleted_at: "2026-01-01T00:00:00.000Z" } },
  ])("a $label user must not receive a fresh authorized session context", async ({ row }) => {
    enqueueContext([{ name: "SYNTHETIC_CURRENT", permissions: {}, permission_slugs: ["events:read"] }], row);
    const result = await authenticate();
    expect([401, 403]).toContain(result.response.statusCode);
    expect(result.next).not.toHaveBeenCalled();
    expect(cache.getCachedUserPermissions(userId)).toBeNull();
    expect(query.mock.calls[0]?.[0]).toContain("is_active = TRUE AND deleted_at IS NULL");
  });

  test("an unassigned current user must not regain an old primary role from the caller", async () => {
    enqueueContext([{ name: "SYNTHETIC_OLD", permissions: {}, permission_slugs: ["events:write"] }],
      { role_id: null, role_ids: [] });
    const context = await permissionDb.fetchUserRoleContext(userId, "stale-primary-role");
    expect(context.roleNames).toEqual([]);
    expect(context.permissionSlugs).toEqual([]);
  });

  test.each([
    { name: "event_manager", permissions: {}, required: "events:write" },
    { name: "synthetic_custom", permissions: { expenses: ["approve"] }, required: "expenses:approve" },
  ])("notification selection must honor revoked grants for $name", async ({ name, permissions, required }) => {
    queryReplies.push({ rows: [{ id: "revoked-recipient", role_name: name, permissions, slugs: [] }] });
    expect(await NotificationsService.emitNotificationToRoleOrPermission({
      permissionSlug: required,
      title: "Synthetic restricted notice",
      message: "Synthetic message",
      entity_type: "event",
    })).toBe(0);
    expect(delivery).not.toHaveBeenCalled();
  });

  test("a failed fallback grant-table read must reject rather than restore legacy rights", async () => {
    queryReplies.push(
      { rows: [{ role_id: "primary-role", role_ids: [], is_active: true, deleted_at: null }] },
      Object.assign(new Error("Synthetic pool unreachable"), { code: "ENOTFOUND" }),
    );
    fallbackReplies.set("roles", {
      data: [{ id: "primary-role", name: "SYNTHETIC_CUSTOM", permissions: { expenses: ["approve"] } }],
      error: null,
    });
    fallbackReplies.set("role_permissions", {
      data: null,
      error: { code: "42501", message: "Synthetic grant read denied" },
    });
    await expect(permissionDb.fetchUserRoleContext(userId)).rejects.toBeDefined();
  });
});

describe("approved policy and legacy boundary regressions", () => {
  const unavailable = () => Object.assign(new Error("Synthetic pool unreachable"), { code: "ENOTFOUND" });
  const missingRelation = (name: string) => Object.assign(
    new Error(`relation "public.${name}" does not exist`), { code: "42P01" },
  );

  test("SYSTEM_MANAGER follows editable current grants under the parent's evidence-based decision", async () => {
    enqueueContext([{
      name: "SYSTEM_MANAGER", permissions: { all: true },
      permission_slugs: ["users:manage", "settings:write"],
    }]);
    const result = await authenticate();
    expect(result.req.admin).toBe(false);
    expect(middleware.getEffectivePermissionSlugsFromUser(result.req.user))
      .toEqual(["users:manage", "settings:write"]);
    const allowed = mock(() => {});
    middleware.requirePermissionSlugs(["payroll:write"])(result.req, result.response as Response, allowed);
    expect(result.response.statusCode).toBe(403);
    expect(allowed).not.toHaveBeenCalled();
  });

  test("a cached role label alone cannot make auth metadata a superuser", async () => {
    cache.setCachedUserPermissions(userId, { roleNames: ["OWNER"], permissionSlugs: [] });
    const result = await invokeEndpoint("/permissions");
    expect(result.response.body).toMatchObject({ permission_slugs: [], is_superuser: false });
  });

  test("permission changes remain visible after invalidation instead of reviving a token snapshot", async () => {
    enqueueContext([{ name: "EVENT_MANAGER", permissions: {}, permission_slugs: ["events:write"] }]);
    expect(middleware.getEffectivePermissionSlugsFromUser((await authenticate()).req.user)).toEqual(["events:write"]);
    cache.invalidateUserCache(userId);
    enqueueContext([{ name: "EVENT_MANAGER", permissions: { events: ["write"] }, permission_slugs: [] }]);
    const result = await authenticate();
    expect(result.next).toHaveBeenCalledTimes(1);
    expect(middleware.getEffectivePermissionSlugsFromUser(result.req.user)).toEqual([]);
    expect(cache.getCachedUserPermissions(userId)?.permissionSlugs).toEqual([]);
  });

  test("supports a genuinely missing role_ids column while retaining account eligibility", async () => {
    queryReplies.push(Object.assign(new Error('column "role_ids" does not exist'), { code: "42703" }));
    enqueueContext([{ name: "EVENT_MANAGER", permissions: {}, permission_slugs: ["events:read"] }]);
    const context = await permissionDb.fetchUserRoleContext(userId);
    expect(context.permissionSlugs).toEqual(["events:read"]);
    expect(query.mock.calls[1]?.[0])
      .toContain("SELECT role_id FROM users WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL");
  });

  test.each(["role_permissions", "permissions"])("uses explicit legacy JSON only after missing %s is identified", async (table) => {
    queryReplies.push(
      { rows: [{ role_id: "primary-role", role_ids: [], is_active: true, deleted_at: null }] },
      missingRelation(table),
      { rows: [{ name: "EVENT_MANAGER", permissions: { events: ["read"] } }] },
    );
    const context = await permissionDb.fetchUserRoleContext(userId);
    expect(context.permissionSlugs).toEqual(["events:read"]);
  });

  test.each([
    { code: "42501", message: 'permission denied for relation "role_permissions"' },
    { code: "42P01", message: 'relation "public.roles" does not exist' },
    { code: "42601", message: 'column role_ids syntax error' },
    { code: "PGRST205", message: "Could not find public.role_permissions in the schema cache" },
  ])("does not treat $code / $message as established legacy schema", async (failure) => {
    queryReplies.push(
      { rows: [{ role_id: "primary-role", role_ids: [], is_active: true, deleted_at: null }] },
      Object.assign(new Error(failure.message), { code: failure.code }),
    );
    await expect(permissionDb.fetchUserRoleContext(userId)).rejects.toMatchObject(failure);
    expect(query).toHaveBeenCalledTimes(2);
    expect(fallbackFrom).not.toHaveBeenCalled();
  });

  test("a missing eligibility column cannot downgrade to a permissive user lookup", async () => {
    queryReplies.push(Object.assign(new Error('column "is_active" does not exist'), { code: "42703" }));
    await expect(permissionDb.fetchUserRoleContext(userId)).rejects.toMatchObject({ code: "42703" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  test("successful alternate-transport empty grants remain empty despite a legacy JSON wildcard", async () => {
    queryReplies.push(
      { rows: [{ role_id: "primary-role", role_ids: [], is_active: true, deleted_at: null }] },
      unavailable(),
    );
    fallbackReplies.set("roles", {
      data: [{ id: "primary-role", name: "SYSTEM_MANAGER", permissions: { all: true } }], error: null,
    });
    fallbackReplies.set("role_permissions", { data: [], error: null });
    expect((await permissionDb.fetchUserRoleContext(userId)).permissionSlugs).toEqual([]);
    expect(fallbackFrom.mock.calls.map(([table]) => table)).toEqual(["roles", "role_permissions"]);
  });

  test.each([
    { table: "role_permissions", code: "42501" },
    { table: "permissions", code: "42501" },
    { table: "role_permissions", code: "PGRST205" },
    { table: "permissions", code: "PGRST205" },
    { table: "permissions", code: "PGRST000" },
  ])("rejects a $table $code failure on the alternate current-grant transport", async ({ table, code }) => {
    queryReplies.push(
      { rows: [{ role_id: "primary-role", role_ids: [], is_active: true, deleted_at: null }] },
      unavailable(),
    );
    fallbackReplies.set("roles", {
      data: [{ id: "primary-role", name: "SYNTHETIC_CUSTOM", permissions: { all: true } }], error: null,
    });
    fallbackReplies.set("role_permissions", {
      data: [{ role_id: "primary-role", permission_id: "permission-1" }], error: null,
    });
    fallbackReplies.set(table, { data: null, error: { code, message: "Synthetic unavailable authority" } });
    await expect(permissionDb.fetchUserRoleContext(userId)).rejects.toMatchObject({ code });
  });

  test("alternate transport checks eligibility and resolves primary plus additional grants in batches", async () => {
    queryReplies.push(unavailable(), unavailable());
    fallbackReplies.set("users", {
      data: [{
        id: userId, role_id: "primary-role", role_ids: ["secondary-role"],
        is_active: true, deleted_at: null,
      }], error: null,
    });
    fallbackReplies.set("roles", {
      data: [
        { id: "primary-role", name: "EVENT_MANAGER", permissions: { all: true } },
        { id: "secondary-role", name: "SYNTHETIC_SECONDARY", permissions: {} },
      ], error: null,
    });
    fallbackReplies.set("role_permissions", {
      data: [
        { role_id: "primary-role", permission_id: "read-events" },
        { role_id: "secondary-role", permission_id: "read-payroll" },
      ], error: null,
    });
    fallbackReplies.set("permissions", {
      data: [{ id: "read-events", slug: "events:read" }, { id: "read-payroll", slug: "payroll:read" }],
      error: null,
    });
    const context = await permissionDb.fetchUserRoleContext(userId);
    expect(context.permissionSlugs.sort()).toEqual(["events:read", "payroll:read"]);
    expect(context.roleNames).toEqual(["EVENT_MANAGER", "SYNTHETIC_SECONDARY"]);
    expect(fallbackFilters).toEqual([
      { table: "users", operation: "eq", column: "id", value: userId },
      { table: "users", operation: "eq", column: "is_active", value: true },
      { table: "users", operation: "is", column: "deleted_at", value: null },
    ]);
  });

  test.each([
    { is_active: false, deleted_at: null },
    { is_active: true, deleted_at: "2026-01-01" },
  ])("alternate transport rejects an ineligible account (%j)", async (eligibility) => {
    queryReplies.push(unavailable());
    fallbackReplies.set("users", {
      data: [{ id: userId, role_id: "primary-role", role_ids: [], ...eligibility }], error: null,
    });
    const context = await permissionDb.fetchUserRoleContext(userId);
    expect(context.userExists).toBe(false);
    expect(context.permissionSlugs).toEqual([]);
    expect(fallbackFrom.mock.calls.map(([table]) => table)).toEqual(["users"]);
  });

  test("notification fallback retains current grants when only role_ids is genuinely absent", async () => {
    queryReplies.push(
      Object.assign(new Error('column "u.role_ids" does not exist'), { code: "42703" }),
      { rows: [{ id: "recipient", role_name: "event_manager", permissions: { all: true }, slugs: [] }] },
    );
    expect(await NotificationsService.emitNotificationToRoleOrPermission({
      permissionSlug: "events:write", title: "Synthetic", message: "Synthetic", entity_type: "event",
    })).toBe(0);
    expect(query.mock.calls[1]?.[0]).not.toContain("extra_role");
    expect(query.mock.calls[1]?.[0]).toContain("role_permissions");
  });

  test("notification legacy support handles both identified missing structures without removing eligibility", async () => {
    queryReplies.push(
      missingRelation("role_permissions"),
      Object.assign(new Error('column "u.role_ids" does not exist'), { code: "42703" }),
      { rows: [{ id: "recipient", role_name: "synthetic", permissions: { hr: ["read"] } }] },
    );
    expect(await NotificationsService.emitNotificationToRoleOrPermission({
      permissionSlug: "employees:read", title: "Synthetic", message: "Synthetic", entity_type: "employee",
    })).toBe(1);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2]?.[0]).not.toContain("role_permissions");
    expect(query.mock.calls[2]?.[0]).not.toContain("extra_role");
    expect(query.mock.calls[2]?.[0]).toContain("u.is_active = TRUE");
    expect(query.mock.calls[2]?.[0]).toContain("u.deleted_at IS NULL");
  });

  test("a notification authority failure logs an error and never emits from old grants", async () => {
    queryReplies.push(Object.assign(new Error("Synthetic grant access denied"), { code: "42501" }));
    expect(await NotificationsService.emitNotificationToRoleOrPermission({
      permissionSlug: "events:read", title: "Synthetic", message: "Synthetic", entity_type: "event",
    })).toBe(0);
    expect(loggedError).toHaveBeenCalled();
    expect(delivery).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  test("normal login signs current empty grants instead of credential-row role snapshots", async () => {
    queryReplies.push({ rows: [{
      id: userId, username: "synthetic", full_name: "Synthetic User", is_active: true,
      role_name: "OWNER", permissions: { all: true }, permission_slugs: ["*"],
    }] });
    enqueueContext([], { role_id: null, role_ids: [] });
    const result = await login();
    expect(result.statusCode).toBe(200);
    expect(sign.mock.calls[0]?.[0]).toMatchObject({ role: "", roles: [], permission_slugs: [] });
  });

  test("normal login does not sign a session when the current user is unavailable", async () => {
    queryReplies.push(
      { rows: [{
        id: userId, username: "synthetic", full_name: "Synthetic User", is_active: true,
        role_name: "OWNER", permissions: { all: true }, permission_slugs: ["*"],
      }] },
      { rows: [] },
    );
    const result = await login();
    expect(result.statusCode).toBe(401);
    expect(sign).not.toHaveBeenCalled();
  });

  test("normal login cannot fall back to a credential-row grant snapshot on authority failure", async () => {
    queryReplies.push(
      { rows: [{
        id: userId, username: "synthetic", full_name: "Synthetic User", is_active: true,
        role_name: "OWNER", permissions: { all: true }, permission_slugs: ["*"],
      }] },
      Object.assign(new Error("Synthetic current authority denied"), { code: "42501" }),
    );
    const result = await login();
    expect(result.statusCode).toBe(500);
    expect(loggedError).toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  test("the defined bootstrap login retains its explicit administrator grant", async () => {
    queryReplies.push({ rows: [] });
    const result = await login("admin", TEST_ADMIN_PASSWORD);
    expect(result.statusCode).toBe(200);
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(sign.mock.calls[0]?.[0]).toMatchObject({
      id: userId, role: "SUPER_ADMIN", permissions: { all: true }, permission_slugs: ["*"],
    });
  });

  test("the explicit legacy bootstrap recovery token remains usable without rewriting bootstrap policy", async () => {
    queryReplies.push({ rows: [] });
    bootstrap.mockRejectedValueOnce(new Error("Synthetic bootstrap unavailable"));
    expect((await login("admin", TEST_ADMIN_PASSWORD)).statusCode).toBe(200);
    expect(sign.mock.calls[0]?.[0]).toEqual({
      username: "admin", role: "SUPER_ADMIN", permissions: { all: true }, permission_slugs: ["*"],
    });
    verifiedTokenUser = { username: "admin", role: "SUPER_ADMIN", permissions: { all: true }, permission_slugs: ["*"] };
    const result = await authenticate();
    expect(result.next).toHaveBeenCalledTimes(1);
    expect(result.req.admin).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
