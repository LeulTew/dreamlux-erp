import { describe, expect, it } from "vitest";
import { buildSidebarNavState, createPermissionMatcher } from "@/lib/sidebar-nav";

const t = (key: string) => `t:${key}`;

function navFor(pathname: string, slugs: string[], isSuperuser = false) {
  return buildSidebarNavState({
    pathname,
    t,
    hasPermission: createPermissionMatcher(slugs, isSuperuser),
  });
}

describe("sidebar permission navigation", () => {
  it("hides every permission-scoped group when the user has no matching slugs", () => {
    const nav = navFor("/hr/reports/profit", []);

    expect(nav.showHRGroup).toBe(false);
    expect(nav.showEmployeesMenu).toBe(false);
    expect(nav.showInventoryGroup).toBe(false);
    expect(nav.showAdminGroup).toBe(false);
    expect(nav.eventLinks).toEqual([]);
    expect(nav.financeLinks).toEqual([]);
  });

  it("does not expose profit reports or expense approvals to event-only users", () => {
    const nav = navFor("/events", ["events:read", "events:write"]);

    expect(nav.showHRGroup).toBe(true);
    expect(nav.showEmployeesMenu).toBe(false);
    expect(nav.eventLinks.map((link) => link.href)).toEqual([
      "/events",
      "/events/proposals",
      "/hr/event-types",
    ]);
    expect(nav.financeLinks.map((link) => link.href)).toEqual([]);
  });

  it("shows only financial routes backed by explicit financial permissions", () => {
    const nav = navFor("/hr/reports/profit", [
      "payroll:read",
      "expenses:approve",
      "reports:profit:read",
    ]);

    expect(nav.financeLinks).toEqual([
      { href: "/hr/payments", label: "t:Payroll", active: false },
      { href: "/hr/expenses/approve", label: "t:Expense Approvals", active: false },
      { href: "/hr/reports/profit", label: "t:Profit Reports", active: true },
    ]);
  });

  it("supports module wildcard permissions without widening unrelated modules", () => {
    const nav = navFor("/events/proposals/prop-1", ["events:*"]);

    expect(nav.eventLinks.map((link) => link.href)).toEqual([
      "/events",
      "/events/proposals",
      "/hr/event-types",
    ]);
    expect(nav.eventLinks.find((link) => link.href === "/events/proposals")?.active).toBe(true);
    expect(nav.financeLinks).toEqual([]);
    expect(nav.showInventoryGroup).toBe(false);
    expect(nav.showAdminGroup).toBe(false);
  });

  it("treats superusers and global wildcard users as fully authorized", () => {
    const superuserNav = navFor("/settings", [], true);
    const wildcardNav = navFor("/settings", ["*"]);

    for (const nav of [superuserNav, wildcardNav]) {
      expect(nav.showHRGroup).toBe(true);
      expect(nav.showEmployeesMenu).toBe(true);
      expect(nav.showInventoryGroup).toBe(true);
      expect(nav.showAdminGroup).toBe(true);
      expect(nav.eventLinks).toHaveLength(3);
      expect(nav.financeLinks).toHaveLength(4);
    }
  });
});
