import "./setup";
import { describe, test, expect, mock, beforeAll, beforeEach } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";
import { buildReturnNotification } from "../services/event-returns-service";

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
  onSql?: (sql: string, params?: unknown[]) => any;
}) {
  mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
    const text = String(sql);
    const custom = options.onSql?.(text, params);
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
    const queueSql = String(mockQuery.mock.calls[1]?.[0] || "");
    expect(queueSql).not.toContain("e.status <>");
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

  test("a later receipt exactly closes an allocation with prior returns", async () => {
    mockReturnQueries({});
    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: 8, idempotency_key: "final-receipt" });
    expect(res.status).toBe(201);
    expect(res.body.outstanding_quantity).toBe(0);
    expect(res.body.fully_returned).toBe(true);
  });

  test("missing linked item rolls back without creating a receipt", async () => {
    const executed: string[] = [];
    mockReturnQueries({ item: null, onSql: (sql) => { executed.push(sql); return undefined; } });
    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: 1 });
    expect(res.status).toBe(409);
    expect(executed.some((sql) => sql.includes("INSERT INTO event_return_receipts"))).toBe(false);
    expect(executed.some((sql) => sql.includes("ROLLBACK"))).toBe(true);
  });

  test("loss reduces owned stock while damaged and repair remain owned but unavailable", async () => {
    const executed: string[] = [];
    let auditParams: unknown[] | undefined;
    mockReturnQueries({ onSql: (sql, params) => {
      executed.push(sql);
      if (sql.includes("INSERT INTO event_logs")) auditParams = params;
      return undefined;
    } });

    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: 4, damaged_quantity: 2, lost_quantity: 1, repair_quantity: 1 });

    expect(res.status).toBe(201);
    expect(res.body.fully_returned).toBe(true); // 8 outstanding fully accounted
    expect(executed.some((sql) => sql.includes("INSERT INTO inventory_movements"))).toBe(true);
    expect(executed.some((sql) => sql.includes("unavailable_damaged_quantity"))).toBe(true);
    expect(auditParams?.[0]).toBe(EVENT_ID);
    expect(auditParams?.[1]).toBe("user-1");
    expect(String(auditParams?.[3])).toContain("damaged 2, lost 1, repair 1");
    expect(buildReturnNotification(LINKED_ITEM.name, {
      good_quantity: 4, damaged_quantity: 2, lost_quantity: 1, repair_quantity: 1,
    }, 0)).toEqual({
      title: "Return recorded with damage/loss",
      message: "Gold Charger Plates: good 4, damaged 2, lost 1, repair 1. Outstanding 0.",
      priority: "high",
    });
  });

  test("condition balances cannot exceed total owned stock", async () => {
    mockReturnQueries({ item: { ...LINKED_ITEM, quantity: 1 } });
    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ damaged_quantity: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("owned quantity");
  });

  test("duplicate idempotency key maps to an explicit conflict", async () => {
    const executed: string[] = [];
    mockReturnQueries({
      onSql: (sql) => {
        executed.push(sql);
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
    expect(executed.some((sql) => sql.includes("ROLLBACK"))).toBe(true);
    expect(executed.some((sql) => sql.includes("COMMIT"))).toBe(false);
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

  test("event audit failure rolls back the receipt, allocation, and inventory transaction", async () => {
    const executed: string[] = [];
    mockReturnQueries({
      onSql: (sql) => {
        executed.push(sql);
        if (sql.includes("INSERT INTO event_logs")) return Promise.reject(new Error("audit unavailable"));
        return undefined;
      },
    });
    const res = await request(app)
      .post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_quantity: 1, idempotency_key: "audit-failure" });
    expect(res.status).toBe(500);
    expect(executed.some((sql) => sql.includes("ROLLBACK"))).toBe(true);
    expect(executed.some((sql) => sql.includes("COMMIT"))).toBe(false);
  });

  test("two concurrent finalizations serialize and cannot over-return", async () => {
    let lockOwnerSelected = false;
    let firstCommitted = false;
    let releaseLock!: () => void;
    const lockReleased = new Promise<void>((resolve) => { releaseLock = resolve; });
    let receiptCount = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes("FROM event_allocations ea") && text.includes("FOR UPDATE OF ea")) {
        if (!lockOwnerSelected) {
          lockOwnerSelected = true;
          return { rows: [DEPARTED_ALLOCATION], rowCount: 1 };
        }
        await lockReleased;
        return { rows: [{ ...DEPARTED_ALLOCATION, returned_good_quantity: 8 }], rowCount: 1 };
      }
      if (text.includes("FROM items WHERE id =") && text.includes("FOR UPDATE")) {
        return { rows: [LINKED_ITEM], rowCount: 1 };
      }
      if (text.includes("INSERT INTO event_return_receipts")) {
        receiptCount += 1;
        return { rows: [{ id: "receipt-concurrent", allocation_id: ALLOCATION_ID }], rowCount: 1 };
      }
      if (text.includes("UPDATE event_allocations")) {
        return { rows: [{ ...DEPARTED_ALLOCATION, returned_good_quantity: 8 }], rowCount: 1 };
      }
      if (text.includes("COMMIT")) {
        firstCommitted = true;
        releaseLock();
      }
      return { rows: [], rowCount: 1 };
    });

    const [first, second] = await Promise.all([
      request(app).post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
        .set("Authorization", `Bearer ${getToken()}`).send({ good_quantity: 6, idempotency_key: "concurrent-a" }),
      request(app).post(`/events/${EVENT_ID}/allocations/${ALLOCATION_ID}/returns`)
        .set("Authorization", `Bearer ${getToken()}`).send({ good_quantity: 6, idempotency_key: "concurrent-b" }),
    ]);
    expect(firstCommitted).toBe(true);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(receiptCount).toBe(1);
  });
});

