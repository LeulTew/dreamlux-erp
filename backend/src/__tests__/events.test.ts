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
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "expense-1", status: "Pending" }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "expense-1", status: "Approved" }],
      rowCount: 1,
    });

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
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "expense-1", status: "Approved" }],
      rowCount: 1,
    });

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

    test("GET /events/reports/profit aggregates monthly/yearly reports correctly with date filtering", async () => {
      // First query: events list
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: "event-1", name: "Corporate Gala", contract_price: "100000.00", start_date: "2026-06-10" },
          { id: "event-2", name: "Private Birthday", contract_price: "50000.00", start_date: "2026-07-15" },
        ],
        rowCount: 2,
      });
      // Second query: approved expenses
      mockQuery.mockResolvedValueOnce({
        rows: [
          { event_id: "event-1", category: "Labor", total_amount: 20000.00 },
          { event_id: "event-1", category: "Fuel", total_amount: 5000.00 },
          { event_id: "event-2", category: "Other", total_amount: 10000.00 },
        ],
        rowCount: 3,
      });

      const res = await request(app)
        .get("/events/reports/profit?start_date=2026-06-01&end_date=2026-07-31")
        .set("Authorization", `Bearer ${getToken("OWNER")}`);

      expect(res.status).toBe(200);
      expect(res.body.summary.totalEvents).toBe(2);
      expect(res.body.summary.totalRevenue).toBe(150000.00);
      expect(res.body.summary.totalExpenses).toBe(35000.00);
      expect(res.body.summary.netProfit).toBe(115000.00);
      expect(res.body.summary.profitMargin).toBe(76.67);
      
      expect(res.body.categoryBreakdown).toContainEqual({ category: "Labor", amount: 20000.00 });
      expect(res.body.categoryBreakdown).toContainEqual({ category: "Fuel", amount: 5000.00 });
      expect(res.body.categoryBreakdown).toContainEqual({ category: "Other", amount: 10000.00 });

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
      // First call setup
      // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Lock/Event select
      mockQuery.mockResolvedValueOnce({ rows: [{ id: "event-1", status: "Completed" }], rowCount: 1 }); // Lock/Event select
      // Labor sum
      mockQuery.mockResolvedValueOnce({ rows: [{ total: "3500" }], rowCount: 1 }); // Labor sum
      // Check active expense
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // Check active expense
      // Insert
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "expense-labor-1", category: "Labor", amount: 3500, status: "Pending" }],
        rowCount: 1,
      }); // Insert
      // COMMIT
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // COMMIT

      const res1 = await request(app)
        .post("/events/event-1/expenses/generate-labor")
        .set("Authorization", `Bearer ${getToken("ACCOUNTANT")}`);

      expect(res1.status).toBe(201);
      expect(res1.body.status).toBe("Pending");

      // Second call setup (finds existing)
      // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Lock/Event select
      mockQuery.mockResolvedValueOnce({ rows: [{ id: "event-1", status: "Completed" }], rowCount: 1 }); // Lock/Event select
      // Labor sum
      mockQuery.mockResolvedValueOnce({ rows: [{ total: "3500" }], rowCount: 1 }); // Labor sum
      // Already exists!
      mockQuery.mockResolvedValueOnce({ rows: [{ id: "expense-labor-1" }], rowCount: 1 }); // Already exists!
      // ROLLBACK
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // ROLLBACK

      const res2 = await request(app)
        .post("/events/event-1/expenses/generate-labor")
        .set("Authorization", `Bearer ${getToken("ACCOUNTANT")}`);

      expect(res2.status).toBe(409);
      expect(res2.body.error).toContain("already been generated");
    });
  });
});
