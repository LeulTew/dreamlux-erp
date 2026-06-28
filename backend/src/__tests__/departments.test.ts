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

// Mock permissions cache
mock.module("../lib/permissions-cache", () => ({
  getCachedUserPermissions: () => ({
    roleNames: ["HR_MANAGER"],
    permissionSlugs: ["departments:manage", "hr:read", "departments:read"],
  }),
  setCachedUserPermissions: () => {},
  invalidateUserPermissionsCache: () => {},
  invalidateAllPermissionsCache: () => {},
}));

let app: import("express").Application;

beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

describe("Departments API", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test("GET /departments lists all departments", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: "dept-1", name: "Logistics" },
        { id: "dept-2", name: "Sales" },
      ],
    });

    const res = await request(app)
      .get("/departments")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe("Logistics");
  });

  test("POST /departments creates a department", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "dept-3", name: "Catering" }],
    });

    const res = await request(app)
      .post("/departments")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ name: " Catering " });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Catering");
  });

  test("POST /departments rejects duplicate names", async () => {
    const error: any = new Error("Duplicate");
    error.code = "23505";
    mockQuery.mockRejectedValueOnce(error);

    const res = await request(app)
      .post("/departments")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ name: "Logistics" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already exists");
  });

  test("DELETE /departments/:id prevents delete if active employees exist", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "emp-1", full_name: "Daniel Kebede" }],
    }); // Employee reference check query

    const res = await request(app)
      .delete("/departments/dept-1")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("associated with active employee");
  });

  test("DELETE /departments/:id deletes department if no active employees exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // Employee reference check: none
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "dept-1", name: "Logistics" }] }); // Deletion query

    const res = await request(app)
      .delete("/departments/dept-1")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("deleted successfully");
  });
});
