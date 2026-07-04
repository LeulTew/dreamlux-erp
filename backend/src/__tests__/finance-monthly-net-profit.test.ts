import "./setup";
import { describe, test, expect, mock, beforeAll, beforeEach } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

const mockQuery = mock((..._args: any[]) => Promise.resolve({ rows: [] as any[], rowCount: 0 }));
const mockRelease = mock(() => {});
const mockConnect = mock(() =>
  Promise.resolve({
    query: mockQuery,
    release: mockRelease,
  }),
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

function getToken(role = "ACCOUNTANT", permission_slugs?: string[]): string {
  return jwt.sign(
    { id: "user-1", role, username: "finance-user", permission_slugs },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

function monthlyRows(sql: string) {
  const text = String(sql);
  if (text.includes("COUNT(e.id)::int AS event_count")) {
    return {
      rows: [{
        event_count: 2,
        revenue: "140000.00",
        approved_expenses: "36000.00",
        pending_expenses: "7000.00",
      }],
      rowCount: 1,
    };
  }
  if (text.includes("FROM expenses x")) {
    return {
      rows: [
        { category: "Labor", amount: "21000.00", count: 2 },
        { category: "Transportation", amount: "9000.00", count: 2 },
        { category: "Equipment Rental", amount: "3000.00", count: 1 },
        { category: "Other", amount: "3000.00", count: 2 },
      ],
      rowCount: 4,
    };
  }
  if (text.includes("SELECT e.id, e.name")) {
    return {
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Hikma Full Package",
          start_date: "2026-05-04",
          revenue: "80000.00",
          approved_expenses: "22000.00",
          pending_expenses: "5000.00",
          net_profit: "58000.00",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Bethel Full Package",
          start_date: "2026-05-06",
          revenue: "60000.00",
          approved_expenses: "14000.00",
          pending_expenses: "2000.00",
          net_profit: "46000.00",
        },
      ],
      rowCount: 2,
    };
  }
  if (text.includes("FROM finance_operational_expenses")) {
    return {
      rows: [
        { category: "Office Lunch", amount: "1500.00", pending_amount: "0.00", count: 1 },
        { category: "Transport", amount: "800.00", pending_amount: "250.00", count: 1 },
      ],
      rowCount: 2,
    };
  }
  if (text.includes("FROM finance_overhead_expenses")) {
    return {
      rows: [
        { scope: "Office", payment_kind: "staff_payment", amount: "33000.00", pending_amount: "0.00", count: 1 },
        { scope: "Store", payment_kind: "staff_payment", amount: "30600.00", pending_amount: "0.00", count: 1 },
        { scope: "General", payment_kind: "overhead", amount: "95900.00", pending_amount: "1500.00", count: 5 },
      ],
      rowCount: 3,
    };
  }
  if (text.includes("COUNT(DISTINCT run.id)::int AS run_count")) {
    return {
      rows: [{ amount: "72000.00", run_count: 1, employee_line_count: 8 }],
      rowCount: 1,
    };
  }
  if (text.includes("SELECT run.id, run.title")) {
    return {
      rows: [{
        id: "33333333-3333-4333-8333-333333333333",
        title: "May payroll",
        period_start: "2026-05-01",
        period_end: "2026-05-31",
        total: "72000.00",
      }],
      rowCount: 1,
    };
  }
  if (text.includes("FROM capital_investments") && text.includes("GROUP BY category")) {
    return {
      rows: [
        { category: "Equipment", amount: "25000.00", pending_amount: "9000.00", count: 1 },
        { category: "Fabric", amount: "12000.00", pending_amount: "0.00", count: 1 },
      ],
      rowCount: 2,
    };
  }
  if (text.includes("FROM capital_investments") && text.includes("ORDER BY purchase_date ASC")) {
    return {
      rows: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          item_name: "Washing Machine",
          category: "Equipment",
          purchase_date: "2026-05-08",
          quantity: "1",
          unit: "pcs",
          unit_cost: "25000.00",
          total_cost: "25000.00",
          vendor: "Merkato Supplier",
          capex_classification: "Capital Asset",
          asset_id: null,
        },
      ],
      rowCount: 1,
    };
  }
  if (text.includes("FROM finance_overhead_month_closures")) {
    return {
      rows: [{ month: "2026-05-01", closed_at: "2026-06-01T10:00:00.000Z", closed_by_username: "owner" }],
      rowCount: 1,
    };
  }
  return { rows: [], rowCount: 0 };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation((sql: string) => Promise.resolve(monthlyRows(sql)));
  mockConnect.mockClear();
  mockRelease.mockClear();
});

