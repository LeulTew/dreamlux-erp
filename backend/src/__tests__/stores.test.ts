import { describe, test, expect, beforeEach, beforeAll, mock } from "bun:test";
import "./setup";
import { getToken } from "./setup_helpers";
import request from "supertest";

const mockQuery = mock(() => Promise.resolve({ rows: [] as any[] }));

export const fakeChain = (isSingle = false): any => {
  const chain: any = {
    select: () => fakeChain(isSingle),
    eq: () => fakeChain(isSingle),
    neq: () => fakeChain(isSingle),
    is: () => fakeChain(isSingle),
    not: () => fakeChain(isSingle),
    or: () => fakeChain(isSingle),
    order: () => fakeChain(isSingle),
    range: () => fakeChain(isSingle),
    update: () => fakeChain(isSingle),
    insert: () => fakeChain(isSingle),
    delete: () => fakeChain(isSingle),
    in: () => fakeChain(isSingle),
    limit: () => fakeChain(isSingle),
    match: () => fakeChain(isSingle),
    ilike: () => fakeChain(isSingle),
    single: () => fakeChain(true),
    then: async (resolve: any) => {
      try {
        const res = await mockQuery();
        if (!res) return resolve({ data: null, error: null, count: 0 });
        
        let countValue = 0;
        if (res?.rows?.[0]?.count !== undefined) {
          countValue = parseInt(res.rows[0].count as string);
        } else {
          countValue = res?.rows?.length || 0;
        }

        const rows = res?.rows || [];
        resolve({
          data: isSingle ? (rows[0] || null) : rows,
          error: null,
          count: countValue,
        });
      } catch (err) {
        resolve({ data: null, error: err, count: 0 });
      }
    }
  };
  return chain;
};

mock.module("../db/supabase", () => ({
  supabase: {
    from: () => fakeChain(),
  },
}));

let app: import("express").Application;

beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

describe("Offices — GET /offices", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test("returns list of active offices", async () => {
    // Current route filters offices that have at least one item or employee associated
    mockQuery
      .mockResolvedValueOnce({
        // First query: List of stores
        rows: [
          { id: "o1", name: "Office A", is_active: true },
          { id: "o2", name: "Office B", is_active: true },
        ],
      })
      .mockResolvedValueOnce({
        // Second query: List of items (to check associations)
        rows: [{ store_id: "o1" }],
      })
      .mockResolvedValueOnce({
        // Third query: List of employees (to check associations)
        rows: [{ office_id: "o2" }],
      });

    const res = await request(app)
      .get("/offices")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty("id", "o1");
    expect(res.body[1]).toHaveProperty("id", "o2");
  });

  test("returns empty array when no offices exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/offices")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test("handles DB error gracefully", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB connection failed"));

    const res = await request(app)
      .get("/offices")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("error", "Failed to fetch offices");
  });

  test("requires authentication", async () => {
    const res = await request(app).get("/offices");

    expect(res.status).toBe(401);
  });
});
