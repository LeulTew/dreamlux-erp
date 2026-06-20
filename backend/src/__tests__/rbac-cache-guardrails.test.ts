import "./setup";
import { describe, test, expect, mock, beforeAll } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";
import { getCachedUserPermissions, setCachedUserPermissions } from "../lib/permissions-cache";

let lastAdminTest = false;

// Mock the DB pool with SQL-matching implementation to prevent startup query pollution
const mockQuery = mock((sql: string, params?: any[]) => {
  const safeParams = params || [];

  if (safeParams[0] === "verify-db-error") {
    return Promise.reject(new Error("permission database unavailable"));
  }

  if (sql.includes("SELECT name FROM roles WHERE id = $1")) {
    const roleId = safeParams[0];
    if (roleId === "role-admin") return Promise.resolve({ rows: [{ name: "SUPER_ADMIN" }], rowCount: 1 });
    if (roleId === "role-owner") return Promise.resolve({ rows: [{ name: "OWNER" }], rowCount: 1 });
    if (roleId === "role-custom") return Promise.resolve({ rows: [{ name: "CUSTOM" }], rowCount: 1 });
    return Promise.resolve({ rows: [{ name: "CUSTOM_ROLE" }], rowCount: 1 });
  }

  if (sql.includes("SELECT id FROM users") && sql.includes("role_id = $1")) {
    const roleId = safeParams[0];
    if (roleId === "role-custom") {
      return Promise.resolve({ rows: [{ id: "user-1" }], rowCount: 1 });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  }

  if (sql.includes("SELECT u.id, u.username FROM users u")) {
    // If we're testing the last active administrator deletion guardrail
    if (lastAdminTest) {
      return Promise.resolve({ rows: [{ id: "user-3", username: "admin" }], rowCount: 1 });
    }
    // Otherwise return two active super admins to allow modification/deletion of others
    return Promise.resolve({ rows: [{ id: "admin-1", username: "admin" }, { id: "admin-2", username: "admin2" }], rowCount: 2 });
  }

  if (sql.includes("SELECT username, profile_image_url FROM users WHERE id = $1")) {
    return Promise.resolve({ rows: [{ username: "testuser", profile_image_url: null }], rowCount: 1 });
  }

  if (sql.includes("SELECT id FROM roles WHERE LOWER(name) = LOWER($1)")) {
    return Promise.resolve({ rows: [], rowCount: 0 });
  }

  if (sql.includes("INSERT INTO roles")) {
    return Promise.resolve({ rows: [{ id: "custom-role-1", name: safeParams[0], description: safeParams[1] }], rowCount: 1 });
  }

  if (sql.includes("UPDATE roles SET name = $1")) {
    return Promise.resolve({ rows: [{ id: safeParams[2], name: safeParams[0], description: safeParams[1] }], rowCount: 1 });
  }

  if (sql.includes("UPDATE users SET full_name = $1") || sql.includes("UPDATE users\n         SET full_name = $1")) {
    return Promise.resolve({ rows: [{ id: safeParams[safeParams.length - 1], username: "user1", full_name: safeParams[0] }], rowCount: 1 });
  }

  if (sql.includes("SELECT role_ids, role_id FROM users WHERE id = $1")) {
    return Promise.resolve({ rows: [{ role_id: "role-1", role_ids: ["role-1"] }], rowCount: 1 });
  }

  if (sql.includes("SELECT\n       r.name,\n       r.permissions")) {
    return Promise.resolve({ rows: [{ name: "STORE_MANAGER", permissions: {}, permission_slugs: ["users:manage", "assets:read"] }], rowCount: 1 });
  }

  if (sql.includes("FROM field_permissions fp")) {
    return Promise.resolve({ rows: [{ field_name: "contract_price" }], rowCount: 1 });
  }

  return Promise.resolve({ rows: [], rowCount: 1 });
});

mock.module("../db/pool", () => ({
  pool: {
    query: mockQuery,
  },
}));

let app: import("express").Application;

beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

const JWT_SECRET = "test-secret";

function getToken(role = "SUPER_ADMIN", extra: Record<string, unknown> = {}): string {
  return jwt.sign({ id: "admin-1", role, username: "admin", ...extra }, JWT_SECRET, { expiresIn: "1h" });
}

describe("RBAC Caching & Guardrails", () => {
  test("PUT /users/:id calls invalidateUserCache", async () => {
    setCachedUserPermissions("user-1", { roleNames: ["test-role"], permissionSlugs: ["assets:read"] });
    expect(getCachedUserPermissions("user-1")).not.toBeNull();

    const res = await request(app)
      .put("/users/user-1")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        fullName: "Updated Name",
        roleId: "role-1",
        isActive: true,
      });

    expect(res.status).toBe(200);
    expect(getCachedUserPermissions("user-1")).toBeNull();
  });

  test("DELETE /users/:id calls invalidateUserCache", async () => {
    setCachedUserPermissions("user-2", { roleNames: ["test-role"], permissionSlugs: ["assets:read"] });
    expect(getCachedUserPermissions("user-2")).not.toBeNull();

    const res = await request(app)
      .delete("/users/user-2")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(204);
    expect(getCachedUserPermissions("user-2")).toBeNull();
  });

  test("PUT /users/roles/:id/permissions checks SUPER_ADMIN * protection", async () => {
    const res = await request(app)
      .put("/users/roles/role-admin/permissions")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        permission_slugs: ["assets:read"],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Cannot strip administrator roles");
  });

  test("DELETE /users/:id blocks deleting the last active administrator", async () => {
    lastAdminTest = true;
    const res = await request(app)
      .delete("/users/user-3")
      .set("Authorization", `Bearer ${getToken()}`);
    lastAdminTest = false;

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Cannot delete the last active administrator");
  });

  test("PUT /users/:id blocks deactivating the last active administrator", async () => {
    lastAdminTest = true;
    const res = await request(app)
      .put("/users/user-3")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        fullName: "Updated Name",
        roleId: "role-admin",
        isActive: false,
      });
    lastAdminTest = false;

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Cannot deactivate the last active administrator");
  });

  test("PUT /users/:id blocks demoting the last active administrator", async () => {
    lastAdminTest = true;
    const res = await request(app)
      .put("/users/user-3")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        fullName: "Updated Name",
        roleId: "role-custom",
        isActive: true,
      });
    lastAdminTest = false;

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Cannot demote the last active administrator");
  });

  test("Role CRUD: POST /users/roles creates custom role", async () => {
    const res = await request(app)
      .post("/users/roles")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        name: "TESTER",
        description: "Tester",
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("TESTER");
    expect(res.body.id).toBe("custom-role-1");
  });

  test("Role CRUD: PUT /users/roles/:id blocks editing system roles", async () => {
    const res = await request(app)
      .put("/users/roles/role-admin")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        name: "SUPER_ADMIN_NEW",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("cannot be renamed");
  });

  test("Role CRUD: DELETE /users/roles/:id blocks deleting system roles", async () => {
    const res = await request(app)
      .delete("/users/roles/role-owner")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("cannot be deleted");
  });

  test("Role CRUD: DELETE /users/roles/:id blocks deleting assigned roles", async () => {
    const res = await request(app)
      .delete("/users/roles/role-custom")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("currently assigned");
  });

  test("requireAuth queries database and caches permissions for verify-db-* user", async () => {
    expect(getCachedUserPermissions("verify-db-user")).toBeNull();

    const verifyToken = jwt.sign({ id: "verify-db-user", role: "STORE_MANAGER", username: "test" }, JWT_SECRET, { expiresIn: "1h" });
    const res = await request(app)
      .get("/users/roles")
      .set("Authorization", `Bearer ${verifyToken}`);

    // Call should pass and user should be cached
    expect(res.status).toBe(200);
    const cached = getCachedUserPermissions("verify-db-user");
    expect(cached).not.toBeNull();
    expect(cached?.roleNames).toContain("STORE_MANAGER");
    expect(cached?.permissionSlugs).toContain("users:manage");
  });

  test("permission middleware fails closed when fresh DB permission lookup fails", async () => {
    const verifyToken = jwt.sign(
      {
        id: "verify-db-error",
        role: "SUPER_ADMIN",
        username: "admin",
        permission_slugs: ["users:manage"],
      },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    const res = await request(app)
      .get("/users/roles")
      .set("Authorization", `Bearer ${verifyToken}`);

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("Permission lookup unavailable");
  });

  test("field permission metadata resolves hidden fields for role names", async () => {
    const { fetchHiddenFieldsForRoles } = await import("../lib/permissions-db");
    const hiddenFields = await fetchHiddenFieldsForRoles(["DRIVER"], "events");

    expect(hiddenFields).toContain("contract_price");
  });
});
