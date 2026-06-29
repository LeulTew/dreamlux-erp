"use client";
import React, { useState, useMemo, useSyncExternalStore, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HiUsers,
  HiOutlineCalendar,
  HiOutlineBanknotes,
  HiBuildingOffice,
  HiTableCells,
  HiOutlineClipboardDocumentCheck,
  HiCog6Tooth,
  HiOutlineDocumentChartBar,
  HiChevronDown,
  HiChevronUp,
  HiChevronLeft,
  HiOutlineBell,
} from "react-icons/hi2";
import { useLanguage } from "@/hooks/use-language";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    Employees: "Employees",
    Payroll: "Payroll",
    Salary: "Salary Levels",
    "Expense Approvals": "Expense Approvals",
    "Event Types": "Event Types",
    "Add Employee": "Add Employee",
    "List Employees": "List Employees",
    Dashboard: "Dashboard",
    Inventory: "Inventory",
    Reconcile: "Reconcile",
    "Audit Log": "Audit Log",
    Reports: "Reports",
    "Add Item": "Add Item",
    "List Items": "List Items",
    Admin: "Settings",
    Events: "Events",
    "HR Management": "HR",
    "Inventory Management": "INVENTORY",
    Search: "Search",
    "List Events": "List Events",
    Finance: "Finance",
    "Profit Reports": "Profit Reports",
    "Event Proposals": "Event Proposals",
    Synced: "Synced",
    Offline: "Offline",
    Syncing: "Syncing",
    "Sync warning": "Sync warning",
    queued: "queued",
    "Reference Data": "Reference Data",
    Departments: "Departments",
    Positions: "Positions",
    Offices: "Offices",
    "Salary Levels": "Salary Levels",
    Notifications: "Notifications",
  },
  am: {
    Employees: "ሰራተኞች",
    Notifications: "ማሳወቂያዎች",
    Payroll: "ደመወዝ",
    Salary: "ደረጃዎች",
    "Expense Approvals": "የወጪ ማጽደቂያ",
    "Event Types": "የዝግጅት አይነቶች",
    "Add Employee": "ሰራተኛ መዝግብ",
    "List Employees": "የሰራተኞች ዝርዝር",
    Dashboard: "ዋና ገጽ",
    Inventory: "ዕቃዎች",
    Reconcile: "ቆጠራ ማመሳከሪያ",
    "Audit Log": "የቆጠራ ታሪክ",
    Reports: "ሪፖርቶች",
    "Add Item": "ዕቃ መዝግብ",
    "List Items": "የዕቃዎች ዝርዝር",
    Admin: "አስተዳዳሪ",
    Events: "ዝግጅቶች",
    "HR Management": "የሰው ኃይል",
    "Inventory Management": "ዕቃዎች",
    Search: "ፈልግ",
    "List Events": "የዝግጅቶች ዝርዝር",
    Finance: "ፋይናንስ",
    "Profit Reports": "የትርፍ ሪፖርቶች",
    "Event Proposals": "የዝግጅት ፕሮፖዛሎች",
    Synced: "ተመሳስሏል",
    Offline: "ከመስመር ውጭ",
    Syncing: "በማመሳሰል ላይ",
    "Sync warning": "የማመሳሰል ማስጠንቀቂያ",
    queued: "በወረፋ",
    "Reference Data": "መሠረታዊ መረጃዎች",
    Departments: "የሥራ ክፍሎች",
    Positions: "የስራ መደቦች",
    Offices: "ቢሮዎች",
    "Salary Levels": "የደሞዝ ደረጃዎች",
  },
};

/* ── Popout menu for collapsed sidebar ──────────────────── */
interface CollapsedPopoutLink {
  href: string;
  label: string;
  active: boolean;
}

