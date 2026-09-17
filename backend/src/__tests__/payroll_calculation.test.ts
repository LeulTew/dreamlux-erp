import { describe, test, expect, beforeEach, beforeAll, mock } from "bun:test";
import express from "express";
import request from "supertest";
import { getToken } from "./setup_helpers";
import "./setup";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { PayrollPersistenceFixture } from "./payroll-persistence-fixture";

let db: PayrollPersistenceFixture;

// ─── Constants ───────────────────────────────────────────────────────────────
const AUTH = () => `Bearer ${getToken()}`;
const EMPLOYEE_ID = "550e8400-e29b-41d4-a716-446655440000";
const EVENT_TYPE_ID = "660e8400-e29b-41d4-a716-446655440001";
const LEVEL_L1_ID = "770e8400-e29b-41d4-a716-446655440001";
const LEVEL_L2_ID = "770e8400-e29b-41d4-a716-446655440002";

// ─── App setup ───────────────────────────────────────────────────────────────
let app: import("express").Application;

beforeAll(async () => {
  const { default: payroll } = await import("../routes/payroll");
  app = express();
  app.use(express.json());
  app.use("/payroll", requireAuth, payroll);
});

beforeEach(() => {
  db = new PayrollPersistenceFixture();
  pool.query = db.query as unknown as typeof pool.query;
  pool.connect = mock(async () => ({ query: db.query, release: db.release })) as unknown as typeof pool.connect;
});

describe("Authoritative verified-attendance payroll pricing", () => {

  test("ignores a client override and uses the recorded attended commission", async () => {
    db.sources = {
      commissions: [{ employee_id: EMPLOYEE_ID, event_type_id: EVENT_TYPE_ID, quantity: 1, commission_total: 2000 }],
      event_types: [{
          id: EVENT_TYPE_ID,
          name: "Wedding",
        }],
      employees: [{
          id: EMPLOYEE_ID,
          full_name: "Synthetic Operations Manager",
          salary_level: "L1",
          base_salary: 0,
          profile_photo_key: null,
          event_prices: { [EVENT_TYPE_ID]: 999 }
        }],
      salary_levels: [{ id: LEVEL_L1_ID, code: "L1", amount_etb: 35000 }],
    };

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
              price_override: 9999
            }],
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.employee_lines[0].total_events_value).toBe(2000);
    expect(res.body.total_payroll_value).toBe(37000);
  });

  test("uses the attended assignment total rather than the employee rate", async () => {
    db.sources = {
      commissions: [{ employee_id: EMPLOYEE_ID, event_type_id: EVENT_TYPE_ID, quantity: 2, commission_total: 4000 }],
      event_types: [{
          id: EVENT_TYPE_ID,
          name: "Wedding",
        }],
      employees: [{
          id: EMPLOYEE_ID,
          full_name: "Synthetic Planner",
          salary_level: "L2",
          base_salary: 0,
          profile_photo_key: null,
          event_prices: { [EVENT_TYPE_ID]: 999 }
        }],
      salary_levels: [{ id: LEVEL_L2_ID, code: "L2", amount_etb: 14500 }],
    };

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
    expect(res.body.employee_lines[0].total_events_value).toBe(4000);
    expect(res.body.total_payroll_value).toBe(18500);
  });

  test("excludes commission when no attended assignment is recorded", async () => {
    db.sources = {
      commissions: [],
      event_types: [{
          id: EVENT_TYPE_ID,
          name: "Wedding",
        }],
      employees: [{ id: EMPLOYEE_ID, full_name: "Synthetic Store Keeper", salary_level: "L1", base_salary: 0, profile_photo_key: null, event_prices: {} }],
      salary_levels: [{ id: LEVEL_L1_ID, code: "L1", amount_etb: 10000 }],
    };

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
    expect(res.body.employee_lines[0].total_events_value).toBe(0);
    expect(res.body.total_payroll_value).toBe(10000);
  });

  test("finalize persists the verified assignment commission snapshot", async () => {
    db.sources = {
      commissions: [{ employee_id: EMPLOYEE_ID, event_type_id: EVENT_TYPE_ID, quantity: 1, commission_total: 2000 }],
      event_types: [{
          id: EVENT_TYPE_ID,
          name: "Wedding",
        }],
      employees: [{ id: EMPLOYEE_ID, full_name: "Synthetic Guard Loader", salary_level: "L1", base_salary: 0, event_prices: { [EVENT_TYPE_ID]: 999 } }],
      salary_levels: [{ id: LEVEL_L1_ID, code: "L1", amount_etb: 7000 }],
    };

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
    expect(db.state.employeeLines[0]).toMatchObject({ base_salary_snapshot: 7000, commission_total_snapshot: 2000, employee_total_snapshot: 9000 });
    expect(db.state.events[0]).toMatchObject({ unit_price_snapshot: 2000, quantity: 1, line_total_snapshot: 2000 });
    expect(db.state.audits[0]).toMatchObject({ action: "finalized", total_payroll_snapshot: 9000 });
  });
});
