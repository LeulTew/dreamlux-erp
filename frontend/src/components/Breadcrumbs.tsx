"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { HiChevronRight } from "react-icons/hi2";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";



const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "HR": "HR",
    "Inventory": "Inventory",
    "Admin": "Admin",
    "Reports": "Reports",
    "Management": "Management",
    "Items": "Items",
    "Employees": "Employees",
    "Add Employee": "Add Employee",
    "Events": "Events",
    "Payroll": "Payroll",
    "Run Payroll": "Run Payroll",
    "Salary Levels": "Salary Levels",
    "Trash": "Trash",
    "Event Types": "Event Types",
    "Dashboard": "Dashboard",
    "Add Item": "Add Item",
    "New Item": "New Item",
    "Reconcile": "Reconcile",
    "Audit Log": "Audit Log",
    "Low Stock": "Low Stock",
    "Settings": "Settings",
    "Users": "Users",
    "Report": "Report",
    "Employee Reports": "Employee Reports",
    "Login": "Login",
    "Page": "Page",
    "Expense Approvals": "Expense Approvals",
    "Profit Reports": "Profit Reports",
    "Event Proposals": "Event Proposals",
    "New Proposal": "New Proposal",
    "Role Permissions": "Role Permissions",
    "Security Posture": "Security Posture",
    "Workspace": "Workspace",
    "Proposal Detail": "Proposal Detail",
    "Location Detail": "Location Detail",
    "Detail": "Detail",
    "Location": "Location",
  },
  am: {
    "HR": "የሰው ኃይል",
    "Inventory": "ዕቃዎች",
    "Admin": "አስተዳዳሪ",
    "Reports": "ሪፖርቶች",
    "Management": "አስተዳደር",
    "Items": "ዕቃዎች",
    "Employees": "ሠራተኞች",
    "Add Employee": "ሠራተኛ መዝግብ",
    "Events": "ዝግጅቶች",
    "Payroll": "ደሞዝ",
    "Run Payroll": "ደሞዝ ማስላት",
    "Salary Levels": "የደሞዝ ደረጃዎች",
    "Trash": "ቆሻሻ መጣያ",
    "Event Types": "የዝግጅት ዓይነቶች",
    "Dashboard": "ዳሽቦርድ",
    "Add Item": "ዕቃ ጨምር",
    "New Item": "አዲስ ዕቃ",
    "Reconcile": "ቆጠራ ማመሳከሪያ",
    "Audit Log": "የቆጠራ ታሪክ",
    "Low Stock": "አነስተኛ ክምችት",
    "Settings": "ቅንብሮች",
    "Users": "ተጠቃሚዎች",
    "Report": "ሪፖርት",
    "Employee Reports": "የሠራተኞች ሪፖርት",
    "Login": "ግባ",
    "Page": "ገጽ",
    "Expense Approvals": "የወጪ ማጽደቂያ",
    "Profit Reports": "የትርፍ ሪፖርቶች",
    "Event Proposals": "የዝግጅት ፕሮፖዛሎች",
    "New Proposal": "አዲስ ፕሮፖዛል",
    "Role Permissions": "የሥልጣን ፈቃዶች",
    "Security Posture": "የደህንነት ሁኔታ",
    "Workspace": "የሥራ ቦታ",
    "Proposal Detail": "የፕሮፖዛል ዝርዝር",
    "Location Detail": "የቦታ ዝርዝር",
    "Detail": "ዝርዝር",
    "Location": "ቦታ",
  }
};

