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

const PENDING_OVERHEAD = {
  id: "7c3f9b65-2222-4ee7-8b62-41d6e5f00002",
  expense_month: "2026-05-01",
  due_date: null,
  category: "Office Rent",
  payee: "Landlord PLC",
  scope: "Office",
  shared_with: null,
  payment_kind: "overhead",
  employee_id: null,
  is_recurring: true,
  amount: "26500.00",
  notes: "Monthly office rent",
  status: "Pending",
  rejected_reason: null,
  created_by: "user-1",
  approved_by: null,
};

function mockClosureAware(options: { closed?: boolean; existing?: Record<string, unknown> | null; onSql?: (sql: string) => any }) {
  mockQuery.mockImplementation((sql: string) => {
    const text = String(sql);
    const custom = options.onSql?.(text);
    if (custom) return custom;
    if (text.includes("finance_overhead_month_closures") && text.includes("SELECT 1")) {
      return Promise.resolve({ rows: options.closed ? [{ "?column?": 1 }] : [], rowCount: options.closed ? 1 : 0 });
    }
    if (text.includes("FROM payroll_run_employee_lines")) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    if (text.includes("FOR UPDATE")) {
      const existing = options.existing === undefined ? PENDING_OVERHEAD : options.existing;
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

describe("Overheads RBAC", () => {
  test("driver and event manager are denied on register, summary, and mutations", async () => {
    for (const role of ["DRIVER", "EVENT_MANAGER"]) {
      const token = getToken(role);
      const list = await request(app).get("/finance/overheads").set("Authorization", `Bearer ${token}`);
      expect(list.status).toBe(403);
      const summary = await request(app).get("/finance/overheads/summary?month=2026-05").set("Authorization", `Bearer ${token}`);
      expect(summary.status).toBe(403);
      const create = await request(app)
        .post("/finance/overheads")
        .set("Authorization", `Bearer ${token}`)
        .send({ expense_month: "2026-05", category: "Other", amount: 10, scope: "Office", payment_kind: "overhead" });
      expect(create.status).toBe(403);
      const close = await request(app)
        .post("/finance/overheads/months/2026-05/close")
        .set("Authorization", `Bearer ${token}`);
      expect(close.status).toBe(403);
    }
  });

  test("unauthenticated requests are rejected", async () => {
    const res = await request(app).get("/finance/overheads");
    expect(res.status).toBe(401);
  });
});

describe("Overhead register CRUD", () => {
  test("GET /finance/overheads returns a paginated register", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [PENDING_OVERHEAD], rowCount: 1 });

    const res = await request(app)
      .get("/finance/overheads?month=2026-05&scope=Office")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.overheads).toHaveLength(1);
    expect(res.body.overheads[0].amount).toBe(26500);
    expect(res.body.totalPages).toBe(1);
  });

  test("GET /finance/overheads rejects an over-cap limit and a bad month", async () => {
    const overCap = await request(app)
      .get("/finance/overheads?limit=500")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(overCap.status).toBe(400);

    const badMonth = await request(app)
      .get("/finance/overheads?month=2026-13")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(badMonth.status).toBe(400);
  });

  test("POST creates a pending overhead entry with a transactional audit log", async () => {
    const executed: string[] = [];
    mockClosureAware({
      closed: false,
      onSql: (sql) => {
        executed.push(sql);
        if (sql.includes("INSERT INTO finance_overhead_expenses")) {
          return Promise.resolve({ rows: [PENDING_OVERHEAD], rowCount: 1 });
        }
        return undefined;
      },
    });

    const res = await request(app)
      .post("/finance/overheads")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        expense_month: "2026-05",
        category: "Office Rent",
        amount: 26500,
        payee: "Landlord PLC",
        scope: "Office",
        payment_kind: "overhead",
        is_recurring: true,
        notes: "Monthly office rent",
      });

    expect(res.status).toBe(201);
    expect(res.body.overhead.status).toBe("Pending");
    expect(executed.some((sql) => sql.includes("INSERT INTO public.activity_logs"))).toBe(true);
    expect(executed.some((sql) => sql.includes("COMMIT"))).toBe(true);
  });

  test("POST validates payloads: bad month, zero amount, employee link on overhead kind, shared_with outside Shared scope", async () => {
    const badMonth = await request(app)
      .post("/finance/overheads")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ expense_month: "2026-5", category: "Other", amount: 10, scope: "Office", payment_kind: "overhead" });
    expect(badMonth.status).toBe(400);

    const zeroAmount = await request(app)
      .post("/finance/overheads")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ expense_month: "2026-05", category: "Other", amount: 0, scope: "Office", payment_kind: "overhead" });
    expect(zeroAmount.status).toBe(400);

    const badEmployeeLink = await request(app)
      .post("/finance/overheads")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        expense_month: "2026-05",
        category: "Other",
        amount: 10,
        scope: "Office",
        payment_kind: "overhead",
        employee_id: "7c3f9b65-2222-4ee7-8b62-41d6e5f00009",
      });
    expect(badEmployeeLink.status).toBe(400);

    const badShared = await request(app)
      .post("/finance/overheads")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        expense_month: "2026-05",
        category: "Other",
        amount: 10,
        scope: "Office",
        payment_kind: "overhead",
        shared_with: "Koti",
      });
    expect(badShared.status).toBe(400);
  });

  test("POST is blocked when the month is closed", async () => {
    mockClosureAware({ closed: true });

    const res = await request(app)
      .post("/finance/overheads")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ expense_month: "2026-05", category: "Other", amount: 10, scope: "Office", payment_kind: "overhead" });

    expect(res.status).toBe(409);
  });

  test("POST blocks linked staff payments when finalized payroll already covers that employee month", async () => {
    mockClosureAware({
      closed: false,
      onSql: (sql) => {
        if (sql.includes("FROM payroll_run_employee_lines")) {
          return Promise.resolve({ rows: [{ "?column?": 1 }], rowCount: 1 });
        }
        return undefined;
      },
    });

    const res = await request(app)
      .post("/finance/overheads")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        expense_month: "2026-05",
        category: "Salary",
        amount: 12000,
        scope: "Office",
        payment_kind: "staff_payment",
        employee_id: "7c3f9b65-2222-4ee7-8b62-41d6e5f00009",
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("finalized payroll");
  });

  test("PATCH is blocked on approved entries and closed months", async () => {
    mockClosureAware({ closed: false, existing: { ...PENDING_OVERHEAD, status: "Approved" } });
    const locked = await request(app)
      .patch(`/finance/overheads/${PENDING_OVERHEAD.id}`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ amount: 999 });
    expect(locked.status).toBe(409);

    mockClosureAware({ closed: true });
    const closedMonth = await request(app)
      .patch(`/finance/overheads/${PENDING_OVERHEAD.id}`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ amount: 999 });
    expect(closedMonth.status).toBe(409);
  });

  test("PATCH resubmits a rejected entry as pending", async () => {
    mockClosureAware({
      closed: false,
      existing: { ...PENDING_OVERHEAD, status: "Rejected", rejected_reason: "typo" },
      onSql: (sql) => {
        if (sql.includes("UPDATE finance_overhead_expenses") && sql.includes("RETURNING")) {
          return Promise.resolve({ rows: [{ ...PENDING_OVERHEAD, amount: "27000.00", status: "Pending" }], rowCount: 1 });
        }
        return undefined;
      },
    });

    const res = await request(app)
      .patch(`/finance/overheads/${PENDING_OVERHEAD.id}`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ amount: 27000 });

    expect(res.status).toBe(200);
    expect(res.body.overhead.status).toBe("Pending");
    expect(res.body.overhead.amount).toBe(27000);
  });

  test("PATCH blocks changing an entry into a linked staff payment for an employee with finalized payroll", async () => {
    mockClosureAware({
      closed: false,
      onSql: (sql) => {
        if (sql.includes("FROM payroll_run_employee_lines")) {
          return Promise.resolve({ rows: [{ "?column?": 1 }], rowCount: 1 });
        }
        return undefined;
      },
    });

    const res = await request(app)
      .patch(`/finance/overheads/${PENDING_OVERHEAD.id}`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        payment_kind: "staff_payment",
        employee_id: "7c3f9b65-2222-4ee7-8b62-41d6e5f00009",
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("finalized payroll");
  });

  test("PATCH validates cross-field edits before hitting database constraints", async () => {
    mockClosureAware({
      closed: false,
      existing: {
        ...PENDING_OVERHEAD,
        payment_kind: "staff_payment",
        employee_id: "7c3f9b65-2222-4ee7-8b62-41d6e5f00009",
      },
    });
    const badEmployeeLink = await request(app)
      .patch(`/finance/overheads/${PENDING_OVERHEAD.id}`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ payment_kind: "overhead" });
    expect(badEmployeeLink.status).toBe(400);
    expect(badEmployeeLink.body.error).toContain("Employee links");

    mockClosureAware({
      closed: false,
      existing: { ...PENDING_OVERHEAD, scope: "Shared", shared_with: "Koti" },
    });
    const badSharedScope = await request(app)
      .patch(`/finance/overheads/${PENDING_OVERHEAD.id}`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ scope: "Office" });
    expect(badSharedScope.status).toBe(400);
    expect(badSharedScope.body.error).toContain("shared_with");
  });

  test("DELETE soft-deletes an open-month pending entry and is blocked on closed months", async () => {
    const executed: string[] = [];
    mockClosureAware({
      closed: false,
      onSql: (sql) => {
        executed.push(sql);
        return undefined;
      },
    });
    const ok = await request(app)
      .delete(`/finance/overheads/${PENDING_OVERHEAD.id}`)
      .set("Authorization", `Bearer ${getToken()}`);
    expect(ok.status).toBe(200);
    expect(executed.some((sql) => sql.includes("SET deleted_at = NOW()"))).toBe(true);

    mockClosureAware({ closed: true });
    const closedMonth = await request(app)
      .delete(`/finance/overheads/${PENDING_OVERHEAD.id}`)
      .set("Authorization", `Bearer ${getToken()}`);
    expect(closedMonth.status).toBe(409);
  });
});

