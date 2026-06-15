"use client";
import React, { useState, useMemo, useSyncExternalStore, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HiUsers,
  HiOutlineCalendar,
  HiOutlineBanknotes,
  HiOutlineCurrencyDollar,
  HiBuildingOffice,
  HiTableCells,
  HiOutlineClipboardDocumentCheck,
  HiCog6Tooth,
  HiOutlineDocumentChartBar,
  HiChevronDown,
  HiChevronUp,
  HiChevronLeft,
} from "react-icons/hi2";
import { useLanguage } from "@/hooks/use-language";
import UserAvatar from "@/components/UserAvatar";
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
    "HR Management": "MAIN",
    "Inventory Management": "INVENTORY",
    Search: "Search",
  },
  am: {
    Employees: "ሰራተኞች",
    Payroll: "ደመወዝ",
    Salary: "ደረጃዎች",
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
    "HR Management": "ዋና",
    "Inventory Management": "ዕቃዎች",
    Search: "ፈልግ",
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
          className="absolute left-[calc(100%+16px)] top-[-6px] z-50 bg-card border border-border/80 rounded-2xl p-1.5 min-w-[170px] shadow-massive flex flex-col gap-0.5 animate-scale-in"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Transparent bridge to fill the 16px hover gap and prevent mouse-leave trigger */}
          <div className="absolute right-full top-0 w-6 h-full bg-transparent" style={{ marginRight: "-1px" }} />

          {/* Subtle curved SVG connection tree-lines */}
          <svg className="absolute right-full top-0 w-[52px] h-full pointer-events-none" style={{ marginRight: "-1px" }}>
            {links.map((link, idx) => {
              const y_start = 30; // Button vertical center (24px button center + 6px top offset)
              const y_item = 22 + idx * 34; // First item center is ~22px, next centers are spaced by 34px (32px item + 2px gap)
              const isBelow = y_item >= y_start;
              const r = Math.min(12, Math.abs(y_item - y_start));
              const y_turn = isBelow ? (y_item - r) : (y_item + r);
              const path = `M 0,${y_start} V ${y_turn} Q 0,${y_item} ${r},${y_item} L 52,${y_item}`;
              
              return (
                <path
                  key={link.href}
                  d={path}
                  fill="none"
                  stroke="currentColor"
                  className="text-border/60"
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

  const buttonContent = (
    <span
      className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all cursor-pointer mx-auto ${
        active 
          ? "bg-primary text-primary-foreground shadow-md" 
          : "text-muted hover:bg-card-alt hover:text-foreground"
      }`}
    >
      <Icon className="w-[22px] h-[22px] shrink-0" />
    </span>
  );

  if (isCollapsed) {
    return (
      <div 
        className="relative flex justify-center w-full"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Link href={href} className="w-full flex justify-center">{buttonContent}</Link>
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
    <SidebarMenuButton asChild isActive={active} tooltip={label} className="rounded-xl h-10">
      <Link href={href}>
        <Icon className="w-[18px] h-[18px] shrink-0" />
        <span>{label}</span>
      </Link>
    </SidebarMenuButton>
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

  const userRole = currentUser.role;

  const hasAccess = (roles?: string[]) => {
    if (!roles) return true;
    return roles.includes(userRole);
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const hrRoles = [
    "SUPER_ADMIN", "super_admin", "admin", "ADMIN", "HR_ADMIN",
    "EVENT_MANAGER", "event_manager", "OWNER", "owner",
    "OPS_MANAGER", "ops_manager", "ACCOUNTANT", "accountant",
  ];

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
            className="w-10 h-10 rounded-2xl bg-foreground flex items-center justify-center text-background font-black text-lg shrink-0 hover:opacity-90 transition-all cursor-pointer active:scale-95 shadow-md border border-border/10"
            title="Expand Sidebar"
          >
            D
          </button>
        ) : (
          <>
            <div className="flex items-center gap-3 truncate">
              <button
                onClick={toggleSidebar}
                className="w-9 h-9 rounded-xl bg-foreground flex items-center justify-center text-background font-black text-base shrink-0 hover:opacity-90 transition-all cursor-pointer active:scale-95 shadow-md border border-border/10"
                title="Collapse Sidebar"
              >
                D
              </button>
              <div className="flex flex-col truncate">
                <span className="font-black tracking-tight text-foreground text-sm leading-tight">
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
        {hasAccess(hrRoles) && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-4 text-[10px] font-semibold tracking-widest uppercase text-muted/60 group-data-[collapsible=icon]:hidden">
              {t("HR Management")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className={`${isCollapsed ? "items-center gap-2" : ""}`}>
                {/* Employees (Nested) — expanded vs collapsed */}
                {hasAccess(["SUPER_ADMIN", "super_admin", "HR_ADMIN", "admin", "ADMIN"]) && (
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
                          className={`w-full justify-between rounded-xl h-10 ${
                            isActive("/") || isActive("/insert") ? "text-primary font-semibold" : ""
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <HiUsers className="w-[18px] h-[18px] shrink-0" />
                            <span>{t("Employees")}</span>
                          </span>
                          <span className="shrink-0">
                            {employeesOpen ? (
                              <HiChevronUp className="w-3.5 h-3.5 text-muted/60" />
                            ) : (
                              <HiChevronDown className="w-3.5 h-3.5 text-muted/60" />
                            )}
                          </span>
                        </SidebarMenuButton>
                        {employeesOpen && (
                          <SidebarMenuSub className="ml-7 border-l border-border/40 pl-3 space-y-0.5 mt-1">
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/"} className="rounded-xl">
                                <Link href="/" className={pathname === "/" ? "text-foreground font-medium" : "text-muted"}>
                                  {t("List Employees")}
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === "/insert"} className="rounded-xl">
                                <Link href="/insert" className={pathname === "/insert" ? "text-foreground font-medium" : "text-muted"}>
                                  {t("Add Employee")}
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        )}
                      </div>
                    )}
                  </SidebarMenuItem>
                )}

                {/* Events */}
                {hasAccess(hrRoles) && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    <SidebarLink
                      href="/events"
                      icon={HiOutlineCalendar}
                      label={t("Events")}
                      active={isActive("/events")}
                      isCollapsed={isCollapsed}
                    />
                  </SidebarMenuItem>
                )}

                {/* Payroll */}
                {hasAccess(["SUPER_ADMIN", "super_admin", "HR_ADMIN", "admin", "ADMIN", "ACCOUNTANT", "accountant"]) && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    <SidebarLink
                      href="/hr/payments"
                      icon={HiOutlineBanknotes}
                      label={t("Payroll")}
                      active={isActive("/hr/payments")}
                      isCollapsed={isCollapsed}
                    />
                  </SidebarMenuItem>
                )}

                {/* Salary Levels */}
                {hasAccess(["SUPER_ADMIN", "super_admin", "HR_ADMIN", "admin", "ADMIN"]) && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    <SidebarLink
                      href="/hr/salary-levels"
                      icon={HiOutlineCurrencyDollar}
                      label={t("Salary")}
                      active={isActive("/hr/salary-levels")}
                      isCollapsed={isCollapsed}
                    />
                  </SidebarMenuItem>
                )}

                {/* Event Types */}
                {hasAccess(["SUPER_ADMIN", "super_admin", "HR_ADMIN", "admin", "ADMIN"]) && (
                  <SidebarMenuItem className="w-full flex justify-center">
                    <SidebarLink
                      href="/hr/event-types"
                      icon={HiOutlineCalendar}
                      label={t("Event Types")}
                      active={isActive("/hr/event-types")}
                      isCollapsed={isCollapsed}
                    />
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Inventory Management Section */}
        {hasAccess(["SUPER_ADMIN", "INVENTORY_CONTROLLER", "admin"]) && (
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
                        className={`w-full justify-between rounded-xl ${
                          isActive("/assets") || isActive("/assets/insert") ? "text-primary font-semibold" : ""
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <HiTableCells className="w-[18px] h-[18px] shrink-0" />
                          <span>{t("Inventory")}</span>
                        </span>
                        <span className="shrink-0">
                          {itemsOpen ? (
                            <HiChevronUp className="w-3.5 h-3.5 text-muted/60" />
                          ) : (
                            <HiChevronDown className="w-3.5 h-3.5 text-muted/60" />
                          )}
                        </span>
                      </SidebarMenuButton>
                      {itemsOpen && (
                        <SidebarMenuSub className="ml-7 border-l border-border/40 pl-3 space-y-0.5 mt-1">
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === "/assets"} className="rounded-xl">
                              <Link href="/assets" className={pathname === "/assets" ? "text-foreground font-medium" : "text-muted"}>
                                {t("List Items")}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === "/assets/insert"} className="rounded-xl">
                              <Link href="/assets/insert" className={pathname === "/assets/insert" ? "text-foreground font-medium" : "text-muted"}>
                                {t("Add Item")}
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
        {hasAccess(["SUPER_ADMIN", "admin", "SYSTEM_MANAGER", "system_manager"]) && (
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
      <SidebarFooter className="border-t border-border/50 p-3 shrink-0">
        <div className="w-full flex items-center gap-3 p-2 group-data-[collapsible=icon]:justify-center">
          <UserAvatar
            fullName={currentUser.full_name}
            imageUrl={currentUser.profile_image_url}
            sizeClassName="w-9 h-9"
            className="shadow-none border border-border shrink-0"
            textClassName="text-[10px] font-black text-muted"
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
