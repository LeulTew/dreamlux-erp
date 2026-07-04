import "./setup";
import { describe, test, expect, mock, beforeAll, beforeEach } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

// Mock the DB pool
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

const PENDING_OPEX = {
  id: "5b2e8a54-1111-4dd6-9a51-30c5d4f00001",
  expense_date: "2026-05-04",
  category: "Office Lunch",
  amount: "450.00",
  description: "Office lunch for install crew",
  status: "Pending",
  rejected_reason: null,
  created_by: "user-1",
  approved_by: null,
};

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  mockConnect.mockClear();
  mockRelease.mockClear();
});

describe("Finance RBAC", () => {
  test("driver is denied on Hisab rollup, ledger, and mutations", async () => {
    const driverToken = getToken("DRIVER");

    const rollup = await request(app)
      .get("/finance/hisab?start_date=2026-05-01&end_date=2026-05-31")
      .set("Authorization", `Bearer ${driverToken}`);
    expect(rollup.status).toBe(403);

    const list = await request(app)
      .get("/finance/operational-expenses")
      .set("Authorization", `Bearer ${driverToken}`);
    expect(list.status).toBe(403);

    const create = await request(app)
      .post("/finance/operational-expenses")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ expense_date: "2026-05-04", category: "Other", amount: 100, description: "x" });
    expect(create.status).toBe(403);

    const approve = await request(app)
      .post(`/finance/operational-expenses/${PENDING_OPEX.id}/approve`)
      .set("Authorization", `Bearer ${driverToken}`);
    expect(approve.status).toBe(403);
  });

  test("event manager without finance permissions is denied", async () => {
    const res = await request(app)
      .get("/finance/hisab?start_date=2026-05-01&end_date=2026-05-31")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`);
    expect(res.status).toBe(403);
  });

  test("unauthenticated requests are rejected", async () => {
    const res = await request(app).get("/finance/operational-expenses");
    expect(res.status).toBe(401);
  });
});

describe("Operational expense ledger", () => {
  test("GET /finance/operational-expenses returns a paginated ledger", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [PENDING_OPEX], rowCount: 1 });

    const res = await request(app)
      .get("/finance/operational-expenses?page=1&limit=20&status=Pending")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.expenses).toHaveLength(1);
    expect(res.body.expenses[0].amount).toBe(450);
    expect(res.body.total).toBe(1);
    expect(res.body.totalPages).toBe(1);
  });

  test("GET /api/finance/operational-expenses alias is mounted and recent sort uses updated_at", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [PENDING_OPEX], rowCount: 1 });

    const res = await request(app)
      .get("/api/finance/operational-expenses?page=1&limit=20&sortBy=recent&sortOrder=desc")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    const listSql = String(mockQuery.mock.calls[1][0]);
    expect(listSql).toContain("ORDER BY fe.updated_at DESC");
    expect(listSql).toContain("fe.created_at DESC");
  });

  test("GET /finance/operational-expenses rejects an over-cap limit", async () => {
    const res = await request(app)
      .get("/finance/operational-expenses?limit=500")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(res.status).toBe(400);
  });

  test("POST creates a pending expense and writes an audit log in one transaction", async () => {
    const executed: string[] = [];
    mockQuery.mockImplementation((sql: string) => {
      executed.push(String(sql));
      if (String(sql).includes("INSERT INTO finance_operational_expenses")) {
        return Promise.resolve({ rows: [PENDING_OPEX], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const res = await request(app)
      .post("/finance/operational-expenses")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        expense_date: "2026-05-04",
        category: "Office Lunch",
        amount: 450,
        description: "Office lunch for install crew",
      });

    expect(res.status).toBe(201);
    expect(res.body.expense.status).toBe("Pending");
    expect(executed.some((sql) => sql.includes("BEGIN"))).toBe(true);
    expect(executed.some((sql) => sql.includes("INSERT INTO public.activity_logs"))).toBe(true);
    expect(executed.some((sql) => sql.includes("COMMIT"))).toBe(true);
  });

  test("POST rejects invalid payloads", async () => {
    const negative = await request(app)
      .post("/finance/operational-expenses")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ expense_date: "2026-05-04", category: "Other", amount: -5, description: "x" });
    expect(negative.status).toBe(400);

    const zero = await request(app)
      .post("/finance/operational-expenses")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ expense_date: "2026-05-04", category: "Other", amount: 0, description: "x" });
    expect(zero.status).toBe(400);

    const badCategory = await request(app)
      .post("/finance/operational-expenses")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ expense_date: "2026-05-04", category: "Not A Category", amount: 5, description: "x" });
    expect(badCategory.status).toBe(400);

    const emptyDescription = await request(app)
      .post("/finance/operational-expenses")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ expense_date: "2026-05-04", category: "Other", amount: 5, description: "  " });
    expect(emptyDescription.status).toBe(400);
  });

  test("PATCH is blocked on approved (locked) expenses", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [{ ...PENDING_OPEX, status: "Approved" }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const res = await request(app)
      .patch(`/finance/operational-expenses/${PENDING_OPEX.id}`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ amount: 999 });

    expect(res.status).toBe(409);
  });

  test("PATCH resubmits a rejected expense as pending", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [{ ...PENDING_OPEX, status: "Rejected", rejected_reason: "typo" }], rowCount: 1 });
      }
      if (String(sql).includes("UPDATE finance_operational_expenses")) {
        return Promise.resolve({ rows: [{ ...PENDING_OPEX, amount: "500.00", status: "Pending" }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const res = await request(app)
      .patch(`/finance/operational-expenses/${PENDING_OPEX.id}`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ amount: 500 });

    expect(res.status).toBe(200);
    expect(res.body.expense.status).toBe("Pending");
    expect(res.body.expense.amount).toBe(500);
  });

  test("DELETE is blocked on approved expenses and soft-deletes pending ones", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [{ ...PENDING_OPEX, status: "Approved" }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });
    const locked = await request(app)
      .delete(`/finance/operational-expenses/${PENDING_OPEX.id}`)
      .set("Authorization", `Bearer ${getToken()}`);
    expect(locked.status).toBe(409);

    const executed: string[] = [];
    mockQuery.mockImplementation((sql: string) => {
      executed.push(String(sql));
      if (String(sql).includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [PENDING_OPEX], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });
    const deleted = await request(app)
      .delete(`/finance/operational-expenses/${PENDING_OPEX.id}`)
      .set("Authorization", `Bearer ${getToken()}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.deleted).toBe(true);
    expect(executed.some((sql) => sql.includes("SET deleted_at = NOW()"))).toBe(true);
    expect(executed.some((sql) => sql.includes("INSERT INTO public.activity_logs"))).toBe(true);
  });

  test("missing expense returns 404", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const res = await request(app)
      .patch(`/finance/operational-expenses/${PENDING_OPEX.id}`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ amount: 10 });
    expect(res.status).toBe(404);
  });
});

