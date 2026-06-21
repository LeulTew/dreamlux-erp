import { describe, test, expect, beforeEach, beforeAll, mock } from "bun:test";
import request from "supertest";
import { getToken } from "./setup_helpers";
import "./setup";

// ─── Local mock wiring ───────────────────────────────────────────────────────
const mockQuery = mock(() => Promise.resolve({ rows: [] as any[] }));

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
    insert: () => fakeChain(isSingle),
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
const EMPLOYEE_ID = "550e8400-e29b-41d4-a716-446655440000";
const EVENT_TYPE_ID = "660e8400-e29b-41d4-a716-446655440001";
const LEVEL_L1_ID = "770e8400-e29b-41d4-a716-446655440001";
const LEVEL_L2_ID = "770e8400-e29b-41d4-a716-446655440002";

// ─── App setup ───────────────────────────────────────────────────────────────
let app: import("express").Application;

beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

beforeEach(() => mockQuery.mockReset());

describe("Decentralized Pricing Logic (Manual > Employee Price > 0)", () => {
  
  test("Priority 1: Manual Override should win", async () => {
    mockQuery
      // event_types (metadata only)
      .mockResolvedValueOnce({
        rows: [{ 
          id: EVENT_TYPE_ID, 
          name: "Wedding", 
        }],
      })
      // employees (has 2500 set in event_prices)
      .mockResolvedValueOnce({
        rows: [{ 
          id: EMPLOYEE_ID, 
          full_name: "Tester", 
          salary_level: "L1", 
          base_salary: 0, 
          profile_photo_key: null,
          event_prices: { [EVENT_TYPE_ID]: 2500 }
        }],
      })
      // salary_levels
      .mockResolvedValueOnce({
        rows: [{ id: LEVEL_L1_ID, code: "L1", amount_etb: 5000 }],
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
            events: [{ 
              event_type_id: EVENT_TYPE_ID, 
              quantity: 1, 
              price_override: 5000 // Manual override is 5000
            }],
          },
        ],
      });

    expect(res.status).toBe(200);
    // Base 5000 + Manual Override 5000 = 10000
    // It should NOT use employee-specific (2500)
    expect(res.body.employee_lines[0].total_events_value).toBe(5000);
    expect(res.body.total_payroll_value).toBe(10000);
  });

  test("Priority 2: Employee-Specific Price should win over 0", async () => {
    mockQuery
      // event_types
      .mockResolvedValueOnce({
        rows: [{ 
          id: EVENT_TYPE_ID, 
          name: "Wedding", 
        }],
      })
      // employees
      .mockResolvedValueOnce({
        rows: [{ 
          id: EMPLOYEE_ID, 
          full_name: "Tester L2", 
          salary_level: "L2", 
          base_salary: 0, 
          profile_photo_key: null,
          event_prices: { [EVENT_TYPE_ID]: 3500 } // Employee override
        }],
      })
      // salary_levels
      .mockResolvedValueOnce({
        rows: [{ id: LEVEL_L2_ID, code: "L2", amount_etb: 8000 }],
      });

    const res = await request(app)
      .post("/payroll/preview")
      .set("Authorization", AUTH())
      .send({
        month: 4,
        year: 2026,
        period_kind: "half_month",
        employeeLineEvents: [
          {
            employee_id: EMPLOYEE_ID,
            events: [{ 
              event_type_id: EVENT_TYPE_ID, 
              quantity: 1, 
              price_override: null // No manual override
            }],
          },
        ],
      });

    expect(res.status).toBe(200);
    // Base 8000 + Employee Override 3500 = 11500
    expect(res.body.employee_lines[0].total_events_value).toBe(3500);
    expect(res.body.total_payroll_value).toBe(11500);
  });

  test("Priority 3: Default Price 0 strictly enforced when no rates set", async () => {
    mockQuery
      // event_types
      .mockResolvedValueOnce({
        rows: [{ 
          id: EVENT_TYPE_ID, 
          name: "Wedding", 
        }],
      })
      // employees (no event_prices set)
      .mockResolvedValueOnce({
        rows: [{ id: EMPLOYEE_ID, full_name: "Tester L1", salary_level: "L1", base_salary: 0, profile_photo_key: null, event_prices: {} }],
      })
      // salary_levels
      .mockResolvedValueOnce({
        rows: [{ id: LEVEL_L1_ID, code: "L1", amount_etb: 5000 }],
      });

    const res = await request(app)
      .post("/payroll/preview")
      .set("Authorization", AUTH())
      .send({
        month: 4,
        year: 2026,
        period_kind: "half_month",
        employeeLineEvents: [
          {
            employee_id: EMPLOYEE_ID,
            events: [{ 
              event_type_id: EVENT_TYPE_ID, 
              quantity: 1, 
              price_override: null 
            }],
          },
        ],
      });

    expect(res.status).toBe(200);
    // Base 5000 + Default 0 = 5000
    expect(res.body.employee_lines[0].total_events_value).toBe(0);
    expect(res.body.total_payroll_value).toBe(5000);
  });

  test("Finalize route correctly persists the employee price in snapshot", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // 1. Duplicate check
      .mockResolvedValueOnce({
        rows: [{ 
          id: EVENT_TYPE_ID, 
          name: "Wedding", 
        }],
      }) // 2. Event types
      .mockResolvedValueOnce({
        rows: [{ id: EMPLOYEE_ID, full_name: "Abera", salary_level: "L1", base_salary: 0, event_prices: { [EVENT_TYPE_ID]: 2500 } }]
      }) // 3. Employees
      .mockResolvedValueOnce({
        rows: [{ id: LEVEL_L1_ID, code: "L1", amount_etb: 7000 }]
      }) // 4. Salary levels
      .mockResolvedValueOnce({ rows: [{ id: "run-999" }] }) // 5. Insert run
      .mockResolvedValueOnce({ rows: [{ id: "line-999" }] }) // 6. Insert line
      .mockResolvedValueOnce({ rows: [] }) // 7. Insert event rows (batch)
      .mockResolvedValueOnce({ rows: [] }); // 8. Insert audit log

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
            events: [{ 
              event_type_id: EVENT_TYPE_ID, 
              quantity: 1, 
              price_override: null 
            }],
          },
        ],
      });

    expect(res.status).toBe(201);
  });
});
