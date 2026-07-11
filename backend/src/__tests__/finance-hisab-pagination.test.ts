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

// Generate rows across multiple weeks to test pagination
const MULTI_WEEK_EVENTS = [
  {
    event_id: "e1",
    event_name: "Event Week 1",
    event_date: "2026-05-05",
    period_start: "2026-05-04",
    income: "50000.00",
    transport: "1000.00",
    rental: "1000.00",
    labour: "1000.00",
    other: "1000.00",
  },
  {
    event_id: "e2",
    event_name: "Event Week 2",
    event_date: "2026-05-12",
    period_start: "2026-05-11",
    income: "60000.00",
    transport: "2000.00",
    rental: "2000.00",
    labour: "2000.00",
    other: "2000.00",
  },
  {
    event_id: "e3",
    event_name: "Event Week 3",
    event_date: "2026-05-19",
    period_start: "2026-05-18",
    income: "70000.00",
    transport: "3000.00",
    rental: "3000.00",
    labour: "3000.00",
    other: "3000.00",
  },
  {
    event_id: "e4",
    event_name: "Event Week 4",
    event_date: "2026-05-26",
    period_start: "2026-05-25",
    income: "80000.00",
    transport: "4000.00",
    rental: "4000.00",
    labour: "4000.00",
    other: "4000.00",
  },
];

const MULTI_WEEK_OPEX = [
  { period_start: "2026-05-04", category: "Office Lunch", approved_amount: "500.00", pending_amount: "0.00" },
  { period_start: "2026-05-11", category: "Office Lunch", approved_amount: "600.00", pending_amount: "0.00" },
  { period_start: "2026-05-18", category: "Office Lunch", approved_amount: "700.00", pending_amount: "0.00" },
  { period_start: "2026-05-25", category: "Office Lunch", approved_amount: "800.00", pending_amount: "0.00" },
];

function mockMultiWeekQueries() {
  mockQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    if (text.includes("FROM events e")) {
      return Promise.resolve({ rows: MULTI_WEEK_EVENTS, rowCount: MULTI_WEEK_EVENTS.length });
    }
    if (text.includes("FROM finance_operational_expenses")) {
      return Promise.resolve({ rows: MULTI_WEEK_OPEX, rowCount: MULTI_WEEK_OPEX.length });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe("Hisab Rollup Pagination", () => {
  test("returns all periods if page and limit are omitted", async () => {
    mockMultiWeekQueries();

    const res = await request(app)
      .get("/finance/hisab?period_type=week&start_date=2026-05-01&end_date=2026-05-31")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.periods).toHaveLength(4);
    expect(res.body.total).toBeUndefined();
    expect(res.body.totalPages).toBeUndefined();
    
    // KPI summary checks
    expect(res.body.summary.eventIncome).toBe(260000); // 50+60+70+80 k
    expect(res.body.summary.operationalExpenses).toBe(2600); // 500+600+700+800
  });

  test("returns sliced periods page 1 with correct metadata", async () => {
    mockMultiWeekQueries();

    const res = await request(app)
      .get("/finance/hisab?period_type=week&start_date=2026-05-01&end_date=2026-05-31&page=1&limit=2")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.periods).toHaveLength(2);
    expect(res.body.total).toBe(4);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(2);

    // Period ordering checks (ascending period_start)
    expect(res.body.periods[0].period_start).toBe("2026-05-04");
    expect(res.body.periods[1].period_start).toBe("2026-05-11");

    // KPI summary MUST cover the full range
    expect(res.body.summary.eventIncome).toBe(260000);
    expect(res.body.summary.operationalExpenses).toBe(2600);
  });

  test("returns sliced periods page 2 with correct metadata", async () => {
    mockMultiWeekQueries();

    const res = await request(app)
      .get("/finance/hisab?period_type=week&start_date=2026-05-01&end_date=2026-05-31&page=2&limit=2")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.periods).toHaveLength(2);
    expect(res.body.total).toBe(4);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(2);

    expect(res.body.periods[0].period_start).toBe("2026-05-18");
    expect(res.body.periods[1].period_start).toBe("2026-05-25");

    // KPI summary MUST cover the full range
    expect(res.body.summary.eventIncome).toBe(260000);
  });
});
