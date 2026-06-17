import {
  mockUploadImage,
  mockDeleteImage,
  getToken,
} from "./setup_helpers";
import "./setup";
import { describe, test, expect, mock, beforeEach, beforeAll } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

const mockQuery = mock(() => Promise.resolve({ rows: [] as any[] }));

export const fakeChain = (isSingle = false): any => {
  const chain: any = {
    select: () => fakeChain(isSingle),
    eq: () => fakeChain(isSingle),
    neq: () => fakeChain(isSingle),
    is: () => fakeChain(isSingle),
    not: () => fakeChain(isSingle),
    or: () => fakeChain(isSingle),
    gte: () => fakeChain(isSingle),
    lte: () => fakeChain(isSingle),
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

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

function getNoAssetsReadToken(): string {
  return jwt.sign(
    { role: "system_manager", username: "system-manager", permissions: { settings: ["write"] } },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

describe("Assets", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockUploadImage.mockReset();
    mockDeleteImage.mockReset();
  });

  describe("GET /assets", () => {
    test("returns paginated items with defaults", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: "1",
              name: "Item 1",
              quantity: 10,
              store_id: VALID_UUID,
              stores: { name: "Store 1" },
              count: "25",
            },
            {
              id: "2",
              name: "Item 2",
              quantity: 5,
              store_id: VALID_UUID,
              stores: { name: "Store 1" },
              count: "25",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/assets")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(25);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(50);
      expect(res.body.items[0].allocated_quantity).toBe(0);
      expect(res.body.items[0].available_quantity).toBe(10);
    });

    test("returns empty items list", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/assets")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    test("returns allocation availability from all active event allocations", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: "white-rose",
              name: "White Rose Arrangement",
              quantity: 20,
              store_id: VALID_UUID,
              stores: { name: "Central Store" },
              count: "2",
            },
            {
              id: "gold-chair",
              name: "Gold Chiavari Chair",
              quantity: 4,
              store_id: VALID_UUID,
              stores: { name: "Central Store" },
              count: "2",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { item_id: "white-rose", quantity_allocated: 6 },
            { item_id: "white-rose", quantity_allocated: "3" },
            { item_id: "gold-chair", quantity_allocated: 8 },
          ],
        });

      const res = await request(app)
        .get("/assets")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].allocated_quantity).toBe(9);
      expect(res.body.items[0].available_quantity).toBe(11);
      expect(res.body.items[1].allocated_quantity).toBe(8);
      expect(res.body.items[1].available_quantity).toBe(0);
    });

    test("falls back to full quantity when event allocation table is unavailable", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: "legacy-item",
              name: "Legacy Item",
              quantity: 12,
              store_id: VALID_UUID,
              stores: { name: "Legacy Store" },
              count: "1",
            },
          ],
        })
        .mockRejectedValueOnce({
          code: "42P01",
          message: 'relation "event_allocations" does not exist',
        });

      const res = await request(app)
        .get("/assets")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.items[0].allocated_quantity).toBe(0);
      expect(res.body.items[0].available_quantity).toBe(12);
    });

    test("filters by store", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get(`/assets?store=${VALID_UUID}`)
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
    });

    test("paginates correctly", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: Array(5).fill({ id: "id", quantity: 1, count: "50" }),
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/assets?page=3&limit=5")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(3);
      expect(res.body.limit).toBe(5);
    });

    test("handles DB error gracefully", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB connection failed"));

      const res = await request(app)
        .get("/assets")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });

    test("falls back when users relationship embed is missing", async () => {
      mockQuery
        .mockRejectedValueOnce({
          code: "PGRST200",
          message:
            "Could not find a relationship between 'items' and 'users' in the schema cache",
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "1",
              name: "Fallback Item",
              quantity: 3,
              store_id: VALID_UUID,
              stores: { name: "Store 1" },
              count: "1",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/assets")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].last_counted_by).toBeNull();
      expect(res.body.total).toBe(1);
    });

    test("falls back when soft-delete column is missing", async () => {
      mockQuery
        .mockRejectedValueOnce({
          code: "42703",
          message: 'column items.deleted_at does not exist',
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "2",
              name: "Legacy Item",
              quantity: 9,
              store_id: VALID_UUID,
              stores: { name: "Store 1" },
              count: "1",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/assets")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].name).toBe("Legacy Item");
      expect(res.body.total).toBe(1);
    });

    test("returns legacy trash items when soft-delete column is missing", async () => {
      mockQuery
        .mockRejectedValueOnce({
          code: "42703",
          message: 'column items.deleted_at does not exist',
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "3",
              name: "Legacy Deleted",
              quantity: -999999,
              store_id: VALID_UUID,
              stores: { name: "Store 1" },
              count: "1",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/assets?status=trash")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].name).toBe("Legacy Deleted");
      expect(res.body.total).toBe(1);
    });
  });

  describe("GET /assets/stats", () => {
    test("returns aggregate stats", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: VALID_UUID, name: "Bulbula 2" },
            { id: "123e4567-e89b-12d3-a456-426614174000", name: "Bulbula Coka" },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { quantity: 3, store_id: VALID_UUID, last_counted_at: null },
            { quantity: 7, store_id: VALID_UUID, last_counted_at: null },
          ],
        });

      const res = await request(app)
        .get("/assets/stats")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.totalItems).toBe(10);
      expect(res.body.lowStockItems).toBe(1);
      expect(res.body.totalEntries).toBe(2);
      expect(Array.isArray(res.body.stockPerLocation)).toBe(true);
      expect(res.body.stockPerLocation[0].lowStockItems).toBe(1);
      expect(res.body.stockPerLocation[0].totalEntries).toBe(2);
    });

    test("falls back when deleted_at and last_counted_at columns are missing", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: VALID_UUID, name: "Bulbula 2" }],
        })
        .mockRejectedValueOnce({ code: "42703", message: "column items.deleted_at does not exist" })
        .mockRejectedValueOnce({ code: "42703", message: "column items.last_counted_at does not exist" })
        .mockResolvedValueOnce({ rows: [{ quantity: 5, store_id: VALID_UUID }] });

      const res = await request(app)
        .get("/assets/stats")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.totalItems).toBe(5);
      expect(res.body.reconciledRecently).toBe(0);
      expect(res.body.totalEntries).toBe(1);
    });
  });

  describe("GET /assets/reconcile/preview", () => {
    test("returns preview rows with pagination", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "a1",
            name: "Preview Item",
            quantity: 12,
            store_id: VALID_UUID,
            stores: { name: "Store 1" },
            last_counted_at: null,
            last_counted_by: null,
            count: "1",
          },
        ],
      });

      const res = await request(app)
        .get("/assets/reconcile/preview?page=1&limit=10")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].name).toBe("Preview Item");
    });
  });

  describe("GET /assets/history", () => {
    test("returns empty list when audit table is unavailable", async () => {
      mockQuery.mockRejectedValueOnce({
        code: "42P01",
        message: "relation \"inventory_reconciliation_runs\" does not exist",
      });

      const res = await request(app)
        .get("/assets/history")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.runs).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    test("blocks users missing assets:read permission", async () => {
      const res = await request(app)
        .get("/assets/history")
        .set("Authorization", `Bearer ${getNoAssetsReadToken()}`);

      expect(res.status).toBe(403);
    });
  });

  describe("GET /assets/history/:runId", () => {
    test("returns enriched run and line-item details", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-1",
              store_id: VALID_UUID,
              initiated_by: "user-1",
              started_at: "2026-04-07T10:00:00.000Z",
              completed_at: "2026-04-07T10:05:00.000Z",
              item_count: 1,
              notes: "Monthly cycle count",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "line-1",
              item_id: "item-1",
              previous_quantity: 8,
              counted_quantity: 10,
              delta: 2,
              counted_at: "2026-04-07T10:03:00.000Z",
              counted_by: "user-2",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "item-1", name: "Inventory Item 1" }],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: "user-1", full_name: "Initiator User" },
            { id: "user-2", full_name: "Counter User" },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: VALID_UUID, name: "Bulbula 2" }],
        });

      const res = await request(app)
        .get("/assets/history/run-1")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.run.id).toBe("run-1");
      expect(res.body.run.store.name).toBe("Bulbula 2");
      expect(res.body.run.initiated_by_user.full_name).toBe("Initiator User");
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].item_name).toBe("Inventory Item 1");
      expect(res.body.items[0].counted_by_user.full_name).toBe("Counter User");
    });
  });

  describe("POST /assets (validation)", () => {
    test("rejects empty name", async () => {
      const res = await request(app)
        .post("/assets")
        .set("Authorization", `Bearer ${getToken()}`)
        .send({ quantity: 10, store_id: VALID_UUID });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
    });

    test("rejects negative quantity", async () => {
      const res = await request(app)
        .post("/assets")
        .set("Authorization", `Bearer ${getToken()}`)
        .send({ name: "Test", quantity: -1, store_id: VALID_UUID });

      expect(res.status).toBe(400);
    });

    test("rejects invalid UUID store_id", async () => {
      const res = await request(app)
        .post("/assets")
        .set("Authorization", `Bearer ${getToken()}`)
        .send({ name: "Test", quantity: 10, store_id: "not-a-uuid" });

      expect(res.status).toBe(400);
    });
    
    test("rejects missing image", async () => {
       const res = await request(app)
        .post("/assets")
        .set("Authorization", `Bearer ${getToken()}`)
        .field("name", "Test Item")
        .field("quantity", 10)
        .field("store_id", VALID_UUID);

      expect(res.status).toBe(400);
    });

    test("creates item with image successfully", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: "cat-1" }] }) // category lookup
        .mockResolvedValueOnce({
          rows: [{ id: VALID_UUID, name: "New Item", quantity: 5, store_id: VALID_UUID, image_key: "k1" }]
        }); // item insert

      const res = await request(app)
        .post("/assets")
        .set("Authorization", `Bearer ${getToken()}`)
        .field("name", "New Item")
        .field("quantity", 5)
        .field("store_id", VALID_UUID)
        .attach("image", Buffer.from("fake-image"), "test.jpg");

      expect(res.status).toBe(201);
      expect(res.body.image_url).toContain("storage.test.com");
    });

    test("rejects name exceeding 500 chars", async () => {
      const longName = "a".repeat(501);
      const res = await request(app)
        .post("/assets")
        .set("Authorization", `Bearer ${getToken()}`)
        .send({ name: longName, quantity: 10, store_id: VALID_UUID });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /assets/:id", () => {
    test("returns 404 for non-existent item", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete(`/assets/${VALID_UUID}`)
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(404);
    });

    test("deletes item and cleans up storage", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: VALID_UUID, image_key: "k1" }] }) // fetch
        .mockResolvedValueOnce({ rows: [] }); // delete

      const res = await request(app)
        .delete(`/assets/${VALID_UUID}`)
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test("succeeds even if storage cleanup fails", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: VALID_UUID, image_key: "k1" }] })
        .mockResolvedValueOnce({ rows: [] });

      mockDeleteImage.mockRejectedValueOnce(new Error("Storage fail"));

      const res = await request(app)
        .delete(`/assets/${VALID_UUID}`)
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
    });
  });

  describe("DELETE /assets/:id/permanent", () => {
    test("returns 404 for non-existent item", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete(`/assets/${VALID_UUID}/permanent`)
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(404);
    });

    test("permanently deletes item", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: VALID_UUID, image_key: "k1" }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete(`/assets/${VALID_UUID}/permanent`)
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.permanently_deleted).toBe(true);
    });
  });

  describe("PATCH /assets/:id", () => {
    test("returns 404 for non-existent item", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .patch(`/assets/${VALID_UUID}`)
        .set("Authorization", `Bearer ${getToken()}`)
        .send({ name: "Updated" });

      expect(res.status).toBe(404);
    });

    test("updates name only", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: VALID_UUID, name: "Old", store_id: VALID_UUID }] }) // fetch
        .mockResolvedValueOnce({ rows: [{ id: VALID_UUID, name: "Updated" }] }); // update

      const res = await request(app)
        .patch(`/assets/${VALID_UUID}`)
        .set("Authorization", `Bearer ${getToken()}`)
        .send({ name: "Updated" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated");
    });

    test("rejects invalid quantity on update", async () => {
      const res = await request(app)
        .patch(`/assets/${VALID_UUID}`)
        .set("Authorization", `Bearer ${getToken()}`)
        .send({ quantity: -5 });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /assets/bulk-delete", () => {
    test("soft deletes multiple items at once", async () => {
      const ids = [VALID_UUID, "123e4567-e89b-12d3-a456-426614174000"];
      mockQuery.mockResolvedValueOnce({ rows: [] }); // delete operation

      const res = await request(app)
        .post("/assets/bulk-delete")
        .set("Authorization", `Bearer ${getToken()}`)
        .send({ ids });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.deleted).toBe(2);
    });

    test("fails if ids are missing or invalid", async () => {
      const res = await request(app)
        .post("/assets/bulk-delete")
        .set("Authorization", `Bearer ${getToken()}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
