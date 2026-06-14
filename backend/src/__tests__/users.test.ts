import "./setup";
import { describe, test, expect, mock, beforeAll, beforeEach } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

// Mock the DB pool
const mockQuery = mock((..._args: any[]) => Promise.resolve({ rows: [] as any[], rowCount: 1 }));

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

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe("Users API", () => {
  test("GET /users returns users for SUPER_ADMIN", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "1",
        username: "test",
        full_name: "Test",
        email: null,
        is_active: true,
        created_at: new Date().toISOString(),
        role_id: "role-1",
        role_name: "SUPER_ADMIN",
      }],
      rowCount: 1,
    });

    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].username).toBe("test");
  });

  test("GET /users blocks unauthorized roles", async () => {
    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${getToken("STORE_MANAGER")}`);

    expect(res.status).toBe(403);
  });

  test("GET /users allows permission slug users:manage", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "1",
        username: "permitted",
        full_name: "Permitted User",
        email: null,
        is_active: true,
        created_at: new Date().toISOString(),
        role_id: "role-1",
        role_name: "UNKNOWN",
      }],
      rowCount: 1,
    });

    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${getToken("STORE_MANAGER", { permission_slugs: ["users:manage"] })}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  test("GET /settings allows permission slug settings:write", async () => {
    const res = await request(app)
      .get("/settings")
      .set("Authorization", `Bearer ${getToken("STORE_MANAGER", { permission_slugs: ["settings:write"] })}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("employee_id_prefix");
  });

  test("GET /settings blocks missing permission slugs", async () => {
    const res = await request(app)
      .get("/settings")
      .set("Authorization", `Bearer ${getToken("STORE_MANAGER")}`);

    expect(res.status).toBe(403);
  });

  test("POST /users creates new user", async () => {
    mockQuery.mockResolvedValueOnce({ 
      rows: [{ id: "2", username: "newuser", full_name: "New Test" }],
      rowCount: 1
    });

    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        username: "newuser",
        rawPassword: "password",
        fullName: "New Test",
        roleId: "role-1"
      });

    expect(res.status).toBe(201);
    expect(res.body.username).toBe("newuser");
  });

  test("PUT /users/:id updates user", async () => {
    mockQuery.mockResolvedValueOnce({ 
      rows: [{ id: "1", username: "test", full_name: "Updated" }],
      rowCount: 1
    });

    const res = await request(app)
      .put("/users/1")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        fullName: "Updated",
        roleId: "role-1",
        isActive: true
      });

    expect(res.status).toBe(200);
    expect(res.body.full_name).toBe("Updated");
  });

  test("DELETE /users/:id deletes user", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .delete("/users/2")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(204);
  });
});