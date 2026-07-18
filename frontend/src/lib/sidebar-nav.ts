export { createPermissionMatcher } from "@/lib/permission-matcher";
import type { PermissionChecker } from "@/lib/permission-matcher";
import { hasAnyPermission } from "@/lib/permission-matcher";

export type SidebarNavLink = {
  href: string;
  label: string;
  active: boolean;
};

export type SidebarNavState = {
  showHRGroup: boolean;
  showEmployeesMenu: boolean;
  showInventoryGroup: boolean;
  showAdminGroup: boolean;
  employeesLinks: SidebarNavLink[];
  eventLinks: SidebarNavLink[];
  financeLinks: SidebarNavLink[];
  refDataLinks: SidebarNavLink[];
  inventoryLinks: SidebarNavLink[];
  dispatchLink: SidebarNavLink | null;
  returnsLink: SidebarNavLink | null;
  reconcileLink: SidebarNavLink | null;
  auditLogLink: SidebarNavLink | null;
  reportsLink: SidebarNavLink | null;
  adminLink: SidebarNavLink | null;
};

const HR_GROUP_PERMISSIONS = [
  "hr:read",
  "hr:write",
  "events:read",
  "events:write",
  "events:proposals:write",
  "events:proposals:approve",
  "payroll:read",
  "payroll:write",
  "expenses:approve",
  "reports:profit:read",
  "salary-levels:manage",
  "departments:manage",
  "finance:hisab:read",
  "finance:overheads:read",
  "finance:investments:read",
];

const EVENT_PROPOSAL_PERMISSIONS = [
  "events:proposals:write",
  "events:write",
  "events:proposals:approve",
];

const PAYROLL_PERMISSIONS = ["payroll:read", "payroll:write"];
const ADMIN_PERMISSIONS = ["users:manage", "settings:write"];

