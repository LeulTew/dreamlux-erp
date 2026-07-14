import "./setup";
import { describe, test, expect, mock, beforeAll, beforeEach } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

const mockQuery = mock((..._args: any[]) => Promise.resolve({ rows: [] as any[], rowCount: 0 }));
const mockRelease = mock(() => {});
const mockConnect = mock(() => Promise.resolve({ query: mockQuery, release: mockRelease }));

mock.module("../db/pool", () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

let app: import("express").Application;
beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

const JWT_SECRET = "test-secret";
function getToken(role = "INVENTORY_OFFICER"): string {
  return jwt.sign({ id: "user-1", role, username: "storekeeper" }, JWT_SECRET, { expiresIn: "1h" });
}

const EVENT_ID = "7c3f9b65-1111-4ee7-8b62-41d6e5f11101";
const ALLOCATION_ID = "7c3f9b65-2222-4ee7-8b62-41d6e5f11102";

// A departed allocation of 10 pcs with 2 already returned good.
const DEPARTED_ALLOCATION = {
  id: ALLOCATION_ID,
  event_id: EVENT_ID,
  item_id: "7c3f9b65-3333-4ee7-8b62-41d6e5f11103",
  quantity_allocated: 10,
  status: "Pulled",
  departed_at: "2026-07-01T10:00:00Z",
  returned_good_quantity: 2,
  returned_damaged_quantity: 0,
  returned_lost_quantity: 0,
  returned_repair_quantity: 0,
};

const LINKED_ITEM = { id: DEPARTED_ALLOCATION.item_id, name: "Gold Charger Plates", quantity: 120 };

function mockReturnQueries(options: {
  allocation?: Record<string, unknown> | null;
  item?: Record<string, unknown> | null;
  onSql?: (sql: string) => any;
}) {
  mockQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    const custom = options.onSql?.(text);
    if (custom) return custom;
    if (text.includes("FROM event_allocations ea") && text.includes("FOR UPDATE OF ea")) {
      const allocation = options.allocation === undefined ? DEPARTED_ALLOCATION : options.allocation;
      return Promise.resolve({ rows: allocation ? [allocation] : [], rowCount: allocation ? 1 : 0 });
    }
    if (text.includes("FROM items WHERE id =") && text.includes("FOR UPDATE")) {
      const item = options.item === undefined ? LINKED_ITEM : options.item;
      return Promise.resolve({ rows: item ? [item] : [], rowCount: item ? 1 : 0 });
    }
    if (text.includes("INSERT INTO event_return_receipts")) {
      return Promise.resolve({ rows: [{ id: "receipt-1", allocation_id: ALLOCATION_ID }], rowCount: 1 });
    }
    if (text.includes("UPDATE event_allocations")) {
      return Promise.resolve({ rows: [{ ...DEPARTED_ALLOCATION }], rowCount: 1 });
    }
    return Promise.resolve({ rows: [], rowCount: 1 });
  });
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockConnect.mockClear();
});

