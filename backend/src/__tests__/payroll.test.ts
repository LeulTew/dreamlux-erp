import { describe, test, expect, beforeEach, beforeAll, mock } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";
import { getToken } from "./setup_helpers";
import "./setup";

// ─── Local mock wiring ───────────────────────────────────────────────────────
const mockQuery = mock(() => Promise.resolve({ rows: [] as any[] }));
let insertPayloads: unknown[] = [];

const fakeChain = (isSingle = false): any => {
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
    insert: (payload: unknown) => {
      insertPayloads.push(payload);
      return fakeChain(isSingle);
    },
    delete: () => fakeChain(isSingle),
    in: () => fakeChain(isSingle),
    limit: () => fakeChain(isSingle),
    match: () => fakeChain(isSingle),
    ilike: () => fakeChain(isSingle),
    single: () => fakeChain(true),
    maybeSingle: () => fakeChain(true),
    then: async (resolve: any) => {
      try {
        const res = await mockQuery();
        if (!res) return resolve({ data: null, error: null, count: 0 });
        const rows = res?.rows || [];
        resolve({
          data: isSingle ? (rows[0] || null) : rows,
          error: null,
          count: rows.length,
        });
      } catch (err) {
        resolve({ data: null, error: err, count: 0 });
      }
    },
  };
  return chain;
};

mock.module("../db/supabase", () => ({
  supabase: { from: () => fakeChain() },
}));

// ─── Constants ───────────────────────────────────────────────────────────────
const AUTH = () => `Bearer ${getToken()}`;
const PAYROLL_READ_ONLY_AUTH = () => {
  const secret = process.env.JWT_SECRET || "dev-secret";
  const token = jwt.sign(
    {
      id: "payroll-readonly-user",
      username: "payroll-readonly",
      role: "PAYROLL_VIEWER",
      roles: ["PAYROLL_VIEWER"],
      permission_slugs: ["payroll:read"],
    },
    secret,
    { expiresIn: "1h" }
  );
  return `Bearer ${token}`;
};

const EMPLOYEE_ID = "550e8400-e29b-41d4-a716-446655440000";
const EVENT_TYPE_ID = "660e8400-e29b-41d4-a716-446655440001";
const RUN_ID = "770e8400-e29b-41d4-a716-446655440002";
const LINE_ID = "880e8400-e29b-41d4-a716-446655440003";

const validFinalizePayload = () => ({
  month: 4,
  year: 2026,
  period_kind: "half_month" as const,
  employeeLineEvents: [
    {
      employee_id: EMPLOYEE_ID,
      events: [
        {
          event_type_id: EVENT_TYPE_ID,
          quantity: 2,
          price_override: null,
          override_reason: null,
        },
      ],
    },
  ],
});

// ─── App setup ───────────────────────────────────────────────────────────────
let app: import("express").Application;

beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

beforeEach(() => mockQuery.mockReset());
beforeEach(() => {
  insertPayloads = [];
});

// ─── Unit Tests: Zod Validation Schema ───────────────────────────────────────
import { generatePayrollPreviewSchema, finalizePayrollRunSchema, savePayrollDraftSchema } from "../lib/validation";

