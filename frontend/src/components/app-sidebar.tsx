"use client";
import React, { useState, useMemo, useRef, useEffect, useId } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Popover } from "radix-ui";
import {
  HiUsers,
  HiOutlineCalendar,
  HiOutlineBanknotes,
  HiTableCells,
  HiOutlineClipboardDocumentCheck,
  HiCog6Tooth,
  HiOutlineDocumentChartBar,
  HiTruck,
  HiArchiveBoxArrowDown,
  HiChevronDown,
  HiChevronUp,
  HiChevronLeft,
  HiChevronDoubleDown,
  HiChevronDoubleUp,
} from "react-icons/hi2";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";
import { useSidebarPreferences } from "@/hooks/use-sidebar-preferences";
import { buildSidebarNavState, getVisibleSidebarSectionIds } from "@/lib/sidebar-nav";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
    "Expand all": "Expand all",
    "Collapse all": "Collapse all",
    "Expand all sections": "Expand all sections",
    "Collapse all sections": "Collapse all sections",
    "Expand Sidebar": "Expand sidebar",
    "Collapse Sidebar": "Collapse sidebar",
    "Session preferences": "Navigation choices will last for this session only.",
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
    "Condition stock": "Condition stock",
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
    "Expand all": "ሁሉን ክፈት",
    "Collapse all": "ሁሉን ዝጋ",
    "Expand all sections": "ሁሉንም ክፍሎች ክፈት",
    "Collapse all sections": "ሁሉንም ክፍሎች ዝጋ",
    "Expand Sidebar": "የጎን ምናሌውን ክፈት",
    "Collapse Sidebar": "የጎን ምናሌውን ዝጋ",
    "Session preferences": "የምናሌ ምርጫዎች ለዚህ ክፍለ ጊዜ ብቻ ይቆያሉ።",
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
    "Condition stock": "የዕቃ ሁኔታ ክምችት",
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hoverOpened = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  const handlePointerEnter = (event: React.PointerEvent) => {
    if (event.pointerType === "touch" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    cancelClose();
    if (!open) {
      hoverOpened.current = true;
      setOpen(true);
    }
  };

  const handlePointerLeave = () => {
    cancelClose();
    timeoutRef.current = setTimeout(() => {
      const focused = document.activeElement;
      if (!triggerRef.current?.contains(focused) && !contentRef.current?.contains(focused)) setOpen(false);
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        cancelClose();
        if (next) hoverOpened.current = false;
        setOpen(next);
      }}
    >
      <div className="flex justify-center w-full">
        <Popover.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={label}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            onClick={(event) => {
              if (open && hoverOpened.current) {
                event.preventDefault();
                hoverOpened.current = false;
                contentRef.current?.focus();
              }
            }}
            className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
            }`}
          >
            <Icon className="w-[22px] h-[22px] shrink-0" />
          </button>
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          aria-label={label}
          tabIndex={-1}
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          hideWhenDetached
          className="z-50 flex w-56 max-w-[calc(100vw-1rem)] min-h-0 max-h-[var(--radix-popover-content-available-height)] flex-col gap-1 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          onPointerEnter={cancelClose}
          onPointerLeave={handlePointerLeave}
          onFocusCapture={() => { hoverOpened.current = false; }}
          onOpenAutoFocus={(event) => {
            // Hover must not steal focus; keyboard opening retains Radix's link-only focus behavior.
            if (hoverOpened.current) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            if (hoverOpened.current) event.preventDefault();
          }}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.active ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={`block shrink-0 px-3 py-2 rounded-xl text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
                link.active
                  ? "bg-primary-light text-foreground font-bold"
                  : "text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
  if (isCollapsed) {
    return (
      <div className="flex justify-center w-full">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
              }`}
            >
              <Icon className="w-[22px] h-[22px] shrink-0" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="motion-reduce:animate-none">
            {label}
          </TooltipContent>
        </Tooltip>
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
      <Link href={href} aria-current={active ? "page" : undefined}>
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
  const { state: sidebarState, isMobile, toggleSidebar, setOpenMobile } = useSidebar();
  const isCollapsed = !isMobile && sidebarState === "collapsed";
  const sectionId = useId();

  const t = useMemo(() => (key: string) => TRANSLATIONS[lang]?.[key] || key, [lang]);

  const { user, hasPermission } = useAuth();
  const { sections, persistence, setSection, setSections } = useSidebarPreferences(user?.id);

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
  const employeesOpen = sections.employees ?? true;
  const eventsOpen = sections.events ?? true;
  const financeOpen = sections.finance ?? true;
  const itemsOpen = sections.inventory ?? true;
  const refDataOpen = sections["reference-data"] ?? isRefDataActive;
  const visibleSectionIds = getVisibleSidebarSectionIds(navState);
  const adminNavigation = navState.adminLink && (
    <SidebarMenu className={isCollapsed ? "items-center" : ""}>
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
  );

  return (
    <Sidebar
      collapsible="icon"
      mobileTitle="Dream Lux"
      className="border-none bg-transparent [&_[data-sidebar=sidebar]]:border-none [&_[data-sidebar=sidebar]]:bg-transparent [&_[data-sidebar=sidebar]]:shadow-none"
    >
      {/* Header - Logo & Collapse Toggle */}
      <SidebarHeader className={`py-5 hidden md:flex flex-row items-center justify-between select-none ${isCollapsed ? "px-0 justify-center" : "px-4"}`}>
        {isCollapsed ? (
          <button
            onClick={(event) => toggleSidebar(event.currentTarget)}
            className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center text-background font-bold text-lg shrink-0 hover:opacity-90 transition-all cursor-pointer active:scale-95 shadow-md border border-border/10"
            aria-label={t("Expand Sidebar")}
            title={t("Expand Sidebar")}
          >
            D
          </button>
        ) : (
          <>
            <div className="flex items-center gap-3 truncate">
              <button
                onClick={(event) => toggleSidebar(event.currentTarget)}
                className="w-9 h-9 rounded-xl bg-foreground flex items-center justify-center text-background font-bold text-base shrink-0 hover:opacity-90 transition-all cursor-pointer active:scale-95 shadow-md border border-border/10"
                aria-label={t("Collapse Sidebar")}
                title={t("Collapse Sidebar")}
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
              onClick={(event) => toggleSidebar(event.currentTarget)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-foreground hover:bg-card-alt transition-all cursor-pointer shrink-0"
              aria-label={t("Collapse Sidebar")}
              title={t("Collapse Sidebar")}
            >
              <HiChevronLeft className="w-4 h-4" />
            </button>
          </>
        )}
      </SidebarHeader>

      {/* Content Groupings */}
      <SidebarContent
        className="py-2"
        onClickCapture={(event) => {
          if (isMobile && event.target instanceof Element && event.target.closest("a[href]")) setOpenMobile(false);
        }}
      >
        {visibleSectionIds.length > 0 && (
          <div data-sidebar="section-controls" className="flex shrink-0 gap-2 px-2 pb-2">
            {[
              { open: true, label: "Expand all", name: "Expand all sections", icon: HiChevronDoubleDown },
              { open: false, label: "Collapse all", name: "Collapse all sections", icon: HiChevronDoubleUp },
            ].map(({ open, label, name, icon: Icon }) => (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={t(name)}
                    onClick={() => setSections(visibleSectionIds, open)}
                    className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-border px-2 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring [@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt md:h-8"
                  >
                    <Icon className="size-4 shrink-0" />
                    {!isCollapsed && <span>{t(label)}</span>}
                  </button>
                </TooltipTrigger>
                <TooltipContent hidden={!isCollapsed} side="right" sideOffset={8} className="motion-reduce:animate-none">
                  {t(name)}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
        {persistence === "session" && (
          <p role="status" className={isCollapsed ? "sr-only" : "px-3 pb-2 text-xs text-foreground"}>
            {t("Session preferences")}
          </p>
        )}
        {/* HR Management Section */}
        {navState.showHRGroup && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-4 text-[10px] font-semibold tracking-widest uppercase text-muted group-data-[collapsible=icon]:hidden">
              {t("HR Management")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className={`${isCollapsed ? "items-center md:gap-2" : ""}`}>
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
                          data-nav-section="employees"
                          aria-expanded={employeesOpen}
                          aria-controls={`${sectionId}-employees`}
                          onClick={() => setSection("employees", !employeesOpen)}
                          className={`w-full justify-between h-10 border border-transparent transition-all ${
                            isEmployeesActive
                              ? "bg-primary-light border-primary/20 text-foreground font-bold rounded-xl"
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
                          <SidebarMenuSub id={`${sectionId}-employees`} className="ml-[27px] border-none pl-3.5 mt-2 md:mt-1 relative">
                            {navState.employeesLinks.map((link, idx) => (
                              <SidebarMenuSubItem key={link.href} className="relative">
                                <SubItemBranchLine isLast={idx === navState.employeesLinks.length - 1} />
                                <SidebarMenuSubButton asChild isActive={link.active} className="rounded-xl">
                                  <Link
                                    href={link.href}
                                    aria-current={link.active ? "page" : undefined}
                                    className={
                                      link.active
                                        ? "text-foreground font-bold flex items-center gap-1.5"
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
                          data-nav-section="events"
                          aria-expanded={eventsOpen}
                          aria-controls={`${sectionId}-events`}
                          onClick={() => setSection("events", !eventsOpen)}
                          className={`w-full justify-between h-10 border border-transparent transition-all ${
                            isEventsActive
                              ? "bg-primary-light border-primary/20 text-foreground font-bold rounded-xl"
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
                          <SidebarMenuSub id={`${sectionId}-events`} className="ml-[27px] border-none pl-3.5 mt-2 md:mt-1 relative">
                            {navState.eventLinks.map((link, idx) => (
                              <SidebarMenuSubItem key={link.href} className="relative">
                                <SubItemBranchLine isLast={idx === navState.eventLinks.length - 1} />
                                <SidebarMenuSubButton asChild isActive={link.active} className="rounded-xl">
                                  <Link
                                    href={link.href}
                                    aria-current={link.active ? "page" : undefined}
                                    className={
                                      link.active
                                        ? "text-foreground font-bold flex items-center gap-1.5"
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
                          data-nav-section="finance"
                          aria-expanded={financeOpen}
                          aria-controls={`${sectionId}-finance`}
                          onClick={() => setSection("finance", !financeOpen)}
                          className={`w-full justify-between h-10 border border-transparent transition-all ${
                            isFinanceActive
                              ? "bg-primary-light border-primary/20 text-foreground font-bold rounded-xl"
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
                          <SidebarMenuSub id={`${sectionId}-finance`} className="ml-[27px] border-none pl-3.5 mt-2 md:mt-1 relative">
                            {navState.financeLinks.map((link, idx) => (
                              <SidebarMenuSubItem key={link.href} className="relative">
                                <SubItemBranchLine isLast={idx === navState.financeLinks.length - 1} />
                                <SidebarMenuSubButton asChild isActive={link.active} className="rounded-xl">
                                  <Link
                                    href={link.href}
                                    aria-current={link.active ? "page" : undefined}
                                    className={
                                      link.active
                                        ? "text-foreground font-bold flex items-center gap-1.5"
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
                          data-nav-section="reference-data"
                          aria-expanded={refDataOpen}
                          aria-controls={`${sectionId}-reference-data`}
                          onClick={() => setSection("reference-data", !refDataOpen)}
                          className={`w-full justify-between h-10 border border-transparent transition-all ${
                            isRefDataActive
                              ? "bg-primary-light border-primary/20 text-foreground font-bold rounded-xl"
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
                          <SidebarMenuSub id={`${sectionId}-reference-data`} className="ml-[27px] border-none pl-3.5 mt-2 md:mt-1 relative">
                            {navState.refDataLinks.map((link, idx) => (
                              <SidebarMenuSubItem key={link.href} className="relative">
                                <SubItemBranchLine isLast={idx === navState.refDataLinks.length - 1} />
                                <SidebarMenuSubButton asChild isActive={link.active} className="rounded-xl">
                                  <Link
                                    href={link.href}
                                    aria-current={link.active ? "page" : undefined}
                                    className={
                                      link.active
                                        ? "text-foreground font-bold flex items-center gap-1.5"
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
            <SidebarGroupLabel className="px-4 text-[10px] font-semibold tracking-widest uppercase text-muted group-data-[collapsible=icon]:hidden">
              {t("Inventory Management")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className={`${isCollapsed ? "items-center md:gap-2" : ""}`}>


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
                          data-nav-section="inventory"
                          aria-expanded={itemsOpen}
                          aria-controls={`${sectionId}-inventory`}
                          onClick={() => setSection("inventory", !itemsOpen)}
                          className={`w-full justify-between h-10 border border-transparent transition-all ${
                            isInventoryActive
                              ? "bg-primary-light border-primary/20 text-foreground font-bold rounded-md"
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
                          <SidebarMenuSub id={`${sectionId}-inventory`} className="ml-[27px] border-none pl-3.5 mt-2 md:mt-1 relative">
                            {navState.inventoryLinks.map((link, idx) => (
                              <SidebarMenuSubItem key={link.href} className="relative">
                                <SubItemBranchLine isLast={idx === navState.inventoryLinks.length - 1} />
                                <SidebarMenuSubButton asChild isActive={link.active} className="rounded-md">
                                  <Link
                                    href={link.href}
                                    aria-current={link.active ? "page" : undefined}
                                    className={
                                      link.active
                                        ? "text-foreground font-bold flex items-center gap-1.5"
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
        {isMobile && adminNavigation && (
          <SidebarFooter className="border-t border-border/50 p-3 shrink-0">
            {adminNavigation}
          </SidebarFooter>
        )}
      </SidebarContent>

      {!isMobile && (
        <SidebarFooter className="border-t border-border/50 p-3 shrink-0">
          {adminNavigation}
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
