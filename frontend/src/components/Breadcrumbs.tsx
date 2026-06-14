"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { HiChevronRight } from "react-icons/hi2";

const ROUTE_LABELS: Record<string, string> = {
  "/": "Employees",
  "/insert": "Add Employee",
  "/events": "Events",
  "/hr": "HR",
  "/hr/payments": "Payroll",
  "/hr/payments/run": "Run Payroll",
  "/hr/salary-levels": "Salary Levels",
  "/hr/salary-levels/trash": "Trash",
  "/hr/event-types": "Event Types",
  "/hr/event-types/trash": "Trash",
  "/assets": "Inventory",
  "/assets/dashboard": "Dashboard",
  "/assets/insert": "Add Item",
  "/assets/new": "New Item",
  "/assets/reconcile": "Reconcile",
  "/assets/history": "Audit Log",
  "/assets/reports": "Reports",
  "/assets/low-stock": "Low Stock",
  "/assets/trash": "Trash",
  "/settings": "Settings",
  "/settings/users": "Users",
  "/report": "Report",
  "/report/employees": "Employee Reports",
  "/login": "Login",
};

function getSection(path: string): string {
  if (path === "/" || path === "/insert" || path === "/events" || path.startsWith("/hr")) return "HR";
  if (path.startsWith("/assets")) return "Inventory";
  if (path.startsWith("/settings")) return "Admin";
  if (path.startsWith("/report")) return "Reports";
  return "Dashboard";
}

export default function Breadcrumbs() {
  const pathname = usePathname();

  if (!pathname || pathname === "/login") return null;

  const section = getSection(pathname);
  const pageLabel = ROUTE_LABELS[pathname] || pathname.split("/").pop() || "Page";

  // Build breadcrumb trail
  const crumbs: { label: string; href?: string }[] = [{ label: section }];

  // Add intermediate paths for nested routes
  if (pathname.startsWith("/hr/")) {
    crumbs.push({ label: "Management", href: "/" });
  } else if (pathname.startsWith("/assets/") && pathname !== "/assets") {
    crumbs.push({ label: "Items", href: "/assets" });
  }

  // If section label != page label, add current page
  if (pageLabel !== section) {
    crumbs.push({ label: pageLabel });
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted select-none">
      {crumbs.map((crumb, idx) => (
        <span key={idx} className="flex items-center gap-1">
          {idx > 0 && <HiChevronRight className="w-3 h-3 text-muted/50 shrink-0" />}
          {crumb.href && idx < crumbs.length - 1 ? (
            <Link href={crumb.href} className="hover:text-foreground transition-colors font-medium">
              {crumb.label}
            </Link>
          ) : (
            <span className={idx === crumbs.length - 1 ? "text-foreground font-semibold" : "font-medium"}>
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