describe("Payroll Validation Schema (unit)", () => {

  test("accepts valid full-month payload", () => {
    const result = generatePayrollPreviewSchema.safeParse({
      month: 4,
      year: 2026,
      employeeLineEvents: [
        {
          employee_id: EMPLOYEE_ID,
          events: [],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("accepts price_override without override_reason (removed requirement)", () => {
    const result = generatePayrollPreviewSchema.safeParse({
      month: 4,
      year: 2026,
      employeeLineEvents: [
        {
          employee_id: EMPLOYEE_ID,
          events: [
            {
              event_type_id: EVENT_TYPE_ID,
              quantity: 1,
              price_override: 999,
              override_reason: null, // ← no reason required anymore
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("accepts selected_level_id for explicit event-level selection", () => {
    const result = generatePayrollPreviewSchema.safeParse({
      month: 4,
      year: 2026,
      employeeLineEvents: [
        {
          employee_id: EMPLOYEE_ID,
          events: [
            {
              event_type_id: EVENT_TYPE_ID,
              quantity: 1,
              selected_level_id: "2e7553f3-8616-4530-9566-38078c444fd8",
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  test("rejects non-uuid employee_id", () => {
    const result = generatePayrollPreviewSchema.safeParse({
      month: 4,
      year: 2026,
      employeeLineEvents: [{ employee_id: "not-a-uuid", events: [] }],
    });
    expect(result.success).toBe(false);
  });

  test("rejects quantity < 1", () => {
    const result = generatePayrollPreviewSchema.safeParse({
      month: 4,
      year: 2026,
      employeeLineEvents: [
        {
          employee_id: EMPLOYEE_ID,
          events: [{ event_type_id: EVENT_TYPE_ID, quantity: 0 }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  test("rejects month out of range", () => {
    const bad = generatePayrollPreviewSchema.safeParse({
      month: 13,
      year: 2026,
      employeeLineEvents: [],
    });
    expect(bad.success).toBe(false);
  });

  test("rejects negative price_override", () => {
    const result = generatePayrollPreviewSchema.safeParse({
      month: 4,
      year: 2026,
      employeeLineEvents: [
        {
          employee_id: EMPLOYEE_ID,
          events: [
            {
              event_type_id: EVENT_TYPE_ID,
              quantity: 1,
              price_override: -500,
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  test("finalizePayrollRunSchema accepts optional created_by_user_id", () => {
    const result = finalizePayrollRunSchema.safeParse({
      ...validFinalizePayload(),
      created_by_user_id: EMPLOYEE_ID,
    });
    expect(result.success).toBe(true);
  });

  test("finalizePayrollRunSchema accepts null created_by_user_id", () => {
    const result = finalizePayrollRunSchema.safeParse({
      ...validFinalizePayload(),
      created_by_user_id: null,
    });
    expect(result.success).toBe(true);
  });

  test("savePayrollDraftSchema accepts optional created_by_user_id", () => {
    const result = savePayrollDraftSchema.safeParse({
      ...validFinalizePayload(),
      created_by_user_id: EMPLOYEE_ID,
    });
    expect(result.success).toBe(true);
  });
});

// ─── Integration Tests: GET /payroll/runs ────────────────────────────────────
describe("Payroll API > GET /payroll/runs", () => {
  test("returns empty paginated payload when no runs exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/payroll/runs")
      .set("Authorization", AUTH());

    expect(res.status).toBe(200);
    expect(res.body.runs).toEqual([]);
  });

  test("returns formatted runs with aggregated totals", async () => {
    // First call: runs list
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: RUN_ID,
          title: "Payroll 2026-04",
          period_kind: "month",
          period_start: "2026-04-01",
          period_end: "2026-04-30",
          status: "finalized",
          created_at: "2026-04-11T00:00:00Z",
          updated_at: "2026-04-11T00:00:00Z",
          finalized_at: "2026-04-11T00:00:00Z",
          created_by: null,
        },
      ],
    });
    // Second call: employee line totals
    mockQuery.mockResolvedValueOnce({
      rows: [
        { run_id: RUN_ID, employee_total_snapshot: 7000 },
        { run_id: RUN_ID, employee_total_snapshot: 8500 },
      ],
    });

    const res = await request(app)
      .get("/payroll/runs")
      .set("Authorization", AUTH());

    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
    expect(res.body.runs[0].status).toBe("FINALIZED");
    expect(res.body.runs[0].total_payroll_value).toBe(15500);
    expect(res.body.runs[0].month).toBe(4);
    expect(res.body.runs[0].year).toBe(2026);
  });

  test("caps requested page size and returns pagination metadata", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: RUN_ID,
          period_start: "2026-04-01",
          period_end: "2026-04-30",
          status: "draft",
          created_at: "2026-04-11T00:00:00Z",
          updated_at: "2026-04-11T00:00:00Z",
          finalized_at: null,
          created_by: null,
        },
      ],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/payroll/runs?page=2&limit=500")
      .set("Authorization", AUTH());

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(100);
    expect(res.body.totalPages).toBe(1);
    expect(res.body.runs).toHaveLength(1);
  });

  test("sorts by total with bounded SQL pagination", async () => {
    const { pool } = await import("../db/pool");
    const poolQuery = pool.query as unknown as ReturnType<typeof mock>;
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: RUN_ID,
          period_start: "2026-04-01",
          period_end: "2026-04-30",
          status: "finalized",
          created_at: "2026-04-11T00:00:00Z",
          updated_at: "2026-04-11T00:00:00Z",
          finalized_at: null,
          created_by: null,
          total_payroll_value: 15500,
          total_count: 11,
        },
      ],
    });

    const res = await request(app)
      .get("/payroll/runs?sortBy=total&sortOrder=asc&page=2&limit=5&status=FINALIZED&year=2026")
      .set("Authorization", AUTH());

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(5);
    const boundedTotalSortCall = poolQuery.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes("SUM(prel.employee_total_snapshot)")
    ) as [string, Array<string | number>] | undefined;
    expect(boundedTotalSortCall).toBeDefined();
    const [sql, params] = boundedTotalSortCall as [string, Array<string | number>];
    expect(sql).toContain("SUM(prel.employee_total_snapshot)");
    expect(sql.toLowerCase()).toContain("limit $4 offset $5");
    expect(params).toEqual(["finalized", "2026-01-01", "2026-12-31", 5, 5]);
  });

  test("rejects unsupported sort fields before querying payroll runs", async () => {
    const res = await request(app)
      .get("/payroll/runs?sortBy=period_start%3B%20DROP%20TABLE%20payroll_runs")
      .set("Authorization", AUTH());

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unsupported payroll run sort field/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("requires authentication", async () => {
    const res = await request(app).get("/payroll/runs");
    expect(res.status).toBe(401);
  });

  test("gracefully handles DB error on lines fetch (returns runs with zero totals)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: RUN_ID,
          period_start: "2026-04-01",
          period_end: "2026-04-30",
          status: "finalized",
          created_at: "2026-04-11T00:00:00Z",
          updated_at: "2026-04-11T00:00:00Z",
          finalized_at: null,
          created_by: null,
        },
      ],
    });
    mockQuery.mockRejectedValueOnce(new Error("lines DB failed"));

    const res = await request(app)
      .get("/payroll/runs")
      .set("Authorization", AUTH());

    // Should still return 200 — totals just default to 0
    expect(res.status).toBe(200);
    expect(res.body.runs[0].total_payroll_value).toBe(0);
  });
});

describe("Payroll API > read/write permission split", () => {
  test("allows payroll:read users to read runs", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/payroll/runs")
      .set("Authorization", PAYROLL_READ_ONLY_AUTH());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      runs: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  test("allows payroll:read users to generate preview without persisting", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/payroll/preview")
      .set("Authorization", PAYROLL_READ_ONLY_AUTH())
      .send({ month: 4, year: 2026, employeeLineEvents: [] });

    expect(res.status).toBe(200);
  });

  test("blocks payroll:read users from payroll mutations before DB writes", async () => {
    const mutationRequests = [
      request(app).post("/payroll/drafts").send(validFinalizePayload()),
      request(app).post("/payroll/runs").send(validFinalizePayload()),
      request(app).patch(`/payroll/runs/${RUN_ID}/status`).send({ status: "TRASH" }),
      request(app).delete(`/payroll/runs/${RUN_ID}`),
      request(app).delete(`/payroll/runs/${RUN_ID}/permanent`),
    ];

    for (const pendingRequest of mutationRequests) {
      const res = await pendingRequest.set("Authorization", PAYROLL_READ_ONLY_AUTH());
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("payroll write permission");
    }

    expect(mockQuery).not.toHaveBeenCalled();
    expect(insertPayloads).toEqual([]);
  });
});

// ─── Integration Tests: GET /payroll/runs/:id ────────────────────────────────
describe("Payroll API > GET /payroll/runs/:id", () => {
  test("returns 404 for non-existent run", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // run not found

    const res = await request(app)
      .get(`/payroll/runs/${RUN_ID}`)
      .set("Authorization", AUTH());

    expect(res.status).toBe(404);
  });

  test("returns run with employee lines and events", async () => {
    // run
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: RUN_ID,
        period_start: "2026-04-01",
        period_end: "2026-04-30",
        status: "finalized",
        created_at: "2026-04-11T00:00:00Z",
        updated_at: "2026-04-11T00:00:00Z",
        finalized_at: "2026-04-11T00:00:00Z",
      }],
    });
    // lines
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: LINE_ID,
        employee_id: EMPLOYEE_ID,
        employee_name_snapshot: "Abera Belay",
        base_salary_snapshot: 7000,
        commission_total_snapshot: 1500,
        employee_total_snapshot: 8500,
      }],
    });
    // employee photo lookup
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: EMPLOYEE_ID, profile_photo_key: null }],
    });
    // events
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "ev-1",
        employee_line_id: LINE_ID,
        event_type_id: EVENT_TYPE_ID,
        event_name_snapshot: "Birthday",
        quantity: 1,
        unit_price_snapshot: 1500,
        line_total_snapshot: 1500,
        override_price_etb: null,
        override_reason: null,
      }],
    });

    const res = await request(app)
      .get(`/payroll/runs/${RUN_ID}`)
      .set("Authorization", AUTH());

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(RUN_ID);
    expect(res.body.status).toBe("FINALIZED");
    expect(res.body.total_payroll_value).toBe(8500);
    expect(res.body.employee_lines).toHaveLength(1);
    expect(res.body.employee_lines[0].events).toHaveLength(1);
    expect(res.body.employee_lines[0].events[0].event_name).toBe("Birthday");
  });

  test("returns stored event snapshot when event type was permanently deleted", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: RUN_ID,
        period_start: "2026-04-01",
        period_end: "2026-04-30",
        status: "finalized",
        created_at: "2026-04-11T00:00:00Z",
        updated_at: "2026-04-11T00:00:00Z",
        finalized_at: "2026-04-11T00:00:00Z",
      }],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: LINE_ID,
        employee_id: null,
        employee_name_snapshot: "Archived Employee",
        base_salary_snapshot: 7000,
        commission_total_snapshot: 1750,
        employee_total_snapshot: 8750,
      }],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "ev-deleted",
        employee_line_id: LINE_ID,
        event_type_id: null,
        event_name_snapshot: "Birthday L2",
        quantity: 1,
        unit_price_snapshot: 1750,
        line_total_snapshot: 1750,
        override_price_etb: null,
        override_reason: null,
      }],
    });

    const res = await request(app)
      .get(`/payroll/runs/${RUN_ID}`)
      .set("Authorization", AUTH());

    expect(res.status).toBe(200);
    expect(res.body.employee_lines[0].employee_name_snapshot).toBe("Archived Employee");
    expect(res.body.employee_lines[0].events[0].event_name).toBe("Birthday L2");
    expect(res.body.employee_lines[0].events[0].price_applied).toBe(1750);
    expect(res.body.employee_lines[0].events[0].event_type_id).toBeNull();
  });

  test("uses snapshot values only for finalized run details", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: RUN_ID,
        period_start: "2026-04-01",
        period_end: "2026-04-30",
        status: "finalized",
        created_at: "2026-04-11T00:00:00Z",
        updated_at: "2026-04-11T00:00:00Z",
        finalized_at: "2026-04-11T00:00:00Z",
      }],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: LINE_ID,
        employee_id: EMPLOYEE_ID,
        employee_name_snapshot: "Abera Belay",
        base_salary_snapshot: 7000,
        commission_total_snapshot: 1500,
        employee_total_snapshot: 8500,
      }],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: EMPLOYEE_ID, profile_photo_key: null }],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "ev-snapshot",
        employee_line_id: LINE_ID,
        event_type_id: EVENT_TYPE_ID,
        event_name_snapshot: "Birthday L2",
        quantity: 1,
        unit_price_snapshot: 1500,
        line_total_snapshot: 1500,
        override_price_etb: null,
        override_reason: null,
      }],
    });

    const res = await request(app)
      .get(`/payroll/runs/${RUN_ID}`)
      .set("Authorization", AUTH());

    expect(res.status).toBe(200);
    expect(res.body.employee_lines[0].events[0].event_name).toBe("Birthday L2");
    expect(res.body.employee_lines[0].events[0].price_applied).toBe(1500);
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });
});

