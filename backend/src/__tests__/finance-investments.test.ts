import "./setup";
import { describe, test, expect, mock, beforeAll, beforeEach } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

const mockQuery = mock((..._args: any[]) => Promise.resolve({ rows: [] as any[], rowCount: 1 }));
const mockRelease = mock(() => {});
const mockConnect = mock(() =>
  Promise.resolve({
    query: mockQuery,
    release: mockRelease,
  })
);

mock.module("../db/pool", () => ({
  pool: {
    query: mockQuery,
    connect: mockConnect,
  },
}));

let app: import("express").Application;

beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

const JWT_SECRET = "test-secret";

function getToken(role = "ACCOUNTANT", extra: Record<string, unknown> = {}): string {
  return jwt.sign({ id: "user-1", role, username: "testuser", ...extra }, JWT_SECRET, { expiresIn: "1h" });
}

const PENDING_INVESTMENT = {
  id: "7c3f9b65-3333-4ee7-8b62-41d6e5f11101",
  purchase_date: "2026-05-04",
  item_name: "white fabric 18 pcs",
  category: "Fabric",
  quantity: "18.0000",
  unit: "pcs",
  unit_cost: "1950.00",
  total_cost: "35100.00",
  vendor: "Merkato Textile",
  notes: "Workbook INVESTMENT line",
  capex_classification: "Inventory Asset",
  asset_id: "7c3f9b65-3333-4ee7-8b62-41d6e5f11199",
  creates_inventory_stock: true,
  status: "Pending",
  rejected_reason: null,
  created_by: "user-1",
  approved_by: null,
};

function mockInvestmentQueries(options: { existing?: Record<string, unknown> | null; assetExists?: boolean; onSql?: (sql: string) => any }) {
  mockQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    const custom = options.onSql?.(text);
    if (custom) return custom;
    if (text.includes("FROM items WHERE id =")) {
      return Promise.resolve({ rows: options.assetExists === false ? [] : [{ "?column?": 1 }], rowCount: options.assetExists === false ? 0 : 1 });
    }
    if (text.includes("FOR UPDATE")) {
      const existing = options.existing === undefined ? PENDING_INVESTMENT : options.existing;
      return Promise.resolve({ rows: existing ? [existing] : [], rowCount: existing ? 1 : 0 });
    }
    return Promise.resolve({ rows: [], rowCount: 1 });
  });
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  mockConnect.mockClear();
  mockRelease.mockClear();
});

describe("Capital investments RBAC", () => {
  test("driver and event manager are denied on register, summary, export, and mutations", async () => {
    for (const role of ["DRIVER", "EVENT_MANAGER"]) {
      const token = getToken(role);
      const list = await request(app).get("/finance/investments").set("Authorization", `Bearer ${token}`);
      expect(list.status).toBe(403);
      const summary = await request(app).get("/finance/investments/summary?month=2026-05").set("Authorization", `Bearer ${token}`);
      expect(summary.status).toBe(403);
      const create = await request(app)
        .post("/finance/investments")
        .set("Authorization", `Bearer ${token}`)
        .send({ purchase_date: "2026-05-04", item_name: "washing machine", category: "Equipment", quantity: 1, unit: "pcs", unit_cost: 36500, capex_classification: "Capital Asset" });
      expect(create.status).toBe(403);
      const exportRes = await request(app).get("/finance/investments/export").set("Authorization", `Bearer ${token}`);
      expect(exportRes.status).toBe(403);
    }
  });

  test("unauthenticated requests are rejected", async () => {
    const res = await request(app).get("/finance/investments");
    expect(res.status).toBe(401);
  });
});

