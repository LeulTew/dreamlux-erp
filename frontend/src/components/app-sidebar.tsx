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
  HiMagnifyingGlass,
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
function CollapsedPopout({
  icon: Icon,
  label,
  isActive,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-center p-2.5 rounded-xl transition-all cursor-pointer ${
          isActive ? "bg-primary/10 text-primary" : "text-muted hover:bg-card-alt hover:text-foreground"
        }`}
      >
        <Icon className="w-[18px] h-[18px]" />
      </button>
      {open && (
        <div className="absolute left-full top-0 ml-2 z-50 bg-card border border-border rounded-xl p-2 min-w-[160px] shadow-lg">
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wider px-2.5 py-1.5 mb-1">{label}</p>
          {children}
        </div>
      )}
    </div>
  );
}

function PopoutLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`block px-2.5 py-1.5 rounded-xl text-sm transition-all ${
        active ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-card-alt"
      }`}
    >
      {label}
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const { state: sidebarState } = useSidebar();
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
      className="border-r border-border bg-sidebar [&_[data-sidebar=sidebar]]:rounded-r-2xl [&_[data-sidebar=sidebar]]:border-y [&_[data-sidebar=sidebar]]:border-r [&_[data-sidebar=sidebar]]:border-border/50 [&_[data-sidebar=sidebar]]:my-3 [&_[data-sidebar=sidebar]]:h-[calc(100vh-24px)] [&_[data-sidebar=sidebar]]:shadow-sm"
    >
      {/* Header - Logo */}
      <SidebarHeader className="py-5 px-5 flex flex-row items-center gap-3 select-none">
        <div className="w-9 h-9 rounded-xl bg-foreground flex items-center justify-center text-background font-black text-base shrink-0">
          D
        </div>
        <div className="flex flex-col truncate group-data-[collapsible=icon]:hidden">
          <span className="font-black tracking-tight text-foreground text-sm leading-tight">
            Dream Lux
          </span>
          <span className="text-[9px] text-muted font-medium tracking-widest uppercase leading-none mt-0.5">
            ERP System
          </span>
        </div>
      </SidebarHeader>

      {/* Search Bar */}
      <div className="px-3 pb-2 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card-alt/50 text-muted text-xs group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-2.5 cursor-pointer hover:border-primary/30 transition-all">
          <HiMagnifyingGlass className="w-4 h-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">{t("Search")}</span>
          <span className="group-data-[collapsible=icon]:hidden ml-auto text-[10px] text-muted/60 font-mono">⌘S</span>
        </div>
      </div>

      {/* Content Groupings */}
      <SidebarContent className="py-2">
        {/* HR Management Section */}
        {hasAccess(hrRoles) && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-4 text-[10px] font-semibold tracking-widest uppercase text-muted/60 group-data-[collapsible=icon]:hidden">
              {t("HR Management")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Employees (Nested) — expanded vs collapsed */}
                {hasAccess(["SUPER_ADMIN", "super_admin", "HR_ADMIN", "admin", "ADMIN"]) && (
                  <SidebarMenuItem>
                    {isCollapsed ? (
                      <CollapsedPopout
                        icon={HiUsers}
                        label={t("Employees")}
                        isActive={isActive("/") || isActive("/insert")}
                      >
                        <PopoutLink href="/" label={t("List Employees")} active={pathname === "/"} />
                        <PopoutLink href="/insert" label={t("Add Employee")} active={pathname === "/insert"} />
                      </CollapsedPopout>
                    ) : (
                      <>
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
                      </>
                    )}
                  </SidebarMenuItem>
                )}

                {/* Events */}
                {hasAccess(hrRoles) && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/events")} tooltip={t("Events")} className="rounded-xl">
                      <Link href="/events">
                        <HiOutlineCalendar className="w-[18px] h-[18px] shrink-0" />
                        <span>{t("Events")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Payroll */}
                {hasAccess(["SUPER_ADMIN", "super_admin", "HR_ADMIN", "admin", "ADMIN", "ACCOUNTANT", "accountant"]) && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/hr/payments")} tooltip={t("Payroll")} className="rounded-xl">
                      <Link href="/hr/payments">
                        <HiOutlineBanknotes className="w-[18px] h-[18px] shrink-0" />
                        <span>{t("Payroll")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Salary Levels */}
                {hasAccess(["SUPER_ADMIN", "super_admin", "HR_ADMIN", "admin", "ADMIN"]) && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/hr/salary-levels")} tooltip={t("Salary")} className="rounded-xl">
                      <Link href="/hr/salary-levels">
                        <HiOutlineCurrencyDollar className="w-[18px] h-[18px] shrink-0" />
                        <span>{t("Salary")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Event Types */}
                {hasAccess(["SUPER_ADMIN", "super_admin", "HR_ADMIN", "admin", "ADMIN"]) && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/hr/event-types")} tooltip={t("Event Types")} className="rounded-xl">
                      <Link href="/hr/event-types">
                        <HiOutlineCalendar className="w-[18px] h-[18px] shrink-0" />
                        <span>{t("Event Types")}</span>
                      </Link>
                    </SidebarMenuButton>
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
                <SidebarMenu>
                  {/* Dashboard */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/assets/dashboard")} tooltip={t("Dashboard")} className="rounded-xl">
                      <Link href="/assets/dashboard">
                        <HiBuildingOffice className="w-[18px] h-[18px] shrink-0" />
                        <span>{t("Dashboard")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {/* Items (Nested) */}
                  <SidebarMenuItem>
                    {isCollapsed ? (
                      <CollapsedPopout
                        icon={HiTableCells}
                        label={t("Inventory")}
                        isActive={isActive("/assets") || isActive("/assets/insert")}
                      >
                        <PopoutLink href="/assets" label={t("List Items")} active={pathname === "/assets"} />
                        <PopoutLink href="/assets/insert" label={t("Add Item")} active={pathname === "/assets/insert"} />
                      </CollapsedPopout>
                    ) : (
                      <>
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
                      </>
                    )}
                  </SidebarMenuItem>

                  {/* Reconcile */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/assets/reconcile")} tooltip={t("Reconcile")} className="rounded-xl">
                      <Link href="/assets/reconcile">
                        <HiOutlineClipboardDocumentCheck className="w-[18px] h-[18px] shrink-0" />
                        <span>{t("Reconcile")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {/* Audit Log */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/assets/history")} tooltip={t("Audit Log")} className="rounded-xl">
                      <Link href="/assets/history">
                        <HiOutlineClipboardDocumentCheck className="w-[18px] h-[18px] shrink-0" />
                        <span>{t("Audit Log")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {/* Reports */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/assets/reports")} tooltip={t("Reports")} className="rounded-xl">
                      <Link href="/assets/reports">
                        <HiOutlineDocumentChartBar className="w-[18px] h-[18px] shrink-0" />
                        <span>{t("Reports")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* Admin Settings Section */}
          {hasAccess(["SUPER_ADMIN", "admin", "SYSTEM_MANAGER", "system_manager"]) && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/settings")} tooltip={t("Admin")} className="rounded-xl">
                      <Link href="/settings">
                        <HiCog6Tooth className="w-[18px] h-[18px] shrink-0" />
                        <span>{t("Admin")}</span>
                      </Link>
                    </SidebarMenuButton>
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
