import "./setup";
import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import request from "supertest";
import { getToken } from "./setup_helpers";

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
  supabase: {
    from: () => fakeChain(),
  },
}));

let app: import("express").Application;

beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

describe("Event Types API", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test("GET /event-types returns event metadata with no pricing fields", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "evt-1",
          name: "Wedding",
          description: "Standard package",
          is_active: true,
          default_price_etb: 500,
          prices_by_level: { L1: 500 },
          deleted_at: null,
        },
      ],
    });

    const res = await request(app)
      .get("/event-types")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].event_name).toBe("Wedding");
    expect(res.body[0].description).toBe("Standard package");
    expect(res.body[0].default_price_etb).toBeUndefined();
    expect(res.body[0].prices_by_level).toBeUndefined();
  });

  test("POST /event-types creates using only name and description", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "evt-2",
          name: "Mels",
          description: "Optional",
          is_active: true,
          deleted_at: null,
        },
      ],
    });

    const res = await request(app)
      .post("/event-types")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        event_name: "Mels",
        description: "Optional",
        default_price: 999,
      });

    expect(res.status).toBe(201);
    expect(res.body.event_name).toBe("Mels");
    expect(res.body.default_price).toBeUndefined();
    expect(res.body.prices_by_level).toBeUndefined();
  });

  test("PUT /event-types/:id ignores pricing-only updates", async () => {
    const res = await request(app)
      .put("/event-types/evt-1")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ default_price: 1200, prices_by_level: { L2: 1200 } });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/No fields to update/i);
  });

  test("PUT /event-types/:id updates name and description", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "evt-1",
          name: "Wedding Premium",
          description: "Updated",
          is_active: true,
          deleted_at: null,
        },
      ],
    });

    const res = await request(app)
      .put("/event-types/evt-1")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ event_name: "Wedding Premium", description: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.event_name).toBe("Wedding Premium");
    expect(res.body.description).toBe("Updated");
  });

  test("GET /event-types requires authentication", async () => {
    const res = await request(app).get("/event-types");
    expect(res.status).toBe(401);
  });
});
