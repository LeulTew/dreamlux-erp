"use client";
import React, { useState, useMemo, useRef, useEffect } from "react";
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
  HiTruck,
  HiArchiveBoxArrowDown,
  HiChevronDown,
  HiChevronUp,
  HiChevronLeft,
} from "react-icons/hi2";
import { useLanguage } from "@/hooks/use-language";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { buildSidebarNavState } from "@/lib/sidebar-nav";


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
    "HR Dashboard": "HR Dashboard",
    Dashboard: "Dashboard",
    Inventory: "Inventory",
    Reconcile: "Reconcile",
    Dispatch: "Dispatch",
    Returns: "Returns",
    "Audit Log": "Audit Log",
    Reports: "Reports",
    "Add Item": "Add Item",
    "List Items": "List Items",
    Fleet: "Fleet",
    Admin: "Settings",
    Events: "Events",
    "HR Management": "HR",
    "Inventory Management": "INVENTORY",
    Search: "Search",
    "List Events": "List Events",
    Finance: "Finance",
    "Profit Reports": "Profit Reports",
    "Hisab Reports": "Hisab Reports",
    "Overhead Register": "Overhead Register",
    "Capital Register": "Capital Register",
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
    "Roles & Access": "Roles & Access",
    "Salary Levels": "Salary Levels",
    Notifications: "Notifications",
    "Net Profit": "Net Profit",
    "Hisab Import": "Hisab Import",
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
    "HR Dashboard": "የሰው ኃይል ዳሽቦርድ",
    Dashboard: "ዋና ገጽ",
    Inventory: "ዕቃዎች",
    Reconcile: "ቆጠራ ማመሳከሪያ",
    Dispatch: "መላኪያ",
    Returns: "መመለሻ",
    "Audit Log": "የቆጠራ ታሪክ",
    Reports: "ሪፖርቶች",
    "Add Item": "ዕቃ መዝግብ",
    "List Items": "የዕቃዎች ዝርዝር",
    Fleet: "ተሽከርካሪዎች",
    Admin: "አስተዳዳሪ",
    Events: "ዝግጅቶች",
    "HR Management": "የሰው ኃይል",
    "Inventory Management": "ዕቃዎች",
    Search: "ፈልግ",
    "List Events": "የዝግጅቶች ዝርዝር",
    Finance: "ፋይናንስ",
    "Profit Reports": "የትርፍ ሪፖርቶች",
    "Hisab Reports": "የሂሳብ ሪፖርቶች",
    "Overhead Register": "የወጪ መዝገብ",
    "Capital Register": "የካፒታል መዝገብ",
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
    "Roles & Access": "ሚናዎችና መዳረሻ",
    "Salary Levels": "የደሞዝ ደረጃዎች",
    "Net Profit": "የተጣራ ትርፍ",
    "Hisab Import": "የሂሳብ ማስገቢያ",
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

  const t = useMemo(() => (key: string) => TRANSLATIONS[lang]?.[key] || key, [lang]);

  const { hasPermission, user: authUser } = useAuth();
  const currentUser = useMemo(() => ({
    role_name: authUser?.role_name || authUser?.role_names?.[0] || "User",
    full_name: authUser?.full_name || authUser?.username || "User",
    profile_image_url: authUser?.profile_image_url || null,
  }), [authUser]);

  const navState = useMemo(() => {
    return buildSidebarNavState({
      pathname,
      t,
      hasPermission,
    });
  }, [pathname, t, hasPermission]);

  const isEmployeesActive = navState.employeesLinks.some(l => l.active);
  const isEventsActive = navState.eventLinks.some(l => l.active);
  const isFinanceActive = navState.financeLinks.some(l => l.active);
  const isRefDataActive = navState.refDataLinks.some(l => l.active);
  const isInventoryActive = navState.inventoryLinks.some(l => l.active);
  const [refDataManuallyOpen, setRefDataManuallyOpen] = useState(false);
  const refDataOpen = isRefDataActive || refDataManuallyOpen;

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
        {navState.showHRGroup && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-4 text-[10px] font-semibold tracking-widest uppercase text-muted/60 group-data-[collapsible=icon]:hidden">
              {t("HR Management")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className={`${isCollapsed ? "items-center gap-2" : ""}`}>
                {/* Employees (Nested) — expanded vs collapsed */}
                {navState.showEmployeesMenu && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    {isCollapsed ? (
                      <CollapsedPopout
                        icon={HiUsers}
                        label={t("Employees")}
                        isActive={isEmployeesActive}
                        links={navState.employeesLinks}
                      />
                    ) : (
                      <div className="w-full">
                        <SidebarMenuButton
                          onClick={() => setEmployeesOpen(!employeesOpen)}
                          className={`w-full justify-between h-10 border border-transparent transition-all ${
                            isEmployeesActive
                              ? "bg-primary-light border-l-2 border-primary text-primary font-bold rounded-l-none rounded-r-xl dark:border-transparent dark:rounded-xl"
                              : "rounded-xl"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <HiUsers className={`w-[18px] h-[18px] shrink-0 ${isEmployeesActive ? "text-primary" : ""}`} />
                            <span>{t("Employees")}</span>
                          </span>
                          <span className="shrink-0">
                            {employeesOpen ? (
                              <HiChevronUp className={`w-3.5 h-3.5 ${isEmployeesActive ? "text-primary" : "text-muted/60"}`} />
                            ) : (
                              <HiChevronDown className={`w-3.5 h-3.5 ${isEmployeesActive ? "text-primary" : "text-muted/60"}`} />
                            )}
                          </span>
                        </SidebarMenuButton>
                        {employeesOpen && (
                          <SidebarMenuSub className="ml-[27px] border-none pl-3.5 space-y-0.5 mt-1 relative">
                            {navState.employeesLinks.map((link, idx) => (
                              <SidebarMenuSubItem key={link.href} className="relative">
                                <SubItemBranchLine isLast={idx === navState.employeesLinks.length - 1} />
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

                {/* Events dropdown */}
                {navState.eventLinks.length > 0 && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    {isCollapsed ? (
                      <CollapsedPopout
                        icon={HiOutlineCalendar}
                        label={t("Events")}
                        isActive={isEventsActive}
                        links={navState.eventLinks}
                      />
                    ) : (
                      <div className="w-full">
                        <SidebarMenuButton
                          onClick={() => setEventsOpen(!eventsOpen)}
                          className={`w-full justify-between h-10 border border-transparent transition-all ${
                            isEventsActive
                              ? "bg-primary-light border-l-2 border-primary text-primary font-bold rounded-l-none rounded-r-xl dark:border-transparent dark:rounded-xl"
                              : "rounded-xl"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <HiOutlineCalendar className={`w-[18px] h-[18px] shrink-0 ${isEventsActive ? "text-primary" : ""}`} />
                            <span>{t("Events")}</span>
                          </span>
                          <span className="shrink-0">
                            {eventsOpen ? (
                              <HiChevronUp className={`w-3.5 h-3.5 ${isEventsActive ? "text-primary" : "text-muted/60"}`} />
                            ) : (
                              <HiChevronDown className={`w-3.5 h-3.5 ${isEventsActive ? "text-primary" : "text-muted/60"}`} />
                            )}
                          </span>
                        </SidebarMenuButton>
                        {eventsOpen && (
                          <SidebarMenuSub className="ml-[27px] border-none pl-3.5 space-y-0.5 mt-1 relative">
                            {navState.eventLinks.map((link, idx) => (
                              <SidebarMenuSubItem key={link.href} className="relative">
                                <SubItemBranchLine isLast={idx === navState.eventLinks.length - 1} />
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
                {navState.financeLinks.length > 0 && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    {isCollapsed ? (
                      <CollapsedPopout
                        icon={HiOutlineBanknotes}
                        label={t("Finance")}
                        isActive={isFinanceActive}
                        links={navState.financeLinks}
                      />
                    ) : (
                      <div className="w-full">
                        <SidebarMenuButton
                          onClick={() => setFinanceOpen(!financeOpen)}
                          className={`w-full justify-between h-10 border border-transparent transition-all ${
                            isFinanceActive
                              ? "bg-primary-light border-l-2 border-primary text-primary font-bold rounded-l-none rounded-r-xl dark:border-transparent dark:rounded-xl"
                              : "rounded-xl"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <HiOutlineBanknotes className={`w-[18px] h-[18px] shrink-0 ${isFinanceActive ? "text-primary" : ""}`} />
                            <span>{t("Finance")}</span>
                          </span>
                          <span className="shrink-0">
                            {financeOpen ? (
                              <HiChevronUp className={`w-3.5 h-3.5 ${isFinanceActive ? "text-primary" : "text-muted/60"}`} />
                            ) : (
                              <HiChevronDown className={`w-3.5 h-3.5 ${isFinanceActive ? "text-primary" : "text-muted/60"}`} />
                            )}
                          </span>
                        </SidebarMenuButton>
                        {financeOpen && (
                          <SidebarMenuSub className="ml-[27px] border-none pl-3.5 space-y-0.5 mt-1 relative">
                            {navState.financeLinks.map((link, idx) => (
                              <SidebarMenuSubItem key={link.href} className="relative">
                                <SubItemBranchLine isLast={idx === navState.financeLinks.length - 1} />
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
                {navState.refDataLinks.length > 0 && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    {isCollapsed ? (
                      <CollapsedPopout
                        icon={HiOutlineClipboardDocumentCheck}
                        label={t("Reference Data")}
                        isActive={isRefDataActive}
                        links={navState.refDataLinks}
                      />
                    ) : (
                      <div className="w-full">
                        <SidebarMenuButton
                          onClick={() => setRefDataManuallyOpen((open) => !open)}
                          className={`w-full justify-between h-10 border border-transparent transition-all ${
                            isRefDataActive
                              ? "bg-primary-light border-l-2 border-primary text-primary font-bold rounded-l-none rounded-r-xl dark:border-transparent dark:rounded-xl"
                              : "rounded-xl"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <HiOutlineClipboardDocumentCheck className={`w-[18px] h-[18px] shrink-0 ${isRefDataActive ? "text-primary" : ""}`} />
                            <span>{t("Reference Data")}</span>
                          </span>
                          <span className="shrink-0">
                            {refDataOpen ? (
                              <HiChevronUp className={`w-3.5 h-3.5 ${isRefDataActive ? "text-primary" : "text-muted/60"}`} />
                            ) : (
                              <HiChevronDown className={`w-3.5 h-3.5 ${isRefDataActive ? "text-primary" : "text-muted/60"}`} />
                            )}
                          </span>
                        </SidebarMenuButton>
                        {refDataOpen && (
                          <SidebarMenuSub className="ml-[27px] border-none pl-3.5 space-y-0.5 mt-1 relative">
                            {navState.refDataLinks.map((link, idx) => (
                              <SidebarMenuSubItem key={link.href} className="relative">
                                <SubItemBranchLine isLast={idx === navState.refDataLinks.length - 1} />
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
        {navState.showInventoryGroup && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-4 text-[10px] font-semibold tracking-widest uppercase text-muted/60 group-data-[collapsible=icon]:hidden">
              {t("Inventory Management")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className={`${isCollapsed ? "items-center gap-2" : ""}`}>
                {/* Dashboard */}
                {navState.inventoryDashboardLink && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    <SidebarLink
                      href={navState.inventoryDashboardLink.href}
                      icon={HiBuildingOffice}
                      label={navState.inventoryDashboardLink.label}
                      active={navState.inventoryDashboardLink.active}
                      isCollapsed={isCollapsed}
                    />
                  </SidebarMenuItem>
                )}

                {/* Items (Nested) */}
                {navState.inventoryLinks.length > 0 && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    {isCollapsed ? (
                      <CollapsedPopout
                        icon={HiTableCells}
                        label={t("Inventory")}
                        isActive={isInventoryActive}
                        links={navState.inventoryLinks}
                      />
                    ) : (
                      <div className="w-full">
                        <SidebarMenuButton
                          onClick={() => setItemsOpen(!itemsOpen)}
                          className={`w-full justify-between h-10 border border-transparent transition-all ${
                            isInventoryActive
                              ? "bg-primary-light border-l-2 border-primary text-primary font-bold rounded-l-none rounded-r-md dark:border-transparent dark:rounded-md"
                              : "rounded-md"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <HiTableCells className={`w-[18px] h-[18px] shrink-0 ${isInventoryActive ? "text-primary" : ""}`} />
                            <span>{t("Inventory")}</span>
                          </span>
                          <span className="shrink-0">
                            {itemsOpen ? (
                              <HiChevronUp className={`w-3.5 h-3.5 ${isInventoryActive ? "text-primary" : "text-muted/60"}`} />
                            ) : (
                              <HiChevronDown className={`w-3.5 h-3.5 ${isInventoryActive ? "text-primary" : "text-muted/60"}`} />
                            )}
                          </span>
                        </SidebarMenuButton>
                        {itemsOpen && (
                          <SidebarMenuSub className="ml-[27px] border-none pl-3.5 space-y-0.5 mt-1 relative">
                            {navState.inventoryLinks.map((link, idx) => (
                              <SidebarMenuSubItem key={link.href} className="relative">
                                <SubItemBranchLine isLast={idx === navState.inventoryLinks.length - 1} />
                                <SidebarMenuSubButton asChild isActive={link.active} className="rounded-md">
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

                {navState.dispatchLink && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    <SidebarLink
                      href={navState.dispatchLink.href}
                      icon={HiTruck}
                      label={navState.dispatchLink.label}
                      active={navState.dispatchLink.active}
                      isCollapsed={isCollapsed}
                    />
                  </SidebarMenuItem>
                )}

                {/* Returns (issue #173) */}
                {navState.returnsLink && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    <SidebarLink
                      href={navState.returnsLink.href}
                      icon={HiArchiveBoxArrowDown}
                      label={navState.returnsLink.label}
                      active={navState.returnsLink.active}
                      isCollapsed={isCollapsed}
                    />
                  </SidebarMenuItem>
                )}

                {/* Reconcile */}
                {navState.reconcileLink && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    <SidebarLink
                      href={navState.reconcileLink.href}
                      icon={HiOutlineClipboardDocumentCheck}
                      label={navState.reconcileLink.label}
                      active={navState.reconcileLink.active}
                      isCollapsed={isCollapsed}
                    />
                  </SidebarMenuItem>
                )}

                {/* Audit Log */}
                {navState.auditLogLink && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    <SidebarLink
                      href={navState.auditLogLink.href}
                      icon={HiOutlineClipboardDocumentCheck}
                      label={navState.auditLogLink.label}
                      active={navState.auditLogLink.active}
                      isCollapsed={isCollapsed}
                    />
                  </SidebarMenuItem>
                )}

                {/* Reports */}
                {navState.reportsLink && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    <SidebarLink
                      href={navState.reportsLink.href}
                      icon={HiOutlineDocumentChartBar}
                      label={navState.reportsLink.label}
                      active={navState.reportsLink.active}
                      isCollapsed={isCollapsed}
                    />
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer - Admin Settings */}
      <SidebarFooter className="border-t border-border/50 p-3 shrink-0">
        {navState.adminLink && (
          <SidebarMenu className={`${isCollapsed ? "items-center" : ""}`}>
            <SidebarMenuItem className="w-full flex justify-center">
              <SidebarLink
                href={navState.adminLink.href}
                icon={HiCog6Tooth}
                label={navState.adminLink.label}
                active={navState.adminLink.active}
                isCollapsed={isCollapsed}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