describe("Resolving unavailable inventory conditions", () => {
  test("repair completion restores availability without changing owned quantity", async () => {
    const executed: Array<{ sql: string; params?: unknown[] }> = [];
    mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
      const text = String(sql);
      executed.push({ sql: text, params });
      if (text.includes("FROM items WHERE id") && text.includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [{ ...LINKED_ITEM, unavailable_damaged_quantity: 1, unavailable_repair_quantity: 4 }], rowCount: 1 });
      }
      if (text.includes("INSERT INTO inventory_condition_resolutions")) {
        return Promise.resolve({ rows: [{ id: "resolution-1" }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const res = await request(app)
      .post(`/events/returns/items/${LINKED_ITEM.id}/condition-resolutions`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ source_condition: "repair", outcome: "good", quantity: 2, idempotency_key: "repair-1" });

    expect(res.status).toBe(201);
    expect(executed.some(({ sql }) => sql.includes("unavailable_repair_quantity = unavailable_repair_quantity - $2"))).toBe(true);
    expect(executed.some(({ sql }) => sql.includes("INSERT INTO inventory_movements"))).toBe(false);
  });

  test("rejects resolving more than the unavailable balance", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes("FROM items WHERE id") && String(sql).includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [{ ...LINKED_ITEM, unavailable_damaged_quantity: 0, unavailable_repair_quantity: 1 }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });
    const res = await request(app)
      .post(`/events/returns/items/${LINKED_ITEM.id}/condition-resolutions`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ source_condition: "repair", outcome: "good", quantity: 2 });
    expect(res.status).toBe(409);
  });
});

describe("Immutable return corrections", () => {
  test("compensating correction reopens an allocation and restores owned stock atomically", async () => {
    const executed: string[] = [];
    mockQuery.mockImplementation((sql: string) => {
      const text = String(sql);
      executed.push(text);
      if (text.includes("FROM event_return_receipts r")) {
        return Promise.resolve({ rows: [{
          id: "receipt-1", allocation_id: ALLOCATION_ID, event_id: EVENT_ID, item_id: LINKED_ITEM.id,
          quantity_allocated: 10, good_quantity: 4, damaged_quantity: 2, lost_quantity: 2, repair_quantity: 2,
          returned_good_quantity: 4, returned_damaged_quantity: 2, returned_lost_quantity: 2, returned_repair_quantity: 2,
          correction_good_delta: 0, correction_damaged_delta: 0, correction_lost_delta: 0, correction_repair_delta: 0,
        }], rowCount: 1 });
      }
      if (text.includes("FROM items WHERE id")) {
        return Promise.resolve({ rows: [{ ...LINKED_ITEM, quantity: 118, unavailable_damaged_quantity: 2, unavailable_repair_quantity: 2 }], rowCount: 1 });
      }
      if (text.includes("INSERT INTO event_return_corrections")) {
        return Promise.resolve({ rows: [{ id: "correction-1" }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const res = await request(app)
      .post("/events/returns/receipt-1/corrections")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ lost_delta: -1, reason: "One unit was located after recount", idempotency_key: "correction-1" });

    expect(res.status).toBe(201);
    expect(res.body.outstanding_quantity).toBe(1);
    expect(executed.some((sql) => sql.includes("event_return_corrections"))).toBe(true);
    expect(executed.some((sql) => sql.includes("event_return_correction"))).toBe(true);
    expect(executed.some((sql) => sql.includes("status=CASE"))).toBe(true);
    expect(executed.some((sql) => sql.includes("COMMIT"))).toBe(true);
  });

  test("correction cannot make original receipt quantities negative", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes("FROM event_return_receipts r")) {
        return Promise.resolve({ rows: [{
          id: "receipt-1", allocation_id: ALLOCATION_ID, event_id: EVENT_ID, item_id: LINKED_ITEM.id,
          quantity_allocated: 10, good_quantity: 1, damaged_quantity: 0, lost_quantity: 0, repair_quantity: 0,
          returned_good_quantity: 1, returned_damaged_quantity: 0, returned_lost_quantity: 0, returned_repair_quantity: 0,
          correction_good_delta: 0, correction_damaged_delta: 0, correction_lost_delta: 0, correction_repair_delta: 0,
        }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });
    const res = await request(app)
      .post("/events/returns/receipt-1/corrections")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ good_delta: -2, reason: "Correct input mistake" });
    expect(res.status).toBe(409);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("ROLLBACK"))).toBe(true);
  });
});
