import "./setup";
import { describe, test, expect, mock, beforeAll, beforeEach } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";
import { TEST_JWT_SECRET } from "./auth-test-config";

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

const JWT_SECRET = TEST_JWT_SECRET;

function getToken(role = "SUPER_ADMIN", extra: Record<string, unknown> = {}): string {
  return jwt.sign({ id: "user-1", role, username: "testuser", ...extra }, JWT_SECRET, { expiresIn: "1h" });
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  mockConnect.mockClear();
  mockRelease.mockClear();
});

function scriptDateConflict(kind: "employee" | "vehicle") {
  mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
    const query = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (query.startsWith("select * from events where id")) {
      return { rows: [{ id: "event-1", name: "Original Event", start_date: "2026-07-10", end_date: "2026-07-11", status: "Planned" }], rowCount: 1 };
    }
    if (query.startsWith("select $1::date")) {
      return { rows: [{ start_date: values?.[0], end_date: values?.[1], valid: true }], rowCount: 1 };
    }
    if (query.includes("with current_event_employees")) {
      return { rows: kind === "employee" ? [{ conflict: 1 }] : [], rowCount: kind === "employee" ? 1 : 0 };
    }
    if (query.includes("select 1 from vehicle_assignments")) return { rows: [{ conflict: 1 }], rowCount: 1 };
    if (["begin", "rollback"].includes(query) || query.startsWith("set local") ||
        query.startsWith("select id from vehicles") || query.startsWith("select id from employees")) {
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`Unexpected scheduling fixture query: ${query}`);
  });
}

describe("Events Date Conflict API validation", () => {
  test("PUT /events/:id returns 400 when new dates conflict with currently assigned employees", async () => {
    scriptDateConflict("employee");

    const res = await request(app)
      .put("/events/event-1")
      .set("Authorization", `Bearer ${getToken("SUPER_ADMIN", { permission_slugs: ["events:write"] })}`)
      .send({
        start_date: "2026-07-12",
        end_date: "2026-07-14",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Scheduling Conflict: One or more assigned employees or drivers have conflicting assignments on these new dates.");
    expect(mockQuery.mock.calls.find(([sql]) => String(sql).includes("WITH current_event_employees"))?.[1])
      .toEqual(["event-1", "2026-07-12", "2026-07-14"]);
  });

  test("PUT /events/:id returns 400 when new dates conflict with currently assigned vehicles", async () => {
    scriptDateConflict("vehicle");

    const res = await request(app)
      .put("/events/event-1")
      .set("Authorization", `Bearer ${getToken("SUPER_ADMIN", { permission_slugs: ["events:write"] })}`)
      .send({
        start_date: "2026-07-12",
        end_date: "2026-07-14",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Scheduling Conflict: One or more assigned vehicles have conflicting assignments on these new dates.");
    expect(mockQuery.mock.calls.find(([sql]) => String(sql).includes("SELECT 1 FROM vehicle_assignments"))?.[1])
      .toEqual(["event-1", "2026-07-12", "2026-07-14"]);
  });
});