export function buildSidebarNavState(params: {
  pathname: string;
  t: (key: string) => string;
  hasPermission: PermissionChecker;
}): SidebarNavState {
  const { pathname, t, hasPermission } = params;

  const hasAny = (slugs: string[]) => hasAnyPermission(hasPermission, slugs);

  // Employees group sub-links
  const employeesLinks = [
    {
      href: "/hr",
      label: t("HR Dashboard"),
      active: pathname === "/hr",
      show: hasPermission("hr:read") || hasPermission("payroll:read"),
    },
    {
      href: "/",
      label: t("List Employees"),
      active: pathname === "/",
      show: hasPermission("hr:read") || hasPermission("hr:write"),
    },
    {
      href: "/insert",
      label: t("Add Employee"),
      active: pathname === "/insert",
      show: hasPermission("hr:write"),
    },
  ]
    .filter((link) => link.show)
    .map(({ href, label, active }) => ({ href, label, active }));

  // Events group sub-links
  const eventLinks = [
    {
      href: "/events",
      label: t("List Events"),
      active: pathname === "/events",
      show: hasPermission("events:read"),
    },
    {
      href: "/events/proposals",
      label: t("Event Proposals"),
      active: pathname === "/events/proposals" || pathname.startsWith("/events/proposals/"),
      show: hasAny(EVENT_PROPOSAL_PERMISSIONS),
    },
    {
      href: "/hr/event-types",
      label: t("Event Types"),
      active: pathname === "/hr/event-types",
      show: hasPermission("events:write"),
    },
  ]
    .filter((link) => link.show)
    .map(({ href, label, active }) => ({ href, label, active }));

  // Finance group sub-links
  const financeLinks = [
    {
      href: "/hr/payments",
      label: t("Payroll"),
      active: pathname === "/hr/payments",
      show: hasAny(PAYROLL_PERMISSIONS),
    },
    {
      href: "/hr/salary-levels",
      label: t("Salary"),
      active: pathname === "/hr/salary-levels",
      show: hasPermission("salary-levels:manage"),
    },
    {
      href: "/hr/finance/hisab",
      label: t("Hisab Reports"),
      active: pathname === "/hr/finance/hisab" || pathname.startsWith("/hr/finance/hisab/"),
      show: hasPermission("finance:hisab:read"),
    },
    {
      href: "/hr/expenses/approve",
      label: t("Expense Approvals"),
      active: pathname === "/hr/expenses/approve",
      show: hasPermission("expenses:approve"),
    },
    {
      href: "/hr/reports/profit",
      label: t("Profit Reports"),
      active: pathname === "/hr/reports/profit",
      show: hasPermission("reports:profit:read"),
    },
    {
      href: "/hr/finance/overheads",
      label: t("Overhead Register"),
      active: pathname === "/hr/finance/overheads",
      show: hasPermission("finance:overheads:read"),
    },
    {
      href: "/hr/finance/investments",
      label: t("Capital Register"),
      active: pathname === "/hr/finance/investments",
      show: hasPermission("finance:investments:read"),
    },
  ]
    .filter((link) => link.show)
    .map(({ href, label, active }) => ({ href, label, active }));

  // Reference Data sub-links
  const refDataLinks = [
    {
      href: "/settings/departments",
      label: t("Departments"),
      active: pathname === "/settings/departments",
      show: hasPermission("departments:manage") || hasPermission("hr:read") || hasPermission("departments:read"),
    },
    {
      href: "/settings/positions",
      label: t("Positions"),
      active: pathname === "/settings/positions",
      show: hasPermission("positions:manage") || hasPermission("hr:read") || hasPermission("positions:read"),
    },
    {
      href: "/settings/offices",
      label: t("Offices"),
      active: pathname === "/settings/offices",
      show: hasPermission("offices:manage") || hasPermission("hr:read") || hasPermission("offices:read"),
    },
  ]
    .filter((link) => link.show)
    .map(({ href, label, active }) => ({ href, label, active }));

  const inventoryLinks = [
    ...(hasPermission("assets:read")
      ? [
          {
            href: "/assets/dashboard",
            label: t("Dashboard"),
            active: pathname === "/assets/dashboard",
            show: true,
          },
        ]
      : []),
    {
      href: "/assets",
      label: t("List Items"),
      active: pathname === "/assets",
      show: hasPermission("assets:read"),
    },
    {
      href: "/assets/insert",
      label: t("Add Item"),
      active: pathname === "/assets/insert",
      show: hasPermission("assets:write"),
    },
    {
      href: "/fleet",
      label: t("Fleet"),
      active: pathname === "/fleet" || pathname.startsWith("/fleet/"),
      show: hasPermission("vehicles:read"),
    },
  ]
    .filter((link) => link.show)
    .map(({ href, label, active }) => ({ href, label, active }));

  // Other Inventory modules
  const dispatchLink = hasAny(["event_allocations:write", "assets:write"])
    ? { href: "/assets/dispatch", label: t("Dispatch"), active: pathname === "/assets/dispatch" }
    : null;

  // Inbound return checklist (issue #173) — same capability as dispatch.
  const returnsLink = hasAny(["event_allocations:write", "assets:write"])
    ? { href: "/assets/returns", label: t("Returns"), active: pathname === "/assets/returns" }
    : null;

  const reconcileLink = hasPermission("assets:reconcile")
    ? { href: "/assets/reconcile", label: t("Reconcile"), active: pathname === "/assets/reconcile" }
    : null;

  const auditLogLink = hasPermission("assets:read")
    ? { href: "/assets/history", label: t("Audit Log"), active: pathname === "/assets/history" }
    : null;

  const reportsLink = hasPermission("assets:read")
    ? { href: "/assets/reports", label: t("Reports"), active: pathname === "/assets/reports" }
    : null;

  // Admin settings Footer link — active only on core settings pages, not Reference Data sub-routes
  // which have their own nav section (/settings/departments, /settings/positions, /settings/offices)
  const REFDATA_PATHS = ["/settings/departments", "/settings/positions", "/settings/offices"];
  const adminLinkActive = pathname.startsWith("/settings") && !REFDATA_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const adminLink = hasAny(ADMIN_PERMISSIONS)
    ? { href: "/settings", label: t("Admin"), active: adminLinkActive }
    : null;

  return {
    showHRGroup: hasAny(HR_GROUP_PERMISSIONS),
    showEmployeesMenu: employeesLinks.length > 0,
    showInventoryGroup: hasPermission("assets:read") || dispatchLink !== null || returnsLink !== null || hasPermission("vehicles:read"),
    showAdminGroup: hasAny([...ADMIN_PERMISSIONS, "departments:manage", "positions:manage", "offices:manage"]),
    employeesLinks,
    eventLinks,
    financeLinks,
    refDataLinks,
    inventoryLinks,
    dispatchLink,
    returnsLink,
    reconcileLink,
    auditLogLink,
    reportsLink,
    adminLink,
  };
}
