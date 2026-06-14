import "./setup";
import { describe, test, expect, mock, beforeAll, beforeEach } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

// Mock the DB pool
const mockQuery = mock((..._args: any[]) => Promise.resolve({ rows: [] as any[], rowCount: 1 }));

mock.module("../db/pool", () => ({
  pool: {
    query: mockQuery,
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
});
