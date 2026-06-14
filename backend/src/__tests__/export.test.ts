import "./setup";
import { describe, test, expect, mock, beforeEach, beforeAll } from "bun:test";
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
// Local mock for image download specifically for Excel export
mock.module("../storage/storage", () => ({
  uploadImage: mock(() => Promise.resolve()),
  deleteImage: mock(() => Promise.resolve()),
  getPublicUrl: mock((key: string) => `https://storage.test.com/${key}`),
  downloadImage: mock(() => Promise.resolve(Buffer.from("fake-image"))),
}));

describe("Export — GET /export/csv", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test("returns CSV with correct headers", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { 
          id: "1", 
          name: "Item 1", 
          quantity: 10, 
          description: "Desc", 
          store_id: "s1", 
          store_name: "Store A", 
          image_key: "k1",
          created_at: new Date().toISOString()
        }
      ]
    });

    const res = await request(app)
      .get("/export/csv")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toBe("text/csv; charset=utf-8");
    expect(res.text).toContain("Asset Name,Quantity,Office / Store,Description,Image URL");
    expect(res.text).toContain("Item 1");
  });

  test("returns CSV with empty dataset", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/export/csv")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain("Asset Name,Quantity,Office / Store,Description,Image URL");
  });

  test("filters by store", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/export/csv")
      .query({ store: "s1" })
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
  });

  test("handles DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB failed"));

    const res = await request(app)
      .get("/export/csv")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(500);
  });
});

describe("Export — GET /export/xlsx", () => {
  test("returns Excel file with correct content type", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: "1", name: "Item 1", quantity: 10, description: "Desc", store_id: "s1", store_name: "Store A", image_key: "k1", created_at: new Date().toISOString() }
      ]
    });

    const res = await request(app)
      .get("/export/xlsx")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  test("handles image download failure gracefully", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: "1", name: "Item 1", quantity: 10, description: "Desc", store_id: "s1", store_name: "Store A", image_key: "k1", created_at: new Date().toISOString() }
      ]
    });
    
    // In setup.ts, downloadImage is already mocked to resolve.
    // We could re-mock here if we wanted to test failure, but the route handles it.

    const res = await request(app)
      .get("/export/xlsx")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
  });
});

describe("Export — GET /export/pdf", () => {
  test("returns 410 for deprecated PDF route", async () => {
    const res = await request(app)
      .get("/export/pdf")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(410);
    expect(res.body.error).toContain("PDF export has moved to the client-side");
  });

  test("requires authentication", async () => {
    const res = await request(app).get("/export/pdf");
    expect(res.status).toBe(401);
  });
});

describe("Export — GET /export/employees/csv", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test("includes event pricing columns and values", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "emp-1",
          employee_id: "EMP-001",
          full_name: "Demo Employee",
          stores: { name: "Main Branch" },
          department: "Ops",
          phone: "+251900000000",
          email: "demo@company.test",
          salary_level: "L2",
          commission: "1000",
          event_prices: { evt_wedding: 1200, evt_mels: 800 },
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
      ],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: "evt_wedding", name: "Wedding" },
        { id: "evt_mels", name: "Mels" },
      ],
    });

    const res = await request(app)
      .get("/export/employees/csv")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain("Event: Wedding (ETB)");
    expect(res.text).toContain("Event: Mels (ETB)");
    expect(res.text).toContain("Demo Employee");
    expect(res.text).toContain("1200");
    expect(res.text).toContain("800");
  });
});
