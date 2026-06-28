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

describe("Positions API", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test("GET /positions lists all positions", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: "pos-1", name: "Planner" },
        { id: "pos-2", name: "Driver" },
      ],
    });

    const res = await request(app)
      .get("/positions")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe("Planner");
  });

  test("POST /positions creates a position", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "pos-3", name: "Accountant" }],
    });

    const res = await request(app)
      .post("/positions")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ name: " Accountant " });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Accountant");
  });

  test("DELETE /positions/:id blocks delete when active employees exist", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "emp-1", full_name: "Daniel" }],
    });

    const res = await request(app)
      .delete("/positions/pos-1")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("associated with active employee");
  });
});