const PATH_METADATA: Record<string, { label: string; href?: string; permissions?: string[] }> = {
  "/": { label: "Employees" },
  "/insert": { label: "Add Employee", permissions: ["hr:write"] },
  "/events": { label: "Events", permissions: ["events:read"] },
  "/events/proposals": { label: "Event Proposals", permissions: ["events:proposals:write", "events:write", "events:proposals:approve"] },
  "/events/trash": { label: "Trash", permissions: ["events:read"] },
  "/events/proposals/trash": { label: "Trash", permissions: ["events:proposals:write", "events:write", "events:proposals:approve"] },
  "/events/proposals/new": { label: "New Proposal", permissions: ["events:proposals:write", "events:write"] },
  "/hr": { label: "Management", href: "/" },
  "/hr/event-types": { label: "Event Types", permissions: ["events:write"] },
  "/hr/event-types/trash": { label: "Trash", permissions: ["events:write"] },
  "/hr/payments": { label: "Payroll", permissions: ["payroll:read", "payroll:write"] },
  "/hr/payments/run": { label: "Run Payroll", permissions: ["payroll:write"] },
  "/hr/salary-levels": { label: "Salary Levels", permissions: ["salary-levels:manage"] },
  "/hr/salary-levels/trash": { label: "Trash", permissions: ["salary-levels:manage"] },
  "/hr/expenses/approve": { label: "Expense Approvals", permissions: ["expenses:approve"] },
  "/hr/reports/profit": { label: "Profit Reports", permissions: ["reports:profit:read"] },
  "/assets": { label: "Items", permissions: ["assets:read"] },
  "/assets/dashboard": { label: "Dashboard", permissions: ["assets:read"] },
  "/assets/new": { label: "New Item", permissions: ["assets:write"] },
  "/assets/reconcile": { label: "Reconcile", permissions: ["assets:reconcile"] },
  "/assets/history": { label: "Audit Log", permissions: ["assets:read"] },
  "/assets/reports": { label: "Reports", permissions: ["assets:read"] },
  "/assets/low-stock": { label: "Low Stock", permissions: ["assets:read"] },
  "/assets/location": { label: "Location", href: "/assets" },
  "/settings": { label: "Settings", permissions: ["users:manage", "settings:write"] },
  "/settings/users": { label: "Users", permissions: ["users:manage"] },
  "/settings/permissions": { label: "Role Permissions", permissions: ["users:manage", "settings:write"] },
  "/settings/security": { label: "Security Posture", permissions: ["users:manage", "settings:write"] },
  "/report/employees": { label: "Employee Reports", permissions: ["hr:read", "hr:write"] },
};

function getSection(path: string): string {
  if (path === "/" || path === "/insert" || path.startsWith("/events") || path.startsWith("/hr")) return "HR";
  if (path.startsWith("/assets")) return "Inventory";
  if (path.startsWith("/settings")) return "Admin";
  if (path.startsWith("/report")) return "Reports";
  return "Dashboard";
}

const isId = (segment: string) => {
  return /^\d+$/.test(segment) || /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(segment);
};

const getDynamicLabel = (segment: string, parentSegment: string): string => {
  if (parentSegment === "events") {
    return "Workspace";
  }
  if (parentSegment === "proposals") {
    return "Proposal Detail";
  }
  if (parentSegment === "location") {
    return "Location Detail";
  }
  return "Detail";
};

export default function Breadcrumbs() {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const { hasAnyPermission } = useAuth();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  if (!pathname || pathname === "/login") return null;

  const section = getSection(pathname);
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href?: string; permissions?: string[] }[] = [];

  // Always start with the section root
  crumbs.push({ label: t(section) });

  if (pathname === "/") {
    crumbs.push({ label: t("Employees") });
  }

  let cumulative = "";
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    cumulative += `/${segment}`;

    let label = "";
    let permissions: string[] | undefined = undefined;
    let overrideHref: string | undefined = undefined;

    if (isId(segment)) {
      const parentSegment = i > 0 ? segments[i - 1] : "";
      label = getDynamicLabel(segment, parentSegment);
      const parentPath = cumulative.substring(0, cumulative.lastIndexOf("/"));
      permissions = PATH_METADATA[parentPath]?.permissions;
    } else {
      const meta = PATH_METADATA[cumulative];
      if (meta) {
        label = meta.label;
        permissions = meta.permissions;
        overrideHref = meta.href;
      } else {
        label = segment.charAt(0).toUpperCase() + segment.slice(1);
      }
    }

    // Only add a link for intermediate segments
    const href = i < segments.length - 1 ? (overrideHref || cumulative) : undefined;

    crumbs.push({
      label: t(label),
      href,
      permissions,
    });
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted select-none">
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        const isAllowed = crumb.permissions ? hasAnyPermission(crumb.permissions) : true;
        const renderLink = crumb.href && !isLast && isAllowed;

        return (
          <span key={idx} className="flex items-center gap-1">
            {idx > 0 && <HiChevronRight className="w-3 h-3 text-muted/50 shrink-0" />}
            {renderLink ? (
              <Link href={crumb.href!} className="hover:text-foreground transition-colors font-medium">
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? "text-foreground font-semibold" : "font-medium text-muted/80"}>
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
