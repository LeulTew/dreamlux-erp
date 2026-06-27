import { describe, expect, it } from "vitest";
import { createPermissionMatcher, hasAnyPermission } from "@/lib/permission-matcher";

describe("permission matcher", () => {
  it("matches explicit, global wildcard, module wildcard, and superuser permissions", () => {
    expect(createPermissionMatcher(["events:write"])("events:write")).toBe(true);
    expect(createPermissionMatcher(["*"])("reports:profit:read")).toBe(true);
    expect(createPermissionMatcher(["reports:*"])("reports:profit:read")).toBe(true);
    expect(createPermissionMatcher([], true)("users:manage")).toBe(true);
  });

  it("does not widen module wildcard access across unrelated modules", () => {
    const hasPermission = createPermissionMatcher(["events:*"]);

    expect(hasPermission("events:proposals:write")).toBe(true);
    expect(hasPermission("reports:profit:read")).toBe(false);
    expect(hasAnyPermission(hasPermission, ["reports:profit:read", "payroll:read"])).toBe(false);
  });
});
