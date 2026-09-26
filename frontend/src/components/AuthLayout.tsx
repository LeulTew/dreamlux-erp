"use client";
import { useEffect, useLayoutEffect, useState, useRef, useId } from "react";
import { Dialog, Popover } from "radix-ui";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getEmployees, getEvents, getItems, getPayrollRuns, getSalaryLevels, api } from "@/lib/api";
import type { Employee, Event, Item, PayrollRun, SalaryLevel } from "@/lib/types";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import PayrollReminder from "@/components/PayrollReminder";
import NotificationInbox from "@/components/NotificationInbox";
import PwaLifecycle from "@/components/PwaLifecycle";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useTheme } from "@/hooks/use-theme";
import { useLanguage } from "@/hooks/use-language";
import { useModalFocus } from "@/hooks/use-modal-focus";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { clearAuthSessionStorage } from "@/lib/auth-session";
import {
  HiOutlineSun,
  HiOutlineMoon,
  HiChevronDown,
  HiArrowRightOnRectangle,
  HiOutlineUser,
  HiOutlineInformationCircle,
  HiArrowsRightLeft,
  HiMagnifyingGlass,
  HiXMark,
} from "react-icons/hi2";
import UserAvatar from "@/components/UserAvatar";
import { usePrivateDraftAccess } from "@/components/PrivateDraftBoundary";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    Search: "Search",
    "Search...": "Search...",
    "Search (Ctrl+K)": "Search (Ctrl+K)",
    "Close search": "Close search",
    "Profile menu": "Profile menu",
    "Toggle Sidebar": "Toggle Sidebar",
    User: "User",
    Dark: "Dark",
    Light: "Light",
    HR: "HR",
    Events: "Events",
    Finance: "Finance",
    Inventory: "Inventory",
    Admin: "Admin",
    Employee: "Employee",
    Asset: "Asset",
    Event: "Event",
    Salary: "Salary",
    Payroll: "Payroll",
    Qty: "Qty",
    "Sign Out": "Sign Out",
    Cancel: "Cancel",
    "Are you sure you want to sign out?": "Are you sure you want to sign out?",
    Language: "Language",
    Theme: "Theme",
    "Page Width": "Page Width",
    "Profile Settings": "Profile Settings",
    "About ERP": "About ERP",
    Full: "Full Canvas",
    Normal: "Contained Canvas",
    "About Dream Lux ERP": "About Dream Lux ERP",
    "Dream Lux ERP Description": "Enterprise Resource Planning for premium event logistics, HR, payroll, and asset management.",
    Close: "Close",
    "Preview Mode: Active": "Preview Mode: Active",
    "Viewing as": "Viewing as",
    "Exit Preview": "Exit Preview",
  },
  am: {
    Search: "ፈልግ",
    "Search...": "ፈልግ...",
    "Search (Ctrl+K)": "ፈልግ (Ctrl+K)",
    "Close search": "ፍለጋውን ዝጋ",
    "Profile menu": "የመገለጫ ምናሌ",
    "Toggle Sidebar": "የጎን ምናሌ ቀይር",
    User: "ተጠቃሚ",
    Dark: "ጨለማ",
    Light: "ብርሃን",
    HR: "የሰው ኃይል",
    Events: "ዝግጅቶች",
    Finance: "ፋይናንስ",
    Inventory: "ዕቃዎች",
    Admin: "አስተዳደር",
    Employee: "ሰራተኛ",
    Asset: "ዕቃ",
    Event: "ዝግጅት",
    Salary: "ደመወዝ",
    Payroll: "የደመወዝ ክፍያ",
    Qty: "ብዛት",
    "Sign Out": "ውጣ",
    Cancel: "ተመለስ",
    "Are you sure you want to sign out?": "በእርግጥ መውጣት ይፈልጋሉ?",
    Language: "ቋንቋ",
    Theme: "ገጽታ",
    "Page Width": "የገጽ ስፋት",
    "Profile Settings": "የመገለጫ ቅንብሮች",
    "About ERP": "ስለ ሲስተሙ",
    Full: "ሙሉ ስፋት",
    Normal: "መደበኛ ስፋት",
    "About Dream Lux ERP": "ስለ ድሪም ላክስ ERP",
    "Dream Lux ERP Description": "የላቀ የዝግጅት ዝግጅት፣ የሰው ኃይል አስተዳደር፣ የደመወዝ እና የንብረት ቁጥጥር አስተዳደር ሲስተም።",
    Close: "ዝጋ",
    "Preview Mode: Active": "የቅድመ እይታ ሁነታ፡ ንቁ",
    "Viewing as": "በዚህ በመመልከት ላይ፡",
    "Exit Preview": "ከቅድመ እይታ ውጣ",
  },
};

