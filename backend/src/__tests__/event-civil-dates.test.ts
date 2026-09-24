import "./setup";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool";
import eventsRouter from "../routes/events";

const eventId = "29500000-0000-4000-8000-000000000001";
const userId = "29500000-0000-4000-8000-000000000002";
const app = express();
app.use(express.json());
app.use("/events", eventsRouter);
let querySpy: ReturnType<typeof spyOn<typeof pool, "query">>;
let logSpy: ReturnType<typeof spyOn<typeof console, "error">>;
const queries: string[] = [];

function get(path: string, permissions = ["*"]) {
  const token = jwt.sign({ id: userId, username: "synthetic.dates", permission_slugs: permissions }, process.env.JWT_SECRET!);
  return request(app).get(path).set("Authorization", `Bearer ${token}`);
}

beforeEach(() => {
  queries.length = 0;
  querySpy = spyOn(pool, "query").mockImplementation((async (sql: string) => {
    queries.push(sql);
    // node-postgres parses DATE columns as local midnight, like these values.
    const rows = /\bselect\s+e\.\*/i.test(sql)
      ? [{
        id: eventId, name: "Synthetic dated event", client_name: "Synthetic client",
        start_date: new Date(2035, 0, 2), end_date: new Date(2035, 0, 3),
        start_time: "06:00:00", end_time: "23:00:00",
        status: "Planned", venue_location: "Synthetic venue", contract_price: "1000.00",
        created_at: new Date("2034-01-01T12:30:00Z"),
      }]
      : /count\(\*\)/i.test(sql) ? [{ count: "1" }] : [];
    return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
  }) as typeof pool.query);
  logSpy = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  querySpy.mockRestore();
  logSpy.mockRestore();
});

describe("event civil-date contracts", () => {
  for (const path of ["/events", `/events/${eventId}`, `/events/${eventId}/workspace`]) {
    test(`${path} preserves civil dates instead of serializing them as UTC instants`, async () => {
      const response = await get(path);
      expect(response.status).toBe(200);
      const event = response.body.events?.[0] ?? response.body.event ?? response.body;
      expect(event.start_date).toBe("2035-01-02");
      expect(event.end_date).toBe("2035-01-03");
      expect(event.created_at).toBe("2034-01-01T12:30:00.000Z");
    });
  }

  test("keeps financial fields redacted for ordinary event readers", async () => {
    const response = await get("/events", ["events:read"]);
    expect(response.status).toBe(200);
    expect(response.body.events[0]).not.toHaveProperty("contract_price");
  });

  test("orders equal-date rows deterministically across pages", async () => {
    expect((await get("/events?limit=100")).status).toBe(200);
    const query = queries.find((sql) => /\bselect\s+e\.\*/i.test(sql));
    expect(query).toMatch(/ORDER BY[\s\S]*e\.created_at DESC,\s*e\.id ASC/);
  });
});
