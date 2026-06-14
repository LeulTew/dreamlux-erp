import "./setup";
import { describe, test, expect, beforeEach, beforeAll, mock } from "bun:test";
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

describe("Salary Levels API", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test("GET /salary-levels/:id/delete-impact counts unique active employees", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "lvl-1", code: "L1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "emp-1" }, { id: "emp-2" }] })
      .mockResolvedValueOnce({ rows: [{ id: "emp-2" }, { id: "emp-3" }] });

    const res = await request(app)
      .get("/salary-levels/lvl-1/delete-impact")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.active_employee_count).toBe(3);
    expect(res.body.level_name).toBe("L1");
  });

  test("GET /salary-levels/:id/delete-impact tolerates missing legacy column", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "lvl-2", code: "L2" }] })
      .mockRejectedValueOnce({ code: "42703", message: "column \"salary_level\" does not exist" })
      .mockResolvedValueOnce({ rows: [{ id: "emp-4" }] });

    const res = await request(app)
      .get("/salary-levels/lvl-2/delete-impact")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.active_employee_count).toBe(1);
  });
});