const SEARCH_ITEMS = [
  { label: "Employees List", amLabel: "የሰራተኞች ዝርዝር", href: "/", category: "HR", permissions: ["hr:read", "hr:write"] },
  { label: "Add Employee", amLabel: "ሰራተኛ መዝግብ", href: "/insert", category: "HR", permissions: ["hr:write"] },
  { label: "Events Calendar", amLabel: "ዝግጅቶች", href: "/events", category: "Events", permissions: ["events:read"] },
  { label: "Payroll Dashboard", amLabel: "ደመወዝ", href: "/hr/payments", category: "HR", permissions: ["payroll:read", "payroll:write"] },
  { label: "Expense Approval Queue", amLabel: "የወጪ ማጽደቂያ", href: "/hr/expenses/approve", category: "Finance", permissions: ["expenses:approve"] },
  { label: "Salary Levels", amLabel: "የደመወዝ ደረጃዎች", href: "/hr/salary-levels", category: "HR", permissions: ["salary-levels:manage"] },
  { label: "Event Types Settings", amLabel: "የዝግጅት አይነቶች", href: "/hr/event-types", category: "Events", permissions: ["events:write"] },
  { label: "Inventory Dashboard", amLabel: "የዕቃዎች ዋና ገጽ", href: "/assets/dashboard", category: "Inventory", permissions: ["assets:read"] },
  { label: "Inventory Items List", amLabel: "የዕቃዎች ዝርዝር", href: "/assets", category: "Inventory", permissions: ["assets:read"] },
  { label: "Add Inventory Item", amLabel: "ዕቃ መዝግብ", href: "/assets/insert", category: "Inventory", permissions: ["assets:write"] },
  { label: "Stock Reconciliation", amLabel: "ቆጠራ ማመሳከሪያ", href: "/assets/reconcile", category: "Inventory", permissions: ["assets:reconcile"] },
  { label: "Audit Log History", amLabel: "የቆጠራ ታሪክ", href: "/assets/history", category: "Inventory", permissions: ["assets:read"] },
  { label: "Inventory Reports", amLabel: "ዕቃዎች ሪፖርቶች", href: "/assets/reports", category: "Inventory", permissions: ["assets:read"] },
  { label: "Hisab Reports", amLabel: "የሂሳብ ሪፖርቶች", href: "/hr/finance/hisab", category: "Finance", permissions: ["finance:hisab:read"] },
  { label: "Overhead Register", amLabel: "የወጪ መዝገብ", href: "/hr/finance/overheads", category: "Finance", permissions: ["finance:overheads:read"] },
  { label: "Capital Register", amLabel: "የካፒታል መዝገብ", href: "/hr/finance/investments", category: "Finance", permissions: ["finance:investments:read"] },
  { label: "Net Profit", amLabel: "የተጣራ ትርፍ", href: "/hr/finance/hisab/net-profit", category: "Finance", permissions: ["finance:hisab:read"] },
  { label: "Hisab Import", amLabel: "የሂሳብ ማስገቢያ", href: "/hr/finance/hisab/imports", category: "Finance", permissions: ["finance:imports:write"] },
  { label: "Admin Settings", amLabel: "አስተዳዳሪ ቅንብሮች", href: "/settings", category: "Admin", permissions: ["users:manage", "settings:write"] },
];

type StaticSearchItem = (typeof SEARCH_ITEMS)[number];

type SearchResult = {
  key: string;
  label: string;
  amLabel: string;
  href: string;
  category: string;
  detail?: string;
  amDetail?: string;
};

const toPageResult = (item: StaticSearchItem): SearchResult => ({
  label: item.label,
  amLabel: item.amLabel,
  href: item.href,
  category: item.category,
  key: `page:${item.href}`,
});

const compactDetail = (values: Array<string | number | null | undefined>) =>
  values.filter((value) => value !== null && value !== undefined && String(value).trim().length > 0).join(" · ");

const HEADER_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const PROFILE_ACTION = `flex min-h-12 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:bg-sidebar-accent ${HEADER_FOCUS}`;