function CollapsedPopout({
  icon: Icon,
  label,
  isActive,
  links,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  links: CollapsedPopoutLink[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 200); // 200ms delay for smooth transition
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="relative flex justify-center w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={() => setOpen(!open)}
        className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all cursor-pointer ${
          isActive
            ? "bg-primary text-primary-foreground shadow-md animate-pulse-subtle"
            : "text-muted hover:bg-card-alt hover:text-foreground"
        }`}
        title={label}
      >
        <Icon className="w-[22px] h-[22px] shrink-0" />
      </button>
      {open && (
        <div
          className="absolute left-[calc(100%+16px)] top-[32px] z-50 bg-card border border-border/80 rounded-2xl p-1.5 min-w-[170px] shadow-massive flex flex-col gap-0.5 animate-scale-in"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Transparent bridge to fill the 16px hover gap and prevent mouse-leave trigger */}
          <div className="absolute right-full top-[-32px] w-6 h-[calc(100%+32px)] bg-transparent" style={{ marginRight: "-1px" }} />

          {/* Subtle curved SVG connection tree-lines */}
          <svg className="absolute right-full top-0 w-[72px] h-full pointer-events-none" style={{ marginRight: "-1px" }}>
            {links.map((link, idx) => {
              const y_item = 22 + idx * 34; // First item center is ~22px, next centers are spaced by 34px
              const x_start = 8; // Button center in 96px sidebar (SVG width 72px, popout starts at 96+16=112px, 112-48=64px offset)
              const x_trunk = 28; // Completely clears the button circle (24px radius from center)
              const y_start = 16; // Button bottom height relative to top-[32px] container
              const r = 6;

              const path = idx === 0
                ? `M ${x_start},${y_start} H ${x_trunk - r} Q ${x_trunk},${y_start} ${x_trunk},${y_item} L 72,${y_item}`
                : `M ${x_start},${y_start} H ${x_trunk - r} Q ${x_trunk},${y_start} ${x_trunk},${y_start + r} V ${y_item - r} Q ${x_trunk},${y_item} ${x_trunk + r},${y_item} L 72,${y_item}`;

              return (
                <path
                  key={link.href}
                  d={path}
                  fill="none"
                  stroke="currentColor"
                  className="text-muted/40 dark:text-muted/20"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          <div className="flex flex-col gap-0.5">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`block px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  link.active
                    ? "bg-primary/10 text-primary font-bold"
                    : "text-foreground/80 hover:bg-card-alt hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  active,
  isCollapsed,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  isCollapsed: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  if (isCollapsed) {
    return (
      <div
        className="relative flex justify-center w-full"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Link
          href={href}
          className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all cursor-pointer ${
            active
              ? "bg-primary text-primary-foreground shadow-md"
              : "text-muted hover:bg-card-alt hover:text-foreground"
          }`}
        >
          <Icon className="w-[22px] h-[22px] shrink-0" />
        </Link>
        {hovered && (
          <div className="absolute left-[calc(100%+16px)] top-[6px] z-50 bg-card border border-border/80 rounded-2xl px-3 py-2 shadow-massive flex items-center animate-scale-in pointer-events-none whitespace-nowrap">
            <span className="text-foreground/90 font-semibold text-xs leading-none">
              {label}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <SidebarMenuButton
      asChild
      isActive={active}
      tooltip={label}
      className={`rounded-xl h-10 border border-transparent ${
        active ? "bg-primary/[0.04] border-primary/[0.08] text-primary font-bold dark:bg-primary-light dark:border-transparent" : ""
      }`}
    >
      <Link href={href}>
        <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? "text-primary" : ""}`} />
        <span>{label}</span>
      </Link>
    </SidebarMenuButton>
  );
}
function SubItemBranchLine({ isLast }: { isLast: boolean }) {
  return (
    <div className="absolute left-[-14px] top-0 bottom-0 w-3.5 pointer-events-none flex items-center">
      <svg className="w-full h-full text-muted/40 dark:text-muted/20" viewBox="0 0 14 36" preserveAspectRatio="none">
        {isLast ? (
          <path
            d="M 0,0 V 18 Q 0,18 8,18 L 14,18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M 0,0 V 36 M 0,18 Q 0,18 8,18 L 14,18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        )}
      </svg>
    </div>
  );
}



export function AppSidebar() {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const { state: sidebarState, toggleSidebar } = useSidebar();
  const isCollapsed = sidebarState === "collapsed";

  // Collapsible sub-menus state
  const [employeesOpen, setEmployeesOpen] = useState(true);
  const [itemsOpen, setItemsOpen] = useState(true);
  const [eventsOpen, setEventsOpen] = useState(true);
  const [financeOpen, setFinanceOpen] = useState(true);

  const isRefDataActive = pathname.startsWith("/settings/departments") || 
                          pathname.startsWith("/settings/positions") || 
                          pathname.startsWith("/settings/offices");
  const [refDataOpen, setRefDataOpen] = useState(isRefDataActive);

  useEffect(() => {
    if (isRefDataActive) {
      setRefDataOpen(true);
    } else {
      setRefDataOpen(false);
    }
  }, [pathname, isRefDataActive]);


  // Sync user details reactively
  const userSnapshot = useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    },
    () => localStorage.getItem("user") || "",
    () => ""
  );

  const currentUser = useMemo(() => {
    const fallback = {
      role: "admin",
      role_name: "admin",
      full_name: "User",
      profile_image_url: null as string | null,
    };
    if (!userSnapshot) return fallback;

    try {
      const parsed = JSON.parse(userSnapshot);
      const resolvedRole = parsed.role_name || parsed.role || "admin";
      return {
        role: resolvedRole,
        role_name: resolvedRole,
        full_name: parsed.full_name || parsed.username || "User",
        profile_image_url: parsed.profile_image_url || null,
      };
    } catch {
      return fallback;
    }
  }, [userSnapshot]);

  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const { hasPermission, hasAnyPermission } = useAuth();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const showHRGroup = hasAnyPermission([
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
    "departments:manage"
  ]);

  const eventLinks = [
    { href: "/events", label: t("List Events"), active: pathname === "/events", show: hasPermission("events:read") },
    { href: "/events/proposals", label: t("Event Proposals"), active: pathname === "/events/proposals" || pathname.startsWith("/events/proposals/"), show: hasAnyPermission(["events:proposals:write", "events:write", "events:proposals:approve"]) },
    { href: "/hr/event-types", label: t("Event Types"), active: pathname === "/hr/event-types", show: hasPermission("events:write") },
  ].filter(l => l.show);

  const financeLinks = [
    { href: "/hr/payments", label: t("Payroll"), active: pathname === "/hr/payments", show: hasAnyPermission(["payroll:read", "payroll:write"]) },
    { href: "/hr/expenses/approve", label: t("Expense Approvals"), active: pathname === "/hr/expenses/approve", show: hasPermission("expenses:approve") },
    { href: "/hr/reports/profit", label: t("Profit Reports"), active: pathname === "/hr/reports/profit", show: hasPermission("reports:profit:read") },
    { href: "/hr/salary-levels", label: t("Salary"), active: pathname === "/hr/salary-levels", show: hasPermission("salary-levels:manage") },
  ].filter(l => l.show);

  const refDataLinks = [
    { href: "/settings/departments", label: t("Departments"), active: pathname === "/settings/departments", show: hasPermission("departments:manage") || hasPermission("hr:read") || hasPermission("departments:read") },
    { href: "/settings/positions", label: t("Positions"), active: pathname === "/settings/positions", show: hasPermission("positions:manage") || hasPermission("hr:read") || hasPermission("positions:read") },
    { href: "/settings/offices", label: t("Offices"), active: pathname === "/settings/offices", show: hasPermission("offices:manage") || hasPermission("hr:read") || hasPermission("offices:read") },
  ].filter(l => l.show);


  return (
    <Sidebar
      collapsible="icon"
      className="border-none bg-transparent [&_[data-sidebar=sidebar]]:border-none [&_[data-sidebar=sidebar]]:bg-transparent [&_[data-sidebar=sidebar]]:shadow-none"
    >
      {/* Header - Logo & Collapse Toggle */}
      <SidebarHeader className={`py-5 flex flex-row items-center justify-between select-none ${isCollapsed ? "px-0 justify-center" : "px-4"}`}>
        {isCollapsed ? (
          <button
            onClick={toggleSidebar}
            className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center text-background font-bold text-lg shrink-0 hover:opacity-90 transition-all cursor-pointer active:scale-95 shadow-md border border-border/10"
            title="Expand Sidebar"
          >
            D
          </button>
        ) : (
          <>
            <div className="flex items-center gap-3 truncate">
              <button
                onClick={toggleSidebar}
                className="w-9 h-9 rounded-xl bg-foreground flex items-center justify-center text-background font-bold text-base shrink-0 hover:opacity-90 transition-all cursor-pointer active:scale-95 shadow-md border border-border/10"
                title="Collapse Sidebar"
              >
                D
              </button>
              <div className="flex flex-col truncate">
                <span className="font-bold tracking-tight text-foreground text-sm leading-tight">
                  Dream Lux
                </span>
                <span className="text-[9px] text-muted font-medium tracking-widest uppercase leading-none mt-0.5">
                  ERP System
                </span>
              </div>
            </div>

            <button
              onClick={toggleSidebar}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-foreground hover:bg-card-alt transition-all cursor-pointer shrink-0"
              title="Collapse Sidebar"
            >
              <HiChevronLeft className="w-4 h-4" />
            </button>
          </>
        )}
      </SidebarHeader>

      {/* Content Groupings */}
      <SidebarContent className="py-2">
        {/* HR Management Section */}
        {showHRGroup && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-4 text-[10px] font-semibold tracking-widest uppercase text-muted/60 group-data-[collapsible=icon]:hidden">
              {t("HR Management")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className={`${isCollapsed ? "items-center gap-2" : ""}`}>
                {/* Employees (Nested) — expanded vs collapsed */}
                {hasAnyPermission(["hr:read", "hr:write"]) && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    {isCollapsed ? (
                      <CollapsedPopout
                        icon={HiUsers}
                        label={t("Employees")}
                        isActive={isActive("/") || isActive("/insert")}
                        links={[
                          { href: "/", label: t("List Employees"), active: pathname === "/" },
                          { href: "/insert", label: t("Add Employee"), active: pathname === "/insert" },
                        ]}
                      />
                    ) : (
                      <div className="w-full">
                        <SidebarMenuButton
                          onClick={() => setEmployeesOpen(!employeesOpen)}
                          className={`w-full justify-between h-10 border border-transparent transition-all ${
                            isActive("/") || isActive("/insert")
                              ? "bg-primary-light border-l-2 border-primary text-primary font-bold rounded-l-none rounded-r-xl dark:border-transparent dark:rounded-xl"
                              : "rounded-xl"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <HiUsers className={`w-[18px] h-[18px] shrink-0 ${isActive("/") || isActive("/insert") ? "text-primary" : ""}`} />
                            <span>{t("Employees")}</span>
                          </span>
                          <span className="shrink-0">
                            {employeesOpen ? (
                              <HiChevronUp className={`w-3.5 h-3.5 ${isActive("/") || isActive("/insert") ? "text-primary" : "text-muted/60"}`} />
                            ) : (
                              <HiChevronDown className={`w-3.5 h-3.5 ${isActive("/") || isActive("/insert") ? "text-primary" : "text-muted/60"}`} />
                            )}
                          </span>
                        </SidebarMenuButton>
                        {employeesOpen && (
                          <SidebarMenuSub className="ml-[27px] border-none pl-3.5 space-y-0.5 mt-1 relative">
                            <SidebarMenuSubItem className="relative">
                              <SubItemBranchLine isLast={false} />
                              <SidebarMenuSubButton asChild isActive={pathname === "/"} className="rounded-xl">
                                <Link
                                  href="/"
                                  className={
                                    pathname === "/"
                                      ? "text-primary font-bold flex items-center gap-1.5"
                                      : "text-muted flex items-center gap-1.5"
                                  }
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
                                      pathname === "/" ? "bg-primary scale-100" : "bg-transparent scale-0"
                                    }`}
                                  />
                                  <span>{t("List Employees")}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem className="relative">
                              <SubItemBranchLine isLast={true} />
                              <SidebarMenuSubButton asChild isActive={pathname === "/insert"} className="rounded-xl">
                                <Link
                                  href="/insert"
                                  className={
                                    pathname === "/insert"
                                      ? "text-primary font-bold flex items-center gap-1.5"
                                      : "text-muted flex items-center gap-1.5"
                                  }
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
                                      pathname === "/insert" ? "bg-primary scale-100" : "bg-transparent scale-0"
                                    }`}
                                  />
                                  <span>{t("Add Employee")}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        )}
                      </div>
                    )}
                  </SidebarMenuItem>
                )}

                {/* Events dropdown */}
                {eventLinks.length > 0 && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    {isCollapsed ? (
                      <CollapsedPopout
                        icon={HiOutlineCalendar}
                        label={t("Events")}
                        isActive={isActive("/events") || isActive("/hr/event-types") || isActive("/events/proposals")}
                        links={eventLinks.map(l => ({ href: l.href, label: l.label, active: l.active }))}
                      />
                    ) : (
                      <div className="w-full">
                        <SidebarMenuButton
                          onClick={() => setEventsOpen(!eventsOpen)}
                          className={`w-full justify-between h-10 border border-transparent transition-all ${
                            isActive("/events") || isActive("/hr/event-types") || isActive("/events/proposals")
                              ? "bg-primary-light border-l-2 border-primary text-primary font-bold rounded-l-none rounded-r-xl dark:border-transparent dark:rounded-xl"
                              : "rounded-xl"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <HiOutlineCalendar className={`w-[18px] h-[18px] shrink-0 ${isActive("/events") || isActive("/hr/event-types") || isActive("/events/proposals") ? "text-primary" : ""}`} />
                            <span>{t("Events")}</span>
                          </span>
                          <span className="shrink-0">
                            {eventsOpen ? (
                              <HiChevronUp className={`w-3.5 h-3.5 ${isActive("/events") || isActive("/hr/event-types") || isActive("/events/proposals") ? "text-primary" : "text-muted/60"}`} />
                            ) : (
                              <HiChevronDown className={`w-3.5 h-3.5 ${isActive("/events") || isActive("/hr/event-types") || isActive("/events/proposals") ? "text-primary" : "text-muted/60"}`} />
                            )}
                          </span>
                        </SidebarMenuButton>
                        {eventsOpen && (
                          <SidebarMenuSub className="ml-[27px] border-none pl-3.5 space-y-0.5 mt-1 relative">
                            {eventLinks.map((link, idx) => (
                              <SidebarMenuSubItem key={link.href} className="relative">
                                <SubItemBranchLine isLast={idx === eventLinks.length - 1} />
                                <SidebarMenuSubButton asChild isActive={link.active} className="rounded-xl">
                                  <Link
                                    href={link.href}
                                    className={
                                      link.active
                                        ? "text-primary font-bold flex items-center gap-1.5"
                                        : "text-muted flex items-center gap-1.5"
                                    }
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
                                        link.active ? "bg-primary scale-100" : "bg-transparent scale-0"
                                      }`}
                                    />
                                    <span>{link.label}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        )}
                      </div>
                    )}
                  </SidebarMenuItem>
                )}

                {/* Finance dropdown */}
                {financeLinks.length > 0 && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    {isCollapsed ? (
                      <CollapsedPopout
                        icon={HiOutlineBanknotes}
                        label={t("Finance")}
                        isActive={isActive("/hr/payments") || isActive("/hr/salary-levels") || isActive("/hr/reports/profit") || isActive("/hr/expenses")}
                        links={financeLinks.map(l => ({ href: l.href, label: l.label, active: l.active }))}
                      />
                    ) : (
                      <div className="w-full">
                        <SidebarMenuButton
                          onClick={() => setFinanceOpen(!financeOpen)}
                          className={`w-full justify-between h-10 border border-transparent transition-all ${
                            isActive("/hr/payments") || isActive("/hr/salary-levels") || isActive("/hr/reports/profit") || isActive("/hr/expenses")
                              ? "bg-primary-light border-l-2 border-primary text-primary font-bold rounded-l-none rounded-r-xl dark:border-transparent dark:rounded-xl"
                              : "rounded-xl"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <HiOutlineBanknotes className={`w-[18px] h-[18px] shrink-0 ${isActive("/hr/payments") || isActive("/hr/salary-levels") || isActive("/hr/reports/profit") || isActive("/hr/expenses") ? "text-primary" : ""}`} />
                            <span>{t("Finance")}</span>
                          </span>
                          <span className="shrink-0">
                            {financeOpen ? (
                              <HiChevronUp className={`w-3.5 h-3.5 ${isActive("/hr/payments") || isActive("/hr/salary-levels") || isActive("/hr/reports/profit") || isActive("/hr/expenses") ? "text-primary" : "text-muted/60"}`} />
                            ) : (
                              <HiChevronDown className={`w-3.5 h-3.5 ${isActive("/hr/payments") || isActive("/hr/salary-levels") || isActive("/hr/reports/profit") || isActive("/hr/expenses") ? "text-primary" : "text-muted/60"}`} />
                            )}
                          </span>
                        </SidebarMenuButton>
                        {financeOpen && (
                          <SidebarMenuSub className="ml-[27px] border-none pl-3.5 space-y-0.5 mt-1 relative">
                            {financeLinks.map((link, idx) => (
                              <SidebarMenuSubItem key={link.href} className="relative">
                                <SubItemBranchLine isLast={idx === financeLinks.length - 1} />
                                <SidebarMenuSubButton asChild isActive={link.active} className="rounded-xl">
                                  <Link
                                    href={link.href}
                                    className={
                                      link.active
                                        ? "text-primary font-bold flex items-center gap-1.5"
                                        : "text-muted flex items-center gap-1.5"
                                    }
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
                                        link.active ? "bg-primary scale-100" : "bg-transparent scale-0"
                                      }`}
                                    />
                                    <span>{link.label}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        )}
                      </div>
                    )}
                  </SidebarMenuItem>
                )}

                {/* Reference Data dropdown */}
                {refDataLinks.length > 0 && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    {isCollapsed ? (
                      <CollapsedPopout
                        icon={HiOutlineClipboardDocumentCheck}
                        label={t("Reference Data")}
                        isActive={isActive("/settings/departments") || isActive("/settings/positions") || isActive("/settings/offices")}
                        links={refDataLinks.map(l => ({ href: l.href, label: l.label, active: l.active }))}
                      />
                    ) : (
                      <div className="w-full">
                        <SidebarMenuButton
                          onClick={() => setRefDataOpen(!refDataOpen)}
                          className={`w-full justify-between h-10 border border-transparent transition-all ${
                            isActive("/settings/departments") || isActive("/settings/positions") || isActive("/settings/offices")
                              ? "bg-primary-light border-l-2 border-primary text-primary font-bold rounded-l-none rounded-r-xl dark:border-transparent dark:rounded-xl"
                              : "rounded-xl"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <HiOutlineClipboardDocumentCheck className={`w-[18px] h-[18px] shrink-0 ${isActive("/settings/departments") || isActive("/settings/positions") || isActive("/settings/offices") ? "text-primary" : ""}`} />
                            <span>{t("Reference Data")}</span>
                          </span>
                          <span className="shrink-0">
                            {refDataOpen ? (
                              <HiChevronUp className={`w-3.5 h-3.5 ${isActive("/settings/departments") || isActive("/settings/positions") || isActive("/settings/offices") ? "text-primary" : "text-muted/60"}`} />
                            ) : (
                              <HiChevronDown className={`w-3.5 h-3.5 ${isActive("/settings/departments") || isActive("/settings/positions") || isActive("/settings/offices") ? "text-primary" : "text-muted/60"}`} />
                            )}
                          </span>
                        </SidebarMenuButton>
                        {refDataOpen && (
                          <SidebarMenuSub className="ml-[27px] border-none pl-3.5 space-y-0.5 mt-1 relative">
                            {refDataLinks.map((link, idx) => (
                              <SidebarMenuSubItem key={link.href} className="relative">
                                <SubItemBranchLine isLast={idx === refDataLinks.length - 1} />
                                <SidebarMenuSubButton asChild isActive={link.active} className="rounded-xl">
                                  <Link
                                    href={link.href}
                                    className={
                                      link.active
                                        ? "text-primary font-bold flex items-center gap-1.5"
                                        : "text-muted flex items-center gap-1.5"
                                    }
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
                                        link.active ? "bg-primary scale-100" : "bg-transparent scale-0"
                                      }`}
                                    />
                                    <span>{link.label}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        )}
                      </div>
                    )}
                  </SidebarMenuItem>
                )}
              </SidebarMenu>

            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Inventory Management Section */}
        {hasPermission("assets:read") && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-4 text-[10px] font-semibold tracking-widest uppercase text-muted/60 group-data-[collapsible=icon]:hidden">
              {t("Inventory Management")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className={`${isCollapsed ? "items-center gap-2" : ""}`}>
                {/* Dashboard */}
                <SidebarMenuItem className="w-full flex justify-center">
                  <SidebarLink
                    href="/assets/dashboard"
                    icon={HiBuildingOffice}
                    label={t("Dashboard")}
                    active={isActive("/assets/dashboard")}
                    isCollapsed={isCollapsed}
                  />
                </SidebarMenuItem>

                {/* Items (Nested) */}
                <SidebarMenuItem className="w-full flex justify-center">
                  {isCollapsed ? (
                    <CollapsedPopout
                      icon={HiTableCells}
                      label={t("Inventory")}
                      isActive={isActive("/assets") || isActive("/assets/insert")}
                      links={[
                        { href: "/assets", label: t("List Items"), active: pathname === "/assets" },
                        { href: "/assets/insert", label: t("Add Item"), active: pathname === "/assets/insert" },
                      ]}
                    />
                  ) : (
                    <div className="w-full">
                      <SidebarMenuButton
                        onClick={() => setItemsOpen(!itemsOpen)}
                        className={`w-full justify-between h-10 border border-transparent transition-all ${
                          isActive("/assets") || isActive("/assets/insert")
                            ? "bg-primary-light border-l-2 border-primary text-primary font-bold rounded-l-none rounded-r-xl dark:border-transparent dark:rounded-xl"
                            : "rounded-xl"
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <HiTableCells className={`w-[18px] h-[18px] shrink-0 ${isActive("/assets") || isActive("/assets/insert") ? "text-primary" : ""}`} />
                          <span>{t("Inventory")}</span>
                        </span>
                        <span className="shrink-0">
                          {itemsOpen ? (
                            <HiChevronUp className={`w-3.5 h-3.5 ${isActive("/assets") || isActive("/assets/insert") ? "text-primary" : "text-muted/60"}`} />
                          ) : (
                            <HiChevronDown className={`w-3.5 h-3.5 ${isActive("/assets") || isActive("/assets/insert") ? "text-primary" : "text-muted/60"}`} />
                          )}
                        </span>
                      </SidebarMenuButton>
                      {itemsOpen && (
                        <SidebarMenuSub className="ml-[27px] border-none pl-3.5 space-y-0.5 mt-1 relative">
                          <SidebarMenuSubItem className="relative">
                            <SubItemBranchLine isLast={false} />
                            <SidebarMenuSubButton asChild isActive={pathname === "/assets"} className="rounded-xl">
                              <Link
                                href="/assets"
                                className={
                                  pathname === "/assets"
                                    ? "text-primary font-bold flex items-center gap-1.5"
                                    : "text-muted flex items-center gap-1.5"
                                }
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
                                    pathname === "/assets" ? "bg-primary scale-100" : "bg-transparent scale-0"
                                  }`}
                                />
                                <span>{t("List Items")}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem className="relative">
                            <SubItemBranchLine isLast={true} />
                            <SidebarMenuSubButton asChild isActive={pathname === "/assets/insert"} className="rounded-xl">
                              <Link
                                href="/assets/insert"
                                className={
                                  pathname === "/assets/insert"
                                    ? "text-primary font-bold flex items-center gap-1.5"
                                    : "text-muted flex items-center gap-1.5"
                                }
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
                                    pathname === "/assets/insert" ? "bg-primary scale-100" : "bg-transparent scale-0"
                                  }`}
                                />
                                <span>{t("Add Item")}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </SidebarMenuSub>
                      )}
                    </div>
                  )}
                </SidebarMenuItem>

                {/* Reconcile */}
                <SidebarMenuItem className="w-full flex justify-center">
                  <SidebarLink
                    href="/assets/reconcile"
                    icon={HiOutlineClipboardDocumentCheck}
                    label={t("Reconcile")}
                    active={isActive("/assets/reconcile")}
                    isCollapsed={isCollapsed}
                  />
                </SidebarMenuItem>

                {/* Audit Log */}
                <SidebarMenuItem className="w-full flex justify-center">
                  <SidebarLink
                    href="/assets/history"
                    icon={HiOutlineClipboardDocumentCheck}
                    label={t("Audit Log")}
                    active={isActive("/assets/history")}
                    isCollapsed={isCollapsed}
                  />
                </SidebarMenuItem>

                {/* Reports */}
                <SidebarMenuItem className="w-full flex justify-center">
                  <SidebarLink
                    href="/assets/reports"
                    icon={HiOutlineDocumentChartBar}
                    label={t("Reports")}
                    active={isActive("/assets/reports")}
                    isCollapsed={isCollapsed}
                  />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}


        {/* Admin Settings Section */}
        {hasAnyPermission(["users:manage", "settings:write"]) && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className={`${isCollapsed ? "items-center gap-2" : ""}`}>
                <SidebarMenuItem className="w-full flex justify-center">
                  <SidebarLink
                    href="/settings"
                    icon={HiCog6Tooth}
                    label={t("Admin")}
                    active={isActive("/settings")}
                    isCollapsed={isCollapsed}
                  />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer - User Profile */}
      <SidebarFooter className="border-t border-border/50 p-3 shrink-0 space-y-2">
        <div className="w-full flex items-center gap-3 p-2 group-data-[collapsible=icon]:justify-center">
          <UserAvatar
            fullName={currentUser.full_name}
            imageUrl={currentUser.profile_image_url}
            sizeClassName="w-9 h-9"
            className="shadow-none border border-border shrink-0"
            textClassName="text-[10px] font-semibold text-muted-foreground"
          />
          <div className="flex flex-col truncate text-left group-data-[collapsible=icon]:hidden animate-fade-in">
            <span className="font-semibold text-foreground text-xs leading-tight">
              {currentUser.full_name}
            </span>
            <span className="text-[9px] text-muted font-medium uppercase tracking-wider mt-0.5">
              {currentUser.role_name}
            </span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
