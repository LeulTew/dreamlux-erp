import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { api, getEmployees, type EmployeeListStatus } from "./api";
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";

const originalAdapter = api.defaults.adapter;
afterEach(() => { api.defaults.adapter = originalAdapter; });

describe("Employee positional API compatibility", () => {
  it("keeps all eight existing arguments and the directory default request unchanged", async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = async (config) => {
      requests.push(config);
      return { data: { employees: [], total: 0, page: 1, limit: 50 }, status: 200, statusText: "OK", headers: {}, config };
    };
    await getEmployees();
    await getEmployees(3, 25, "Abebe Name", "trash", "office-id", "department-id", "salary", "desc");
    expect(api.getUri(requests[0])).toBe("/api/employees?page=1&limit=50");
    expect(requests[1].params).toEqual({
      page: 3, limit: 25, search: "Abebe Name", status: "trash", office_id: "office-id",
      department_id: "department-id", sortBy: "salary", sortOrder: "desc",
    });
    expect(requests[0].timeout).toBe(0);
    expect(requests[0].signal).toBeUndefined();
    expectTypeOf<Parameters<typeof getEmployees>[3]>().toEqualTypeOf<EmployeeListStatus | undefined>();
  });

  it("adds only optional cancellation and deadline settings for the staff lookup", async () => {
    let captured: AxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      captured = config;
      return { data: { employees: [], total: 0, page: 1, limit: 50 }, status: 200, statusText: "OK", headers: {}, config };
    };
    const controller = new AbortController();
    await getEmployees(1, 50, "SYN-0151", "active", undefined, undefined, "name", "asc", { signal: controller.signal, timeout: 10_000 });
    expect(captured?.signal).toBe(controller.signal);
    expect(captured?.timeout).toBe(10_000);
    expect(captured?.params).toEqual({
      page: 1, limit: 50, search: "SYN-0151", status: "active", office_id: undefined, department_id: undefined, sortBy: "name", sortOrder: "asc",
    });
  });
});