function HeaderDialog({
  isOpen, onClose, title, description, getReturnFocus, children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  getReturnFocus: () => HTMLElement | null;
  children: React.ReactNode;
}) {
  const modalFocus = useModalFocus(getReturnFocus);
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-70 bg-black/40 no-print" />
        <Dialog.Content {...modalFocus}
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-70 max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-xl border border-border bg-card p-5 text-center sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%_-_2rem)] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 no-print">
          <Dialog.Title className="text-lg font-bold text-foreground">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">{description}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SearchDialog({
  isOpen,
  onClose,
  lang,
  getReturnFocus,
}: {
  isOpen: boolean;
  onClose: () => void;
  lang: string;
  getReturnFocus: () => HTMLElement | null;
}) {
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [recordResults, setRecordResults] = useState<SearchResult[]>([]);
  const [isSearchingRecords, setIsSearchingRecords] = useState(false);
  const [recordSearchError, setRecordSearchError] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const modalFocus = useModalFocus(getReturnFocus);
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const { hasPermission } = useAuth();
  const canSearchEmployees = hasPermission("hr:read") || hasPermission("hr:write");
  const canSearchAssets = hasPermission("assets:read");
  const canSearchEvents = hasPermission("events:read");
  const canSearchSalaryLevels = hasPermission("salary-levels:manage");
  const canSearchPayroll = hasPermission("payroll:read") || hasPermission("payroll:write");
  const recordPermissions: Record<string, boolean> = {
    Employee: canSearchEmployees, Asset: canSearchAssets, Event: canSearchEvents,
    Salary: canSearchSalaryLevels, Payroll: canSearchPayroll,
  };

  const pageResults = SEARCH_ITEMS.filter((item) => {
    // Unified permission check
    if (item.permissions && !item.permissions.some((p) => hasPermission(p))) {
      return false;
    }

    const term = query.trim().toLowerCase();
    return (
      !term ||
      item.label.toLowerCase().includes(term) ||
      item.amLabel.toLowerCase().includes(term) ||
      item.category.toLowerCase().includes(term)
    );
  }).map(toPageResult);

  const filtered = [...recordResults.filter((result) => recordPermissions[result.category]), ...pageResults].slice(0, 12);
  const activeResult = filtered.find((result) => result.key === activeKey) ?? filtered[0];
  const activeIndex = Math.max(0, filtered.findIndex((result) => result === activeResult));
  const resultId = (key: string) => `${listboxId}-result-${encodeURIComponent(key)}`;
  const activeDescendant = activeResult ? resultId(activeResult.key) : undefined;
  const resultLayoutKey = JSON.stringify(filtered.map((result) => [
    result.key, lang === "am" ? result.amLabel : result.label,
    (lang === "am" ? result.amDetail ?? result.detail : result.detail) || result.href,
    t(result.category),
  ]));

  useLayoutEffect(() => {
    const viewport = resultsRef.current;
    const result = activeDescendant ? document.getElementById(activeDescendant) : null;
    if (!viewport || !result) return;
    const bounds = viewport.getBoundingClientRect();
    const resultBounds = result.getBoundingClientRect();
    if (resultBounds.top < bounds.top) viewport.scrollTop -= bounds.top - resultBounds.top;
    else if (resultBounds.bottom > bounds.bottom) viewport.scrollTop += resultBounds.bottom - bounds.bottom;
  }, [activeDescendant, resultLayoutKey]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      const nextQuery = query.trim();
      setDebouncedQuery(nextQuery);
      if (nextQuery.length >= 2) {
        setIsSearchingRecords(true);
        setRecordSearchError(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isOpen, query]);

  useEffect(() => {
    if (!isOpen) return;

    if (debouncedQuery.length < 2) {
      return;
    }

    let active = true;

    const promises = [
      canSearchEmployees
        ? getEmployees(1, 5, debouncedQuery, "active").then((res) => ({ type: "employees", value: res }))
        : Promise.resolve({ type: "employees", value: null }),
      canSearchAssets
        ? getItems(1, 5, debouncedQuery).then((res) => ({ type: "assets", value: res }))
        : Promise.resolve({ type: "assets", value: null }),
      canSearchEvents
        ? getEvents(1, 5, debouncedQuery).then((res) => ({ type: "events", value: res }))
        : Promise.resolve({ type: "events", value: null }),
      canSearchSalaryLevels
        ? getSalaryLevels().then((res) => ({ type: "salaryLevels", value: res }))
        : Promise.resolve({ type: "salaryLevels", value: null }),
      canSearchPayroll
        ? getPayrollRuns({ view: "active", limit: 20 }).then((res) => ({ type: "payroll", value: res }))
        : Promise.resolve({ type: "payroll", value: null }),
    ];

    Promise.allSettled(promises)
      .then((results) => {
        if (!active) return;

        const nextResults: SearchResult[] = [];
        const normalizedQuery = debouncedQuery.toLowerCase();

        const [employeesRes, assetsRes, eventsRes, salaryLevelsRes, payrollRunsRes] = results;

        if (employeesRes.status === "fulfilled" && employeesRes.value && employeesRes.value.value) {
          const employees = (employeesRes.value.value?.employees || []) as Employee[];
          nextResults.push(
            ...employees.map((employee) => ({
              key: `employee:${employee.id}`,
              label: employee.full_name,
              amLabel: employee.full_name,
              href: `/?edit=${encodeURIComponent(employee.id)}`,
              category: "Employee",
              detail: compactDetail([employee.employee_id, employee.department, employee.office]),
            }))
          );
        }

        if (assetsRes.status === "fulfilled" && assetsRes.value && assetsRes.value.value) {
          const assets = (assetsRes.value.value?.items || []) as Item[];
          nextResults.push(
            ...assets.map((item) => ({
              key: `asset:${item.id}`,
              label: item.name,
              amLabel: item.name,
              href: `/assets?q=${encodeURIComponent(item.name)}`,
              category: "Asset",
              detail: compactDetail([item.store?.name, `${TRANSLATIONS.en.Qty} ${item.quantity}`]),
              amDetail: compactDetail([item.store?.name, `${TRANSLATIONS.am.Qty} ${item.quantity}`]),
            }))
          );
        }

        if (eventsRes.status === "fulfilled" && eventsRes.value && eventsRes.value.value) {
          const events = (eventsRes.value.value?.events || []) as Event[];
          nextResults.push(
            ...events.map((event) => ({
              key: `event:${event.id}`,
              label: event.name,
              amLabel: event.name,
              href: `/events?edit=${encodeURIComponent(event.id)}`,
              category: "Event",
              detail: compactDetail([event.client_name, event.venue_location, event.status]),
            }))
          );
        }

        if (salaryLevelsRes.status === "fulfilled" && salaryLevelsRes.value && salaryLevelsRes.value.value) {
          const salaryLevels = ((salaryLevelsRes.value.value || []) as SalaryLevel[])
            .filter((level) =>
              compactDetail([level.level_name, level.base_salary]).toLowerCase().includes(normalizedQuery)
            )
            .slice(0, 5);
          nextResults.push(
            ...salaryLevels.map((level) => ({
              key: `salary-level:${level.id}`,
              label: level.level_name,
              amLabel: level.level_name,
              href: `/hr/salary-levels?highlight=${encodeURIComponent(level.id)}`,
              category: "Salary",
              detail: `ETB ${Number(level.base_salary).toLocaleString()}`,
            }))
          );
        }

        if (payrollRunsRes.status === "fulfilled" && payrollRunsRes.value && payrollRunsRes.value.value) {
          const payrollRuns = ((payrollRunsRes.value.value?.runs || []) as PayrollRun[])
            .filter((run) =>
              compactDetail([
                run.status,
                run.year,
                run.month,
                run.period_start,
                run.period_end,
                run.total_payroll_value,
              ]).toLowerCase().includes(normalizedQuery)
            )
            .slice(0, 5);
          nextResults.push(
            ...payrollRuns.map((run) => ({
              key: `payroll:${run.id}`,
              label: compactDetail([run.period_start, run.period_end]) || `${TRANSLATIONS.en.Payroll} ${run.id}`,
              amLabel: compactDetail([run.period_start, run.period_end]) || `${TRANSLATIONS.am.Payroll} ${run.id}`,
              href: `/hr/payments?highlight=${encodeURIComponent(run.id)}`,
              category: "Payroll",
              detail: compactDetail([run.status, `ETB ${Number(run.total_payroll_value || 0).toLocaleString()}`]),
            }))
          );
        }

        setRecordResults(nextResults.slice(0, 8));
        setRecordSearchError(
          (canSearchEmployees ? employeesRes.status === "rejected" : false) &&
            (canSearchAssets ? assetsRes.status === "rejected" : false) &&
            (canSearchEvents ? eventsRes.status === "rejected" : false) &&
            (canSearchSalaryLevels ? salaryLevelsRes.status === "rejected" : false) &&
            (canSearchPayroll ? payrollRunsRes.status === "rejected" : false)
        );
      })
      .catch(() => {
        if (active) {
          setRecordResults([]);
          setRecordSearchError(true);
        }
      })
      .finally(() => {
        if (active) {
          setIsSearchingRecords(false);
        }
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery, isOpen, canSearchEmployees, canSearchAssets, canSearchEvents, canSearchSalaryLevels, canSearchPayroll]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveKey(filtered[(activeIndex + 1) % Math.max(1, filtered.length)]?.key ?? null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveKey(filtered[(activeIndex - 1 + filtered.length) % Math.max(1, filtered.length)]?.key ?? null);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeResult) {
        router.push(activeResult.href);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
      <Dialog.Overlay
        className="fixed inset-0 z-80 bg-black/60 no-print"
      />
      <Dialog.Content {...modalFocus} aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          // This combobox is the search dialog itself, not a nested selector.
          if (event.target !== inputRef.current) modalFocus.onEscapeKeyDown(event);
        }}
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-80 flex max-h-[70dvh] flex-col overflow-hidden rounded-xl border border-border bg-card sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[15vh] sm:w-[calc(100%_-_2rem)] sm:max-w-lg sm:-translate-x-1/2 no-print">
          <Dialog.Title className="sr-only">{t("Search")}</Dialog.Title>
          <div className="flex shrink-0 items-center gap-2 px-3 py-2 border-b border-border/60">
            <HiMagnifyingGlass className="w-5 h-5 text-muted shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label={t("Search")}
              aria-autocomplete="list"
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-activedescendant={activeDescendant}
              onKeyDown={handleKeyDown}
              value={query}
              onChange={(e) => {
                const nextQuery = e.target.value;
                setQuery(nextQuery);
                setActiveKey(null);
                if (nextQuery.trim().length < 2) {
                  setRecordResults([]);
                  setIsSearchingRecords(false);
                  setRecordSearchError(false);
                }
              }}
              placeholder={lang === "en" ? "Search pages, tools or settings..." : "ገጾችን፣ ዕቃዎችን ወይም ቅንብሮችን ይፈልጉ..."}
              className={`min-h-12 min-w-0 flex-1 rounded-lg bg-transparent border-none text-foreground text-sm placeholder:text-muted ${HEADER_FOCUS}`}
            />
            <button type="button" onClick={onClose} aria-label={t("Close search")}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-colors motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt ${HEADER_FOCUS}`}>
              <HiXMark className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div ref={resultsRef} className="min-h-0 flex-1 overflow-y-auto p-2">
              <div id={listboxId} role="listbox" aria-label={t("Search")} className="flex flex-col gap-2">
                {filtered.map((item) => {
                  const isSelected = item === activeResult;
                  return (
                    <button
                      key={item.key}
                      id={resultId(item.key)}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={isSelected}
                      onMouseDown={(event) => event.preventDefault()}
                      onFocus={() => setActiveKey(item.key)}
                      onClick={() => {
                        router.push(item.href);
                        onClose();
                      }}
                      className={`min-h-12 w-full text-left px-3 py-2.5 rounded-xl transition-colors motion-reduce:transition-none flex flex-wrap items-center justify-between gap-2 cursor-pointer ${
                        isSelected ? "bg-card-alt text-foreground" : "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt text-foreground"
                      } ${HEADER_FOCUS}`}
                    >
                      <div className="flex min-w-0 flex-col gap-0.5 [overflow-wrap:anywhere]">
                        <span className="text-xs font-bold">{lang === "en" ? item.label : item.amLabel}</span>
                        <span className="text-xs text-muted tabular-nums">{(lang === "am" ? item.amDetail ?? item.detail : item.detail) || item.href}</span>
                      </div>
                      <span className="text-xs font-medium text-muted">
                        {t(item.category)}
                      </span>
                    </button>
                  );
                })}
              </div>
            {filtered.length === 0 && (
              <div role="status" className="py-8 text-center text-xs text-muted font-medium">
                {isSearchingRecords
                  ? lang === "en"
                    ? "Searching records..."
                    : "መዝገቦችን በመፈለግ ላይ..."
                  : lang === "en"
                    ? "No results found for your query."
                    : "ምንም ውጤት አልተገኘም።"}
              </div>
            )}
            {recordSearchError && (
              <div className="px-3 pb-2 text-[10px] font-medium text-danger">
                {lang === "en"
                  ? "Record search is unavailable. Page search still works."
                  : "የመዝገብ ፍለጋ አልተሳካም። የገጽ ፍለጋ ግን ይሰራል።"}
              </div>
            )}
          </div>
      </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function HeaderUserMenu({
  pageWidth,
  togglePageWidth,
  setShowAbout,
  onLogout,
  triggerRef,
}: {
  pageWidth: "full" | "contained";
  togglePageWidth: () => void;
  setShowAbout: (show: boolean) => void;
  onLogout: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { lang, toggle: toggleLang } = useLanguage();
  const { dark, toggle: toggleTheme } = useTheme();
  const [showConfirm, setShowConfirm] = useState(false);
  const { user: authUser, hasPermission } = useAuth();
  const modalFocus = useModalFocus(() => triggerRef.current);
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const user = {
    full_name: authUser?.full_name || authUser?.username || t("User"),
    role_name: authUser?.role_name || authUser?.role_names?.[0] || t("User"),
    profile_image_url: authUser?.profile_image_url || null,
  };

  const handleLogout = () => {
    onLogout();
    router.replace("/login");
  };

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen} modal>
      <Popover.Trigger asChild>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${t("Profile menu")}: ${user.full_name}`}
        className={`flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 px-2 rounded-xl [@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt transition-colors motion-reduce:transition-none cursor-pointer select-none ${HEADER_FOCUS}`}
      >
        <UserAvatar
          fullName={user.full_name}
          imageUrl={user.profile_image_url}
          sizeClassName="w-7 h-7"
          className="border border-border shrink-0 shadow-none"
          textClassName="text-[8px] font-black text-muted"
        />
        <HiChevronDown className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
      </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content {...modalFocus} aria-label={t("Profile menu")} align="end" sideOffset={8} collisionPadding={12}
          className="z-50 flex w-72 max-w-[calc(100vw-1.5rem)] max-h-[var(--radix-popover-content-available-height)] flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-card p-3 no-print">
          <div className="px-2 py-1.5 border-b border-border/50 pb-2.5 mb-1">
            <p className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{user.full_name}</p>
            <p className="text-xs font-medium text-muted mt-0.5 [overflow-wrap:anywhere]">{user.role_name}</p>
          </div>

          {(hasPermission("users:manage") || hasPermission("settings:write")) && (
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className={PROFILE_ACTION}
            >
              <HiOutlineUser className="w-4 h-4 shrink-0 text-muted" aria-hidden="true" />
              <span>{t("Profile Settings")}</span>
            </Link>
          )}


          <button
            type="button"
            onClick={toggleLang}
            className={`${PROFILE_ACTION} justify-between`}
          >
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="font-mono text-xs w-4 text-center shrink-0 font-black text-muted">
                {lang === "en" ? "EN" : "አማ"}
              </span>
              <span>{t("Language")}</span>
            </div>
            <span className="text-xs text-muted">
              {lang === "en" ? "English" : "አማርኛ"}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className={`${PROFILE_ACTION} justify-between`}
          >
            <div className="flex items-center gap-2">
              {dark ? (
                <HiOutlineSun className="w-4 h-4 shrink-0 text-muted" aria-hidden="true" />
              ) : (
                <HiOutlineMoon className="w-4 h-4 shrink-0 text-muted" aria-hidden="true" />
              )}
              <span>{t("Theme")}</span>
            </div>
            <span className="text-xs text-muted">
              {t(dark ? "Dark" : "Light")}
            </span>
          </button>

          <button
            type="button"
            onClick={togglePageWidth}
            className={`${PROFILE_ACTION} justify-between`}
          >
            <div className="flex items-center gap-2">
              <HiArrowsRightLeft className="w-4 h-4 shrink-0 text-muted" aria-hidden="true" />
              <span>{t("Page Width")}</span>
            </div>
            <span className="text-xs text-right text-muted">
              {t(pageWidth === "contained" ? "Normal" : "Full")}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setShowAbout(true);
            }}
            className={PROFILE_ACTION}
          >
            <HiOutlineInformationCircle className="w-4 h-4 shrink-0 text-muted" aria-hidden="true" />
            <span>{t("About ERP")}</span>
          </button>

          <div className="border-t border-border/50 my-1" />

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setShowConfirm(true);
            }}
            className={`${PROFILE_ACTION} text-danger`}
          >
            <HiArrowRightOnRectangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t("Sign Out")}</span>
          </button>
        </Popover.Content>
      </Popover.Portal>
      </Popover.Root>

      <HeaderDialog isOpen={showConfirm} onClose={() => setShowConfirm(false)}
        title={t("Sign Out")} description={t("Are you sure you want to sign out?")}
        getReturnFocus={() => triggerRef.current}>
              <div className="mt-6 flex gap-2 w-full">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className={`min-h-12 flex-1 px-3 rounded-xl bg-card-alt border border-border text-foreground font-semibold [@media(hover:hover)_and_(pointer:fine)]:hover:bg-border transition-colors motion-reduce:transition-none text-sm cursor-pointer ${HEADER_FOCUS}`}
                >
                  {t("Cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className={`min-h-12 flex-1 px-3 rounded-xl bg-destructive text-destructive-foreground font-semibold [@media(hover:hover)_and_(pointer:fine)]:hover:opacity-90 transition-colors motion-reduce:transition-none text-sm cursor-pointer ${HEADER_FOCUS}`}
                >
                  {t("Sign Out")}
                </button>
              </div>
      </HeaderDialog>
    </>
  );
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const privateDraft = usePrivateDraftAccess();
  const privateVisible = privateDraft?.active ?? true;
  const { isPreviewActive, previewRoleName, clearPreview, isLoading, isAuthenticated, isSessionResolved } = useAuth();
  const [mounted, setMounted] = useState(false);
  const { lang } = useLanguage();
  const [pageWidth, setPageWidth] = useState<"full" | "contained">("full");
  const [showAbout, setShowAbout] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const profileTrigger = useRef<HTMLButtonElement | null>(null);
  const searchTrigger = useRef<HTMLButtonElement | null>(null);
  const searchOpener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => {
      setMounted(true);
      const savedWidth = localStorage.getItem("dreamlux_page_width");
      if (savedWidth === "full" || savedWidth === "contained") {
        setPageWidth(savedWidth);
      }
    });
  }, []);

  const status = !mounted || isLoading || !isSessionResolved
    ? "checking"
    : isAuthenticated
      ? "authenticated"
      : "unauthenticated";

  useEffect(() => {
    if (status === "unauthenticated") {
      clearAuthSessionStorage();
      queryClient.clear();
      router.replace("/login");
    }
  }, [status, router, queryClient]);

  useEffect(() => {
    const enforceTokenPresence = () => {
      if (typeof window === "undefined" || status === "checking" || window.localStorage.getItem("user")) {
        return;
      }

      clearAuthSessionStorage();
      queryClient.clear();
      router.replace("/login");
    };

    window.addEventListener("pageshow", enforceTokenPresence);
    window.addEventListener("focus", enforceTokenPresence);
    return () => {
      window.removeEventListener("pageshow", enforceTokenPresence);
      window.removeEventListener("focus", enforceTokenPresence);
    };
  }, [router, queryClient, status]);

  // Handle Ctrl+K shortcut globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!privateVisible || status !== "authenticated" || (!showSearch && document.querySelector('[role="dialog"], [role="alertdialog"]'))) return;
        if (!showSearch) searchOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setShowSearch(!showSearch);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSearch, status, privateVisible]);

  // Sync page width setting with DOM attribute
  useEffect(() => {
    if (typeof window !== "undefined") {
      document.documentElement.setAttribute("data-page-width", pageWidth);
    }
  }, [pageWidth]);

  const togglePageWidth = () => {
    const next = pageWidth === "full" ? "contained" : "full";
    setPageWidth(next);
    localStorage.setItem("dreamlux_page_width", next);
  };

  const handleLogout = async () => {
    privateDraft?.owner.terminate();
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    }
    clearAuthSessionStorage();
    queryClient.clear();
  };

  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  if (status === "checking" && !privateDraft) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (status !== "authenticated" && !privateDraft) return null;

  return (
    <SidebarProvider className="h-screen overflow-hidden">
      <div className="flex h-full w-full bg-background overflow-hidden">
        {privateVisible && <PwaLifecycle />}
        {privateVisible && <AppSidebar />}
        <SidebarInset className="flex flex-col flex-1 w-full overflow-hidden">
          {isPreviewActive && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs text-amber-500 font-medium select-none z-50">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span>
                  {t("Preview Mode: Active")} ({t("Viewing as")} <strong>{previewRoleName}</strong>)
                </span>
              </div>
              <button
                onClick={clearPreview}
                className="px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all font-semibold cursor-pointer"
              >
                {t("Exit Preview")}
              </button>
            </div>
          )}
          {/* Header - Flat borderless design */}
          <header className="flex h-14 2xl:h-16 shrink-0 items-center gap-2 2xl:gap-3 px-3 md:px-5 2xl:px-6 bg-transparent select-none no-print">
            <SidebarTrigger aria-label={t("Toggle Sidebar")}
              className={`hidden shrink-0 md:inline-flex md:min-h-12 md:min-w-12 text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground transition-colors motion-reduce:transition-none cursor-pointer ${HEADER_FOCUS}`} />
            <Breadcrumbs />

            {/* Top Right Controls */}
            <div className="ml-auto shrink-0 flex items-center gap-2 2xl:gap-3">
              {/* Search Trigger Button */}
              <button
                ref={searchTrigger}
                type="button"
                onClick={(event) => { searchOpener.current = event.currentTarget; setShowSearch(true); }}
                className={`flex min-h-12 min-w-12 items-center justify-center gap-2 px-2.5 2xl:px-3 rounded-lg 2xl:rounded-xl border border-border bg-card-alt/50 text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt transition-colors motion-reduce:transition-none cursor-pointer text-xs font-semibold shrink-0 ${HEADER_FOCUS}`}
                aria-label={t("Search")}
                aria-haspopup="dialog"
                aria-expanded={showSearch}
                title={t("Search (Ctrl+K)")}
              >
                <HiMagnifyingGlass className="w-4 h-4" aria-hidden="true" />
                <span className="hidden lg:inline">{t("Search...")}</span>
                <kbd aria-hidden="true" className="hidden lg:inline-flex h-4 select-none items-center gap-0.5 rounded-lg border border-border bg-card px-1.5 font-mono text-[10px] font-bold text-muted leading-none">
                  <span>Ctrl</span><span>K</span>
                </kbd>
              </button>

              {privateVisible && <PayrollReminder />}
              {privateVisible && <NotificationInbox />}

              {/* User Dropdown */}
              {privateVisible && <HeaderUserMenu
                pageWidth={pageWidth}
                togglePageWidth={togglePageWidth}
                setShowAbout={setShowAbout}
                onLogout={handleLogout}
                triggerRef={profileTrigger}
              />}
            </div>
          </header>

          {/* Main View Area - page content in a curved container on desktop */}
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden p-0 md:pl-0 md:pr-4 md:pb-4 2xl:md:pr-6 2xl:md:pb-6">
            <div className="flex-1 flex flex-col min-h-0 bg-background md:bg-card md:border md:border-border/10 md:rounded-[1.5rem] 2xl:md:rounded-[2rem] p-3 md:p-5 2xl:p-8 overflow-y-auto">
              <div className="flex-1 flex flex-col min-h-0 w-full">
                {children}
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>

      {/* About Modal Dialog */}
      <HeaderDialog isOpen={privateVisible && showAbout} onClose={() => setShowAbout(false)}
        title={t("About Dream Lux ERP")} description={t("Dream Lux ERP Description")}
        getReturnFocus={() => profileTrigger.current}>
        <button type="button" onClick={() => setShowAbout(false)}
          className={`mt-6 min-h-12 w-full px-3 rounded-xl bg-foreground text-background font-semibold [@media(hover:hover)_and_(pointer:fine)]:hover:opacity-90 transition-colors motion-reduce:transition-none text-sm cursor-pointer ${HEADER_FOCUS}`}>
          {t("Close")}
        </button>
      </HeaderDialog>

      {/* Command Search Overlay Modal */}
      {privateVisible && showSearch && <SearchDialog
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        lang={lang}
        getReturnFocus={() => searchOpener.current?.isConnected ? searchOpener.current : searchTrigger.current}
      />}
    </SidebarProvider>
  );
}
