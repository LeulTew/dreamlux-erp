import { describe, test, expect, mock, afterEach, beforeAll, beforeEach } from "bun:test";
import { EventEmitter } from "events";
import { getCachedUserPermissions, setCachedUserPermissions } from "../lib/permissions-cache";

const listenerClient = Object.assign(new EventEmitter(), {
  query: mock(() => Promise.resolve({ rows: [], rowCount: 0 })),
  release: mock(() => {}),
});

const mockConnect = mock(() => Promise.resolve(listenerClient));

mock.module("../db/pool", () => ({
  pool: {
    connect: mockConnect,
  },
}));

let startPermissionCacheInvalidationListener: typeof import("../lib/permissions-cache-listener").startPermissionCacheInvalidationListener;
let stopPermissionCacheInvalidationListener: typeof import("../lib/permissions-cache-listener").stopPermissionCacheInvalidationListener;

beforeAll(async () => {
  const mod = await import("../lib/permissions-cache-listener");
  startPermissionCacheInvalidationListener = mod.startPermissionCacheInvalidationListener;
  stopPermissionCacheInvalidationListener = mod.stopPermissionCacheInvalidationListener;
});

beforeEach(async () => {
  await stopPermissionCacheInvalidationListener();
  mockConnect.mockClear();
  listenerClient.query.mockClear();
  listenerClient.release.mockClear();
});

afterEach(async () => {
  await stopPermissionCacheInvalidationListener();
});

describe("permission cache LISTEN invalidation", () => {
  test("invalidates one user from user-scoped notification payloads", async () => {
    setCachedUserPermissions("user-1", { roleNames: ["old"], permissionSlugs: ["assets:read"] });
    setCachedUserPermissions("user-2", { roleNames: ["old"], permissionSlugs: ["events:read"] });

    await startPermissionCacheInvalidationListener();
    listenerClient.emit("notification", {
      channel: "dreamlux_permissions_changed",
      payload: JSON.stringify({ scope: "user", userId: "user-1", reason: "users:UPDATE" }),
    });

    expect(getCachedUserPermissions("user-1")).toBeNull();
    expect(getCachedUserPermissions("user-2")).not.toBeNull();
  });

  test("invalidates all users from role permission notifications", async () => {
    setCachedUserPermissions("user-1", { roleNames: ["old"], permissionSlugs: ["assets:read"] });
    setCachedUserPermissions("user-2", { roleNames: ["old"], permissionSlugs: ["events:read"] });

    await startPermissionCacheInvalidationListener();
    listenerClient.emit("notification", {
      channel: "dreamlux_permissions_changed",
      payload: JSON.stringify({ scope: "all", reason: "role_permissions:INSERT" }),
    });

    expect(getCachedUserPermissions("user-1")).toBeNull();
    expect(getCachedUserPermissions("user-2")).toBeNull();
  });
});