describe("Monthly net profit statement", () => {
  test("combines approved event, opex, overhead, payroll, and investments without double-counting staff payments", async () => {
    const res = await request(app)
      .get("/finance/reports/monthly-net-profit?month=2026-05")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.period.closed).toBe(true);
    expect(res.body.treatment.investments).toBe("shown_below_operating_profit");
    expect(res.body.treatment.payroll).toBe("finalized_payroll_runs_deducted_staff_payment_overheads_excluded");

    expect(res.body.totals.eventRevenue).toBe(140000);
    expect(res.body.totals.approvedEventExpenses).toBe(36000);
    expect(res.body.totals.eventGrossProfit).toBe(104000);
    expect(res.body.totals.operationalExpenses).toBe(2300);
    expect(res.body.breakdowns.payroll.nonPayrollOverhead).toBe(95900);
    expect(res.body.breakdowns.payroll.staffPaymentOverheadExcluded).toBe(63600);
    expect(res.body.totals.payrollExpenses).toBe(72000);
    expect(res.body.totals.overheadExpenses).toBe(95900);
    expect(res.body.totals.operatingProfit).toBe(-66200);
    expect(res.body.totals.approvedInvestments).toBe(37000);
    expect(res.body.totals.netAfterInvestments).toBe(-66200);
    expect(res.body.totals.pendingExposure).toBe(17750);
    expect(res.body.drilldowns.events).toHaveLength(2);
    expect(res.body.drilldowns.payrollRuns[0].title).toBe("May payroll");
  });

  test("can explicitly deduct investments below operating profit", async () => {
    const res = await request(app)
      .get("/finance/reports/monthly-net-profit?month=2026-05&include_investments_in_net=true")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.treatment.investments).toBe("deducted_below_operating_profit");
    expect(res.body.totals.operatingProfit).toBe(-66200);
    expect(res.body.totals.netAfterInvestments).toBe(-103200);
  });

  test("includes staff-payment overhead only when no finalized payroll run exists", async () => {
    mockQuery.mockImplementation((sql: string) => {
      const text = String(sql);
      if (text.includes("COUNT(DISTINCT run.id)::int AS run_count")) {
        return Promise.resolve({ rows: [{ amount: "0.00", run_count: 0, employee_line_count: 0 }], rowCount: 1 });
      }
      if (text.includes("SELECT run.id, run.title")) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve(monthlyRows(sql));
    });

    const res = await request(app)
      .get("/finance/reports/monthly-net-profit?month=2026-05")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.treatment.payroll).toBe("no_finalized_payroll_staff_payment_overheads_included");
    expect(res.body.totals.payrollExpenses).toBe(0);
    expect(res.body.totals.overheadExpenses).toBe(159500);
    expect(res.body.breakdowns.payroll.staffPaymentOverheadIncluded).toBe(63600);
    expect(res.body.totals.operatingProfit).toBe(-57800);
  });

  test("validates month format before database access", async () => {
    const res = await request(app)
      .get("/finance/reports/monthly-net-profit?month=2026-13")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("denies users without finance reporting permission before database access", async () => {
    const res = await request(app)
      .get("/finance/reports/monthly-net-profit?month=2026-05")
      .set("Authorization", `Bearer ${getToken("DRIVER", ["trips:create"])}`);

    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("requires authentication", async () => {
    const res = await request(app).get("/finance/reports/monthly-net-profit?month=2026-05");

    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("Monthly net profit export", () => {
  test("exports bounded CSV with totals and drilldowns", async () => {
    const res = await request(app)
      .get("/finance/reports/monthly-net-profit/export?month=2026-05&format=csv")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Operating Profit");
    expect(res.text).toContain("Hikma Full Package");
    expect(res.text).toContain("Washing Machine");
    expect(mockConnect).toHaveBeenCalled();
  });

  test("blocks and audits exports above maxRows", async () => {
    const res = await request(app)
      .get("/finance/reports/monthly-net-profit/export?month=2026-05&maxRows=1")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(413);
    expect(mockConnect).toHaveBeenCalled();
    expect(mockQuery.mock.calls.some((call) => String(call[0]).includes("INSERT INTO public.activity_logs"))).toBe(true);
  });
});