describe("Capital investment register", () => {
  test("GET /finance/investments returns paginated rows with linked asset metadata", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...PENDING_INVESTMENT, asset_name: "White Fabric", asset_quantity: 18, asset_unit: "pcs" }],
      rowCount: 1,
    });

    const res = await request(app)
      .get("/finance/investments?month=2026-05&category=Fabric&linked=linked")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.investments).toHaveLength(1);
    expect(res.body.investments[0].total_cost).toBe(35100);
    expect(res.body.investments[0].asset_name).toBe("White Fabric");
  });

  test("GET /finance/investments rejects invalid filters", async () => {
    const overCap = await request(app)
      .get("/finance/investments?limit=500")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(overCap.status).toBe(400);

    const badMonth = await request(app)
      .get("/finance/investments?month=2026-13")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(badMonth.status).toBe(400);
  });

  test("POST creates pending capex with generated total and transactional audit log", async () => {
    const executed: string[] = [];
    mockInvestmentQueries({
      assetExists: true,
      onSql: (sql) => {
        executed.push(sql);
        if (sql.includes("INSERT INTO capital_investments")) {
          return Promise.resolve({ rows: [PENDING_INVESTMENT], rowCount: 1 });
        }
        return undefined;
      },
    });

    const res = await request(app)
      .post("/finance/investments")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        purchase_date: "2026-05-04",
        item_name: "white fabric 18 pcs",
        category: "Fabric",
        quantity: 18,
        unit: "pcs",
        unit_cost: 1950,
        vendor: "Merkato Textile",
        capex_classification: "Inventory Asset",
        asset_id: "7c3f9b65-3333-4ee7-8b62-41d6e5f11199",
        creates_inventory_stock: true,
        notes: "Workbook INVESTMENT line",
      });

    expect(res.status).toBe(201);
    expect(res.body.investment.status).toBe("Pending");
    expect(res.body.investment.total_cost).toBe(35100);
    expect(executed.some((sql) => sql.includes("INSERT INTO public.activity_logs"))).toBe(true);
    expect(executed.some((sql) => sql.includes("COMMIT"))).toBe(true);
    expect(executed.some((sql) => sql.includes("UPDATE items"))).toBe(false);
  });

  test("POST validates bad payloads and missing linked assets", async () => {
    const badAmount = await request(app)
      .post("/finance/investments")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ purchase_date: "2026-05-04", item_name: "washing machine", category: "Equipment", quantity: 1, unit: "pcs", unit_cost: 0, capex_classification: "Capital Asset" });
    expect(badAmount.status).toBe(400);

    const badCategory = await request(app)
      .post("/finance/investments")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ purchase_date: "2026-05-04", item_name: "washing machine", category: "Office Lunch", quantity: 1, unit: "pcs", unit_cost: 36500, capex_classification: "Capital Asset" });
    expect(badCategory.status).toBe(400);

    mockInvestmentQueries({ assetExists: false });
    const missingAsset = await request(app)
      .post("/finance/investments")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        purchase_date: "2026-05-04",
        item_name: "white fabric 18 pcs",
        category: "Fabric",
        quantity: 18,
        unit: "pcs",
        unit_cost: 1950,
        capex_classification: "Inventory Asset",
        asset_id: "7c3f9b65-3333-4ee7-8b62-41d6e5f11199",
      });
    expect(missingAsset.status).toBe(400);
    expect(missingAsset.body.error).toContain("Linked asset");
  });

  test("PATCH is blocked on approved entries and resubmits rejected entries as pending", async () => {
    mockInvestmentQueries({ existing: { ...PENDING_INVESTMENT, status: "Approved" } });
    const locked = await request(app)
      .patch(`/finance/investments/${PENDING_INVESTMENT.id}`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ unit_cost: 2000 });
    expect(locked.status).toBe(409);

    mockInvestmentQueries({
      existing: { ...PENDING_INVESTMENT, status: "Rejected", rejected_reason: "wrong vendor" },
      onSql: (sql) => {
        if (sql.includes("UPDATE capital_investments") && sql.includes("RETURNING")) {
          return Promise.resolve({ rows: [{ ...PENDING_INVESTMENT, unit_cost: "2000.00", total_cost: "36000.00", status: "Pending" }], rowCount: 1 });
        }
        return undefined;
      },
    });
    const updated = await request(app)
      .patch(`/finance/investments/${PENDING_INVESTMENT.id}`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ unit_cost: 2000 });
    expect(updated.status).toBe(200);
    expect(updated.body.investment.status).toBe("Pending");
    expect(updated.body.investment.total_cost).toBe(36000);
  });

  test("approve/reject transitions are pending-only and audited", async () => {
    const executed: string[] = [];
    mockInvestmentQueries({
      onSql: (sql) => {
        executed.push(sql);
        if (sql.includes("UPDATE capital_investments") && sql.includes("RETURNING")) {
          return Promise.resolve({ rows: [{ ...PENDING_INVESTMENT, status: "Approved", approved_by: "user-1" }], rowCount: 1 });
        }
        return undefined;
      },
    });
    const approved = await request(app)
      .post(`/finance/investments/${PENDING_INVESTMENT.id}/approve`)
      .set("Authorization", `Bearer ${getToken()}`);
    expect(approved.status).toBe(200);
    expect(approved.body.investment.status).toBe("Approved");
    expect(executed.some((sql) => sql.includes("INSERT INTO public.activity_logs"))).toBe(true);

    mockInvestmentQueries({ existing: { ...PENDING_INVESTMENT, status: "Approved" } });
    const notPending = await request(app)
      .post(`/finance/investments/${PENDING_INVESTMENT.id}/reject`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ rejected_reason: "duplicate" });
    expect(notPending.status).toBe(409);
  });

  test("DELETE soft-deletes only non-approved investments", async () => {
    const executed: string[] = [];
    mockInvestmentQueries({ onSql: (sql) => { executed.push(sql); return undefined; } });
    const deleted = await request(app)
      .delete(`/finance/investments/${PENDING_INVESTMENT.id}`)
      .set("Authorization", `Bearer ${getToken()}`);
    expect(deleted.status).toBe(200);
    expect(executed.some((sql) => sql.includes("SET deleted_at = NOW()"))).toBe(true);

    mockInvestmentQueries({ existing: { ...PENDING_INVESTMENT, status: "Approved" } });
    const locked = await request(app)
      .delete(`/finance/investments/${PENDING_INVESTMENT.id}`)
      .set("Authorization", `Bearer ${getToken()}`);
    expect(locked.status).toBe(409);
  });
});

