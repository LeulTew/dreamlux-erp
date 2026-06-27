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
  eventLinks: SidebarNavLink[];
  financeLinks: SidebarNavLink[];
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
      show: hasAnyPermission(hasPermission, EVENT_PROPOSAL_PERMISSIONS),
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

  const financeLinks = [
    {
      href: "/hr/payments",
      label: t("Payroll"),
      active: pathname === "/hr/payments",
      show: hasAnyPermission(hasPermission, PAYROLL_PERMISSIONS),
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
      href: "/hr/salary-levels",
      label: t("Salary"),
      active: pathname === "/hr/salary-levels",
      show: hasPermission("salary-levels:manage"),
    },
  ]
    .filter((link) => link.show)
    .map(({ href, label, active }) => ({ href, label, active }));

  return {
    showHRGroup: hasAnyPermission(hasPermission, HR_GROUP_PERMISSIONS),
    showEmployeesMenu: hasAnyPermission(hasPermission, ["hr:read", "hr:write"]),
    showInventoryGroup: hasPermission("assets:read"),
    showAdminGroup: hasAnyPermission(hasPermission, ADMIN_PERMISSIONS),
    eventLinks,
    financeLinks,
  };
}
