import "./setup";
import { describe, test, expect, mock, beforeAll, beforeEach } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

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

describe("Events Date Conflict API validation", () => {
  test("PUT /events/:id returns 400 when new dates conflict with currently assigned employees", async () => {
    // 1. Fetch existing event
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "event-1",
          name: "Original Event",
          start_date: "2026-07-10",
          end_date: "2026-07-10",
          status: "Planned",
        },
      ],
      rowCount: 1,
    });

    // 2. hasBulkEmployeeConflict check query (returns conflict)
    mockQuery.mockResolvedValueOnce({
      rows: [{ '1': 1 }],
      rowCount: 1,
    });

    const res = await request(app)
      .put("/events/event-1")
      .set("Authorization", `Bearer ${getToken("SUPER_ADMIN", { permission_slugs: ["events:write"] })}`)
      .send({
        start_date: "2026-07-12",
        end_date: "2026-07-12",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Scheduling Conflict: One or more assigned employees or drivers have conflicting assignments on these new dates.");
  });

  test("PUT /events/:id returns 400 when new dates conflict with currently assigned vehicles", async () => {
    // 1. Fetch existing event
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "event-1",
          name: "Original Event",
          start_date: "2026-07-10",
          end_date: "2026-07-10",
          status: "Planned",
        },
      ],
      rowCount: 1,
    });

    // 2. hasBulkEmployeeConflict check query (returns no conflict)
    mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    // 3. hasBulkVehicleConflict check query (returns conflict)
    mockQuery.mockResolvedValueOnce({
      rows: [{ '1': 1 }],
      rowCount: 1,
    });

    const res = await request(app)
      .put("/events/event-1")
      .set("Authorization", `Bearer ${getToken("SUPER_ADMIN", { permission_slugs: ["events:write"] })}`)
      .send({
        start_date: "2026-07-12",
        end_date: "2026-07-12",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Scheduling Conflict: One or more assigned vehicles have conflicting assignments on these new dates.");
  });
});