describe("Capital investment summary and export", () => {
  test("summary returns approved totals, pending exposure, and category/classification buckets", async () => {
    mockQuery.mockImplementation((sql: string) => {
      const text = String(sql);
      if (text.includes("COUNT(*) FILTER")) {
        return Promise.resolve({
          rows: [{ approved_total: "71600.00", pending_total: "16000.00", pending_count: 1, linked_count: 1, unlinked_count: 2 }],
          rowCount: 1,
        });
      }
      if (text.includes("GROUP BY category")) {
        return Promise.resolve({ rows: [{ category: "Fabric", amount: "35100.00" }, { category: "Equipment", amount: "36500.00" }], rowCount: 2 });
      }
      if (text.includes("GROUP BY capex_classification")) {
        return Promise.resolve({ rows: [{ capex_classification: "Inventory Asset", amount: "35100.00" }, { capex_classification: "Capital Asset", amount: "36500.00" }], rowCount: 2 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const res = await request(app)
      .get("/finance/investments/summary?month=2026-05")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.totals.approvedTotal).toBe(71600);
    expect(res.body.totals.pendingTotal).toBe(16000);
    expect(res.body.totals.linkedCount).toBe(1);
    expect(res.body.byCategory[0].category).toBe("Fabric");
  });

  test("export requires approve permission and emits CSV rows", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...PENDING_INVESTMENT, asset_name: "White Fabric" }],
      rowCount: 1,
    });

    const res = await request(app)
      .get("/finance/investments/export?format=csv&month=2026-05")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("white fabric 18 pcs");
    expect(res.text).toContain("White Fabric");
  });
});