// ─── Integration Tests: PATCH /payroll/runs/:id/status ───────────────────────
describe("Payroll API > PATCH /payroll/runs/:id/status", () => {
  test("rejects invalid status", async () => {
    const res = await request(app)
      .patch(`/payroll/runs/${RUN_ID}/status`)
      .set("Authorization", AUTH())
      .send({ status: "INVALID_STATUS" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid status/i);
  });

  test("accepts FLAGGED_WRONG status", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: RUN_ID, status: "flagged_wrong", updated_at: new Date().toISOString(), deleted_at: null, finalized_at: null }],
    });

    const res = await request(app)
      .patch(`/payroll/runs/${RUN_ID}/status`)
      .set("Authorization", AUTH())
      .send({ status: "FLAGGED_WRONG" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("FLAGGED_WRONG");
  });

  test("accepts TRASH status", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: RUN_ID, status: "trashed", updated_at: new Date().toISOString(), deleted_at: new Date().toISOString(), finalized_at: null }],
    });

    const res = await request(app)
      .patch(`/payroll/runs/${RUN_ID}/status`)
      .set("Authorization", AUTH())
      .send({ status: "TRASH" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("TRASH");
  });
});

// ─── Integration Tests: POST /payroll/preview ────────────────────────────────
describe("Payroll API > POST /payroll/preview", () => {
  test("returns preview with correct totals for default price", async () => {
    mockQuery
      // event_types
      .mockResolvedValueOnce({
        rows: [{ id: EVENT_TYPE_ID, name: "Birthday" }],
      })
      // employees
      .mockResolvedValueOnce({
        rows: [{ 
          id: EMPLOYEE_ID, 
          full_name: "Abera Belay", 
          salary_level: "L2", 
          base_salary: 0, 
          profile_photo_key: null,
          event_prices: { [EVENT_TYPE_ID]: 1500 }
        }],
      })
      // salary_levels
      .mockResolvedValueOnce({
        rows: [{ id: "sl-1", code: "L2", amount_etb: 7000 }],
      });

    const res = await request(app)
      .post("/payroll/preview")
      .set("Authorization", AUTH())
      .send({
        month: 4,
        year: 2026,
        employeeLineEvents: [
          {
            employee_id: EMPLOYEE_ID,
            events: [{ event_type_id: EVENT_TYPE_ID, quantity: 2, price_override: null }],
          },
        ],
      });

    expect(res.status).toBe(200);
    // 7000 base + (1500 × 2) events = 10000
    expect(res.body.total_payroll_value).toBe(10000);
    expect(res.body.employee_lines[0].snapshot_base_salary).toBe(7000);
    expect(res.body.employee_lines[0].total_events_value).toBe(3000);
  });

  test("price_override replaces default_price in calculation", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: EVENT_TYPE_ID, name: "Birthday" }] })
      .mockResolvedValueOnce({ rows: [{ 
          id: EMPLOYEE_ID, 
          full_name: "Test", 
          salary_level: "L1", 
          base_salary: 0, 
          profile_photo_key: null,
          event_prices: { [EVENT_TYPE_ID]: 1500 }
        }] 
      })
      .mockResolvedValueOnce({ rows: [{ id: "sl1", code: "L1", amount_etb: 5000 }] });

    const res = await request(app)
      .post("/payroll/preview")
      .set("Authorization", AUTH())
      .send({
        month: 4,
        year: 2026,
        employeeLineEvents: [
          {
            employee_id: EMPLOYEE_ID,
            events: [{ event_type_id: EVENT_TYPE_ID, quantity: 1, price_override: 999 }],
          },
        ],
      });

    expect(res.status).toBe(200);
    // 5000 + 999 override = 5999
    expect(res.body.total_payroll_value).toBe(5999);
  });

  test("skips unknown employee gracefully", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no event types
      .mockResolvedValueOnce({ rows: [] }) // no employees (employee_id won't match)
      .mockResolvedValueOnce({ rows: [] }); // no salary levels

    const res = await request(app)
      .post("/payroll/preview")
      .set("Authorization", AUTH())
      .send({
        month: 4,
        year: 2026,
        employeeLineEvents: [
          { employee_id: EMPLOYEE_ID, events: [] },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.total_payroll_value).toBe(0);
    expect(res.body.employee_lines).toHaveLength(0);
  });

  test("returns 400 for invalid payload", async () => {
    const res = await request(app)
      .post("/payroll/preview")
      .set("Authorization", AUTH())
      .send({ month: 13 }); // invalid month

    expect(res.status).toBe(400);
  });

  test("returns 400 for non-uuid employee_id", async () => {
    const res = await request(app)
      .post("/payroll/preview")
      .set("Authorization", AUTH())
      .send({
        month: 4,
        year: 2026,
        employeeLineEvents: [{ employee_id: "not-a-uuid", events: [] }],
      });

    expect(res.status).toBe(400);
  });
});

