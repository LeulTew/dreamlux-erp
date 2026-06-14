import {
  mockUploadImage,
  mockDeleteImage,
  getToken,
} from "./setup_helpers";
import "./setup";
import { describe, test, expect, beforeEach, beforeAll, mock } from "bun:test";
import request from "supertest";

const mockQuery = mock(() => Promise.resolve({ rows: [] as any[] }));

export const fakeChain = (isSingle = false): any => {
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
        
        let countValue = 0;
        if (res?.rows?.[0]?.count !== undefined) {
          countValue = parseInt(res.rows[0].count as string);
        } else {
          countValue = res?.rows?.length || 0;
        }

        const rows = res?.rows || [];
        resolve({
          data: isSingle ? (rows[0] || null) : rows,
          error: null,
          count: countValue,
        });
      } catch (err) {
        resolve({ data: null, error: err, count: 0 });
      }
    }
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

function createJpegBuffer(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

describe("Employees API", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockUploadImage.mockReset();
    mockDeleteImage.mockReset();
  });

  test("GET /employees returns list", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "1",
          full_name: "John Doe",
          employee_id: "EMP1",
          deleted_at: null,
        },
      ],
    });

    const res = await request(app)
      .get("/employees")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.employees).toHaveLength(1);
    expect(res.body.employees[0].full_name).toBe("John Doe");
  });

  test("POST /employees creates new employee", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ 
        id: "new-id", 
        full_name: "Jane Smith", 
        employee_id: "EMP2",
        id_card_front_key: "employees/EMP2/front.webp"
      }],
    });

    const res = await request(app)
      .post("/employees")
      .set("Authorization", `Bearer ${getToken()}`)
      .field("full_name", "Jane Smith")
      .field("employee_id", "EMP2")
      .attach("id_card_front", createJpegBuffer(), "front.jpg");

    expect(res.status).toBe(201);
    expect(res.body.full_name).toBe("Jane Smith");
    expect(res.body.id_card_front_url).toContain("storage.test.com");
  });

  test("POST /employees retries when event_prices column is missing", async () => {
    mockQuery
      .mockRejectedValueOnce({
        code: "42703",
        message: "column \"event_prices\" of relation \"employees\" does not exist",
      })
      .mockResolvedValueOnce({
        rows: [{ 
          id: "new-id", 
          full_name: "Jane Retry", 
          employee_id: "EMP3",
        }],
      });

    const res = await request(app)
      .post("/employees")
      .set("Authorization", `Bearer ${getToken()}`)
      .field("full_name", "Jane Retry")
      .field("employee_id", "EMP3")
      .field("event_prices", JSON.stringify({ event1: 200 }));

    expect(res.status).toBe(201);
    expect(res.body.full_name).toBe("Jane Retry");
    expect(res.body._warning).toContain("event_prices");
  });

  test("POST /employees rejects malformed event_prices JSON payload", async () => {
    const res = await request(app)
      .post("/employees")
      .set("Authorization", `Bearer ${getToken()}`)
      .field("full_name", "John Doe")
      .field("employee_id", "EMP1")
      .field("event_prices", "{invalid json");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid event_prices payload/i);
  });

  test("POST /employees rejects negative event_prices values", async () => {
    const res = await request(app)
      .post("/employees")
      .set("Authorization", `Bearer ${getToken()}`)
      .field("full_name", "John Doe")
      .field("employee_id", "EMP1")
      .field("event_prices", JSON.stringify({ wedding: -250 }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid event_prices payload/i);
  });

  test("DELETE /employees/:id soft deletes employee", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "1", full_name: "John" }] }) // check existence
      .mockResolvedValueOnce({ rows: [] }); // update

    const res = await request(app)
      .delete("/employees/1")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("GET /employees/:id returns 404 for deleted or non-existent", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/employees/999")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(404);
  });

  test("GET /employees/:id resolves current salary from salary level code", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "1",
          full_name: "John Doe",
          employee_id: "EMP1",
          salary_level: "L2",
          base_salary: 7000,
          salary_level_id: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ amount_etb: 7500 }] });

    const res = await request(app)
      .get("/employees/1")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.base_salary).toBe(7500);
  });

  test("PATCH /employees retries when salary_level column is missing", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "1", employee_id: "EMP1", full_name: "John Doe" }] })
      .mockRejectedValueOnce({
        code: "42703",
        message: "column \"salary_level\" of relation \"employees\" does not exist",
      })
      .mockResolvedValueOnce({ rows: [{ id: "1", employee_id: "EMP1", full_name: "John Updated" }] });

    const res = await request(app)
      .patch("/employees/1")
      .set("Authorization", `Bearer ${getToken()}`)
      .field("full_name", "John Updated")
      .field("salary_level", "L1")
      .field("event_prices", JSON.stringify({}));

    expect(res.status).toBe(200);
    expect(res.body.full_name).toBe("John Updated");
    expect(res.body._warning).toContain("salary_level");
  });

  test("PATCH /employees accepts empty event_prices and persists as empty object", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "1", employee_id: "EMP1", full_name: "John Doe" }] })
      .mockResolvedValueOnce({ rows: [{ id: "1", employee_id: "EMP1", full_name: "John Doe", event_prices: {} }] });

    const res = await request(app)
      .patch("/employees/1")
      .set("Authorization", `Bearer ${getToken()}`)
      .field("full_name", "John Doe")
      .field("employee_id", "EMP1")
      .field("event_prices", "");

    expect(res.status).toBe(200);
    expect(res.body.event_prices).toEqual({});
  });

  test("PATCH /employees rejects malformed event_prices JSON payload", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "1", employee_id: "EMP1", full_name: "John Doe" }] });

    const res = await request(app)
      .patch("/employees/1")
      .set("Authorization", `Bearer ${getToken()}`)
      .field("full_name", "John Doe")
      .field("employee_id", "EMP1")
      .field("event_prices", "{invalid json");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid event_prices payload/i);
  });

  test("PATCH /employees rejects negative event_prices values", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "1", employee_id: "EMP1", full_name: "John Doe" }] });

    const res = await request(app)
      .patch("/employees/1")
      .set("Authorization", `Bearer ${getToken()}`)
      .field("full_name", "John Doe")
      .field("employee_id", "EMP1")
      .field("event_prices", JSON.stringify({ wedding: -250 }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid event_prices payload/i);
  });
});
