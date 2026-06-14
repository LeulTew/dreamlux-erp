"use client";
import React, { useState, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  HiArrowRightOnRectangle,
  HiSun,
  HiMoon,
  HiChevronDown,
  HiChevronUp,
} from "react-icons/hi2";
import { useTheme } from "@/hooks/use-theme";
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
    Admin: "Admin Settings",
    Events: "Events",
    "HR Management": "HR Management",
    "Inventory Management": "Inventory Management",
    "Sign Out": "Sign Out",
    Cancel: "Cancel",
    "Are you sure you want to sign out?": "Are you sure you want to sign out?",
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
    "HR Management": "የሰራተኞች ገጽ",
    "Inventory Management": "የዕቃዎች ገጽ",
    "Sign Out": "ውጣ",
    Cancel: "ተመለስ",
    "Are you sure you want to sign out?": "በእርግጥ መውጣት ይፈልጋሉ?",
  },
};

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { dark, toggle: toggleTheme } = useTheme();
  const { lang, toggle: toggleLang } = useLanguage();
  const [showConfirmLogout, setShowConfirmLogout] = useState(false);

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

  // Filter links based on role
  const hasAccess = (roles?: string[]) => {
    if (!roles) return true;
    return roles.includes(userRole);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-border bg-card">
        {/* Header - App Branding */}
        <SidebarHeader className="border-b border-border/50 py-4 px-6 flex flex-row items-center gap-3 select-none">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-black text-lg shadow-none shrink-0">
            D
          </div>
          <div className="flex flex-col truncate group-data-[collapsible=icon]:hidden">
            <span className="font-black tracking-tight text-foreground text-sm leading-tight">
              DREAM LUX
            </span>
            <span className="text-[9px] text-muted font-bold tracking-widest uppercase leading-none mt-0.5">
              ERP System
            </span>
          </div>
        </SidebarHeader>

        {/* Content Groupings */}
        <SidebarContent className="py-4 space-y-4">
          {/* HR Management Section */}
          {hasAccess([
            "SUPER_ADMIN",
            "super_admin",
            "admin",
            "ADMIN",
            "HR_ADMIN",
            "EVENT_MANAGER",
            "event_manager",
            "OWNER",
            "owner",
            "OPS_MANAGER",
            "ops_manager",
            "ACCOUNTANT",
            "accountant",
          ]) && (
            <SidebarGroup>
              <SidebarGroupLabel className="px-4 text-[10px] font-black tracking-widest uppercase text-muted/80 group-data-[collapsible=icon]:hidden">
                {t("HR Management")}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {/* Employees (Nested) */}
                  {hasAccess(["SUPER_ADMIN", "super_admin", "HR_ADMIN", "admin", "ADMIN"]) && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => setEmployeesOpen(!employeesOpen)}
                        className={`w-full justify-between group-data-[collapsible=icon]:justify-center ${
                          isActive("/") || isActive("/insert") ? "text-primary bg-primary-light dark:bg-primary-light" : ""
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <HiUsers className="w-5 h-5 shrink-0" />
                          <span className="group-data-[collapsible=icon]:hidden font-bold">
                            {t("Employees")}
                          </span>
                        </span>
                        <span className="group-data-[collapsible=icon]:hidden shrink-0">
                          {employeesOpen ? (
                            <HiChevronUp className="w-3.5 h-3.5 text-muted" />
                          ) : (
                            <HiChevronDown className="w-3.5 h-3.5 text-muted" />
                          )}
                        </span>
                      </SidebarMenuButton>
                      {employeesOpen && (
                        <SidebarMenuSub className="ml-8 border-l border-border/80 pl-3 space-y-1 mt-1 group-data-[collapsible=icon]:hidden">
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === "/"}>
                              <Link href="/" className="font-bold">
                                {t("List Employees")}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={pathname === "/insert"}>
                              <Link href="/insert" className="font-bold">
                                {t("Add Employee")}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  )}

                  {/* Events */}
                  {hasAccess([
                    "SUPER_ADMIN",
                    "super_admin",
                    "admin",
                    "ADMIN",
                    "EVENT_MANAGER",
                    "event_manager",
                    "OWNER",
                    "owner",
                    "OPS_MANAGER",
                    "ops_manager",
                    "ACCOUNTANT",
                    "accountant",
                  ]) && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isActive("/events")}>
                        <Link href="/events">
                          <HiOutlineCalendar className="w-5 h-5 shrink-0" />
                          <span className="font-bold">{t("Events")}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}

                  {/* Payroll */}
                  {hasAccess(["SUPER_ADMIN", "super_admin", "HR_ADMIN", "admin", "ADMIN", "ACCOUNTANT", "accountant"]) && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isActive("/hr/payments")}>
                        <Link href="/hr/payments">
                          <HiOutlineBanknotes className="w-5 h-5 shrink-0" />
                          <span className="font-bold">{t("Payroll")}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}

                  {/* Salary Levels */}
                  {hasAccess(["SUPER_ADMIN", "super_admin", "HR_ADMIN", "admin", "ADMIN"]) && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isActive("/hr/salary-levels")}>
                        <Link href="/hr/salary-levels">
                          <HiOutlineCurrencyDollar className="w-5 h-5 shrink-0" />
                          <span className="font-bold">{t("Salary")}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}

                  {/* Event Types */}
                  {hasAccess(["SUPER_ADMIN", "super_admin", "HR_ADMIN", "admin", "ADMIN"]) && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isActive("/hr/event-types")}>
                        <Link href="/hr/event-types">
                          <HiOutlineCalendar className="w-5 h-5 shrink-0" />
                          <span className="font-bold">{t("Event Types")}</span>
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
              <SidebarGroupLabel className="px-4 text-[10px] font-black tracking-widest uppercase text-muted/80 group-data-[collapsible=icon]:hidden">
                {t("Inventory Management")}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {/* Dashboard */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/assets/dashboard")}>
                      <Link href="/assets/dashboard">
                        <HiBuildingOffice className="w-5 h-5 shrink-0" />
                        <span className="font-bold">{t("Dashboard")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {/* Items (Nested) */}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setItemsOpen(!itemsOpen)}
                      className={`w-full justify-between group-data-[collapsible=icon]:justify-center ${
                        isActive("/assets") || isActive("/assets/insert") ? "text-primary bg-primary-light" : ""
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <HiTableCells className="w-5 h-5 shrink-0" />
                        <span className="group-data-[collapsible=icon]:hidden font-bold">
                          {t("Inventory")}
                        </span>
                      </span>
                      <span className="group-data-[collapsible=icon]:hidden shrink-0">
                        {itemsOpen ? (
                          <HiChevronUp className="w-3.5 h-3.5 text-muted" />
                        ) : (
                          <HiChevronDown className="w-3.5 h-3.5 text-muted" />
                        )}
                      </span>
                    </SidebarMenuButton>
                    {itemsOpen && (
                      <SidebarMenuSub className="ml-8 border-l border-border/80 pl-3 space-y-1 mt-1 group-data-[collapsible=icon]:hidden">
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === "/assets"}>
                            <Link href="/assets" className="font-bold">
                              {t("List Items")}
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === "/assets/insert"}>
                            <Link href="/assets/insert" className="font-bold">
                              {t("Add Item")}
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>

                  {/* Reconcile */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/assets/reconcile")}>
                      <Link href="/assets/reconcile">
                        <HiOutlineClipboardDocumentCheck className="w-5 h-5 shrink-0" />
                        <span className="font-bold">{t("Reconcile")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {/* Audit Log */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/assets/history")}>
                      <Link href="/assets/history">
                        <HiCog6Tooth className="w-5 h-5 shrink-0" />
                        <span className="font-bold">{t("Audit Log")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {/* Reports */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/assets/reports")}>
                      <Link href="/assets/reports">
                        <HiOutlineDocumentChartBar className="w-5 h-5 shrink-0" />
                        <span className="font-bold">{t("Reports")}</span>
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
                    <SidebarMenuButton asChild isActive={isActive("/settings")}>
                      <Link href="/settings">
                        <HiCog6Tooth className="w-5 h-5 shrink-0" />
                        <span className="font-bold">{t("Admin")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        {/* Footer - User Profile & System Toggles */}
        <SidebarFooter className="border-t border-border/50 p-4 space-y-4 bg-card-alt/30 shrink-0">
          {/* User profile block */}
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
            <UserAvatar
              fullName={currentUser.full_name}
              imageUrl={currentUser.profile_image_url}
              sizeClassName="w-9 h-9"
              className="shadow-none border border-border"
              textClassName="text-[10px] font-black text-muted"
            />
            <div className="flex flex-col truncate group-data-[collapsible=icon]:hidden">
              <span className="font-bold text-foreground text-xs leading-tight">
                {currentUser.full_name}
              </span>
              <span className="text-[9px] text-muted font-black uppercase tracking-wider mt-0.5">
                {currentUser.role_name}
              </span>
            </div>
          </div>

          {/* System Toggles */}
          <div className="grid grid-cols-2 gap-2 group-data-[collapsible=icon]:hidden">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-border bg-card hover:bg-card-alt text-muted hover:text-foreground text-xs font-bold transition-all"
            >
              {dark ? (
                <>
                  <HiSun className="w-4 h-4 shrink-0" />
                  Light
                </>
              ) : (
                <>
                  <HiMoon className="w-4 h-4 shrink-0" />
                  Dark
                </>
              )}
            </button>

            {/* Language Toggle */}
            <button
              onClick={toggleLang}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-border bg-card hover:bg-card-alt text-muted hover:text-foreground text-xs font-bold transition-all"
            >
              <span className="font-black text-[10px] shrink-0 leading-none">
                {lang === "en" ? "EN" : "አማ"}
              </span>
              {lang === "en" ? "English" : "አማርኛ"}
            </button>
          </div>

          {/* Sign Out Button */}
          <button
            onClick={() => setShowConfirmLogout(true)}
            className="w-full py-2.5 rounded-lg bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all flex items-center justify-center gap-2 border border-danger/20 text-xs font-black uppercase tracking-wider group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:py-3 shrink-0"
          >
            <HiArrowRightOnRectangle className="w-4 h-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">{t("Sign Out")}</span>
          </button>
        </SidebarFooter>
      </Sidebar>

      {/* Logout Confirmation Backdrop & Modal */}
      {showConfirmLogout && (
        <>
          <div
            className="fixed inset-0 z-70 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowConfirmLogout(false)}
          />
          <div className="fixed inset-0 z-70 flex items-center justify-center pointer-events-none p-4">
            <div className="pointer-events-auto bg-card rounded-lg border border-border p-6 w-full max-w-sm flex flex-col items-center">
              <div className="w-12 h-12 rounded-lg bg-danger/10 flex items-center justify-center text-danger mb-4 shrink-0">
                <HiArrowRightOnRectangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-foreground mb-1">{t("Sign Out")}</h3>
              <p className="text-xs text-muted text-center leading-relaxed mb-6">
                {t("Are you sure you want to sign out?")}
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowConfirmLogout(false)}
                  className="flex-1 py-2.5 rounded-lg bg-card-alt border border-border text-foreground font-bold hover:bg-border transition-all text-xs active:scale-95"
                >
                  {t("Cancel")}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 py-2.5 rounded-lg bg-danger text-white font-bold hover:opacity-90 transition-all text-xs active:scale-95"
                >
                  {t("Sign Out")}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
