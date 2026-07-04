import "./setup";
import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

const mockQuery = mock<(...args: any[]) => Promise<any>>(() => Promise.resolve({ rows: [], rowCount: 0 }));

mock.module("../db/pool", () => ({
  pool: {
    query: mockQuery,
    connect: mock(() => Promise.resolve({ query: mockQuery, release: mock(() => {}) })),
  },
}));

let app: import("express").Application;

beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

function queryCall(index: number): [string, any[]] {
  return mockQuery.mock.calls[index] as unknown as [string, any[]];
}

function token(userId = "550e8400-e29b-41d4-a716-446655440000", permission_slugs: string[] = ["events:read"]) {
  return jwt.sign(
    {
      id: userId,
      username: `user-${userId.slice(0, 4)}`,
      role: "staff",
      permission_slugs,
      is_active: true,
    },
    "test-secret",
    { expiresIn: "1h" },
  );
}

describe("record list preferences", () => {
  test("GET is scoped to the authenticated user and record type", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "pref-1",
        record_type: "events",
        sort: { sortBy: "recent", sortOrder: "desc" },
        filters: { status: "Ongoing" },
        page_size: 50,
        visible_columns: ["name", "status"],
        density: "compact",
        active_tab: "active",
        updated_at: "2026-07-04T00:00:00Z",
      }],
      rowCount: 1,
    });

    const res = await request(app)
      .get("/api/preferences/record-list/events")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.preference.sort.sortBy).toBe("recent");
    expect(res.body.preference.pageSize).toBe(50);
    const [sql, params] = queryCall(0);
    expect(sql).toContain("WHERE user_id = $1 AND record_type = $2");
    expect(params).toEqual(["550e8400-e29b-41d4-a716-446655440000", "events"]);
  });

  test("PUT upserts only for the authenticated user without accepting user_id from the body", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "pref-1",
        record_type: "payroll",
        sort: { sortBy: "recent", sortOrder: "desc" },
        filters: {},
        page_size: 20,
        visible_columns: ["period_start"],
        density: "comfortable",
        active_tab: "history",
        updated_at: "2026-07-04T00:00:00Z",
      }],
      rowCount: 1,
    });

    const res = await request(app)
      .put("/api/preferences/record-list/payroll")
      .set("Authorization", `Bearer ${token("11111111-1111-4111-8111-111111111111", ["payroll:read"])}`)
      .send({
        user_id: "attacker",
        sort: { sortBy: "recent", sortOrder: "desc" },
        filters: {},
        pageSize: 20,
        visibleColumns: ["period_start"],
        density: "comfortable",
        activeTab: "history",
      });

    expect(res.status).toBe(400);

    const accepted = await request(app)
      .put("/api/preferences/record-list/payroll")
      .set("Authorization", `Bearer ${token("11111111-1111-4111-8111-111111111111", ["payroll:read"])}`)
      .send({
        sort: { sortBy: "recent", sortOrder: "desc" },
        filters: {},
        pageSize: 20,
        visibleColumns: ["period_start"],
        density: "comfortable",
        activeTab: "history",
      });

    expect(accepted.status).toBe(200);
    const [sql, params] = queryCall(0);
    expect(params[0]).toBe("11111111-1111-4111-8111-111111111111");
    expect(params[1]).toBe("payroll");
    expect(sql).toContain("ON CONFLICT (user_id, record_type)");
  });

  test("rejects invalid record type and unbounded page size", async () => {
    const badType = await request(app)
      .get("/api/preferences/record-list/../../users")
      .set("Authorization", `Bearer ${token()}`);
    expect([400, 404]).toContain(badType.status);

    const badPageSize = await request(app)
      .put("/api/preferences/record-list/events")
      .set("Authorization", `Bearer ${token()}`)
      .send({ pageSize: 1000, filters: {} });
    expect(badPageSize.status).toBe(400);
  });
});
