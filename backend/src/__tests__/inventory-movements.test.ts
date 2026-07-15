import "./setup";
import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockQuery = mock((..._args: unknown[]) => Promise.resolve({ rows: [] as Record<string, unknown>[], rowCount: 0 }));

mock.module("../db/pool", () => ({
  pool: {
    query: mockQuery,
    connect: mock(() => Promise.resolve({ query: mockQuery, release: mock(() => {}) })),
  },
}));

let app: import("express").Application;

beforeAll(async () => {
  app = (await import("../index")).default;
});

beforeEach(() => mockQuery.mockReset());

function token(role: string, permissions?: Record<string, string[]>): string {
  return jwt.sign({ id: "user-1", role, username: "reviewer", permissions }, "test-secret", { expiresIn: "1h" });
}

describe("GET /assets/movements", () => {
  test("returns a bounded, attributable movement page filtered by source", async () => {
    const sourceId = "7c3f9b65-3333-4ee7-8b62-41d6e5f11101";
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          id: "7c3f9b65-3333-4ee7-8b62-41d6e5f11200",
          item_id: "7c3f9b65-3333-4ee7-8b62-41d6e5f11199",
          item_name: "White Fabric",
          unit_of_measurement: "pcs",
          quantity_delta: 18,
          quantity_before: 24,
          quantity_after: 42,
          source_type: "capital_investment",
          source_id: sourceId,
          created_at: "2026-07-15T08:00:00Z",
          created_by_name: "Finance Owner",
        }],
        rowCount: 1,
      });

    const response = await request(app)
      .get(`/assets/movements?sourceId=${sourceId}&page=1&limit=25`)
      .set("Authorization", `Bearer ${token("OWNER")}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 1, page: 1, limit: 25, totalPages: 1 });
    expect(response.body.movements[0]).toMatchObject({ item_name: "White Fabric", quantity_after: 42 });
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([sourceId]);
    expect(mockQuery.mock.calls[1]?.[1]).toEqual([sourceId, 25, 0]);
  });

  test("rejects invalid filters before querying", async () => {
    const response = await request(app)
      .get("/assets/movements?sourceId=not-a-uuid")
      .set("Authorization", `Bearer ${token("OWNER")}`);

    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("requires inventory read permission", async () => {
    const response = await request(app)
      .get("/assets/movements")
      .set("Authorization", `Bearer ${token("SYSTEM_MANAGER", { settings: ["write"] })}`);

    expect(response.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("inventory movement migration hardening", () => {
  const sql = readFileSync(join(__dirname, "../db/migrations/inventory_movements.sql"), "utf8");

  test("locks direct Data API access and enforces append-only history", () => {
    expect(sql).toContain("ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL PRIVILEGES ON TABLE public.inventory_movements");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.inventory_movements");
    expect(sql).toContain("inventory_movements is append-only");
  });
});
