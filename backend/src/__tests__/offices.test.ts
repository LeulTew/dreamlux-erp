import "./setup";
import { describe, test, expect, mock, beforeEach, beforeAll } from "bun:test";
import request from "supertest";
import { getToken } from "./setup_helpers";

const mockQuery = mock(() => Promise.resolve({ rows: [] as any[] }));

const fakeChain = (initialSingle = false): any => {
  let isSingle = initialSingle;
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    is: () => chain,
    not: () => chain,
    or: () => chain,
    order: () => chain,
    range: () => chain,
    update: () => chain,
    insert: () => chain,
    delete: () => chain,
    in: () => chain,
    limit: () => chain,
    match: () => chain,
    ilike: () => chain,
    maybeSingle: () => {
      isSingle = true;
      return chain;
    },
    single: () => {
      isSingle = true;
      return chain;
    },
    then: async (resolve: (value: unknown) => void) => {
      try {
        const res = await mockQuery();
        const rows = res?.rows || [];
        resolve({ data: isSingle ? (rows[0] || null) : rows, error: null, count: rows.length });
      } catch (err) {
        resolve({ data: null, error: err, count: 0 });
      }
    },
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

describe("Offices API", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test("GET /offices/all returns all stores/offices", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: "store-1", name: "Bole Central Office", is_active: true },
        { id: "store-2", name: "Hawassa Warehouse", is_active: false },
      ],
    });

    const res = await request(app)
      .get("/offices/all")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[1].is_active).toBe(false);
  });

  test("POST /offices creates a store office location", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "store-3", name: "Mekelle Branch", is_active: true }],
    });

    const res = await request(app)
      .post("/offices")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ name: "Mekelle Branch", is_active: true });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Mekelle Branch");
  });

  test("DELETE /offices/:id checks employee and inventory assets reference dual impact", async () => {
    // Test Case 1: active employee block
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "emp-1", full_name: "Daniel" }],
    });

    const res1 = await request(app)
      .delete("/offices/store-1")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res1.status).toBe(400);
    expect(res1.body.error).toContain("associated with active employee");

    // Test Case 2: active inventory block
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [] }); // No employees
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "item-1", name: "Peach Runner" }],
    }); // Associated inventory items

    const res2 = await request(app)
      .delete("/offices/store-1")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res2.status).toBe(400);
    expect(res2.body.error).toContain("associated with inventory item");
  });
});
