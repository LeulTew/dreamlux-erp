import {
  mockUploadImage,
  mockDeleteImage,
  getToken,
} from "./setup_helpers";
import "./setup";
import { describe, test, expect, beforeEach, beforeAll, mock } from "bun:test";
import request from "supertest";
import { NotificationsService } from "../services/notifications-service";

const mockQuery = mock(() => Promise.resolve({ rows: [] as any[] }));
const employeeWrites: Record<string, unknown>[] = [];

mock.module("../db/pool", () => ({
  pool: { query: mockQuery, connect: mock(() => Promise.resolve({ release: mock(() => {}), query: mockQuery })) },
}));

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
    update: (values: Record<string, unknown>) => {
      employeeWrites.push({ ...values });
      return fakeChain(isSingle);
    },
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
    employeeWrites.length = 0;
  });

  describe("partial employee setup preservation", () => {
    const existing = {
      id: "23700000-0000-4000-8000-000000000001",
      employee_id: "EMP-PARTIAL", full_name: "Original employee",
      department_id: "23700000-0000-4000-8000-000000000002",
      office_id: "23700000-0000-4000-8000-000000000003",
      salary_level: "L1", compensation_mode: "commission_only", event_prices: {},
    };
    function prepare() {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...existing }] });
      mockQuery.mockImplementationOnce(async () => {
        const write = employeeWrites.at(-1);
        if (!write) throw new Error("Expected an observed employee persistence call");
        return { rows: [{ ...existing, ...write }] };
      });
    }

    test.each(["json", "multipart"])("%s name-only edit preserves every omitted setup field", async (format) => {
      prepare();
      const call = request(app).patch(`/employees/${existing.id}`)
        .set("Authorization", `Bearer ${getToken()}`);
      const response = await (format === "json"
        ? call.send({ full_name: "Updated employee" })
        : call.field("full_name", "Updated employee"));
      expect(response.status).toBe(200);
      expect(employeeWrites).toHaveLength(1);
      for (const key of ["department_id", "office_id", "salary_level"]) {
        expect(employeeWrites[0]).not.toHaveProperty(key);
      }
      expect(response.body).toMatchObject({ ...existing, full_name: "Updated employee" });
    });

    test("an explicit blank clears all three fields even when parsed values become undefined", async () => {
      prepare();
      const response = await request(app).patch(`/employees/${existing.id}`)
        .set("Authorization", `Bearer ${getToken()}`)
        .field("department_id", "").field("office_id", "").field("salary_level", "");
      expect(response.status).toBe(200);
      expect(employeeWrites[0]).toMatchObject({ department_id: null, office_id: null, salary_level: null });
      expect(response.body).toMatchObject({ department_id: null, office_id: null, salary_level: null });
    });

    test("a supplied full update preserves validated values, zero commission and empty event prices", async () => {
      prepare();
      const update = {
        full_name: "Full update",
        department_id: "23700000-0000-4000-8000-000000000004",
        office_id: "23700000-0000-4000-8000-000000000005",
        salary_level: "L2", compensation_mode: "regular", commission: "0", event_prices: {},
      };
      const response = await request(app).patch(`/employees/${existing.id}`)
        .set("Authorization", `Bearer ${getToken()}`).send(update);
      expect(response.status).toBe(200);
      expect(employeeWrites[0]).toMatchObject({ ...update, commission: 0 });
      expect(response.body).toMatchObject({ ...update, commission: 0 });
    });

    test("clearing one field leaves the other setup fields unchanged", async () => {
      prepare();
      const response = await request(app).patch(`/employees/${existing.id}`)
        .set("Authorization", `Bearer ${getToken()}`).send({ office_id: "" });
      expect(response.status).toBe(200);
      expect(employeeWrites[0]).toMatchObject({ office_id: null });
      expect(employeeWrites[0]).not.toHaveProperty("department_id");
      expect(employeeWrites[0]).not.toHaveProperty("salary_level");
      expect(response.body).toMatchObject({ department_id: existing.department_id, office_id: null, salary_level: "L1" });
    });

    test.each(["department_id", "office_id", "salary_level"])("invalid explicit null %s is still rejected", async (key) => {
      const response = await request(app).patch(`/employees/${existing.id}`)
        .set("Authorization", `Bearer ${getToken()}`).send({ [key]: null });
      expect(response.status).toBe(400);
      expect(employeeWrites).toEqual([]);
    });
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

  test("GET /employees rejects unsupported sort fields before querying", async () => {
    const res = await request(app)
      .get("/employees?sortBy=full_name%3B%20DROP%20TABLE%20employees")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid employee query parameters/i);
    expect(mockQuery).not.toHaveBeenCalled();
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

    const originalEmit = NotificationsService.emitNotificationToRoleOrPermission;
    const emitMock = mock(() => Promise.resolve(1));
    NotificationsService.emitNotificationToRoleOrPermission = emitMock as typeof NotificationsService.emitNotificationToRoleOrPermission;

    try {
      const res = await request(app)
        .delete("/employees/1")
        .set("Authorization", `Bearer ${getToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body._notification_count).toBe(1);
      expect(emitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          permissionSlug: "hr:read",
          title: "Employee Record Deleted",
          entity_type: "employee",
          entity_id: "1",
        })
      );
    } finally {
      NotificationsService.emitNotificationToRoleOrPermission = originalEmit;
    }
  });

  test("POST /employees accepts commission-only compensation mode", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "new-id", full_name: "Event Worker", employee_id: "EMP-C", compensation_mode: "commission_only" }],
    });

    const res = await request(app)
      .post("/employees")
      .set("Authorization", `Bearer ${getToken()}`)
      .field("full_name", "Event Worker")
      .field("employee_id", "EMP-C")
      .field("compensation_mode", "commission_only");

    expect(res.status).toBe(201);
    expect(res.body.compensation_mode).toBe("commission_only");
  });

  test("POST /employees rejects unknown compensation modes", async () => {
    const res = await request(app)
      .post("/employees")
      .set("Authorization", `Bearer ${getToken()}`)
      .field("full_name", "Invalid Worker")
      .field("employee_id", "EMP-X")
      .field("compensation_mode", "salary_only");

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("POST /employees/import bulk upserts validated employees in one query", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { id: "employee-db-1", employee_id: "EMP-101", full_name: "Regular Worker", compensation_mode: "regular" },
      { id: "employee-db-2", employee_id: "EMP-102", full_name: "Event Worker", compensation_mode: "commission_only" },
    ] });
    const res = await request(app).post("/employees/import")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({ rows: [
        { employee_id: "EMP-101", full_name: "Regular Worker" },
        { employee_id: "EMP-102", full_name: "Event Worker", compensation_mode: "commission_only", event_prices: { wedding: 2500 } },
      ] });

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2);
    const bulkQueries = mockQuery.mock.calls.filter((call) => String((call as unknown[])[0]).includes("jsonb_to_recordset"));
    expect(bulkQueries).toHaveLength(1);
  });

  test("POST /employees/import rejects more than 1000 rows before querying", async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ employee_id: `EMP-${index}`, full_name: `Worker ${index}` }));
    const res = await request(app).post("/employees/import").set("Authorization", `Bearer ${getToken()}`).send({ rows });
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("POST /employees/import returns a stable error when the bulk query fails", async () => {
    mockQuery.mockRejectedValueOnce(new Error("database unavailable"));
    const res = await request(app).post("/employees/import").set("Authorization", `Bearer ${getToken()}`)
      .send({ rows: [{ employee_id: "EMP-101", full_name: "Worker" }] });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Employee import failed");
  });

  test("POST /employees/import denies unauthenticated callers before querying", async () => {
    const res = await request(app).post("/employees/import")
      .send({ rows: [{ employee_id: "EMP-101", full_name: "Worker" }] });
    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
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
