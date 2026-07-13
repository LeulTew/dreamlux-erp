import "./setup";
import { describe, test, expect, mock, beforeEach, beforeAll } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

type MockResult = { rows: any[]; count?: number; error?: { code?: string; message?: string } };
const mockQuery = mock((): Promise<MockResult> => Promise.resolve({ rows: [] as any[] }));

const fakeChain = (): any => {
  let isSingle = false;
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
    maybeSingle: () => { isSingle = true; return chain; },
    single: () => { isSingle = true; return chain; },
    then: async (resolve: (value: unknown) => void) => {
      try {
        const res = await mockQuery();
        const rows = res?.rows || [];
        const count = (res as any)?.count ?? rows.length;
        const error = (res as any)?.error ?? null;
        resolve({ data: isSingle ? (rows[0] || null) : rows, error, count });
      } catch (err) {
        resolve({ data: null, error: err, count: 0 });
      }
    },
  };
  return chain;
};

mock.module("../db/supabase", () => ({ supabase: { from: () => fakeChain() } }));

const JWT_SECRET = process.env.JWT_SECRET || "dreamlux-jwt-secret-key-2026";
function token(role = "SUPER_ADMIN"): string {
  return jwt.sign({ id: "u1", role, username: "t" }, JWT_SECRET, { expiresIn: "1h" });
}

let app: import("express").Application;
beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

describe("Vehicles / Fleet API (issue #147)", () => {
  beforeEach(() => mockQuery.mockReset());

  // --- Permissions ---
  test("GET /vehicles allows a vehicles:read role (EVENT_MANAGER)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "v1", plate_number: "AA-1", vehicle_type: "Van", fuel_type: "Diesel", fuel_consumption_rate: 0.2 }] });
    const res = await request(app).get("/vehicles").set("Authorization", `Bearer ${token("EVENT_MANAGER")}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.vehicles)).toBe(true);
    expect(res.body.total).toBe(1);
  });

  test("GET /vehicles with punctuation in search does not error (sanitized filter)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get("/vehicles")
      .query({ search: "AA,3(x)%_*" })
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.vehicles).toEqual([]);
  });

  test("GET /vehicles is forbidden for a role without vehicles perms (DRIVER)", async () => {
    const res = await request(app).get("/vehicles").set("Authorization", `Bearer ${token("DRIVER")}`);
    expect(res.status).toBe(403);
  });

  test("POST /vehicles is forbidden for read-only role (EVENT_MANAGER)", async () => {
    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token("EVENT_MANAGER")}`)
      .send({ plate_number: "AA-9", vehicle_type: "Van", fuel_type: "Diesel", fuel_consumption_rate: 0.3 });
    expect(res.status).toBe(403);
  });

  test("POST /vehicles is allowed for OPS_MANAGER", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "v2", plate_number: "AA-2", vehicle_type: "Truck", fuel_type: "Diesel", fuel_consumption_rate: 0.25 }] });
    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token("OPS_MANAGER")}`)
      .send({ plate_number: "aa-2", vehicle_type: "Truck", fuel_type: "Diesel", fuel_consumption_rate: 0.25 });
    expect(res.status).toBe(201);
  });

  // --- Validation ---
  test("POST /vehicles rejects fuel rate above 5 L/km", async () => {
    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token()}`)
      .send({ plate_number: "AA-3", vehicle_type: "Van", fuel_type: "Diesel", fuel_consumption_rate: 6 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5 L\/km/);
  });

  test("POST /vehicles rejects zero/negative fuel rate", async () => {
    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token()}`)
      .send({ plate_number: "AA-4", vehicle_type: "Van", fuel_type: "Diesel", fuel_consumption_rate: 0 });
    expect(res.status).toBe(400);
  });

  test("POST /vehicles maps a unique-violation to 409", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], error: { code: "23505", message: "duplicate key" } });
    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token()}`)
      .send({ plate_number: "AA-2", vehicle_type: "Van", fuel_type: "Diesel", fuel_consumption_rate: 0.2 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/plate number/i);
  });

  // --- Retirement (archive/restore) ---
  test("PATCH /vehicles/:id/archive retires a vehicle", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "v1", plate_number: "AA-1", deleted_at: "2026-01-01", is_active: false }] });
    const res = await request(app).patch("/vehicles/v1/archive").set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.vehicle.is_active).toBe(false);
  });

  test("PATCH /vehicles/:id/restore restores a retired vehicle", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "v1", plate_number: "AA-1", deleted_at: null, is_active: true }] });
    const res = await request(app).patch("/vehicles/v1/restore").set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.vehicle.deleted_at).toBeNull();
  });

  // --- Historical integrity on delete ---
  test("DELETE /vehicles/:id is blocked when assignment history exists", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], count: 2 }); // 2 assignment rows
    const res = await request(app).delete("/vehicles/v1").set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/historical reporting|Archive it instead/i);
  });

  test("DELETE /vehicles/:id succeeds when no assignment history", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], count: 0 }); // no assignments
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "v1", plate_number: "AA-1" }] }); // deleted row
    const res = await request(app).delete("/vehicles/v1").set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.vehicle.id).toBe("v1");
  });

  test("DELETE /vehicles/:id is forbidden without vehicles:delete (OPS has it, EVENT_MANAGER does not)", async () => {
    const res = await request(app).delete("/vehicles/v1").set("Authorization", `Bearer ${token("EVENT_MANAGER")}`);
    expect(res.status).toBe(403);
  });
});