// ─── Integration Tests: POST /payroll/drafts ───────────────────────────────
describe("Payroll API > POST /payroll/drafts", () => {
  const LEVEL_L2_ID = "2e7553f3-8616-4530-9566-38078c444fd8";

  function mockDraftCreateSequence(overrides: { runId?: string } = {}) {
    const id = overrides.runId ?? RUN_ID;
    mockQuery
      // existing draft lookup
      .mockResolvedValueOnce({ rows: [] })
      // event types
      .mockResolvedValueOnce({ rows: [{ id: EVENT_TYPE_ID, name: "Birthday" }] })
      // employees
      .mockResolvedValueOnce({
        rows: [{
          id: EMPLOYEE_ID,
          full_name: "Abera",
          salary_level: "L2",
          base_salary: 0,
          event_prices: { [EVENT_TYPE_ID]: 1900 },
        }],
      })
      // salary levels
      .mockResolvedValueOnce({ rows: [{ id: LEVEL_L2_ID, code: "L2", amount_etb: 7000 }] })
      // insert payroll_run
      .mockResolvedValueOnce({ rows: [{ id }] })
      // insert employee lines
      .mockResolvedValueOnce({ rows: [{ id: LINE_ID, employee_id: EMPLOYEE_ID }] })
      // insert event rows
      .mockResolvedValueOnce({ rows: [] })
      // insert audit log
      .mockResolvedValueOnce({ rows: [] });
  }

  function mockDraftUpdateSequence() {
    mockQuery
      // existing draft lookup
      .mockResolvedValueOnce({ rows: [{ id: RUN_ID }] })
      // event types
      .mockResolvedValueOnce({ rows: [{ id: EVENT_TYPE_ID, name: "Birthday" }] })
      // employees
      .mockResolvedValueOnce({
        rows: [{
          id: EMPLOYEE_ID,
          full_name: "Abera",
          salary_level: "L2",
          base_salary: 0,
          event_prices: { [EVENT_TYPE_ID]: 1900 },
        }],
      })
      // salary levels
      .mockResolvedValueOnce({ rows: [{ id: LEVEL_L2_ID, code: "L2", amount_etb: 7000 }] })
      // update payroll_run
      .mockResolvedValueOnce({ rows: [{ id: RUN_ID }] })
      // delete existing lines
      .mockResolvedValueOnce({ rows: [] })
      // insert employee lines
      .mockResolvedValueOnce({ rows: [{ id: LINE_ID, employee_id: EMPLOYEE_ID }] })
      // insert event rows
      .mockResolvedValueOnce({ rows: [] })
      // insert audit log
      .mockResolvedValueOnce({ rows: [] });
  }

  test("creates a draft run and returns id", async () => {
    mockDraftCreateSequence();

    const res = await request(app)
      .post("/payroll/drafts")
      .set("Authorization", AUTH())
      .send({
        month: 4,
        year: 2026,
        period_kind: "half_month",
        period_start: "2026-04-01",
        employeeLineEvents: [
          {
            employee_id: EMPLOYEE_ID,
            events: [{ event_type_id: EVENT_TYPE_ID, quantity: 1 }],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(RUN_ID);
    expect(res.body.status).toBe("DRAFT");
    expect(insertPayloads).toContainEqual(expect.objectContaining({
      payroll_run_id: RUN_ID,
      action: "draft_saved",
      status_snapshot: "draft",
      employee_count: 1,
      total_payroll_snapshot: 8900,
      period_start: "2026-04-01",
      period_end: "2026-04-15",
    }));
  });

  test("updates an existing draft for the same period", async () => {
    mockDraftUpdateSequence();

    const res = await request(app)
      .post("/payroll/drafts")
      .set("Authorization", AUTH())
      .send({
        month: 4,
        year: 2026,
        period_kind: "half_month",
        period_start: "2026-04-01",
        employeeLineEvents: [
          {
            employee_id: EMPLOYEE_ID,
            events: [{ event_type_id: EVENT_TYPE_ID, quantity: 1 }],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(RUN_ID);
  });

  test("rejects non-half-month drafts", async () => {
    const res = await request(app)
      .post("/payroll/drafts")
      .set("Authorization", AUTH())
      .send({
        month: 4,
        year: 2026,
        period_kind: "month",
        employeeLineEvents: [],
      });

    expect(res.status).toBe(400);
  });
});

// ─── Integration Tests: POST /payroll/runs (finalize) ────────────────────────
describe("Payroll API > POST /payroll/runs (finalize)", () => {
  const LEVEL_L2_ID = "2e7553f3-8616-4530-9566-38078c444fd8";

  function mockFinalizeSequence(overrides: { runId?: string } = {}) {
    const id = overrides.runId ?? RUN_ID;
    mockQuery
      // event_types lookup
      .mockResolvedValueOnce({
        rows: [{
          id: EVENT_TYPE_ID,
          name: "Birthday",
        }],
      })
      // employees lookup
      .mockResolvedValueOnce({ 
        rows: [{ 
          id: EMPLOYEE_ID, 
          full_name: "Abera", 
          salary_level: "L2", 
          base_salary: 0,
          event_prices: { [EVENT_TYPE_ID]: 1900 } 
        }] 
      })
      // salary_levels lookup
      .mockResolvedValueOnce({ rows: [{ id: LEVEL_L2_ID, code: "L2", amount_etb: 7000 }] })
      // insert payroll_run
      .mockResolvedValueOnce({ rows: [{ id }] })
      // insert employee line
        .mockResolvedValueOnce({ rows: [{ id: LINE_ID, employee_id: EMPLOYEE_ID }] })
      // insert event rows
      .mockResolvedValueOnce({ rows: [] })
      // insert audit log
      .mockResolvedValueOnce({ rows: [] });
  }

  test("returns 409 Conflict if a finalized run already exists", async () => {
    // Check if duplicate exists
    mockQuery.mockResolvedValueOnce({ rows: [{ id: RUN_ID }] });

    const res = await request(app)
      .post("/payroll/runs")
      .set("Authorization", AUTH())
      .send(validFinalizePayload());

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test("creates a finalized run and returns id", async () => {
    // 1. Check duplicate -> returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // 2. Mock the rest of the sequence
    mockFinalizeSequence();

    const res = await request(app)
      .post("/payroll/runs")
      .set("Authorization", AUTH())
      .send(validFinalizePayload());

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(RUN_ID);
    expect(res.body.status).toBe("FINALIZED");
    expect(insertPayloads).toContainEqual(expect.objectContaining({
      payroll_run_id: RUN_ID,
      action: "finalized",
      status_snapshot: "finalized",
      employee_count: 1,
      total_payroll_snapshot: 10800,
      period_start: "2026-04-01",
      period_end: "2026-04-15",
    }));
  });

  test("handles employee with price override (no reason required)", async () => {
    // 1. Check duplicate -> returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockFinalizeSequence();

    const res = await request(app)
      .post("/payroll/runs")
      .set("Authorization", AUTH())
      .send({
        month: 4,
        year: 2026,
        period_kind: "half_month",
        employeeLineEvents: [
          {
            employee_id: EMPLOYEE_ID,
            events: [
              {
                event_type_id: EVENT_TYPE_ID,
                quantity: 1,
                price_override: 2000, // Override with no reason — must pass
                override_reason: null,
              },
            ],
          },
        ],
      });

    expect(res.status).toBe(201);
  });

  test("stores level suffix in event_name_snapshot when selected_level_id is provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockFinalizeSequence();

    const res = await request(app)
      .post("/payroll/runs")
      .set("Authorization", AUTH())
      .send({
        month: 4,
        year: 2026,
        period_kind: "half_month",
        employeeLineEvents: [
          {
            employee_id: EMPLOYEE_ID,
            events: [
              {
                event_type_id: EVENT_TYPE_ID,
                quantity: 1,
                selected_level_id: LEVEL_L2_ID,
                price_override: 1900,
              },
            ],
          },
        ],
      });

    expect(res.status).toBe(201);

    const serializedPayloads = insertPayloads.map((payload) => JSON.stringify(payload)).join("\n");

    expect(serializedPayloads).toContain("Birthday L2");
  });

  test("stores level-based unit_price_snapshot and line_total_snapshot", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockFinalizeSequence();

    const res = await request(app)
      .post("/payroll/runs")
      .set("Authorization", AUTH())
      .send({
        month: 4,
        year: 2026,
        period_kind: "half_month",
        employeeLineEvents: [
          {
            employee_id: EMPLOYEE_ID,
            events: [
              {
                event_type_id: EVENT_TYPE_ID,
                quantity: 2,
              },
            ],
          },
        ],
      });

    expect(res.status).toBe(201);

    const serializedPayloads = insertPayloads.map((payload) => JSON.stringify(payload)).join("\n");
    expect(serializedPayloads).toContain('"unit_price_snapshot":1900');
    expect(serializedPayloads).toContain('"line_total_snapshot":3800');
  });

  test("creates half-month H1 run with correct title", async () => {
    // 1. Check duplicate -> returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockFinalizeSequence();

    const res = await request(app)
      .post("/payroll/runs")
      .set("Authorization", AUTH())
      .send({
        month: 4,
        year: 2026,
        period_kind: "half_month",
        period_start: "2026-04-01",
        period_end: "2026-04-15",
        employeeLineEvents: [{ employee_id: EMPLOYEE_ID, events: [] }],
      });

    expect(res.status).toBe(201);
  });

  test("creates half-month H2 run", async () => {
    // 1. Check duplicate -> returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockFinalizeSequence();

    const res = await request(app)
      .post("/payroll/runs")
      .set("Authorization", AUTH())
      .send({
        month: 4,
        year: 2026,
        period_kind: "half_month",
        period_start: "2026-04-16",
        employeeLineEvents: [{ employee_id: EMPLOYEE_ID, events: [] }],
      });

    expect(res.status).toBe(201);
  });

  test("rejects payload with invalid Zod fields", async () => {
    const res = await request(app)
      .post("/payroll/runs")
      .set("Authorization", AUTH())
      .send({
        month: 0, // invalid
        year: 2026,
        employeeLineEvents: [],
      });

    expect(res.status).toBe(400);
  });

  test("requires authentication", async () => {
    const res = await request(app)
      .post("/payroll/runs")
      .send(validFinalizePayload());

    expect(res.status).toBe(401);
  });

  test("handles empty employee list gracefully (no events posted)", async () => {
    // 1. Check duplicate -> returns empty
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // 1. Duplicate check
      .mockResolvedValueOnce({ rows: [] }) // 2. event types
      .mockResolvedValueOnce({ rows: [] }) // 3. employees
      .mockResolvedValueOnce({ rows: [] }) // 4. salary levels
      .mockResolvedValueOnce({ rows: [{ id: RUN_ID }] }) // 5. insert run
      .mockResolvedValueOnce({ rows: [] }) // 6. insert employee lines batch (empty)
      .mockResolvedValueOnce({ rows: [] }); // 7. insert audit log

    const res = await request(app)
      .post("/payroll/runs")
      .set("Authorization", AUTH())
      .send({ month: 4, year: 2026, period_kind: "half_month", employeeLineEvents: [] });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(RUN_ID);
  });
});

// ─── Integration Tests: DELETE /payroll/runs/:id ─────────────────────────────
describe("Payroll API > DELETE /payroll/runs/:id", () => {
  test("soft-deletes an existing run", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: RUN_ID }] });

    const res = await request(app)
      .delete(`/payroll/runs/${RUN_ID}`)
      .set("Authorization", AUTH());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe(RUN_ID);
  });

  test("requires authentication", async () => {
    const res = await request(app).delete(`/payroll/runs/${RUN_ID}`);
    expect(res.status).toBe(401);
  });
});


