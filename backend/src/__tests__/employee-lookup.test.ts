import "./setup";
import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { getToken } from "./setup_helpers";
import { requireAuth } from "../middleware/auth";
import { supabase } from "../db/supabase";

const requests: URL[] = [];
let compatibilityFailures = 0;
let employeeRequests = 0;
let failLookup = false;
const rows = Array.from({ length: 151 }, (_, index) => ({
  id: `23200000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  employee_id: `SYN-${String(index + 1).padStart(4, "0")}`,
  full_name: index === 150 ? "Synthetic Zuri" : "Synthetic Same Name",
  deleted_at: null,
}));

// Serialize queries with Dream's installed Supabase client, but never send them
// to a database. Supertest alone owns the loopback HTTP listener.
const client = createClient("http://127.0.0.1:1", "synthetic-232-no-service", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      expect(url.origin).toBe("http://127.0.0.1:1");
      expect(init?.method ?? "GET").toBe("GET");
      requests.push(url);
      if (url.pathname === "/rest/v1/salary_levels") return Response.json([]);
      expect(url.pathname).toBe("/rest/v1/employees");
      employeeRequests += 1;
      if (failLookup) return Response.json({ message: "Synthetic lookup unavailable", code: "XX000" }, { status: 500 });
      if (employeeRequests <= compatibilityFailures) {
        return Response.json({ message: "Synthetic relationship unavailable", code: "PGRST200" }, { status: 400 });
      }
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 50);
      const data = rows.slice(offset, offset + limit);
      return Response.json(data, {
        headers: { "content-range": `${offset}-${offset + data.length - 1}/${rows.length}` },
      });
    }, { preconnect: () => { throw new Error("The employee fixture forbids network preconnect"); } }),
  },
});

const app = express();
let fromSpy: ReturnType<typeof spyOn>;

beforeAll(async () => {
  fromSpy = spyOn(supabase, "from").mockImplementation((table: string) => client.from(table));
  const { default: employeesRouter } = await import("../routes/employees");
  app.use("/employees", requireAuth, employeesRouter);
});

beforeEach(() => {
  requests.length = 0;
  employeeRequests = 0;
  compatibilityFailures = 0;
  failLookup = false;
});

afterAll(() => fromSpy.mockRestore());

describe("Staff-payment employee lookup contract", () => {
  test("the original uppercase Active request is rejected before any data query", async () => {
    const response = await request(app).get("/employees?page=1&limit=100&status=Active")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid employee query parameters");
    expect(requests).toHaveLength(0);
  });

  test.each([0, 1, 2])("name paging has a unique tie-breaker through %i compatibility fallbacks", async (failures) => {
    compatibilityFailures = failures;
    const response = await request(app)
      .get("/employees?page=4&limit=50&status=active&sortBy=name&sortOrder=asc")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 4, limit: 50, total: 151 });
    expect(response.body.employees.map((row: { employee_id: string }) => row.employee_id)).toEqual(["SYN-0151"]);
    const queries = requests.filter((url) => url.pathname === "/rest/v1/employees");
    expect(queries).toHaveLength(failures + 1);
    for (const url of queries) {
      expect(url.searchParams.get("order")).toBe("full_name.asc,employee_id.asc");
      expect(url.searchParams.get("deleted_at")).toBe("is.null");
      expect(url.searchParams.get("offset")).toBe("150");
      expect(url.searchParams.get("limit")).toBe("50");
    }
  });

  test.each([0, 1, 2])("server search and existing scope filters survive %i compatibility fallbacks", async (failures) => {
    compatibilityFailures = failures;
    const office = "23200000-0000-4000-8000-000000000201";
    const department = "23200000-0000-4000-8000-000000000202";
    const response = await request(app).get("/employees").query({
      page: 1, limit: 50, status: "active", search: "SYN-0151",
      office_id: office, department_id: department, sortBy: "full_name", sortOrder: "desc",
    }).set("Authorization", `Bearer ${getToken()}`);
    expect(response.status).toBe(200);
    for (const url of requests.filter((entry) => entry.pathname === "/rest/v1/employees")) {
      expect(url.searchParams.get("or")).toBe("(full_name.ilike.%SYN-0151%,employee_id.ilike.%SYN-0151%,department.ilike.%SYN-0151%)");
      expect(url.searchParams.get("deleted_at")).toBe("is.null");
      expect(url.searchParams.get("office_id")).toBe(`eq.${office}`);
      expect(url.searchParams.get("department_id")).toBe(`eq.${department}`);
      expect(url.searchParams.get("order")).toBe("full_name.desc,employee_id.asc");
      expect(url.searchParams.get("limit")).toBe("50");
    }
  });

  test("directory defaults retain salary ordering and the existing trash policy", async () => {
    const response = await request(app).get("/employees?status=trash")
      .set("Authorization", `Bearer ${getToken()}`);
    expect(response.status).toBe(200);
    const url = requests[0];
    expect(url.searchParams.get("salary_levels.order")).toBe("amount_etb.desc.nullslast");
    expect(url.searchParams.has("order")).toBe(false);
    expect(url.searchParams.get("deleted_at")).toBe("not.is.null");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(url.searchParams.get("limit")).toBe("50");
  });

  test("unauthenticated lookup is denied without querying employees", async () => {
    const response = await request(app).get("/employees?status=active");
    expect(response.status).toBe(401);
    expect(requests).toHaveLength(0);
  });

  test("the existing authenticated read policy does not acquire a new HR permission gate", async () => {
    const token = jwt.sign({ username: "synthetic-finance", role: "Accountant", permission_slugs: ["finance:overheads:write"] },
      process.env.JWT_SECRET!, { expiresIn: "1m" });
    const response = await request(app).get("/employees?status=active&limit=50")
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(employeeRequests).toBe(1);
  });

  test("query failures remain errors rather than successful empty pages", async () => {
    failLookup = true;
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await request(app).get("/employees?status=active&limit=50")
        .set("Authorization", `Bearer ${getToken()}`);
      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to fetch employees");
      expect(response.body).not.toHaveProperty("employees");
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });
});