describe("Operational expense approval flow", () => {
  test("approve locks a pending expense and audits the transition", async () => {
    const executed: string[] = [];
    mockQuery.mockImplementation((sql: string) => {
      executed.push(String(sql));
      if (String(sql).includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [PENDING_OPEX], rowCount: 1 });
      }
      if (String(sql).includes("UPDATE finance_operational_expenses")) {
        return Promise.resolve({ rows: [{ ...PENDING_OPEX, status: "Approved", approved_by: "user-1" }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const res = await request(app)
      .post(`/finance/operational-expenses/${PENDING_OPEX.id}/approve`)
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.expense.status).toBe("Approved");
    expect(executed.some((sql) => sql.includes("INSERT INTO public.activity_logs"))).toBe(true);
  });

  test("approve conflicts when the expense is not pending (double-submit guard)", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [{ ...PENDING_OPEX, status: "Approved" }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const res = await request(app)
      .post(`/finance/operational-expenses/${PENDING_OPEX.id}/approve`)
      .set("Authorization", `Bearer ${getToken()}`);
    expect(res.status).toBe(409);
  });

  test("reject requires a reason", async () => {
    const res = await request(app)
      .post(`/finance/operational-expenses/${PENDING_OPEX.id}/reject`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test("reject stores the reason", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [PENDING_OPEX], rowCount: 1 });
      }
      if (String(sql).includes("UPDATE finance_operational_expenses")) {
        return Promise.resolve({
          rows: [{ ...PENDING_OPEX, status: "Rejected", rejected_reason: "No receipt" }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const res = await request(app)
      .post(`/finance/operational-expenses/${PENDING_OPEX.id}/reject`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ rejected_reason: "No receipt" });

    expect(res.status).toBe(200);
    expect(res.body.expense.status).toBe("Rejected");
    expect(res.body.expense.rejected_reason).toBe("No receipt");
  });
});

const HISAB_EVENT_ROWS = [
  {
    event_id: "11111111-1111-4111-8111-111111111111",
    event_name: "Hikma Full Package",
    event_date: "2026-05-04",
    period_start: "2026-05-04",
    income: "80000.00",
    transport: "5000.00",
    rental: "3000.00",
    labour: "12000.00",
    other: "2000.00",
  },
  {
    event_id: "22222222-2222-4222-8222-222222222222",
    event_name: "Bethel Full Package",
    event_date: "2026-05-06",
    period_start: "2026-05-04",
    income: "60000.00",
    transport: "4000.00",
    rental: "0.00",
    labour: "9000.00",
    other: "1000.00",
  },
];

const HISAB_OPEX_ROWS = [
  { period_start: "2026-05-04", category: "Office Lunch", approved_amount: "1500.00", pending_amount: "0.00" },
  { period_start: "2026-05-04", category: "Transport", approved_amount: "800.00", pending_amount: "250.00" },
];

function mockHisabQueries() {
  mockQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    if (text.includes("FROM events e")) {
      return Promise.resolve({ rows: HISAB_EVENT_ROWS, rowCount: HISAB_EVENT_ROWS.length });
    }
    if (text.includes("FROM finance_operational_expenses")) {
      return Promise.resolve({ rows: HISAB_OPEX_ROWS, rowCount: HISAB_OPEX_ROWS.length });
    }
    return Promise.resolve({ rows: [], rowCount: 1 });
  });
}

describe("Hisab rollup", () => {
  test("GET /finance/hisab groups events and operational expenses into weekly buckets", async () => {
    mockHisabQueries();

    const res = await request(app)
      .get("/finance/hisab?period_type=week&start_date=2026-05-01&end_date=2026-05-31")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.periods).toHaveLength(1);

    const period = res.body.periods[0];
    expect(period.label).toBe("Week of 2026-05-04");
    expect(period.period_end).toBe("2026-05-10");
    expect(period.events).toHaveLength(2);

    // Workbook math: income 140000, expenses 36000, profit 104000,
    // operational 2300, net 101700. Pending amounts never join totals.
    expect(period.eventTotals.income).toBe(140000);
    expect(period.eventTotals.transport).toBe(9000);
    expect(period.eventTotals.rental).toBe(3000);
    expect(period.eventTotals.labour).toBe(21000);
    expect(period.eventTotals.other).toBe(3000);
    expect(period.eventTotals.expenses).toBe(36000);
    expect(period.eventTotals.profit).toBe(104000);
    expect(period.operational.total).toBe(2300);
    expect(period.operational.pendingExposure).toBe(250);
    expect(period.net).toBe(101700);

    expect(res.body.summary.eventIncome).toBe(140000);
    expect(res.body.summary.net).toBe(101700);
  });

  test("GET /finance/hisab validates the date range", async () => {
    const inverted = await request(app)
      .get("/finance/hisab?start_date=2026-06-01&end_date=2026-05-01")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(inverted.status).toBe(400);

    const tooWide = await request(app)
      .get("/finance/hisab?start_date=2024-01-01&end_date=2026-05-01")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(tooWide.status).toBe(400);

    const missing = await request(app)
      .get("/finance/hisab")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(missing.status).toBe(400);
  });
});

describe("Hisab export", () => {
  test("export emits CSV rows for events, operational categories, and period totals", async () => {
    mockHisabQueries();

    const res = await request(app)
      .get("/finance/hisab/export?period_type=week&start_date=2026-05-01&end_date=2026-05-31&format=csv")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Hikma Full Package");
    expect(res.text).toContain("Office Lunch");
    expect(res.text).toContain("Period Total");
  });

  test("export is blocked and audited when rows exceed maxRows", async () => {
    mockHisabQueries();

    const res = await request(app)
      .get("/finance/hisab/export?period_type=week&start_date=2026-05-01&end_date=2026-05-31&maxRows=1")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(413);
  });
});
