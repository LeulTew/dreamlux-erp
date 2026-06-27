import "./setup";
import { describe, test, expect, beforeAll } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

let app: import("express").Application;
const JWT_SECRET = "test-secret";

beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

function getCustomToken(permissions: string[]): string {
  return jwt.sign(
    {
      id: "test-user-id",
      username: "test-user",
      role: "driver",
      permission_slugs: permissions
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

describe("Backend RBAC and Guardrails Regression Tests", () => {


  test("GET /settings without settings:write permission returns HTTP 403", async () => {
    const token = getCustomToken(["events:read"]);
    const res = await request(app)
      .get("/settings")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  test("GET /settings with settings:write permission returns HTTP 200", async () => {
    const token = getCustomToken(["settings:write", "users:manage"]);
    const res = await request(app)
      .get("/settings")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  test("GET /auth/permissions with no token returns HTTP 401", async () => {
    const res = await request(app).get("/auth/permissions");
    expect(res.status).toBe(401);
  });
});
