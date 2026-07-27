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
    expect(nav.employeesLinks).toEqual([]);
    expect(nav.inventoryLinks).toEqual([]);
    expect(nav.adminLink).toBeNull();
    expect(nav.dispatchLink).toBeNull();
    expect(nav.reconcileLink).toBeNull();
    expect(nav.auditLogLink).toBeNull();
    expect(nav.reportsLink).toBeNull();
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
      // 7 finance links: Payroll, Expense Approvals, Profit Reports,
      // Hisab Reports, Overhead Register, Capital Register, Salary
      // (Net Profit and Hisab Import are now layout subpages reachable via buttons inside Hisab Reports)
      expect(nav.financeLinks).toHaveLength(7);
      expect(nav.employeesLinks).toHaveLength(3); // HR Dashboard, List Employees, Add Employee
      expect(nav.adminLink).not.toBeNull();
    }
  });

  // --- New fields: employeesLinks ---
  it("shows HR Dashboard and List Employees for hr:read, but not Add Employee", () => {
    const nav = navFor("/", ["hr:read"]);
    expect(nav.employeesLinks.map((l) => l.href)).toEqual(["/hr", "/"]);
  });

  it("shows Add Employee only with hr:write", () => {
    const nav = navFor("/", ["hr:write"]);
    expect(nav.employeesLinks.some((l) => l.href === "/insert")).toBe(true);
  });

  it("marks the current employee link as active", () => {
    const nav = navFor("/insert", ["hr:write"]);
    const insertLink = nav.employeesLinks.find((l) => l.href === "/insert");
    expect(insertLink?.active).toBe(true);
  });

  it("shows inventory dashboard and list for assets:read, not Add Item", () => {
    const nav = navFor("/assets", ["assets:read"]);
    expect(nav.inventoryLinks.some((l) => l.href === "/assets/dashboard")).toBe(true);
    expect(nav.inventoryLinks.some((l) => l.href === "/assets")).toBe(true);
    expect(nav.inventoryLinks.some((l) => l.href === "/assets/insert")).toBe(false);
    expect(nav.auditLogLink).not.toBeNull();
    expect(nav.reportsLink).not.toBeNull();
    expect(nav.reconcileLink).toBeNull();
  });

  it("shows Add Item but not dispatch for assets:write alone", () => {
    const nav = navFor("/assets", ["assets:write"]);
    expect(nav.inventoryLinks.some((l) => l.href === "/assets/insert")).toBe(true);
    expect(nav.dispatchLink).toBeNull();
    expect(nav.showInventoryGroup).toBe(true);
  });

  it("shows reconcile only for assets:reconcile", () => {
    const nav = navFor("/assets/reconcile", ["assets:reconcile"]);
    expect(nav.reconcileLink).not.toBeNull();
  });

  it("shows dispatch for event_allocations:dispatch even without assets:read", () => {
    const nav = navFor("/assets/dispatch", ["event_allocations:dispatch"]);
    expect(nav.dispatchLink).not.toBeNull();
    expect(nav.showInventoryGroup).toBe(true);
    expect(nav.inventoryLinks.some((l) => l.href === "/assets/dashboard")).toBe(false); // no assets:read
  });

  // Issue #173: inbound returns share the dispatch capability.
  it("shows the Returns link for event_allocations:write", () => {
    const nav = navFor("/assets/returns", ["event_allocations:write"]);
    expect(nav.returnsLink?.href).toBe("/assets/returns");
    expect(nav.returnsLink?.active).toBe(true);
    expect(nav.showInventoryGroup).toBe(true);
  });

  it("hides the Returns link without allocation/asset write", () => {
    expect(navFor("/assets", ["assets:read"]).returnsLink).toBeNull();
  });

  // --- Roles & Access discoverability (issue #144) ---
  // The role editor lives under Settings (reachable from the Admin hub card),
  // NOT in the Reference Data dropdown.
  it("does not place the role editor in the Reference Data dropdown", () => {
    const nav = navFor("/settings/permissions", ["users:manage"]);
    expect(nav.refDataLinks.some((l) => l.href === "/settings/permissions")).toBe(false);
  });

  // --- Fleet (issue #147) ---
  it("shows Fleet link for vehicles:read and reveals the inventory group", () => {
    const nav = navFor("/fleet", ["vehicles:read"]);
    expect(nav.inventoryLinks.some((l) => l.href === "/fleet")).toBe(true);
    expect(nav.showInventoryGroup).toBe(true);
  });

  it("hides Fleet link without vehicles:read", () => {
    const nav = navFor("/assets", ["assets:read"]);
    expect(nav.inventoryLinks.some((l) => l.href === "/fleet")).toBe(false);
  });

  // --- Admin link ---
  it("hides admin link for non-admin users", () => {
    expect(navFor("/", ["hr:read"]).adminLink).toBeNull();
    expect(navFor("/", ["assets:read"]).adminLink).toBeNull();
  });

  it("shows admin link for users:manage", () => {
    const nav = navFor("/settings", ["users:manage"]);
    expect(nav.adminLink?.href).toBe("/settings");
    expect(nav.adminLink?.active).toBe(true);
  });

  it("shows admin link for settings:write", () => {
    expect(navFor("/", ["settings:write"]).adminLink).not.toBeNull();
  });

  // --- Finance: hisab-related entries ---
  it("shows hisab report but hides net-profit from sidebar for finance:hisab:read (net-profit is subpage button)", () => {
    const nav = navFor("/hr/finance/hisab", ["finance:hisab:read"]);
    const hrefs = nav.financeLinks.map((l) => l.href);
    expect(hrefs).toContain("/hr/finance/hisab");
    expect(hrefs).not.toContain("/hr/finance/net-profit");
  });

  it("shows overhead register for finance:overheads:read", () => {
    const nav = navFor("/", ["finance:overheads:read"]);
    expect(nav.financeLinks.some((l) => l.href === "/hr/finance/overheads")).toBe(true);
  });

  it("shows capital register for finance:investments:read", () => {
    const nav = navFor("/", ["finance:investments:read"]);
    expect(nav.financeLinks.some((l) => l.href === "/hr/finance/investments")).toBe(true);
  });

  it("hides hisab import from sidebar for finance:imports:write (import is subpage button)", () => {
    const nav = navFor("/", ["finance:imports:write"]);
    expect(nav.financeLinks.some((l) => l.href === "/hr/finance/imports")).toBe(false);
  });
});

