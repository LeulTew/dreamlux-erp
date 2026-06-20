import "./setup";
import { describe, test, expect, mock, beforeAll } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

// Mock the DB pool
const mockQuery = mock((sql: string, params?: any[]) => {
  const safeParams = params || [];

  // Mock user email lookup
  if (sql.includes("SELECT email FROM users WHERE id = $1")) {
    if (safeParams[0] === "driver-user-id") {
      return Promise.resolve({ rows: [{ email: "driver@example.com" }], rowCount: 1 });
    }
    if (safeParams[0] === "other-driver-user-id") {
      return Promise.resolve({ rows: [{ email: "other_driver@example.com" }], rowCount: 1 });
    }
  }

  // Mock employee lookup from email
  if (sql.includes("SELECT id FROM employees WHERE email = $1")) {
    if (safeParams[0] === "driver@example.com") {
      return Promise.resolve({ rows: [{ id: "emp-driver-1" }], rowCount: 1 });
    }
    if (safeParams[0] === "other_driver@example.com") {
      return Promise.resolve({ rows: [{ id: "emp-driver-2" }], rowCount: 1 });
    }
  }

  // Mock vehicle assignment lookup
  if (sql.includes("SELECT va.*, v.plate_number, v.vehicle_type, v.fuel_consumption_rate")) {
    return Promise.resolve({
      rows: [
        {
          id: "7891594c-ecc0-4f66-a51f-a29d530587a2",
          driver_id: "emp-driver-1",
          fuel_consumption_rate: 0.15,
          event_status: "Ongoing",
        },
      ],
      rowCount: 1,
    });
  }

  // Mock trip insertion
  if (sql.includes("INSERT INTO trips")) {
    return Promise.resolve({ rows: [{ id: "trip-1" }], rowCount: 1 });
  }

  // Mock expense insertion
  if (sql.includes("INSERT INTO expenses")) {
    return Promise.resolve({ rows: [{ id: "expense-1" }], rowCount: 1 });
  }

  // Mock role fetch
  if (sql.includes("SELECT role_ids, role_id FROM users WHERE id = $1")) {
    return Promise.resolve({ rows: [{ role_id: "role-driver", role_ids: ["role-driver"] }], rowCount: 1 });
  }

  if (sql.includes("SELECT\n       r.name,\n       r.permissions")) {
    return Promise.resolve({
      rows: [{ name: "DRIVER", permissions: {}, permission_slugs: ["expenses:write"] }],
      rowCount: 1,
    });
  }

  return Promise.resolve({ rows: [], rowCount: 0 });
});

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

function getToken(userId: string, role = "DRIVER"): string {
  return jwt.sign({ id: userId, role, username: "driver_user" }, JWT_SECRET, { expiresIn: "1h" });
}

describe("Row-Scope Filtering (BOLA) Integration Tests", () => {
  test("POST /events/:id/trips allows access to the assigned driver", async () => {
    mockQuery.mockClear();

    const res = await request(app)
      .post("/events/event-123/trips")
      .set("Authorization", `Bearer ${getToken("driver-user-id")}`)
      .send({
        vehicle_assignment_id: "7891594c-ecc0-4f66-a51f-a29d530587a2",
        destination: "Adama",
        distance_km: 100,
        fuel_price_etb: 80,
      });

    expect(res.status).toBe(201);
    expect(res.body.trip).toBeDefined();
  });

  test("POST /events/:id/trips blocks access for unassigned drivers", async () => {
    mockQuery.mockClear();

    const res = await request(app)
      .post("/events/event-123/trips")
      .set("Authorization", `Bearer ${getToken("other-driver-user-id")}`)
      .send({
        vehicle_assignment_id: "7891594c-ecc0-4f66-a51f-a29d530587a2",
        destination: "Adama",
        distance_km: 100,
        fuel_price_etb: 80,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("You are not assigned as the driver");
  });
});