describe("Overhead approval flow and month closure", () => {
  test("approve locks a pending entry and audits the transition", async () => {
    const executed: string[] = [];
    mockClosureAware({
      closed: false,
      onSql: (sql) => {
        executed.push(sql);
        if (sql.includes("UPDATE finance_overhead_expenses") && sql.includes("RETURNING")) {
          return Promise.resolve({ rows: [{ ...PENDING_OVERHEAD, status: "Approved", approved_by: "user-1" }], rowCount: 1 });
        }
        return undefined;
      },
    });

    const res = await request(app)
      .post(`/finance/overheads/${PENDING_OVERHEAD.id}/approve`)
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.overhead.status).toBe("Approved");
    expect(executed.some((sql) => sql.includes("INSERT INTO public.activity_logs"))).toBe(true);
  });

  test("approve conflicts when entry is not pending or month is closed", async () => {
    mockClosureAware({ closed: false, existing: { ...PENDING_OVERHEAD, status: "Approved" } });
    const notPending = await request(app)
      .post(`/finance/overheads/${PENDING_OVERHEAD.id}/approve`)
      .set("Authorization", `Bearer ${getToken()}`);
    expect(notPending.status).toBe(409);

    mockClosureAware({ closed: true });
    const closedMonth = await request(app)
      .post(`/finance/overheads/${PENDING_OVERHEAD.id}/approve`)
      .set("Authorization", `Bearer ${getToken()}`);
    expect(closedMonth.status).toBe(409);
  });

  test("reject requires a reason", async () => {
    const res = await request(app)
      .post(`/finance/overheads/${PENDING_OVERHEAD.id}/reject`)
      .set("Authorization", `Bearer ${getToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test("close month inserts a closure and audits it; double close conflicts", async () => {
    const executed: string[] = [];
    mockClosureAware({
      closed: false,
      onSql: (sql) => {
        executed.push(sql);
        return undefined;
      },
    });
    const closed = await request(app)
      .post("/finance/overheads/months/2026-05/close")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(closed.status).toBe(200);
    expect(closed.body).toEqual({ month: "2026-05", closed: true });
    expect(executed.some((sql) => sql.includes("INSERT INTO finance_overhead_month_closures"))).toBe(true);
    expect(executed.some((sql) => sql.includes("INSERT INTO public.activity_logs"))).toBe(true);

    mockClosureAware({ closed: true });
    const doubleClose = await request(app)
      .post("/finance/overheads/months/2026-05/close")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(doubleClose.status).toBe(409);
  });

  test("reopen month deletes the closure; reopening an open month conflicts", async () => {
    const executed: string[] = [];
    mockClosureAware({
      closed: true,
      onSql: (sql) => {
        executed.push(sql);
        return undefined;
      },
    });
    const reopened = await request(app)
      .post("/finance/overheads/months/2026-05/reopen")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(reopened.status).toBe(200);
    expect(executed.some((sql) => sql.includes("DELETE FROM finance_overhead_month_closures"))).toBe(true);

    mockClosureAware({ closed: false });
    const notClosed = await request(app)
      .post("/finance/overheads/months/2026-05/reopen")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(notClosed.status).toBe(409);
  });
});

describe("Overhead monthly summary", () => {
  test("summary groups workbook blocks and segregates staff payments from non-payroll overhead", async () => {
    mockQuery.mockImplementation((sql: string) => {
      const text = String(sql);
      if (text.includes("GROUP BY scope, payment_kind")) {
        return Promise.resolve({
          rows: [
            { scope: "Office", payment_kind: "staff_payment", approved_amount: "33000.00", pending_amount: "0.00", pending_count: 0 },
            { scope: "Store", payment_kind: "staff_payment", approved_amount: "30600.00", pending_amount: "0.00", pending_count: 0 },
            { scope: "Shared", payment_kind: "staff_payment", approved_amount: "6000.00", pending_amount: "0.00", pending_count: 0 },
            { scope: "Shared", payment_kind: "overhead", approved_amount: "5000.00", pending_amount: "0.00", pending_count: 0 },
            { scope: "General", payment_kind: "overhead", approved_amount: "95900.00", pending_amount: "1500.00", pending_count: 2 },
          ],
          rowCount: 5,
        });
      }
      if (text.includes("GROUP BY category")) {
        return Promise.resolve({
          rows: [
            { category: "Office Rent", approved_amount: "26500.00" },
            { category: "Marketing/Boost", approved_amount: "25000.00" },
          ],
          rowCount: 2,
        });
      }
      if (text.includes("finance_overhead_month_closures")) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const res = await request(app)
      .get("/finance/overheads/summary?month=2026-05")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    // Workbook math: office staff 33000, store staff 30600 (grand 63600),
    // shared 11000, rental & other 95900 (grand 106900), subtotal 170500.
    expect(res.body.blocks.officeStaff).toBe(33000);
    expect(res.body.blocks.storeStaff).toBe(30600);
    expect(res.body.blocks.grandOfficeStore).toBe(63600);
    expect(res.body.blocks.shared).toBe(11000);
    expect(res.body.blocks.rentalAndOther).toBe(95900);
    expect(res.body.blocks.grandSharedRental).toBe(106900);
    expect(res.body.totals.subtotalMonthly).toBe(170500);
    // Payroll double-count guard: staff payments reported separately.
    expect(res.body.totals.staffPayments).toBe(69600);
    expect(res.body.totals.nonPayrollOverhead).toBe(100900);
    expect(res.body.totals.pendingExposure).toBe(1500);
    expect(res.body.closed).toBe(false);
    expect(res.body.byCategory[0].category).toBe("Office Rent");
  });

  test("summary requires a valid month", async () => {
    const res = await request(app)
      .get("/finance/overheads/summary")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(res.status).toBe(400);
  });
});
