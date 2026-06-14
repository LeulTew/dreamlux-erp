import { describe, test, expect, mock, beforeAll, beforeEach } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

const JWT_SECRET = "test-secret";
const STORE_UUID = "550e8400-e29b-41d4-a716-446655440099";

// Mock Supabase
const mockUpdate = mock(() => ({
  eq: () => ({
    select: () => ({
      single: () => Promise.resolve({
        data: { id: "item-1", store_id: "store-1", quantity: 10 },
        error: null,
      }),
    }),
  }),
}));

const mockSnapshot = mock(() => ({
  in: () =>
    Promise.resolve({
      data: [
        { id: "550e8400-e29b-41d4-a716-446655440000", quantity: 8, store_id: "store-1" },
        { id: "550e8400-e29b-41d4-a716-446655440001", quantity: 4, store_id: "store-1" },
      ],
      error: null,
    }),
  eq: (id: string) => ({
    single: () =>
      Promise.resolve({
        data: { id, deleted_at: null, quantity: 10 },
        error: null,
      }),
  }),
}));

const mockRunInsert = mock(() => ({
  select: () => ({
    single: () => Promise.resolve({ data: { id: "run-1" }, error: null }),
  }),
}));

const mockRunItemsInsert = mock(() => Promise.resolve({ data: null, error: null }));

mock.module("../db/supabase", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "items") {
        return {
          select: mockSnapshot,
          update: mockUpdate,
        };
      }

      if (table === "inventory_reconciliation_runs") {
        return {
          insert: mockRunInsert,
        };
      }

      if (table === "inventory_reconciliation_items") {
        return {
          insert: mockRunItemsInsert,
        };
      }

      return {
        select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
        update: mockUpdate,
        insert: mockRunItemsInsert,
      };
    },
    auth: {
      getUser: () => Promise.resolve({
        data: { user: { id: "user-123", role: "admin" } },
        error: null,
      }),
    },
  },
}));



let app: any;

beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

describe("Reconciliation API", () => {
  beforeEach(() => {
    mockUpdate.mockClear();
    mockSnapshot.mockClear();
    mockRunInsert.mockClear();
    mockRunItemsInsert.mockClear();
  });

  test("POST /assets/reconcile should update multiple items and log audit fields", async () => {
    const token = jwt.sign({ id: "user-123", role: "admin", username: "testuser", permissions: { assets: ["reconcile"] } }, JWT_SECRET);
    const mockItems = [
      { id: "550e8400-e29b-41d4-a716-446655440000", quantity: 10 },
      { id: "550e8400-e29b-41d4-a716-446655440001", quantity: 5 },
    ];

    const response = await request(app)
      .post("/assets/reconcile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        store_id: STORE_UUID,
        notes: "Monthly warehouse count",
        items: mockItems,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.count).toBe(2);
    expect(response.body.run_id).toBe("run-1");
    expect(response.body.summary.changed_rows).toBe(2);
    expect(response.body.summary.zero_delta_rows).toBe(0);
    expect(response.body.summary.total_delta).toBe(3);
    expect(response.body.summary.notes).toBe("Monthly warehouse count");
    expect(response.body.summary.store_id).toBe(STORE_UUID);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    
    // Check if last_counted_at and last_counted_by were passed
    const calls = mockUpdate.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const firstCallArgs = (calls[0] as any[])[0];
    expect(firstCallArgs).toHaveProperty("last_counted_at");
    expect(firstCallArgs.last_counted_by).toBe("user-123");

    expect(mockRunInsert).toHaveBeenCalledTimes(1);
    const runInsertPayload = (mockRunInsert.mock.calls[0] as any[])[0];
    expect(runInsertPayload.store_id).toBe(STORE_UUID);
    expect(runInsertPayload.notes).toBe("Monthly warehouse count");

    expect(mockRunItemsInsert).toHaveBeenCalledTimes(1);
    const auditRows = (mockRunItemsInsert.mock.calls[0] as any[])[0] as any[];
    expect(auditRows).toHaveLength(2);
    expect(auditRows[0].delta).toBe(2);
    expect(auditRows[1].delta).toBe(1);
  });

  test("POST /assets/reconcile should audit only successfully updated rows", async () => {
    mockUpdate
      .mockImplementationOnce(() => ({
        eq: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "550e8400-e29b-41d4-a716-446655440000", store_id: "store-1", quantity: 10 },
                error: null,
              } as any),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        eq: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: new Error("write failed"),
              } as any),
          }),
        }),
      }));

    const token = jwt.sign({ id: "user-123", role: "admin", username: "testuser", permissions: { assets: ["reconcile"] } }, JWT_SECRET);
    const mockItems = [
      { id: "550e8400-e29b-41d4-a716-446655440000", quantity: 10 },
      { id: "550e8400-e29b-41d4-a716-446655440001", quantity: 5 },
    ];

    const response = await request(app)
      .post("/assets/reconcile")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: mockItems });

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.summary.changed_rows).toBe(1);
    expect(response.body.summary.zero_delta_rows).toBe(0);
    expect(response.body.summary.total_delta).toBe(2);

    expect(mockRunItemsInsert).toHaveBeenCalledTimes(1);
    const auditRows = (mockRunItemsInsert.mock.calls[0] as any[])[0] as any[];
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].item_id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  test("POST /assets/reconcile should fail for non-authorized roles", async () => {
    // Role 'employee' is not in ['admin', 'inventory_controller']
    const token = jwt.sign({ id: "user-456", role: "employee", username: "badactor" }, JWT_SECRET);
    const mockItems = [
      { id: "550e8400-e29b-41d4-a716-446655440000", quantity: 9999 },
    ];

    const response = await request(app)
      .post("/assets/reconcile")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: mockItems });

    expect(response.status).toBe(403);
    const bodyAsJson = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    expect(bodyAsJson.error).toBeDefined();
  });

  test("POST /assets/reconcile should fail with invalid payload", async () => {
    const token = jwt.sign({ id: "user-123", role: "admin", username: "testuser", permissions: { assets: ["reconcile"] } }, JWT_SECRET);
    const response = await request(app)
      .post("/assets/reconcile")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ id: "550e8400-e29b-41d4-a716-446655440000" }] }); // Missing quantity

    expect(response.status).toBe(400);
  });
});
