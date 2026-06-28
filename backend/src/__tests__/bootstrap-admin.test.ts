import { beforeEach, describe, expect, mock, test } from "bun:test";

const queryCalls: Array<{ sql: string; params?: unknown[] }> = [];

const mockQuery = mock((sql: string, params?: unknown[]) => {
  queryCalls.push({ sql, params });

  if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
    return Promise.resolve({ rows: [], rowCount: 0 });
  }

  if (sql.includes("SELECT id, name, permissions FROM roles WHERE name = 'SUPER_ADMIN'")) {
    return Promise.resolve({
      rows: [{ id: "role-super-admin", name: "SUPER_ADMIN", permissions: { all: true } }],
      rowCount: 1,
    });
  }

  if (sql.includes("FROM users u") && sql.includes("WHERE u.username = 'admin'")) {
    return Promise.resolve({
      rows: [
        {
          id: "user-admin",
          username: "admin",
          full_name: "Old Admin",
          is_active: true,
          role_name: "SUPER_ADMIN",
          permissions: { all: true },
        },
      ],
      rowCount: 1,
    });
  }

  if (sql.includes("UPDATE users") && sql.includes("password_hash = crypt($1, gen_salt('bf'))")) {
    return Promise.resolve({
      rows: [
        {
          id: "user-admin",
          username: "admin",
          full_name: "System Administrator",
          is_active: true,
        },
      ],
      rowCount: 1,
    });
  }

  return Promise.resolve({ rows: [], rowCount: 0 });
});

const mockRelease = mock(() => {});

mock.module("../db/pool", () => ({
  pool: {
    connect: mock(() =>
      Promise.resolve({
        query: mockQuery,
        release: mockRelease,
      }),
    ),
  },
}));

describe("ensureBootstrapAdmin", () => {
  beforeEach(() => {
    queryCalls.length = 0;
    mockQuery.mockClear();
    mockRelease.mockClear();
  });

  test("refreshes an existing admin password hash from configured dev/test password", async () => {
    const { ensureBootstrapAdmin } = await import("../lib/bootstrap-admin");

    const admin = await ensureBootstrapAdmin("Password123");

    expect(admin).toMatchObject({
      id: "user-admin",
      username: "admin",
      full_name: "System Administrator",
      role_name: "SUPER_ADMIN",
      is_active: true,
    });

    const passwordSync = queryCalls.find((call) =>
      call.sql.includes("password_hash = crypt($1, gen_salt('bf'))"),
    );

    expect(passwordSync).toBeDefined();
    expect(passwordSync?.params).toEqual(["Password123", "user-admin"]);
    expect(mockRelease).toHaveBeenCalled();
  });
});
