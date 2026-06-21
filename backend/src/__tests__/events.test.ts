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

function getToken(role = "SUPER_ADMIN", extra: Record<string, unknown> = {}): string {
  return jwt.sign({ id: "user-1", role, username: "testuser", ...extra }, JWT_SECRET, { expiresIn: "1h" });
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  mockConnect.mockClear();
  mockRelease.mockClear();
});

describe("Events API", () => {
  // Test listing
  test("GET /events returns paginated list of active events", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ count: "1" }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "event-1",
          name: "Lux Wedding",
          client_name: "Betty",
          status: "Planned",
          start_date: "2026-06-20",
          end_date: "2026-06-22",
          venue_location: "Sheraton",
          contract_price: "250000.00",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app)
      .get("/events")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.events[0].name).toBe("Lux Wedding");
  });

  test("GET /events applies allowlisted advanced filters, sorting, summaries, and pagination", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ count: "1" }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "event-1",
          name: "Corporate Gala",
          client_name: "Aster",
          status: "Planned",
          start_date: "2026-07-20",
          end_date: "2026-07-20",
          venue_location: "Hilton",
          contract_price: "100000.00",
          approved_expense_total: 40000,
          estimated_cost_total: 5000,
          net_profit: 60000,
          margin_percentage: 60,
          vehicle_count: 2,
          assigned_staff_count: 8,
          allocation_count: 5,
          checklist_completion_percentage: 75,
          pending_expense_count: 1,
        },
      ],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const filters = encodeURIComponent(JSON.stringify([
      { field: "client_name", operator: "contains", value: "Ast" },
      { field: "net_profit", operator: "greater_than_or_equal", value: 50000 },
      { field: "vehicle_count", operator: "greater_than", value: 1 },
    ]));

    const res = await request(app)
      .get(`/events?filters=${filters}&sortBy=margin_percentage&sortOrder=desc&page=2&limit=25`)
      .set("Authorization", `Bearer ${getToken("OWNER")}`);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(25);
    expect(res.body.events[0].net_profit).toBe(60000);
    expect(res.body.events[0].vehicle_count).toBe(2);

    const countSql = String(mockQuery.mock.calls[0][0]);
    const dataSql = String(mockQuery.mock.calls[1][0]);
    const dataParams = mockQuery.mock.calls[1][1] as unknown[];
    expect(countSql).toContain("LEFT JOIN event_types et");
    expect(dataSql).toContain("ORDER BY CASE WHEN e.contract_price > 0");
    expect(dataSql).toContain("LIMIT $4 OFFSET $5");
    expect(dataParams).toEqual(["%Ast%", 50000, 1, 25, 25]);
  });

  test("GET /events rejects unsupported filter fields instead of interpolating SQL", async () => {
    const filters = encodeURIComponent(JSON.stringify([
      { field: "name; DROP TABLE events; --", operator: "equals", value: "x" },
    ]));

    const res = await request(app)
      .get(`/events?filters=${filters}`)
      .set("Authorization", `Bearer ${getToken("OWNER")}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unsupported event filter field");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("GET /events rejects unsupported sort fields instead of interpolating SQL", async () => {
    const res = await request(app)
      .get("/events?sortBy=name%3B%20DROP%20TABLE%20events")
      .set("Authorization", `Bearer ${getToken("OWNER")}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unsupported event sort field");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("GET /events blocks financial filters and sorting for non-financial users", async () => {
    const filters = encodeURIComponent(JSON.stringify([
      { field: "net_profit", operator: "greater_than", value: 1 },
    ]));

    const filterRes = await request(app)
      .get(`/events?filters=${filters}`)
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`);

    expect(filterRes.status).toBe(403);

    const sortRes = await request(app)
      .get("/events?sortBy=margin_percentage")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`);

    expect(sortRes.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("GET /events enforces pagination bounds", async () => {
    const res = await request(app)
      .get("/events?limit=101")
      .set("Authorization", `Bearer ${getToken("OWNER")}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Number must be less than or equal to 100");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("GET /events redacts derived financial summary fields for non-financial users", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ count: "1" }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "event-1",
          name: "Wedding",
          contract_price: "50000.00",
          estimated_design_cost: "5000.00",
          approved_expense_total: 20000,
          estimated_cost_total: 5000,
          net_profit: 30000,
          margin_percentage: 60,
          pending_expense_count: 1,
          vehicle_count: 1,
        },
      ],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get("/events")
      .set("Authorization", `Bearer ${getToken("DRIVER")}`);

    expect(res.status).toBe(200);
    expect(res.body.events[0].contract_price).toBeUndefined();
    expect(res.body.events[0].approved_expense_total).toBeUndefined();
    expect(res.body.events[0].estimated_cost_total).toBeUndefined();
    expect(res.body.events[0].net_profit).toBeUndefined();
    expect(res.body.events[0].margin_percentage).toBeUndefined();
    expect(res.body.events[0].pending_expense_count).toBeUndefined();
    expect(res.body.events[0].vehicle_count).toBe(1);
  });

  test("GET /events/export returns filtered CSV and audits financial export", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "event-1",
          name: "Corporate Gala",
          client_name: "Aster",
          event_type_name: "Gala",
          status: "Planned",
          start_date: "2026-07-20",
          end_date: "2026-07-20",
          venue_location: "Hilton",
          contract_price: 100000,
          approved_expense_total: 40000,
          net_profit: 60000,
          margin_percentage: 60,
          vehicle_count: 2,
        },
      ],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit

    const filters = encodeURIComponent(JSON.stringify([
      { field: "client_name", operator: "contains", value: "Ast" },
    ]));

    const res = await request(app)
      .get(`/events/export?filters=${filters}&columns=name,client_name,net_profit&format=csv`)
      .set("Authorization", `Bearer ${getToken("OWNER")}`);

    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Event Name,Client Name,Net Profit");
    expect(res.text).toContain("Corporate Gala,Aster,60000");
    expect(String(mockQuery.mock.calls[2][0])).toContain("INSERT INTO event_logs");
    expect((mockQuery.mock.calls[2][1] as unknown[])[2]).toBe("events_export_financial");
  });

  test("GET /events/export redacts financial columns for non-financial export users", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "event-1",
          name: "Wedding",
          client_name: "Betty",
          contract_price: 50000,
          net_profit: 30000,
          vehicle_count: 1,
        },
      ],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit

    const res = await request(app)
      .get("/events/export?columns=name,contract_price,net_profit,vehicle_count")
      .set("Authorization", `Bearer ${getToken("OPS_MANAGER")}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain("Event Name,Vehicle Count");
    expect(res.text).not.toContain("Revenue / Contract Price");
    expect(res.text).not.toContain("Net Profit");
    expect(res.text).not.toContain("50000");
    expect(res.text).toContain("Wedding,1");
  });

  test("GET /events/export enforces large export guardrail before fetching rows", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "1001" }], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // blocked audit

    const res = await request(app)
      .get("/events/export?maxRows=1000")
      .set("Authorization", `Bearer ${getToken("OWNER")}`);

    expect(res.status).toBe(413);
    expect(res.body.total).toBe(1001);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(String(mockQuery.mock.calls[1][0])).toContain("INSERT INTO event_logs");
    expect((mockQuery.mock.calls[1][1] as unknown[])[2]).toBe("events_export_financial_blocked");
  });

  test("GET /events/export blocks unsupported financial filters for non-financial users", async () => {
    const filters = encodeURIComponent(JSON.stringify([
      { field: "net_profit", operator: "greater_than", value: 1 },
    ]));

    const res = await request(app)
      .get(`/events/export?filters=${filters}`)
      .set("Authorization", `Bearer ${getToken("OPS_MANAGER")}`);

    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("GET /events/export/template returns import template for event writers", async () => {
    const res = await request(app)
      .get("/events/export/template")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`);

    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Event Name,Client Name");
    expect(res.text).toContain("DreamLux SRD Wedding Setup");
  });

  test("POST /events/import/preview returns row-level validation errors for unknown event type", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // event type lookup
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit

    const res = await request(app)
      .post("/events/import/preview")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`)
      .send({
        mode: "insert",
        rows: [{
          name: "Imported Wedding",
          client_name: "Aster",
          event_type_name: "Unknown Type",
          start_date: "2026-07-20",
          end_date: "2026-07-20",
          venue_location: "Hilton",
          contract_price: 120000,
        }],
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors[0]).toEqual({ row: 1, field: "event_type_name", message: "Unknown event type: Unknown Type" });
  });

  test("POST /events/import/commit inserts valid rows in one transaction and audits import", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "type-1" }], rowCount: 1 }); // event type lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "event-imported" }], rowCount: 1 }); // insert
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // row audit
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // batch audit
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // COMMIT

    const res = await request(app)
      .post("/events/import/commit")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`)
      .send({
        mode: "insert",
        rows: [{
          name: "Imported Wedding",
          client_name: "Aster",
          event_type_name: "Wedding",
          start_date: "2026-07-20",
          end_date: "2026-07-20",
          venue_location: "Hilton",
          contract_price: 120000,
          package_design_notes: "Imported estimate",
          estimated_design_cost: 30000,
        }],
      });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(true);
    expect(res.body.importedCount).toBe(1);
    expect(res.body.eventIds).toEqual(["event-imported"]);
    expect(String(mockQuery.mock.calls[2][0])).toContain("INSERT INTO events");
    expect(String(mockQuery.mock.calls[4][0])).toContain("INSERT INTO event_logs");
  });

  test("POST /events/import/commit rolls back when update row is missing id", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // ROLLBACK
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // failed audit via pool

    const res = await request(app)
      .post("/events/import/commit")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`)
      .send({
        mode: "update",
        rows: [{
          name: "Imported Wedding",
          client_name: "Aster",
          start_date: "2026-07-20",
          end_date: "2026-07-20",
          venue_location: "Hilton",
          contract_price: 120000,
        }],
      });

    expect(res.status).toBe(400);
    expect(res.body.imported).toBe(false);
    expect(res.body.errors[0].field).toBe("id");
    expect(String(mockQuery.mock.calls[1][0])).toBe("ROLLBACK");
  });

  test("POST /events/import/commit blocks low-permission users", async () => {
    const res = await request(app)
      .post("/events/import/commit")
      .set("Authorization", `Bearer ${getToken("DRIVER")}`)
      .send({ rows: [] });

    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("GET /events/saved-views returns personal, matching role, and global views only", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: "view-personal", name: "Mine", scope: "personal", user_id: "user-1" },
        { id: "view-role", name: "Ops Queue", scope: "role", role_name: "EVENT_MANAGER" },
        { id: "view-global", name: "All Events", scope: "global" },
      ],
      rowCount: 3,
    });

    const res = await request(app)
      .get("/events/saved-views")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`);

    expect(res.status).toBe(200);
    expect(res.body.savedViews).toHaveLength(3);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("LOWER(role_name) = ANY");
    expect(params).toEqual(["user-1", ["event_manager"]]);
  });

  test("POST /events/saved-views creates a personal default view in a transaction", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // clear defaults
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "view-1", name: "My Event View", scope: "personal", user_id: "user-1", is_default: true }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // COMMIT

    const res = await request(app)
      .post("/events/saved-views")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`)
      .send({
        name: "My Event View",
        is_default: true,
        columns: ["name", "status"],
        filters: [{ field: "status", operator: "equals", value: "Planned" }],
        sort: { sortBy: "start_date", sortOrder: "asc" },
        page_size: 50,
      });

    expect(res.status).toBe(201);
    expect(res.body.savedView.name).toBe("My Event View");
    const insertParams = mockQuery.mock.calls[2][1] as unknown[];
    expect(insertParams[1]).toBe("user-1");
    expect(insertParams[2]).toBe("personal");
    expect(insertParams[8]).toBe(true);
  });

  test("POST /events/saved-views blocks role/global sharing without permission", async () => {
    const res = await request(app)
      .post("/events/saved-views")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`)
      .send({
        name: "Role View",
        scope: "role",
        role_name: "EVENT_MANAGER",
      });

    expect(res.status).toBe(403);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  test("POST /events/saved-views allows shared role view with audit log for permitted users", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "view-role", name: "Ops Shared", scope: "role", role_name: "EVENT_MANAGER" }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // COMMIT

    const res = await request(app)
      .post("/events/saved-views")
      .set("Authorization", `Bearer ${getToken("OPS_MANAGER")}`)
      .send({
        name: "Ops Shared",
        scope: "role",
        role_name: "EVENT_MANAGER",
      });

    expect(res.status).toBe(201);
    expect(res.body.savedView.scope).toBe("role");
    expect(String(mockQuery.mock.calls[2][0])).toContain("INSERT INTO event_logs");
  });

  test("PUT /events/saved-views/:viewId blocks editing another user's personal view", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "view-other", name: "Other", scope: "personal", user_id: "other-user" }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // ROLLBACK

    const res = await request(app)
      .put("/events/saved-views/view-other")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`)
      .send({ name: "Nope" });

    expect(res.status).toBe(403);
  });

  test("POST /events/saved-views/:viewId/duplicate duplicates only visible views as personal", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "view-global", name: "Global", scope: "global", columns: ["name"], filters: [], page_size: 20 }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "copy-1", name: "My Copy", scope: "personal", user_id: "user-1" }],
      rowCount: 1,
    });

    const res = await request(app)
      .post("/events/saved-views/view-global/duplicate")
      .set("Authorization", `Bearer ${getToken("DRIVER")}`)
      .send({ name: "My Copy" });

    expect(res.status).toBe(201);
    expect(res.body.savedView.scope).toBe("personal");
    const insertParams = mockQuery.mock.calls[1][1] as unknown[];
    expect(insertParams[1]).toBe("user-1");
  });

  test("PATCH /events/saved-views/:viewId/default clears sibling defaults before setting selected view", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "view-1", scope: "personal", user_id: "user-1", role_name: null }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // clear defaults
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "view-1", scope: "personal", user_id: "user-1", is_default: true }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // COMMIT

    const res = await request(app)
      .patch("/events/saved-views/view-1/default")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`);

    expect(res.status).toBe(200);
    expect(res.body.savedView.is_default).toBe(true);
    expect(String(mockQuery.mock.calls[2][0])).toContain("SET is_default = FALSE");
  });

  test("POST /events/proposals creates draft with calculated profitability and audit log", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "proposal-1",
        name: "Corporate Gala Proposal",
        client_name: "Aster",
        requested_budget: "200000.00",
        estimated_design_cost: "50000.00",
        estimated_team_cost: "24000.00",
        estimated_trip_cost: "10000.00",
        estimated_other_cost: "6000.00",
        estimated_total_cost: "90000.00",
        estimated_net_profit: "110000.00",
        estimated_margin_percentage: "55.00",
        status: "Draft",
      }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // proposal audit
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // COMMIT

    const res = await request(app)
      .post("/events/proposals")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`)
      .send({
        name: "Corporate Gala Proposal",
        client_name: "Aster",
        client_phone: "+251900000000",
        requested_budget: 200000,
        requested_start_date: "2026-07-20",
        requested_end_date: "2026-07-20",
        venue_location: "Hilton",
        cost_breakdown: {
          design: [{ label: "Stage", amount: 50000 }],
          team: [{ label: "Decor crew", amount: 0, people_count: 6, commission_per_person: 4000 }],
          trip: [{ label: "Fuel", amount: 10000 }],
          other: [{ label: "Permits", amount: 6000 }],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.proposal.estimated_net_profit).toBe(110000);
    const insertParams = mockQuery.mock.calls[1][1] as unknown[];
    expect(insertParams[17]).toBe(90000);
    expect(insertParams[18]).toBe(110000);
    expect(String(mockQuery.mock.calls[2][0])).toContain("INSERT INTO event_proposal_logs");
  });

  test("POST /events/proposals blocks low-permission users", async () => {
    const res = await request(app)
      .post("/events/proposals")
      .set("Authorization", `Bearer ${getToken("DRIVER")}`)
      .send({ name: "Blocked", client_name: "Aster", requested_budget: 200000 });

    expect(res.status).toBe(403);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  test("GET /events/proposals applies queue filters and prioritization", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "proposal-1",
        name: "Near Term Gala",
        status: "Submitted",
        requested_budget: "200000.00",
        estimated_total_cost: "90000.00",
        estimated_net_profit: "110000.00",
        estimated_margin_percentage: "55.00",
      }],
      rowCount: 1,
    });

    const res = await request(app)
      .get("/events/proposals?status=Submitted&min_profit=100000&min_margin=40")
      .set("Authorization", `Bearer ${getToken("OPS_MANAGER")}`);

    expect(res.status).toBe(200);
    expect(res.body.proposals[0].estimated_margin_percentage).toBe(55);
    expect(String(mockQuery.mock.calls[1][0])).toContain("p.estimated_net_profit");
    expect(String(mockQuery.mock.calls[1][0])).toContain("p.created_at ASC");
  });

  test("POST /events/proposals/:id/submit moves Draft to Submitted with audit", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "proposal-1", status: "Draft" }], rowCount: 1 }); // lock
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "proposal-1", status: "Submitted" }], rowCount: 1 }); // update
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // COMMIT

    const res = await request(app)
      .post("/events/proposals/proposal-1/submit")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`);

    expect(res.status).toBe(200);
    expect(res.body.proposal.status).toBe("Submitted");
    expect(String(mockQuery.mock.calls[3][0])).toContain("INSERT INTO event_proposal_logs");
  });

  test("POST /events/proposals/:id/reject requires reason and approver permission", async () => {
    const missingReason = await request(app)
      .post("/events/proposals/proposal-1/reject")
      .set("Authorization", `Bearer ${getToken("OPS_MANAGER")}`)
      .send({});

    expect(missingReason.status).toBe(400);

    const noPermission = await request(app)
      .post("/events/proposals/proposal-1/reject")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`)
      .send({ reason: "Low margin" });

    expect(noPermission.status).toBe(403);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  test("POST /events/proposals/:id/convert creates one real event and links proposal atomically", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "proposal-1",
        name: "Approved Gala",
        client_name: "Aster",
        client_phone: "+251900000000",
        event_type_id: "type-1",
        requested_start_date: "2026-07-20",
        requested_end_date: "2026-07-20",
        requested_start_time: "09:00",
        requested_end_time: "18:00",
        venue_location: "Hilton",
        requested_budget: "200000.00",
        package_design_notes: "Decor estimate",
        estimated_design_cost: "50000.00",
        status: "Approved",
        converted_event_id: null,
      }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "event-1", name: "Approved Gala" }], rowCount: 1 }); // insert event
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "proposal-1", status: "Converted", converted_event_id: "event-1" }], rowCount: 1 }); // update proposal
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // proposal audit
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // event audit
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // COMMIT

    const res = await request(app)
      .post("/events/proposals/proposal-1/convert")
      .set("Authorization", `Bearer ${getToken("OPS_MANAGER")}`);

    expect(res.status).toBe(201);
    expect(res.body.event.id).toBe("event-1");
    expect(String(mockQuery.mock.calls[1][0])).toContain("FOR UPDATE");
    expect(String(mockQuery.mock.calls[2][0])).toContain("INSERT INTO events");
    expect(String(mockQuery.mock.calls[2][0])).toContain("event_proposal_id");
    expect(String(mockQuery.mock.calls[3][0])).toContain("converted_event_id IS NULL");
  });

  test("POST /events/proposals/:id/convert blocks duplicate conversion without inserting event", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proposal-1", status: "Converted", converted_event_id: "event-existing" }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // ROLLBACK

    const res = await request(app)
      .post("/events/proposals/proposal-1/convert")
      .set("Authorization", `Bearer ${getToken("OPS_MANAGER")}`);

    expect(res.status).toBe(409);
    expect(res.body.eventId).toBe("event-existing");
    expect(mockQuery.mock.calls.some((call) => String(call[0]).includes("INSERT INTO events"))).toBe(false);
  });

  // Test single event retrieval
  test("GET /events/:id returns event details and audit logs", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "event-1",
          name: "Lux Wedding",
          client_name: "Betty",
          status: "Planned",
          start_date: "2026-06-20",
          end_date: "2026-06-22",
          venue_location: "Sheraton",
          contract_price: "250000.00",
          created_by_name: "Dev User",
        },
      ],
      rowCount: 1,
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "log-1",
          field_changed: "status",
          old_value: "Planned",
          new_value: "Ongoing",
          user_username: "testuser",
          user_full_name: "Test User",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app)
      .get("/events/event-1")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.event.name).toBe("Lux Wedding");
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].field_changed).toBe("status");
  });

  // Test creation
  test("POST /events creates a planned event with valid data", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "event-new",
          name: "Corporate Gala",
          client_name: "TechCorp",
          client_phone: "+251911223344",
          status: "Planned",
          start_date: "2026-07-01",
          end_date: "2026-07-02",
          venue_location: "Hilton",
          contract_price: "150000.00",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`)
      .send({
        name: "Corporate Gala",
        client_name: "TechCorp",
        client_phone: "+251911223344",
        event_type_id: "7891594c-ecc0-4f66-a51f-a29d530587a1",
        start_date: "2026-07-01",
        end_date: "2026-07-02",
        venue_location: "Hilton",
        contract_price: 150000,
      });

    expect(res.status).toBe(201);
    expect(res.body.event.name).toBe("Corporate Gala");
    expect(res.body.event.status).toBe("Planned");
  });

  // Test start_date/end_date validation
  test("POST /events blocks event if end_date precedes start_date", async () => {
    const res = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        name: "Invalid Date Event",
        client_name: "Bad Date",
        start_date: "2026-07-05",
        end_date: "2026-07-04",
        venue_location: "Somewhere",
        contract_price: 1000,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("End date must be on or after start date");
  });

  // Test phone validation
  test("POST /events blocks invalid Ethiopian phone number format", async () => {
    const res = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        name: "Bad Phone Event",
        client_name: "Bad Phone",
        client_phone: "123456789", // not an Ethiopian format
        start_date: "2026-07-01",
        end_date: "2026-07-02",
        venue_location: "Somewhere",
        contract_price: 1000,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid Ethiopian phone number");
  });

  // Test Completed Event Lock (unauthorized edits blocked)
  test("PUT /events/:id blocks edit to Completed event for non-admin/non-accountant roles", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "event-comp",
          status: "Completed",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app)
      .put("/events/event-comp")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`) // Non-admin / Non-accountant
      .send({
        name: "Attempted Name Change",
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Completed events cannot be edited");
  });

  // Test Completed Event Override (authorized edits allowed)
  test("PUT /events/:id allows edit to Completed event for admin", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "event-comp",
          status: "Completed",
          name: "Old Name",
        },
      ],
      rowCount: 1,
    });

    // Mock the audit logs inserts and update query
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Log insert
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "event-comp",
          status: "Completed",
          name: "Updated Name",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app)
      .put("/events/event-comp")
      .set("Authorization", `Bearer ${getToken("SUPER_ADMIN")}`)
      .send({
        name: "Updated Name",
      });

    expect(res.status).toBe(200);
    expect(res.body.event.name).toBe("Updated Name");
  });

  // Test invalid status transitions (Ongoing -> Planned)
  test("PUT /events/:id blocks transition from Ongoing back to Planned", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "event-ongoing",
          status: "Ongoing",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app)
      .put("/events/event-ongoing")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`)
      .send({
        status: "Planned",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Cannot transition event status from Ongoing back to Planned");
  });

  // Test soft delete
  test("DELETE /events/:id soft deletes active event", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "event-1",
          deleted_at: "2026-06-15T00:00:00.000Z",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app)
      .delete("/events/event-1")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // Workspace endpoint
  test("GET /events/:id/workspace returns details, allocations, checklist and assignments", async () => {
    // Event query
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", name: "Wedding" }],
      rowCount: 1,
    });
    // Allocations query
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "alloc-1", item_name: "White Rose", quantity_allocated: 5, status: "Reserved" }],
      rowCount: 1,
    });
    // Checklist query
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "check-1", title: "Setup stage", status: "Todo" }],
      rowCount: 1,
    });
    // Assignments query
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "assign-1", employee_name: "John Doe" }],
      rowCount: 1,
    });

    const res = await request(app)
      .get("/events/event-1/workspace")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.event.name).toBe("Wedding");
    expect(res.body.allocations).toHaveLength(1);
    expect(res.body.checklist).toHaveLength(1);
    expect(res.body.assignments).toHaveLength(1);
  });

  // Design updates
  test("PATCH /events/:id/design updates package design notes and cost", async () => {
    // Event query
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", status: "Planned", package_design_notes: "Old note" }],
      rowCount: 1,
    });
    // Log queries
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // logs notes
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // logs cost
    // Update query
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", package_design_notes: "New theme", estimated_design_cost: 1500 }],
      rowCount: 1,
    });

    const res = await request(app)
      .patch("/events/event-1/design")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        package_design_notes: "New theme",
        estimated_design_cost: 1500,
      });

    expect(res.status).toBe(200);
    expect(res.body.event.package_design_notes).toBe("New theme");
    expect(res.body.event.estimated_design_cost).toBe(1500);
  });

  // Allocation - Success
  test("POST /events/:id/allocations reserves item when stock is available", async () => {
    // Event check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", status: "Planned" }],
      rowCount: 1,
    });
    // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // Item check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "item-1", quantity: 10 }],
      rowCount: 1,
    });
    // Active allocations check
    mockQuery.mockResolvedValueOnce({
      rows: [{ total_allocated: "2" }],
      rowCount: 1,
    });
    // Insert allocation
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "alloc-new", quantity_allocated: 5, status: "Reserved" }],
      rowCount: 1,
    });
    // COMMIT
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post("/events/event-1/allocations")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        item_id: "7891594c-ecc0-4f66-a51f-a29d530587a2",
        quantity_allocated: 5,
        notes: "Test alloc",
      });

    expect(res.status).toBe(201);
    expect(res.body.quantity_allocated).toBe(5);
  });

  // Allocation - Overflow blocked
  test("POST /events/:id/allocations blocks allocation when requested quantity exceeds available stock", async () => {
    // Event check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", status: "Planned" }],
      rowCount: 1,
    });
    // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // Item check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "item-1", quantity: 10 }],
      rowCount: 1,
    });
    // Active allocations check
    mockQuery.mockResolvedValueOnce({
      rows: [{ total_allocated: "8" }],
      rowCount: 1,
    });
    // ROLLBACK
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post("/events/event-1/allocations")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        item_id: "7891594c-ecc0-4f66-a51f-a29d530587a2",
        quantity_allocated: 5,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Requested quantity exceeds available stock");
  });

  // Allocation - Delete
  test("DELETE /events/:id/allocations/:allocationId releases allocation", async () => {
    // Event check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", status: "Planned" }],
      rowCount: 1,
    });
    // Delete allocation
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "alloc-1", status: "Reserved" }],
      rowCount: 1,
    });

    const res = await request(app)
      .delete("/events/event-1/allocations/alloc-1")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // Checklist - Create
  test("POST /events/:id/checklist adds checklist item", async () => {
    // Event check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1" }],
      rowCount: 1,
    });
    // Insert checklist
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "check-1", title: "Setup Stage", status: "Todo" }],
      rowCount: 1,
    });

    const res = await request(app)
      .post("/events/event-1/checklist")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        title: "Setup Stage",
        owner_name: "Abebe",
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Setup Stage");
  });

  // Checklist - Patch
  test("PATCH /events/:id/checklist/:itemId updates status or title", async () => {
    // Event check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1" }],
      rowCount: 1,
    });
    // Update checklist
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "check-1", status: "Done" }],
      rowCount: 1,
    });

    const res = await request(app)
      .patch("/events/event-1/checklist/check-1")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        status: "Done",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Done");
  });

  // Scheduling - GET available employees
  test("GET /events/:id/assignments/available-employees returns active employees not booked on overlapping dates", async () => {
    // Event check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", start_date: "2026-06-20", end_date: "2026-06-22" }],
      rowCount: 1,
    });
    // Available employees
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "emp-1", full_name: "Abebe Girma" }],
      rowCount: 1,
    });

    const res = await request(app)
      .get("/events/event-1/assignments/available-employees")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].full_name).toBe("Abebe Girma");
  });

  // Scheduling - GET available vehicles
  test("GET /events/:id/assignments/available-vehicles returns active vehicles not booked on overlapping dates", async () => {
    // Event check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", start_date: "2026-06-20", end_date: "2026-06-22" }],
      rowCount: 1,
    });
    // Available vehicles
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "veh-1", plate_number: "AA-3-A12345" }],
      rowCount: 1,
    });

    const res = await request(app)
      .get("/events/event-1/assignments/available-vehicles")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].plate_number).toBe("AA-3-A12345");
  });

  // Scheduling - POST Employee Assignment success
  test("POST /events/:id/assignments/employees creates assignment", async () => {
    // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // Event check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", start_date: "2026-06-20", end_date: "2026-06-22", status: "Planned" }],
      rowCount: 1,
    });
    // Employee lock
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "emp-1" }],
      rowCount: 1,
    });
    // Employee team conflict check (returns 0 count)
    mockQuery.mockResolvedValueOnce({
      rows: [{ count: "0" }],
      rowCount: 1,
    });
    // Employee driver conflict check (returns 0 count)
    mockQuery.mockResolvedValueOnce({
      rows: [{ count: "0" }],
      rowCount: 1,
    });
    // Insert assignment
    mockQuery.mockResolvedValueOnce({
      rows: [{ event_id: "event-1", employee_id: "emp-1", role: "Team Leader" }],
      rowCount: 1,
    });
    // COMMIT
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post("/events/event-1/assignments/employees")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        employee_id: "7891594c-ecc0-4f66-a51f-a29d530587a2",
        role: "Team Leader",
        commission_amount: 2000,
      });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("Team Leader");
  });

  // Scheduling - POST Employee Assignment double booking conflict blocked
  test("POST /events/:id/assignments/employees blocks assignment when employee is already booked", async () => {
    // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // Event check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", start_date: "2026-06-20", end_date: "2026-06-22", status: "Planned" }],
      rowCount: 1,
    });
    // Employee lock
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "emp-1" }],
      rowCount: 1,
    });
    // Employee team conflict check (returns 1 count)
    mockQuery.mockResolvedValueOnce({
      rows: [{ count: "1" }],
      rowCount: 1,
    });
    // ROLLBACK
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post("/events/event-1/assignments/employees")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        employee_id: "7891594c-ecc0-4f66-a51f-a29d530587a2",
        role: "Team Leader",
        commission_amount: 2000,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Scheduling Conflict");
  });

  // Scheduling - POST Vehicle Assignment success
  test("POST /events/:id/assignments/vehicles assigns vehicle and driver", async () => {
    // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // Event check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", start_date: "2026-06-20", end_date: "2026-06-22", status: "Planned" }],
      rowCount: 1,
    });
    // Vehicle lock
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "veh-1" }],
      rowCount: 1,
    });
    // Driver lock
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "emp-1" }],
      rowCount: 1,
    });
    // Vehicle conflict check (returns 0 count)
    mockQuery.mockResolvedValueOnce({
      rows: [{ count: "0" }],
      rowCount: 1,
    });
    // Driver team conflict check (returns 0)
    mockQuery.mockResolvedValueOnce({
      rows: [{ count: "0" }],
      rowCount: 1,
    });
    // Driver vehicle conflict check (returns 0)
    mockQuery.mockResolvedValueOnce({
      rows: [{ count: "0" }],
      rowCount: 1,
    });
    // Insert vehicle assignment
    mockQuery.mockResolvedValueOnce({
      rows: [{ event_id: "event-1", vehicle_id: "veh-1", driver_id: "emp-1" }],
      rowCount: 1,
    });
    // COMMIT
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post("/events/event-1/assignments/vehicles")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        vehicle_id: "7891594c-ecc0-4f66-a51f-a29d530587a2",
        driver_id: "7891594c-ecc0-4f66-a51f-a29d530587a2",
        is_night_shift: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.vehicle_id).toBe("veh-1");
  });

  // Scheduling - DELETE Employee Assignment
  test("DELETE /events/:id/assignments/employees/:employeeId removes assignment", async () => {
    // Event check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", status: "Planned" }],
      rowCount: 1,
    });
    // Delete query
    mockQuery.mockResolvedValueOnce({
      rows: [{ event_id: "event-1", employee_id: "emp-1" }],
      rowCount: 1,
    });

    const res = await request(app)
      .delete("/events/event-1/assignments/employees/emp-1")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("removed successfully");
  });

  // Scheduling - Toggle Attendance
  test("PATCH /events/:id/assignments/employees/:employeeId/attendance updates attended field", async () => {
    // Event check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", status: "Planned" }],
      rowCount: 1,
    });
    // Update query
    mockQuery.mockResolvedValueOnce({
      rows: [{ event_id: "event-1", employee_id: "emp-1", attended: false }],
      rowCount: 1,
    });

    const res = await request(app)
      .patch("/events/event-1/assignments/employees/emp-1/attendance")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ attended: false });

    expect(res.status).toBe(200);
    expect(res.body.attended).toBe(false);
  });

  test("POST /events/:id/expenses creates pending manual expense", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", status: "Ongoing" }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "expense-1", category: "Consumables", amount: 1500, status: "Pending" }],
      rowCount: 1,
    });

    const res = await request(app)
      .post("/events/event-1/expenses")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`)
      .send({
        category: "Consumables",
        amount: 1500,
        description: "Water and cleaning material",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("Pending");
  });

  test("POST /events/:id/trips calculates fuel cost and creates pending fuel expense", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "va-1", fuel_consumption_rate: "0.10", plate_number: "AA-3-A12345" }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "trip-1", fuel_liters_used: 5, fuel_cost_etb: 500 }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "expense-fuel-1", category: "Fuel", amount: 500, status: "Pending" }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // COMMIT

    const res = await request(app)
      .post("/events/event-1/trips")
      .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`)
      .send({
        vehicle_assignment_id: "7891594c-ecc0-4f66-a51f-a29d530587a2",
        destination: "Friendship Hotel",
        distance_km: 50,
        fuel_price_etb: 100,
      });

    expect(res.status).toBe(201);
    expect(res.body.fuel_liters_used).toBe(5);
    expect(res.body.fuel_cost_etb).toBe(500);
    expect(res.body.expense.status).toBe("Pending");
  });

  test("GET /events/expenses/pending returns accountant approval queue", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "expense-1", event_name: "Wedding", status: "Pending" }],
      rowCount: 1,
    });

    const res = await request(app)
      .get("/events/expenses/pending")
      .set("Authorization", `Bearer ${getToken("ACCOUNTANT")}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  test("PATCH /events/expenses/:expenseId/review approves pending expense", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "expense-1", event_id: "event-1", category: "Fuel", amount: 1200, status: "Pending" }],
      rowCount: 1,
    }); // JOIN select query
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "expense-1", status: "Approved" }],
      rowCount: 1,
    }); // UPDATE query
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT event_logs
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // COMMIT

    const res = await request(app)
      .patch("/events/expenses/expense-1/review")
      .set("Authorization", `Bearer ${getToken("ACCOUNTANT")}`)
      .send({ status: "Approved" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Approved");
  });

  test("PATCH /events/expenses/:expenseId/review requires rejection reason", async () => {
    const res = await request(app)
      .patch("/events/expenses/expense-1/review")
      .set("Authorization", `Bearer ${getToken("ACCOUNTANT")}`)
      .send({ status: "Rejected" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Rejection reason is required");
  });

  test("PATCH /events/expenses/:expenseId/review locks approved expenses", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "expense-1", status: "Approved" }],
      rowCount: 1,
    }); // JOIN select query
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // ROLLBACK

    const res = await request(app)
      .patch("/events/expenses/expense-1/review")
      .set("Authorization", `Bearer ${getToken("ACCOUNTANT")}`)
      .send({ status: "Rejected", rejected_reason: "Duplicate" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("Approved expenses are locked");
  });

  test("POST /events/:id/expenses/generate-labor creates labor expense from attended assignments", async () => {
    // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // Event check/lock
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "event-1", status: "Completed" }],
      rowCount: 1,
    });
    // Labor sum
    mockQuery.mockResolvedValueOnce({
      rows: [{ total: "3500" }],
      rowCount: 1,
    });
    // Check existing
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // Insert labor
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "expense-labor-1", category: "Labor", amount: 3500, status: "Pending" }],
      rowCount: 1,
    });
    // COMMIT
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post("/events/event-1/expenses/generate-labor")
      .set("Authorization", `Bearer ${getToken("ACCOUNTANT")}`);

    expect(res.status).toBe(201);
    expect(res.body.category).toBe("Labor");
    expect(res.body.status).toBe("Pending");
  });

  describe("Profitability Reports & Dashboards API", () => {
    test("GET /events/:id/profit calculates single event profit correctly", async () => {
      // First query: event lookup
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "event-1", name: "Corporate Gala", contract_price: "100000.00" }],
        rowCount: 1,
      });
      // Second query: expenses breakdown
      mockQuery.mockResolvedValueOnce({
        rows: [
          { category: "Labor", amount: 20000.00 },
          { category: "Fuel", amount: 5000.00 },
          { category: "Other", amount: 15000.00 },
        ],
        rowCount: 3,
      });

      const res = await request(app)
        .get("/events/event-1/profit")
        .set("Authorization", `Bearer ${getToken("ACCOUNTANT")}`);

      expect(res.status).toBe(200);
      expect(res.body.eventId).toBe("event-1");
      expect(res.body.contractPrice).toBe(100000.00);
      expect(res.body.totalExpenses).toBe(40000.00);
      expect(res.body.netProfit).toBe(60000.00);
      expect(res.body.profitMargin).toBe(60.00);
      expect(res.body.categoryBreakdown).toContainEqual({ category: "Labor", amount: 20000.00 });
      expect(res.body.categoryBreakdown).toContainEqual({ category: "Fuel", amount: 5000.00 });
      expect(res.body.categoryBreakdown).toContainEqual({ category: "Other", amount: 15000.00 });
    });

    test("GET /events/:id/profit returns 404 if event not found", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const res = await request(app)
        .get("/events/event-not-exists/profit")
        .set("Authorization", `Bearer ${getToken("ACCOUNTANT")}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Event not found");
    });

    test("GET /events/:id/profit enforces role-based access", async () => {
      const res = await request(app)
        .get("/events/event-1/profit")
        .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Forbidden");
    });

    test("GET /events/reports/profit returns paginated event rows, KPIs, proposal variance, and aggregates", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: "2" }],
        rowCount: 1,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            event_id: "event-1",
            event_name: "Corporate Gala",
            event_type_name: "Gala",
            start_date: "2026-06-10",
            status: "Completed",
            revenue: "100000.00",
            approved_expenses: "25000.00",
            labor_cost: "20000.00",
            fuel_cost: "5000.00",
            other_cost: "0.00",
            pending_expense_exposure: "2000.00",
            net_profit: "75000.00",
            margin_percentage: "75.00",
            proposal_id: "proposal-1",
            proposal_status: "Converted",
            estimated_total_cost: "30000.00",
            estimated_net_profit: "70000.00",
            estimated_profit_variance: "5000.00",
          },
          {
            event_id: "event-2",
            event_name: "Private Birthday",
            event_type_name: "Birthday",
            start_date: "2026-07-15",
            status: "Completed",
            revenue: "50000.00",
            approved_expenses: "10000.00",
            labor_cost: "0.00",
            fuel_cost: "0.00",
            other_cost: "10000.00",
            pending_expense_exposure: "0.00",
            net_profit: "40000.00",
            margin_percentage: "80.00",
            proposal_id: null,
            proposal_status: null,
            estimated_total_cost: "0.00",
            estimated_net_profit: "0.00",
            estimated_profit_variance: null,
          },
        ],
        rowCount: 2,
      });

      const res = await request(app)
        .get("/events/reports/profit?start_date=2026-06-01&end_date=2026-07-31&sortBy=net_profit&sortOrder=desc&page=1&limit=1")
        .set("Authorization", `Bearer ${getToken("OWNER")}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.events).toHaveLength(1);
      expect(res.body.events[0].event_name).toBe("Corporate Gala");
      expect(res.body.summary.totalEvents).toBe(2);
      expect(res.body.summary.totalRevenue).toBe(150000.00);
      expect(res.body.summary.totalExpenses).toBe(35000.00);
      expect(res.body.summary.netProfit).toBe(115000.00);
      expect(res.body.summary.profitMargin).toBe(76.67);
      expect(res.body.summary.pendingExpenseExposure).toBe(2000.00);
      
      expect(res.body.categoryBreakdown).toContainEqual({ category: "Labor", amount: 20000.00 });
      expect(res.body.categoryBreakdown).toContainEqual({ category: "Fuel", amount: 5000.00 });
      expect(res.body.categoryBreakdown).toContainEqual({ category: "Other", amount: 10000.00 });
      expect(res.body.kpis.mostProfitableEvent.event_name).toBe("Corporate Gala");
      expect(res.body.kpis.highestMarginEventType.eventType).toBe("Birthday");
      expect(res.body.proposalVariance.averageVariance).toBe(5000.00);
      expect(res.body.proposalVariance.events[0].proposalId).toBe("proposal-1");

      const juneData = res.body.monthlyData.find((m: any) => m.month === "2026-06");
      const julyData = res.body.monthlyData.find((m: any) => m.month === "2026-07");
      expect(juneData).toBeDefined();
      expect(juneData.revenue).toBe(100000.00);
      expect(juneData.expenses).toBe(25000.00);
      expect(juneData.profit).toBe(75000.00);

      expect(julyData).toBeDefined();
      expect(julyData.revenue).toBe(50000.00);
      expect(julyData.expenses).toBe(10000.00);
      expect(julyData.profit).toBe(40000.00);
      expect(String(mockQuery.mock.calls[1][0])).toContain("LEFT JOIN event_proposals");
      expect(String(mockQuery.mock.calls[1][0])).toContain("ORDER BY profit_rows.net_profit DESC");
    });

    test("GET /events/reports/profit validates bounded report filters", async () => {
      const res = await request(app)
        .get("/events/reports/profit?start_date=2026-08-01&end_date=2026-07-01")
        .set("Authorization", `Bearer ${getToken("OWNER")}`);

      expect(res.status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    test("GET /events/reports/profit/export returns CSV and audits financial export", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: "1" }],
        rowCount: 1,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          event_id: "event-1",
          event_name: "Corporate Gala",
          event_type_name: "Gala",
          start_date: "2026-06-10",
          status: "Completed",
          revenue: "100000.00",
          approved_expenses: "25000.00",
          labor_cost: "20000.00",
          fuel_cost: "5000.00",
          other_cost: "0.00",
          pending_expense_exposure: "2000.00",
          net_profit: "75000.00",
          margin_percentage: "75.00",
          proposal_id: "proposal-1",
          proposal_status: "Converted",
          estimated_total_cost: "30000.00",
          estimated_net_profit: "70000.00",
          estimated_profit_variance: "5000.00",
        }],
        rowCount: 1,
      });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .get("/events/reports/profit/export?start_date=2026-06-01&end_date=2026-07-31&format=csv")
        .set("Authorization", `Bearer ${getToken("OWNER")}`);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.text).toContain("Net Profit");
      expect(res.text).toContain("Corporate Gala");
      expect(String(mockQuery.mock.calls[2][0])).toContain("INSERT INTO event_logs");
      expect((mockQuery.mock.calls[2][1] as unknown[])[1]).toBe("profit_report_export");
    });

    test("GET /events/reports/profit/export enforces maxRows before exporting", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: "1001" }],
        rowCount: 1,
      });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .get("/events/reports/profit/export?maxRows=1000")
        .set("Authorization", `Bearer ${getToken("OWNER")}`);

      expect(res.status).toBe(413);
      expect(String(mockQuery.mock.calls[1][0])).toContain("INSERT INTO event_logs");
      expect((mockQuery.mock.calls[1][1] as unknown[])[1]).toBe("profit_report_export_blocked");
      expect(mockQuery.mock.calls.some((call) => String(call[0]).includes("ORDER BY profit_rows"))).toBe(false);
    });

    test("GET /events/reports/profit restricts access to non-financial roles", async () => {
      const res = await request(app)
        .get("/events/reports/profit")
        .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Forbidden");
    });
  });

  describe("Security, BOLA & Concurrency Enhancements", () => {
    test("POST /events/:id/allocations blocks low-privilege roles", async () => {
      const res = await request(app)
        .post("/events/event-1/allocations")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`) // Unauthorized role
        .send({
          item_id: "7891594c-ecc0-4f66-a51f-a29d530587a2",
          quantity_allocated: 5,
        });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Forbidden");
    });

    test("POST /events/:id/checklist blocks low-privilege roles", async () => {
      const res = await request(app)
        .post("/events/event-1/checklist")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`)
        .send({
          title: "Malicious Task",
        });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Forbidden");
    });

    test("POST /events/:id/expenses blocks DRIVER role from manual expenses", async () => {
      const res = await request(app)
        .post("/events/event-1/expenses")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`)
        .send({
          category: "Consumables",
          amount: 500,
          description: "Driver buying personal water",
        });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Forbidden");
    });

    test("GET /events/:id/workspace omits financial data for non-financial roles", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "event-1", name: "Wedding" }],
        rowCount: 1,
      });
      // Allocations query
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });
      // Checklist query
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });
      // Assignments query
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });
      // Vehicle assignments query
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const res = await request(app)
        .get("/events/event-1/workspace")
        .set("Authorization", `Bearer ${getToken("EVENT_MANAGER")}`);

      expect(res.status).toBe(200);
      expect(res.body.expenses).toHaveLength(0);
      expect(res.body.trips).toHaveLength(0);
    });

    test("POST /events/:id/expenses/generate-labor prevents double-generation under concurrency", async () => {
      let activeTransaction = false;
      let laborExpenseCreated = false;

      mockQuery.mockImplementation(async (sql: string, _params?: any[]) => {
        const sqlStr = sql.trim();
        if (sqlStr === "BEGIN") {
          return { rows: [], rowCount: 1 };
        }
        if (sqlStr === "COMMIT" || sqlStr === "ROLLBACK") {
          activeTransaction = false;
          return { rows: [], rowCount: 1 };
        }
        if (sqlStr.includes("FROM events") && sqlStr.includes("FOR UPDATE")) {
          // If a transaction is already active, wait (simulating FOR UPDATE lock contention)
          let waitTime = 0;
          while (activeTransaction && waitTime < 1000) {
            await new Promise((resolve) => setTimeout(resolve, 5));
            waitTime += 5;
          }
          activeTransaction = true;
          return { rows: [{ id: "event-1", status: "Completed" }], rowCount: 1 };
        }
        if (sqlStr.includes("SUM(commission_amount)")) {
          return { rows: [{ total: "3500" }], rowCount: 1 };
        }
        if (sqlStr.includes("FROM expenses") && sqlStr.includes("'Labor'")) {
          if (laborExpenseCreated) {
            return { rows: [{ id: "expense-labor-1" }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
        if (sqlStr.includes("INSERT INTO expenses")) {
          laborExpenseCreated = true;
          return {
            rows: [{ id: "expense-labor-1", category: "Labor", amount: 3500, status: "Pending" }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      });

      // Fire both requests concurrently
      const [res1, res2] = await Promise.all([
        request(app)
          .post("/events/event-1/expenses/generate-labor")
          .set("Authorization", `Bearer ${getToken("ACCOUNTANT")}`),
        request(app)
          .post("/events/event-1/expenses/generate-labor")
          .set("Authorization", `Bearer ${getToken("ACCOUNTANT")}`)
      ]);

      // Assert that one succeeds (201) and the other fails (409) due to concurrency lock/idempotency check
      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(201);
      expect(statuses).toContain(409);

      // Verify that the query used FOR UPDATE for locking
      const queryCalls = mockQuery.mock.calls;
      const selectForUpdateCall = queryCalls.find((call) =>
        String(call[0]).includes("FOR UPDATE")
      );
      expect(selectForUpdateCall).toBeDefined();
    });

    test("POST /events blocks low-privilege roles", async () => {
      const res = await request(app)
        .post("/events")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`)
        .send({
          name: "Fake Event",
          client_name: "Client",
          start_date: "2026-06-20",
          end_date: "2026-06-22",
          venue_location: "Venue",
          contract_price: 1000,
        });
      expect(res.status).toBe(403);
    });

    test("PUT /events/:id blocks low-privilege roles", async () => {
      const res = await request(app)
        .put("/events/event-1")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`)
        .send({
          name: "Updated Name",
        });
      expect(res.status).toBe(403);
    });

    test("PATCH /events/:id/design blocks low-privilege roles", async () => {
      const res = await request(app)
        .patch("/events/event-1/design")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`)
        .send({
          package_design_notes: "New Design",
        });
      expect(res.status).toBe(403);
    });

    test("GET /events/:id/workspace redacts commission_amount and employee_phone for DRIVER", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "event-1", name: "Wedding", contract_price: "50000.00", estimated_design_cost: "5000.00" }],
        rowCount: 1,
      });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // allocations
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // checklist
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "assign-1", employee_name: "John Doe", employee_phone: "+251911111111", commission_amount: "5000.00" }],
        rowCount: 1,
      });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // vehicle assignments

      const res = await request(app)
        .get("/events/event-1/workspace")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`);

      expect(res.status).toBe(200);
      expect(res.body.event.contract_price).toBeUndefined();
      expect(res.body.event.estimated_design_cost).toBeUndefined();
      expect(res.body.assignments[0].employee_phone).toBeUndefined();
      expect(res.body.assignments[0].commission_amount).toBeUndefined();
    });

    test("GET /events/:id/workspace redacts financial fields for OPS_MANAGER", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "event-1", name: "Wedding", contract_price: "50000.00", estimated_design_cost: "5000.00" }],
        rowCount: 1,
      });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // allocations
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // checklist
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "assign-1", employee_name: "John Doe", employee_phone: "+251911111111", commission_amount: "5000.00" }],
        rowCount: 1,
      });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // vehicle assignments

      const res = await request(app)
        .get("/events/event-1/workspace")
        .set("Authorization", `Bearer ${getToken("OPS_MANAGER")}`);

      expect(res.status).toBe(200);
      expect(res.body.event.contract_price).toBeUndefined();
      expect(res.body.event.estimated_design_cost).toBeDefined();
    });

    test("GET /events/:id and GET /events redact financial fields for DRIVER", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "event-1", name: "Wedding", contract_price: "50000.00", estimated_design_cost: "5000.00" }],
        rowCount: 1,
      });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // logs

      const res = await request(app)
        .get("/events/event-1")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`);

      expect(res.status).toBe(200);
      expect(res.body.event.contract_price).toBeUndefined();
      expect(res.body.event.estimated_design_cost).toBeUndefined();
    });

    test("GET /payroll, /salary-levels, /departments and export routes block DRIVER", async () => {
      const payrollRes = await request(app)
        .get("/payroll/runs")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`);
      expect(payrollRes.status).toBe(403);

      const salaryRes = await request(app)
        .get("/salary-levels")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`);
      expect(salaryRes.status).toBe(403);

      const deptRes = await request(app)
        .get("/departments")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`);
      expect(deptRes.status).toBe(403);

      const exportRes = await request(app)
        .get("/export/xlsx")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`);
      expect(exportRes.status).toBe(403);
    });

    test("POST /events/:id/trips BOLA check allows assigned driver and blocks unassigned drivers", async () => {
      const validAssignmentId = "7891594c-ecc0-4f66-a51f-a29d530587a2";

      // Test Case 1: Driver has no linked email -> block
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: validAssignmentId, driver_id: "7891594c-ecc0-4f66-a51f-a29d530587a3", fuel_consumption_rate: 0.15, event_status: "Ongoing" }],
        rowCount: 1,
      }); // vehicle_assignment lookup
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // SELECT email FROM users (not found)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // ROLLBACK

      const res1 = await request(app)
        .post("/events/event-1/trips")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`)
        .send({
          vehicle_assignment_id: validAssignmentId,
          destination: "Bole",
          distance_km: 15,
          fuel_price_etb: 80,
        });
      expect(res1.status).toBe(403);
      expect(res1.body.error).toContain("no linked email");

      // Test Case 2: Driver has email but no employee record -> block
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: validAssignmentId, driver_id: "7891594c-ecc0-4f66-a51f-a29d530587a3", fuel_consumption_rate: 0.15, event_status: "Ongoing" }],
        rowCount: 1,
      }); // vehicle_assignment lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ email: "driver@example.com" }], rowCount: 1 }); // users lookup
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // employees lookup (not found)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // ROLLBACK

      const res2 = await request(app)
        .post("/events/event-1/trips")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`)
        .send({
          vehicle_assignment_id: validAssignmentId,
          destination: "Bole",
          distance_km: 15,
          fuel_price_etb: 80,
        });
      expect(res2.status).toBe(403);
      expect(res2.body.error).toContain("No linked employee record");

      // Test Case 3: Driver is not assigned to the vehicle assignment -> block
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: validAssignmentId, driver_id: "7891594c-ecc0-4f66-a51f-a29d530587a3", fuel_consumption_rate: 0.15, event_status: "Ongoing" }],
        rowCount: 1,
      }); // vehicle_assignment lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ email: "driver@example.com" }], rowCount: 1 }); // users lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: "7891594c-ecc0-4f66-a51f-a29d530587a4" }], rowCount: 1 }); // employees lookup (wrong driver)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // ROLLBACK

      const res3 = await request(app)
        .post("/events/event-1/trips")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`)
        .send({
          vehicle_assignment_id: validAssignmentId,
          destination: "Bole",
          distance_km: 15,
          fuel_price_etb: 80,
        });
      expect(res3.status).toBe(403);
      expect(res3.body.error).toContain("not assigned as the driver");

      // Test Case 4: Driver is correctly assigned -> allow
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: validAssignmentId, driver_id: "7891594c-ecc0-4f66-a51f-a29d530587a3", fuel_consumption_rate: 0.15, event_status: "Ongoing" }],
        rowCount: 1,
      }); // vehicle_assignment lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ email: "driver@example.com" }], rowCount: 1 }); // users lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: "7891594c-ecc0-4f66-a51f-a29d530587a3" }], rowCount: 1 }); // employees lookup (correct driver)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: "trip-1" }], rowCount: 1 }); // insert trip
      mockQuery.mockResolvedValueOnce({ rows: [{ id: "expense-1" }], rowCount: 1 }); // insert expense
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // COMMIT

      const res4 = await request(app)
        .post("/events/event-1/trips")
        .set("Authorization", `Bearer ${getToken("DRIVER")}`)
        .send({
          vehicle_assignment_id: validAssignmentId,
          destination: "Bole",
          distance_km: 15,
          fuel_price_etb: 80,
        });
      expect(res4.status).toBe(201);
      expect(res4.body.trip).toBeDefined();
    });

    test("PATCH /events/expenses/:expenseId/review blocks reviews on soft-deleted events", async () => {
      // Test Case 1: Expense or event doesn't exist/deleted -> 404
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // JOIN select query (not found or deleted)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // ROLLBACK

      const res1 = await request(app)
        .patch("/events/expenses/expense-1/review")
        .set("Authorization", `Bearer ${getToken("ACCOUNTANT")}`)
        .send({ status: "Approved" });

      expect(res1.status).toBe(404);
      expect(res1.body.error).toContain("Expense not found or associated event is deleted");

      // Test Case 2: Success case - approves active event expense and inserts audit log
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "expense-1", event_id: "event-1", category: "Fuel", amount: 1200, status: "Pending" }],
        rowCount: 1,
      }); // JOIN select query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "expense-1", status: "Approved" }],
        rowCount: 1,
      }); // update expense status
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // insert audit log
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // COMMIT

      const res2 = await request(app)
        .patch("/events/expenses/expense-1/review")
        .set("Authorization", `Bearer ${getToken("ACCOUNTANT")}`)
        .send({ status: "Approved" });

      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe("Approved");

      // Verify audit log query was made
      const auditLogCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes("INSERT INTO event_logs")
      );
      expect(auditLogCall).toBeDefined();
      expect(auditLogCall?.[1]?.[0]).toBe("event-1"); // event_id
      expect(auditLogCall?.[1]?.[2]).toBe("expense_status"); // field_changed
    });
  });
});