describe("Return queue and detail (issue #173)", () => {
  test("queue is forbidden without allocation/asset write privileges", async () => {
    const res = await request(app).get("/events/returns/queue").set("Authorization", `Bearer ${getToken("VIEWER")}`);
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("queue returns paginated event groups with outstanding totals", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({
      rows: [{
        event_id: EVENT_ID,
        event_name: "Hana & Daniel Wedding",
        open_allocation_count: 2,
        dispatched_quantity: 30,
        accounted_quantity: 10,
        outstanding_quantity: 20,
      }],
      rowCount: 1,
    });

    const res = await request(app).get("/events/returns/queue").set("Authorization", `Bearer ${getToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.queue[0].outstanding_quantity).toBe(20);
  });

  test("event return detail 404s for unknown events", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get(`/events/${EVENT_ID}/returns`).set("Authorization", `Bearer ${getToken()}`);
    expect(res.status).toBe(404);
  });
});

describe("Recording return receipts (issue #173)", () => {
  test("validation rejects all-zero, negative, and fractional quantities", async () => {
    const zero = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: 0 });
    expect(zero.status).toBe(400);

    const negative = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: -1, damaged_quantity: 2 });
    expect(negative.status).toBe(400);

    const fractional = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: 1.5 });
    expect(fractional.status).toBe(400);
  });

  test("unauthorized roles cannot record returns", async () => {
    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken("DRIVER")}`)
      .send({ good_quantity: 1 });
    expect(res.status).toBe(403);
  });

  test("allocation must belong to the event (BOLA scope)", async () => {
    mockReturnQueries({ allocation: null });
    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: 1 });
    expect(res.status).toBe(404);
  });

  test("reserved / not-departed allocations cannot be returned", async () => {
    mockReturnQueries({ allocation: { ...DEPARTED_ALLOCATION, departed_at: null, status: "Reserved" } });
    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("departed");
  });

  test("fully returned allocations conflict", async () => {
    mockReturnQueries({ allocation: { ...DEPARTED_ALLOCATION, status: "Returned" } });
    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already been fully returned");
  });

  test("over-return beyond outstanding is rejected before any write", async () => {
    const executed: string[] = [];
    mockReturnQueries({ onSql: (sql) => { executed.push(sql); return undefined; } });
    // outstanding = 10 - 2 = 8; submit 9
    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: 9 });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("outstanding");
    expect(executed.some((sql) => sql.includes("INSERT INTO event_return_receipts"))).toBe(false);
    expect(executed.some((sql) => sql.includes("ROLLBACK"))).toBe(true);
  });

  test("good-only receipt restores availability without touching items.quantity", async () => {
    const executed: string[] = [];
    mockReturnQueries({ onSql: (sql) => { executed.push(sql); return undefined; } });

    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: 3, notes: "first batch back" });

    expect(res.status).toBe(201);
    expect(res.body.outstanding_quantity).toBe(5); // 8 outstanding - 3
    expect(res.body.fully_returned).toBe(false);
    expect(executed.some((sql) => sql.includes("INSERT INTO event_return_receipts"))).toBe(true);
    expect(executed.some((sql) => sql.includes("UPDATE items"))).toBe(false);
    expect(executed.some((sql) => sql.includes("INSERT INTO inventory_movements"))).toBe(false);
    expect(executed.some((sql) => sql.includes("inventory_return"))).toBe(true); // event audit
    expect(executed.some((sql) => sql.includes("COMMIT"))).toBe(true);
  });

  test("damaged/lost/repair quantities create a negative ledger movement and reduce stock", async () => {
    const executed: string[] = [];
    mockReturnQueries({ onSql: (sql) => { executed.push(sql); return undefined; } });

    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: 4, damaged_quantity: 2, lost_quantity: 1, repair_quantity: 1 });

    expect(res.status).toBe(201);
    expect(res.body.fully_returned).toBe(true); // 8 outstanding fully accounted
    expect(executed.some((sql) => sql.includes("INSERT INTO inventory_movements"))).toBe(true);
    expect(executed.some((sql) => sql.includes("UPDATE items SET quantity"))).toBe(true);
  });

  test("non-good return that would drive stock negative is rejected", async () => {
    mockReturnQueries({ item: { ...LINKED_ITEM, quantity: 1 } });
    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ damaged_quantity: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("negative");
  });

  test("duplicate idempotency key maps to an explicit conflict", async () => {
    mockReturnQueries({
      onSql: (sql) => {
        if (sql.includes("INSERT INTO event_return_receipts")) {
          const err = Object.assign(new Error("duplicate key"), {
            code: "23505",
            constraint: "uq_event_return_receipts_idem",
          });
          return Promise.reject(err);
        }
        return undefined;
      },
    });

    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: 1, idempotency_key: "retry-1" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already recorded");
  });

  test("database over-return constraint (23514) maps to an explicit conflict", async () => {
    mockReturnQueries({
      onSql: (sql) => {
        if (sql.includes("UPDATE event_allocations")) {
          const err = Object.assign(new Error("check violation"), {
            code: "23514",
            constraint: "chk_event_allocations_return_totals",
          });
          return Promise.reject(err);
        }
        return undefined;
      },
    });

    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: 8 });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("exceeds the dispatched quantity");
  });
});
