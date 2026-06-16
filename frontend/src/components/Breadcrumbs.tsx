"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { HiChevronRight } from "react-icons/hi2";
import { useLanguage } from "@/hooks/use-language";

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
  }
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
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  if (!pathname || pathname === "/login") return null;

  const section = getSection(pathname);
  const pageLabel = ROUTE_LABELS[pathname] || pathname.split("/").pop() || "Page";

  // Build breadcrumb trail
  const crumbs: { label: string; href?: string }[] = [{ label: t(section) }];

  // Add intermediate paths for nested routes
  if (pathname.startsWith("/hr/")) {
    crumbs.push({ label: t("Management"), href: "/" });
  } else if (pathname.startsWith("/assets/") && pathname !== "/assets") {
    crumbs.push({ label: t("Items"), href: "/assets" });
  }

  // If section label != page label, add current page
  if (pageLabel !== section) {
    crumbs.push({ label: t(pageLabel) });
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
