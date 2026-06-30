import { describe, test, expect, mock } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../index";
import "./setup"; // Imports setup mocks for Supabase/pg

const testUserId = "550e8400-e29b-41d4-a716-446655440000";

const superAdminToken = getTestToken(testUserId, "super_admin", ["*"]);
const staffToken = getTestToken(testUserId, "crew", ["events:read"]); // Cannot read payroll/bank details
const assetOnlyToken = getTestToken(testUserId, "inventory_officer", ["assets:read"]);

const mockLogs = [
  {
    id: "1",
    entity_type: "proposal",
    entity_id: "100e8400-e29b-41d4-a716-446655440000",
    user_id: testUserId,
    username: "admin_user",
    full_name: "Admin User",
    action: "update",
    field_changed: "estimated_design_cost",
    old_value: "1000",
    new_value: "1500",
    note: "Updated design costs",
    created_at: new Date(Date.now() - 60000).toISOString(),
    source_route: "activity_logs",
  },
  {
    id: "2",
    entity_type: "proposal",
    entity_id: "100e8400-e29b-41d4-a716-446655440000",
    user_id: testUserId,
    username: null,
    full_name: null,
    action: "update",
    field_changed: "client_name",
    old_value: "Old Client",
    new_value: "New Client",
    note: "Client changed",
    created_at: new Date().toISOString(),
    source_route: "event_proposal_logs",
  }
];

// Mock pg pool query
mock.module("../db/pool", () => ({
  pool: {
    query: mock((sql: string, _params?: any[]) => {
      const queryLower = sql.toLowerCase();
      
      // Resolve mock logs list
      if (queryLower.includes("public.activity_logs") || queryLower.includes("event_proposal_logs")) {
        return Promise.resolve({ rows: mockLogs });
      }

      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
    connect: mock(() => Promise.resolve({
      query: mock(() => Promise.resolve({ rows: [] })),
      release: mock(() => {}),
    })),
  }
}));

// Helper to generate auth tokens
function getTestToken(userId: string, role = "admin", permissions = ["*"]): string {
  const secret = process.env.JWT_SECRET || "test-secret";
  return jwt.sign(
    {
      id: userId,
      username: "testuser",
      role_name: role,
      permission_slugs: permissions,
      is_active: true,
    },
    secret,
    { expiresIn: "1h" }
  );
}

describe("Activity API & Redaction logs triggers", () => {
  test("GET /api/activity requires authentication", async () => {
    const res = await request(app).get("/api/activity");
    expect(res.status).toBe(401);
  });

  test("GET /api/activity returns list of logs successfully", async () => {
    const res = await request(app)
      .get("/api/activity?entity_type=proposal&entity_id=100e8400-e29b-41d4-a716-446655440000")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("activity");
    expect(res.body.activity.length).toBe(2);
    // Value remains unredacted for superadmin
    expect(res.body.activity[0].old_value).toBe("1000");
    expect(res.body.activity[0].source_route).toBe("activity_logs");
    expect(res.body.activity[1].username).toBeNull();
    expect(res.body.activity[1].full_name).toBeNull();
  });

  test("GET /api/activity redacts sensitive budget/cost fields for standard users", async () => {
    const res = await request(app)
      .get("/api/activity?entity_type=proposal&entity_id=100e8400-e29b-41d4-a716-446655440000")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("activity");
    // Sensitive design cost field must be redacted for standard staff
    expect(res.body.activity[0].old_value).toBe("[REDACTED]");
    expect(res.body.activity[0].new_value).toBe("[REDACTED]");
    // Non-sensitive client name must NOT be redacted
    expect(res.body.activity[1].old_value).toBe("Old Client");
  });

  test("GET /api/activity blocks users without entity activity permission", async () => {
    const res = await request(app)
      .get("/api/activity?entity_type=proposal&entity_id=100e8400-e29b-41d4-a716-446655440000")
      .set("Authorization", `Bearer ${assetOnlyToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Missing required activity permission/i);
  });

  test("GET /api/activity bounds event/proposal feed queries", async () => {
    const res = await request(app)
      .get("/api/activity?entity_type=proposal&entity_id=100e8400-e29b-41d4-a716-446655440000")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    const { pool } = await import("../db/pool");
    const calls = (pool.query as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const lastSql = String(calls[calls.length - 1][0]);
    expect(lastSql.toLowerCase()).toContain("limit 100");
    expect(lastSql).toContain("source_route");
  });
});
