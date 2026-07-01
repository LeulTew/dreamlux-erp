"use client";

export const dynamic = "force-dynamic";

import { Suspense, useCallback, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  HiOutlineArrowUturnLeft, 
  HiOutlinePlus, 
  HiOutlineTrash, 
  HiOutlineCog6Tooth,
  HiArrowPath,
  HiPrinter,
  HiMinus
} from "react-icons/hi2";
import Select from "@/components/ui/Select";
import AuthLayout from "@/components/AuthLayout";
import PaginationControls from "@/components/PaginationControls";
import PrintOptionsModal from "@/components/PrintOptionsModal";
import UserAvatar from "@/components/UserAvatar";
import { useRef } from "react";
import {
  getEmployees,
  getStores,
  getSalaryLevels,
  getEventTypes,
  previewPayrollRun,
  savePayrollDraft,
  finalizePayrollRun,
  getPayrollRuns,
  getPayrollRun,
} from "@/lib/api";
import { 
  Employee, 
  SalaryLevel, 
  EventType, 
  PayrollGenerateRequest, 
  PayrollRun, 
  PayrollEmployeeLine, 
  PayrollRunLineEvent 
} from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { fuzzySearch } from "@/lib/fuzzy-search";
import toast from "@/lib/toast";
import { findRunForPeriod } from "@/utils/payroll-period";
import { useLanguage } from "@/hooks/use-language";
import ForbiddenState from "@/components/ForbiddenState";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Salary & Event Disbursement": "Salary & Event Disbursement",
    "Paginated cards with persistent totals": "Paginated cards with persistent totals",
    "Print": "Print",
    "Saving...": "Saving...",
    "Save Draft": "Save Draft",
    "Previewing...": "Previewing...",
    "Preview": "Preview",
    "Finalizing...": "Finalizing...",
    "Finalize Run": "Finalize Run",
    "Saving draft...": "Saving draft...",
    "Unsaved changes": "Unsaved changes",
    "Saved": "Saved",
    "Not saved yet": "Not saved yet",
    "Summary Report": "Summary Report",
    "Generate a detailed HTML report for this draft run.": "Generate a detailed HTML report for this draft run.",
    "Period (Month)": "Period (Month)",
    "Search & Drafts": "Search & Drafts",
    "Name, code, department": "Name, code, department",
    "Load Draft": "Load Draft",
    "Open Finalized Run": "Open Finalized Run",
    "Office": "Office",
    "All offices": "All offices",
    "Sort: Name": "Sort: Name",
    "Sort: Dept": "Sort: Dept",
    "Sort: Pay": "Sort: Pay",
    "Manage Event Types": "Manage Event Types",
    "Base Salary": "Base Salary",
    "Events / Commissions": "Events / Commissions",
    "No events added for this employee yet.": "No events added for this employee yet.",
    "Select event": "Select event",
    "Decrease": "Decrease",
    "Increase": "Increase",
    "Remove Event": "Remove Event",
    "Add Event": "Add Event",
    "Total Earnings": "Total Earnings",
    "Base Salary Total": "Base Salary Total",
    "Commission Total": "Commission Total",
    "Grand Total Disbursement": "Grand Total Disbursement",
    "Loading payroll run...": "Loading payroll run...",
    "Existing draft loaded!": "Existing draft loaded!",
    "Draft saved": "Draft saved",
    "Failed to generate preview": "Failed to generate preview",
    "Failed to save draft": "Failed to save draft",
    "Failed to finalize payroll run": "Failed to finalize payroll run",
    "Payroll history is still loading. Please try finalizing again in a moment.": "Payroll history is still loading. Please try finalizing again in a moment.",
    "A finalized payroll run already exists for this period. Move the existing run to trash before finalizing again.": "A finalized payroll run already exists for this period. Move the existing run to trash before finalizing again.",
    "A finalized payroll run already exists for": "A finalized payroll run already exists for",
    "Open the existing run instead of creating a duplicate.": "Open the existing run instead of creating a duplicate.",
    "1st-15th": "1st-15th",
    "16th-End": "16th-End",
    "NO LEVEL": "NO LEVEL"
  },
  am: {
    "Salary & Event Disbursement": "የደመወዝ እና ክስተት ክፍያ ማስተላለፊያ",
    "Paginated cards with persistent totals": "የቀጠሉ ካርዶች ከማይለወጥ አጠቃላይ ድምር ጋር",
    "Print": "አትም",
    "Saving...": "በማስቀመጥ ላይ...",
    "Save Draft": "ረቂቅ አስቀምጥ",
    "Previewing...": "ቅድመ-ዕይታ በማዘጋጀት ላይ...",
    "Preview": "ቅድመ-ዕይታ",
    "Finalizing...": "በማጠናቀቅ ላይ...",
    "Finalize Run": "ክፍያውን አጠናቅ",
    "Saving draft...": "ረቂቅ በመቀመጥ ላይ...",
    "Unsaved changes": "ያልተቀመጡ ለውጦች",
    "Saved": "ተቀምጧል",
    "Not saved yet": "እስካሁን አልተቀመጠም",
    "Summary Report": "አጠቃላይ ሪፖርት",
    "Generate a detailed HTML report for this draft run.": "ለዚህ የረቂቅ ክፍያ ዝርዝር የኤችቲኤምኤል ሪፖርት ያመንጩ።",
    "Period (Month)": "የክፍያ ጊዜ (ወር)",
    "Search & Drafts": "ፈልግ እና ረቂቆች",
    "Name, code, department": "ስም፣ ኮድ፣ የሥራ ክፍል",
    "Load Draft": "ረቂቅ ጫን",
    "Open Finalized Run": "የተጠናቀቀ ክፍያ ክፈት",
    "Office": "ቢሮ",
    "All offices": "ሁሉም ቢሮዎች",
    "Sort: Name": "በስም ደርድር",
    "Sort: Dept": "በክፍል ደርድር",
    "Sort: Pay": "በክፍያ ደርድር",
    "Manage Event Types": "የክስተት ዓይነቶችን ያስተዳድሩ",
    "Base Salary": "መሠረታዊ ደመወዝ",
    "Events / Commissions": "ክስተቶች / ኮሚሽኖች",
    "No events added for this employee yet.": "ለዚህ ሠራተኛ እስካሁን የተጨመረ ክስተት የለም።",
    "Select event": "ክስተት ይምረጡ",
    "Decrease": "ቀንስ",
    "Increase": "ጨምር",
    "Remove Event": "ክስተት አስወግድ",
    "Add Event": "ክስተት ጨምር",
    "Total Earnings": "አጠቃላይ ገቢ",
    "Base Salary Total": "አጠቃላይ መሠረታዊ ደመወዝ",
    "Commission Total": "አጠቃላይ ኮሚሽን",
    "Grand Total Disbursement": "አጠቃላይ የተከፈለ ክፍያ",
    "Loading payroll run...": "የክፍያ መዝገብ በመጫን ላይ...",
    "Existing draft loaded!": "ያለው ረቂቅ ተጭኗል!",
    "Draft saved": "ረቂቅ ተቀምጧል",
    "Failed to generate preview": "ቅድመ-ዕይታ ማመንጨት አልተቻለም",
    "Failed to save draft": "ረቂቅ ማስቀመጥ አልተቻለም",
    "Failed to finalize payroll run": "የክፍያ መዝገብ ማጠናቀቅ አልተቻለም",
    "Payroll history is still loading. Please try finalizing again in a moment.": "የክፍያ ታሪክ ገና በመጫን ላይ ነው። እባክዎ ከጥቂት ቆይታ በኋላ እንደገና ይሞክሩ።",
    "A finalized payroll run already exists for this period. Move the existing run to trash before finalizing again.": "ለዚህ የክፍያ ጊዜ ቀደም ሲል የተጠናቀቀ የክፍያ መዝገብ አለ። እንደገና ከማጠናቀቅዎ በፊት ያለውን መዝገብ ወደ መጣያ ይውሰዱት።",
    "A finalized payroll run already exists for": "የተጠናቀቀ የክፍያ መዝገብ ቀደም ሲል ለ",
    "Open the existing run instead of creating a duplicate.": "የተባዛ ከመፍጠር ይልቅ ያለውን መዝገብ ይክፈቱ።",
    "1st-15th": "ከ1ኛ-15ኛ",
    "16th-End": "ከ16ኛ-መጨረሻ",
    "NO LEVEL": "ደረጃ የለውም"
  }
};

type EventLine = {
  event_type_id: string;
  quantity: number;
  price_override?: number | null;
  override_reason?: string | null;
  selected_level_id?: string | null;
};

type PreviewResponse = {
  month: number;
  year: number;
  total_payroll_value: number;
  employee_lines: Array<{
    employee_id: string;
    employee_name_snapshot: string;
    snapshot_base_salary: number;
    total_events_value: number;
    total_line_pay: number;
  }>;
};

function extractHttpError(error: unknown): { status: number | null; message: string | null } {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return { status: null, message: null };
  }

  const response = (error as { response?: { status?: unknown; data?: unknown } }).response;
  const status = typeof response?.status === "number" ? response.status : null;
  const data = response?.data;

  if (typeof data === "object" && data !== null && "error" in data) {
    const message = (data as { error?: unknown }).error;
    if (typeof message === "string" && message.trim().length > 0) {
      return { status, message };
    }
  }

  return { status, message: null };
}

function normalizeLevelLabel(rawLabel: string): string {
  const cleaned = rawLabel.replace(/^legacy:/i, "").trim().toUpperCase();
  if (!cleaned) return "";

  const lMatch = cleaned.match(/^L+\s*(\d+)$/i);
  if (lMatch) return `L${Number(lMatch[1])}`;

  const numericMatch = cleaned.match(/^(\d+)$/);
  if (numericMatch) return `L${Number(numericMatch[1])}`;

  return cleaned;
}

function parseMonth(monthValue: string): { month: number; year: number } {
  const [y, m] = monthValue.split("-");
  const year = Number(y);
  const month = Number(m);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year, month };
}

function PaymentRunProcessPageContent() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const searchParams = useSearchParams();
  const router = useRouter();
  const hasAutoLoaded = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveSourceRef = useRef<"manual" | "auto" | null>(null);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const fromQuery = searchParams.get("date");
    if (fromQuery && /^\d{4}-\d{2}$/.test(fromQuery)) return fromQuery;
    return format(new Date(), "yyyy-MM");
  });

  const [periodType, setPeriodType] = useState<"h1" | "h2">(() => {
    const fromQuery = searchParams.get("period_type");
    if (fromQuery === "h1" || fromQuery === "h2") return fromQuery;
    const day = new Date().getUTCDate();
    return day <= 15 ? "h1" : "h2";
  });

  useEffect(() => {
    const d = searchParams.get("date");
    const p = searchParams.get("period_type");
    
    // Defer state updates to avoid cascading render warning
    const timeout = setTimeout(() => {
      if (d && /^\d{4}-\d{2}$/.test(d) && d !== selectedMonth) {
        setSelectedMonth(d);
      }
      if (p && (p === "h1" || p === "h2") && p !== periodType) {
        setPeriodType(p as "h1" | "h2");
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, [searchParams, selectedMonth, periodType]);

  const [search, setSearch] = useState("");
  const [officeId, setOfficeId] = useState("all");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"name" | "department" | "pay">("name");
  const [errorMsg, setErrorMsg] = useState("");
  const [eventLinesByEmployee, setEventLinesByEmployee] = useState<Record<string, EventLine[]>>({});
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [draftPeriodKey, setDraftPeriodKey] = useState<string | null>(null);
  const { user, isLoading: authLoading, hasPermission, isAuthenticated } = useAuth();
  const [isFloating, setIsFloating] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!sentinelRef.current) return;
      const rect = sentinelRef.current.getBoundingClientRect();
      // On mobile, card sticks at bottom-10 (~40px). 
      // It is floating if its natural position (sentinel) is below that threshold.
      const threshold = window.innerHeight - 80; // Buffer for floating detection
      setIsFloating(rect.top > threshold);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    handleScroll();
    
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  const hasPayrollWrite = isAuthenticated && hasPermission("payroll:write");

  const { data: employeesPayload, isLoading: employeesLoading } = useQuery({
    queryKey: ["payroll-run-employees", officeId],
    queryFn: () => getEmployees(1, 5000, undefined, "active", officeId === "all" ? undefined : officeId),
    enabled: hasPayrollWrite,
  });

  const { data: salaryLevels } = useQuery<SalaryLevel[]>({
    queryKey: ["salary-levels"],
    queryFn: getSalaryLevels,
    enabled: hasPayrollWrite,
  });

  const { data: eventTypes } = useQuery<EventType[]>({
    queryKey: ["event-types"],
    queryFn: getEventTypes,
    enabled: hasPayrollWrite,
  });

  const { data: runsHistoryPayload, isLoading: runsHistoryLoading } = useQuery({
    queryKey: ["payroll-runs", "active"],
    queryFn: () => getPayrollRuns({ view: "active", limit: 100 }),
    enabled: hasPayrollWrite,
  });

  const runsHistory = useMemo(() => runsHistoryPayload?.runs ?? [], [runsHistoryPayload]);

  const existingDraft = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return findRunForPeriod(runsHistory, "DRAFT", y, m, periodType);
  }, [runsHistory, selectedMonth, periodType]);

  const existingFinalized = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return findRunForPeriod(runsHistory, "FINALIZED", y, m, periodType);
  }, [runsHistory, selectedMonth, periodType]);

  const loadDraftMutation = useMutation({
    mutationFn: (id: string) => getPayrollRun(id),
    onSuccess: (data: PayrollRun) => {
      const newLineMap: Record<string, EventLine[]> = {};
      data.employee_lines?.forEach((empLine: PayrollEmployeeLine) => {
        newLineMap[empLine.employee_id] = empLine.events.map((ev: PayrollRunLineEvent) => ({
          event_type_id: ev.event_type_id,
          quantity: ev.quantity,
          price_override: ev.override_price_etb ?? null,
          override_reason: ev.override_reason ?? "",
        }));
      });
      setEventLinesByEmployee(newLineMap);
      setIsDraftDirty(false);
      setLastSavedAt(data.updated_at ?? null);
      setDraftPeriodKey(`${selectedMonth}:${periodType}`);
      toast.success(t("Existing draft loaded!"));
    }
  });

  // Auto-load draft data if detected for the selected period
  useEffect(() => {
    if (existingDraft && hasAutoLoaded.current !== existingDraft.id) {
      loadDraftMutation.mutate(existingDraft.id);
      hasAutoLoaded.current = existingDraft.id;
    }
    // If user changes period, we reset the auto-load tracker for that period
    if (!existingDraft) {
      hasAutoLoaded.current = null;
    }
  }, [existingDraft, loadDraftMutation]);

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const { data: stores } = useQuery({
    queryKey: ["stores"],
    queryFn: getStores,
  });

  const employees = useMemo(() => employeesPayload?.employees || [], [employeesPayload]);

  const salaryLevelMap = useMemo(() => {
    const map = new Map<string, SalaryLevel>();
    salaryLevels?.forEach((level) => {
      const normalizedName = normalizeLevelLabel(level.level_name);
      map.set(level.id, level);
      map.set(level.level_name, level);
      map.set(level.level_name.toUpperCase(), level);
      if (normalizedName) map.set(normalizedName, level);
    });
    return map;
  }, [salaryLevels]);


  const getEmployeeEventPrice = useCallback((employee: Employee, eventTypeId: string) => {
    // 1. Check employee manual overrides in JSONB
    const employeePrices = employee.event_prices || {};
    if (employeePrices[eventTypeId] != null) return Number(employeePrices[eventTypeId]);

    // 2. Fallback to 0 (Decentralized Pricing requirement)
    return 0;
  }, []);

  const getDefaultLinePatch = useCallback(
    (employeeId: string, eventTypeId: string): Partial<EventLine> => {
      const emp = (employees as Employee[]).find(e => e.id === employeeId);
      if (!emp) return {};
      
      const price = getEmployeeEventPrice(emp, eventTypeId);
      return {
        price_override: price,
      };
    },
    [employees, getEmployeeEventPrice]
  );

  const filteredEmployees = useMemo(() => {
    let result = employees;
    if (search.trim()) {
      result = fuzzySearch(result, search, {
        keys: ["full_name", "employee_id", "department"],
        threshold: 0.35,
      });
    }
    return result;
  }, [employees, search]);

  const itemsPerPage = 6;
  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / itemsPerPage));

  const computeEmployeeTotals = useCallback((employee: Employee) => {
    const level = employee.salary_level ? salaryLevelMap.get(employee.salary_level) : undefined;
    const baseSalary = Number(level?.base_salary ?? 0);
    const lines = eventLinesByEmployee[employee.id] ?? [];

    const commission = lines.reduce((sum, line) => {
      const unitPrice = line.price_override ?? getEmployeeEventPrice(employee, line.event_type_id);
      return sum + unitPrice * Math.max(1, Number(line.quantity || 1));
    }, 0);

    return {
      levelName: level?.level_name ?? "NO LEVEL",
      baseSalary,
      commission,
      total: baseSalary + commission,
    };
  }, [salaryLevelMap, eventLinesByEmployee, getEmployeeEventPrice]);

  const paginatedEmployees = useMemo(() => {
    const sorted = [...filteredEmployees];
    
    if (sortBy === "pay") {
      sorted.sort((a, b) => computeEmployeeTotals(b).total - computeEmployeeTotals(a).total);
    } else if (sortBy === "department") {
      sorted.sort((a, b) => (a.department || "").localeCompare(b.department || ""));
    } else {
      sorted.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    }

    const start = (page - 1) * itemsPerPage;
    return sorted.slice(start, start + itemsPerPage);
  }, [filteredEmployees, page, sortBy, computeEmployeeTotals]);

  const totals = useMemo(() => {
    let base = 0;
    let commission = 0;
 
    employees.forEach((employee: Employee) => {
      const employeeTotals = computeEmployeeTotals(employee);
      base += employeeTotals.baseSalary;
      commission += employeeTotals.commission;
    });
 
    return {
      base,
      commission,
      grand: base + commission,
    };
  }, [employees, computeEmployeeTotals]);

  const previewMutation = useMutation({
    mutationFn: (payload: PayrollGenerateRequest) =>
      previewPayrollRun(payload as unknown as Record<string, unknown>) as Promise<PreviewResponse>,
    onError: (error: Error) => {
      setErrorMsg(error.message || t("Failed to generate preview"));
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: (payload: PayrollGenerateRequest & { created_by_user_id?: string }) =>
      savePayrollDraft(payload as unknown as Record<string, unknown>) as Promise<{ id: string }>,
    onSuccess: (data) => {
      setIsDraftDirty(false);
      setLastSavedAt(new Date().toISOString());
      setDraftPeriodKey(`${selectedMonth}:${periodType}`);
      setErrorMsg("");
      if (data?.id) {
        hasAutoLoaded.current = data.id;
      }
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      if (lastSaveSourceRef.current === "manual") {
        toast.success(t("Draft saved"));
      }
    },
    onError: (error: unknown) => {
      const { message } = extractHttpError(error);

      if (message) {
        setErrorMsg(message);
        return;
      }

      if (error instanceof Error) {
        setErrorMsg(error.message || t("Failed to save draft"));
        return;
      }

      setErrorMsg(t("Failed to save draft"));
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: (payload: PayrollGenerateRequest & { created_by_user_id?: string }) => 
      finalizePayrollRun(payload as unknown as Record<string, unknown>) as Promise<{ id: string }>,
    onSuccess: (data) => {
      router.push(`/hr/payments/${data.id}`);
    },
    onError: (error: unknown) => {
      const { status, message } = extractHttpError(error);

      if (status === 409) {
        setErrorMsg(
          message ||
            t("A finalized payroll run already exists for this period. Move the existing run to trash before finalizing again.")
        );
        return;
      }

      if (message) {
        setErrorMsg(message);
        return;
      }

      if (error instanceof Error) {
        setErrorMsg(error.message || t("Failed to finalize payroll run"));
        return;
      }

      setErrorMsg(t("Failed to finalize payroll run"));
    },
  });

  const buildPayload = useCallback((): PayrollGenerateRequest => {
    const parsed = parseMonth(selectedMonth);

    const employeeLineEvents = employees.map((employee: Employee) => ({
      employee_id: employee.id,
      events: (eventLinesByEmployee[employee.id] ?? [])
        .filter((line) => line.event_type_id)
        .map((line) => {
          const employeePrice = getEmployeeEventPrice(employee, line.event_type_id);
          const isOverride = line.price_override != null && line.price_override !== employeePrice;

          return {
            event_type_id: line.event_type_id,
            quantity: Math.max(1, Number(line.quantity || 1)),
            selected_level_id: line.selected_level_id ?? null,
            price_override: isOverride ? line.price_override : null,
            override_reason: null,
          };
        }),
    }));

    const payload: PayrollGenerateRequest = {
      month: parsed.month,
      year: parsed.year,
      employeeLineEvents,
    };

    if (periodType === "h1") {
      payload.period_kind = "half_month";
      payload.period_start = `${parsed.year}-${String(parsed.month).padStart(2, "0")}-01`;
      payload.period_end = `${parsed.year}-${String(parsed.month).padStart(2, "0")}-15`;
    } else if (periodType === "h2") {
      payload.period_kind = "half_month";
      payload.period_start = `${parsed.year}-${String(parsed.month).padStart(2, "0")}-16`;
    }

    return payload;
  }, [employees, eventLinesByEmployee, getEmployeeEventPrice, periodType, selectedMonth]);

  const handleSaveDraft = useCallback((source: "manual" | "auto") => {
    if (employeesLoading || authLoading) return;

    setErrorMsg("");
    try {
      const payload = buildPayload();
      const createdByUserId = user?.id;

      lastSaveSourceRef.current = source;
      saveDraftMutation.mutate({
        ...payload,
        ...(createdByUserId ? { created_by_user_id: createdByUserId } : {}),
      });
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }, [authLoading, buildPayload, employeesLoading, saveDraftMutation, user]);

  useEffect(() => {
    if (!isDraftDirty) return;
    if (employeesLoading || authLoading) return;
    if (saveDraftMutation.isPending) return;

    const activePeriodKey = `${selectedMonth}:${periodType}`;
    if (!draftPeriodKey || draftPeriodKey !== activePeriodKey) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      handleSaveDraft("auto");
    }, 45000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    isDraftDirty,
    eventLinesByEmployee,
    selectedMonth,
    periodType,
    draftPeriodKey,
    employeesLoading,
    authLoading,
    saveDraftMutation.isPending,
    handleSaveDraft,
  ]);

  const handlePreview = () => {
    setErrorMsg("");
    try {
      const payload = buildPayload();
      previewMutation.mutate(payload);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const handleFinalize = () => {
    setErrorMsg("");

    if (runsHistoryLoading) {
      setErrorMsg(t("Payroll history is still loading. Please try finalizing again in a moment."));
      return;
    }

    if (existingFinalized) {
      const periodLabel = periodType === "h1" ? t("1st-15th") : t("16th-End");
      setErrorMsg(
        `${t("A finalized payroll run already exists for")} ${selectedMonth} (${periodLabel}). ${t("Open the existing run instead of creating a duplicate.")}`
      );
      return;
    }

    try {
      const payload = buildPayload();
      const createdByUserId = user?.id;

      finalizeMutation.mutate({
        ...payload,
        ...(createdByUserId ? { created_by_user_id: createdByUserId } : {}),
      });
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const addEventLine = (employeeId: string) => {
    const fallbackEvent = eventTypes?.[0]?.id ?? "";
    const defaults = getDefaultLinePatch(employeeId, fallbackEvent);
    setEventLinesByEmployee((prev) => ({
      ...prev,
      [employeeId]: [...(prev[employeeId] ?? []), { event_type_id: fallbackEvent, quantity: 1, ...defaults }],
    }));
    setIsDraftDirty(true);
    setDraftPeriodKey(`${selectedMonth}:${periodType}`);
  };

  const removeEventLine = (employeeId: string, index: number) => {
    setEventLinesByEmployee((prev) => ({
      ...prev,
      [employeeId]: (prev[employeeId] ?? []).filter((_, i) => i !== index),
    }));
    setIsDraftDirty(true);
    setDraftPeriodKey(`${selectedMonth}:${periodType}`);
  };

  const updateEventLine = (employeeId: string, index: number, patch: Partial<EventLine>) => {
    setEventLinesByEmployee((prev) => {
      const next = [...(prev[employeeId] ?? [])];
      next[index] = { ...next[index], ...patch };
      return { ...prev, [employeeId]: next };
    });
    setIsDraftDirty(true);
    setDraftPeriodKey(`${selectedMonth}:${periodType}`);
  };

  const draftStatusLabel = saveDraftMutation.isPending
    ? t("Saving draft...")
    : isDraftDirty
      ? t("Unsaved changes")
      : lastSavedAt
        ? `${t("Saved")} ${format(new Date(lastSavedAt), "HH:mm")}`
        : t("Not saved yet");

  if (authLoading) {
    return (
      <AuthLayout>
        <div className="max-w-5xl mx-auto py-20 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-muted animate-pulse">{t("Loading payroll run...")}</p>
        </div>
      </AuthLayout>
    );
  }

  if (!isAuthenticated || !hasPermission("payroll:write")) {
    return (
      <AuthLayout>
        <ForbiddenState
          title="Forbidden: Insufficient privileges"
          description="Only Owners, Accountants, and Administrators can run payroll."
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/hr/payments" className="text-muted-foreground hover:text-foreground transition-colors">
              <HiOutlineArrowUturnLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight">{t("Salary & Event Disbursement")}</h1>
              <p className="text-xs text-muted-foreground uppercase tracking-widest">{t("Paginated cards with persistent totals")}</p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap items-center gap-2">
              {existingDraft && (
                <button
                  onClick={() => setIsPrintModalOpen(true)}
                  className="px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest bg-card border border-border/50 text-foreground shadow-premium hover:bg-card-alt transition-all items-center gap-2 flex"
                >
                  <HiPrinter className="w-4 h-4" />
                  {t("Print")}
                </button>
              )}
              <button
                onClick={() => handleSaveDraft("manual")}
                disabled={saveDraftMutation.isPending || employeesLoading || authLoading}
                className="px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest bg-amber-500/10 text-amber-700 border border-amber-500/20 shadow-premium hover:bg-amber-500/20 transition-all disabled:opacity-50"
              >
                {saveDraftMutation.isPending ? t("Saving...") : t("Save Draft")}
              </button>
              <button
                onClick={handlePreview}
                disabled={previewMutation.isPending || employeesLoading || authLoading}
                className="px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest bg-card text-foreground shadow-premium hover:bg-card-alt transition-all disabled:opacity-50"
              >
                {previewMutation.isPending ? t("Previewing...") : t("Preview")}
              </button>
              <button
                onClick={handleFinalize}
                disabled={finalizeMutation.isPending || employeesLoading || authLoading || runsHistoryLoading || !!existingFinalized}
                className="px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest bg-primary text-background shadow-premium hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {finalizeMutation.isPending ? t("Finalizing...") : t("Finalize Run")}
              </button>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {draftStatusLabel}
            </p>
          </div>
        </div>

        {existingDraft && (
          <PrintOptionsModal 
            isOpen={isPrintModalOpen}
            onClose={() => setIsPrintModalOpen(false)}
            onPrint={(options) => router.push(`/hr/payments/${existingDraft.id}/report?includeImages=${options.includeImages}`)}
            title={t("Summary Report")}
            description={t("Generate a detailed HTML report for this draft run.")}
          />
        )}

        <div className="rounded-2xl border border-border/60 bg-card p-4 grid gap-6 md:grid-cols-[1fr_2fr_1fr] items-end">
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-1">{t("Period (Month)")}</label>
            <div className="flex gap-2">
              <div className="relative flex-1 group">
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedMonth(val);
                    router.replace(`/hr/payments/run?date=${val}&period_type=${periodType}`);
                  }}
                  className="w-full rounded-2xl border border-border/50 bg-card-alt px-4 py-2.5 text-sm font-bold text-foreground transition-all focus:ring-2 focus:ring-primary/20 outline-none hover:bg-border/30 scheme-dark"
                />
              </div>
              <Select 
                options={[
                  { id: "h1", label: t("1st-15th") },
                  { id: "h2", label: t("16th-End") }
                ]}
                value={periodType}
                onChange={(val) => {
                  const type = val as "h1" | "h2";
                  setPeriodType(type);
                  router.replace(`/hr/payments/run?date=${selectedMonth}&period_type=${type}`);
                }}
                className="w-40"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-1">{t("Search & Drafts")}</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder={t("Name, code, department")}
                  className="w-full rounded-xl border border-border/50 bg-card px-3 py-2.5 text-sm font-bold"
                />
              </div>
              {existingDraft && (
                <button
                  onClick={() => loadDraftMutation.mutate(existingDraft.id)}
                  disabled={loadDraftMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20 text-xs font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all active:scale-95"
                >
                  <HiArrowPath className={`w-4 h-4 ${loadDraftMutation.isPending ? 'animate-spin' : ''}`} />
                  {t("Load Draft")}
                </button>
              )}
              {existingFinalized && (
                <Link
                  href={`/hr/payments/${existingFinalized.id}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all active:scale-95"
                >
                  {t("Open Finalized Run")}
                </Link>
              )}
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest font-black text-muted-foreground mb-1">{t("Office")}</label>
            <Select
              options={[
                { id: "all", label: t("All offices") },
                ...(stores ?? []).map((store: { id: string; name: string }) => ({ id: store.id, label: store.name })),
              ]}
              value={officeId}
              onChange={(val) => { setOfficeId(val); setPage(1); }}
            />
          </div>
          <div className="flex items-end justify-end gap-2">
            <Select
              options={[
                { id: "name", label: t("Sort: Name") },
                { id: "department", label: t("Sort: Dept") },
                { id: "pay", label: t("Sort: Pay") },
              ]}
              value={sortBy}
              onChange={(val) => setSortBy(val as "name" | "department" | "pay")}
              className="w-36"
            />
            <Link
              href="/hr/event-types"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-card-alt text-foreground hover:bg-muted transition-colors"
            >
              <HiOutlineCog6Tooth className="w-4 h-4" />
              {t("Manage Event Types")}
            </Link>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-sm font-bold">
            {errorMsg}
          </div>
        )}

        <div className="grid gap-4">
          {paginatedEmployees.map((employee: Employee) => {
            const lines = eventLinesByEmployee[employee.id] ?? [];
            const employeeTotals = computeEmployeeTotals(employee);

            return (
              <div
                key={employee.id}
                className="grid gap-3 rounded-2xl border border-border/60 bg-card p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_220px]"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <UserAvatar 
                      fullName={employee.full_name}
                      imageUrl={employee.profile_photo_url}
                      sizeClassName="w-10 h-10"
                    />
                    <p className="text-base font-black tracking-tight">{employee.full_name}</p>
                  </div>

                  <div className="rounded-xl border border-border/50 bg-card-alt px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">{t("Base Salary")}</span>
                      <span className="text-[10px] uppercase tracking-widest font-black px-2.5 py-1 rounded-lg bg-indigo-600/10 text-indigo-800 dark:text-indigo-200 border border-indigo-600/20 shadow-sm">{employeeTotals.levelName === "NO LEVEL" ? t("NO LEVEL") : employeeTotals.levelName}</span>
                    </div>
                    <p className="text-sm font-bold mt-1">ETB {employeeTotals.baseSalary.toLocaleString()}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t("Events / Commissions")}</p>

                  {lines.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">{t("No events added for this employee yet.")}</p>
                  ) : (
                    lines.map((line, index) => {
                      const unitPrice = line.price_override != null ? Number(line.price_override) : getEmployeeEventPrice(employee, line.event_type_id);
                      const lineTotal = unitPrice * Math.max(1, Number(line.quantity || 1));

                      return (
                        <div key={`${employee.id}-${index}`} className="flex flex-col gap-2 p-2.5 border border-border/40 rounded-xl bg-card-alt/50 mb-2">
                          {/* Row 1: Event dropdown */}
                          <div className="grid gap-2">
                            <Select
                              options={(eventTypes ?? []).map((eventType) => ({
                                id: eventType.id,
                                label: eventType.event_name,
                              }))}
                              value={line.event_type_id}
                              onChange={(val) => {
                                const defaults = getDefaultLinePatch(employee.id, val);
                                updateEventLine(employee.id, index, { event_type_id: val, ...defaults });
                              }}
                              placeholder={t("Select event")}
                              className="w-full"
                            />
                          </div>

                          {/* Row 2: Qty stepper + editable price + delete */}
                          <div className="flex items-center gap-2">
                            {/* - / + Stepper */}
                            <div className="flex items-center rounded-lg border border-border overflow-hidden shrink-0">
                              <button
                                onClick={() => updateEventLine(employee.id, index, { quantity: Math.max(1, (line.quantity || 1) - 1) })}
                                className="px-2.5 py-2 text-foreground hover:bg-muted transition-colors"
                                title={t("Decrease")}
                              >
                                <HiMinus className="w-3.5 h-3.5" />
                              </button>
                              <span className="px-3 py-2 text-sm font-bold min-w-8 text-center select-none">{line.quantity || 1}</span>
                              <button
                                onClick={() => updateEventLine(employee.id, index, { quantity: (line.quantity || 1) + 1 })}
                                className="px-2.5 py-2 text-foreground hover:bg-muted transition-colors"
                                title={t("Increase")}
                              >
                                <HiOutlinePlus className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Editable unit price (acts as override) */}
                            <div className="relative flex-1">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold pointer-events-none">ETB</span>
                              <input
                                type="number"
                                min={0}
                                value={line.price_override ?? getEmployeeEventPrice(employee, line.event_type_id)}
                                onChange={(e) => {
                                  const val = Math.max(0, Number(e.target.value));
                                  const basePrice = getEmployeeEventPrice(employee, line.event_type_id);
                                  updateEventLine(employee.id, index, {
                                    price_override: val !== basePrice ? val : null,
                                  });
                                }}
                                className="w-full rounded-lg border border-border bg-background text-foreground pl-9 pr-2 py-2 text-sm font-bold text-right"
                              />
                            </div>

                            {/* Line total */}
                            {(line.quantity > 1 || line.price_override != null) && (
                              <div className="text-xs font-bold text-muted-foreground shrink-0 whitespace-nowrap">
                                = ETB {lineTotal.toLocaleString()}
                              </div>
                            )}

                            {/* Delete */}
                            <button
                              onClick={() => removeEventLine(employee.id, index)}
                              className="w-8 h-8 rounded-full border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center shrink-0"
                              title={t("Remove Event")}
                            >
                              <HiOutlineTrash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  <button
                    onClick={() => addEventLine(employee.id)}
                    className="w-full py-2 rounded-xl border border-dashed border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary hover:border-primary transition-all flex items-center justify-center gap-2"
                  >
                    <HiOutlinePlus className="w-3.5 h-3.5" />
                    {t("Add Event")}
                  </button>
                </div>

                <div className="rounded-2xl bg-card-alt border border-border/50 p-4 flex flex-col justify-center shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">{t("Total Earnings")}</p>
                  <p className="text-xl font-black text-primary">ETB {employeeTotals.total.toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div ref={sentinelRef} className="h-px w-full invisible" />
        <div 
          className={`sticky bottom-10 md:bottom-8 flex flex-col p-6 rounded-xl bg-card/80 backdrop-blur-xl shadow-massive border border-border/40 text-foreground z-30 transition-all duration-300 ease-in-out ${isFloating ? '-translate-y-1' : 'translate-y-0'}`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className={`flex items-center transition-all duration-300 ${isFloating ? 'gap-4' : 'gap-6'}`}>
              <div>
                <p className={`font-black uppercase tracking-widest text-muted-foreground transition-all duration-300 ${isFloating ? 'text-[7px] mb-0' : 'text-[10px] mb-1'}`}>{t("Base Salary Total")}</p>
                <p className={`font-black transition-all duration-300 ${isFloating ? 'text-base' : 'text-xl'}`}>ETB {totals.base.toLocaleString()}</p>
              </div>
              <div className={`w-px bg-border/40 transition-all duration-300 ${isFloating ? 'h-6' : 'h-10'}`} />
              <div>
                <p className={`font-black uppercase tracking-widest text-muted-foreground transition-all duration-300 ${isFloating ? 'text-[7px] mb-0' : 'text-[10px] mb-1'}`}>{t("Commission Total")}</p>
                <p className={`font-black transition-all duration-300 ${isFloating ? 'text-base' : 'text-xl'}`}>ETB {totals.commission.toLocaleString()}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-black uppercase tracking-widest text-muted-foreground transition-all duration-300 ${isFloating ? 'text-[7px] mb-0' : 'text-[10px] mb-1'}`}>{t("Grand Total Disbursement")}</p>
              <p className={`font-black text-primary drop-shadow-sm transition-all duration-300 ${isFloating ? 'text-xl' : 'text-3xl'}`}>ETB {totals.grand.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-center pb-10">
          <PaginationControls
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      </div>
    </AuthLayout>
  );
}

export default function PaymentRunProcessPage() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  return (
    <Suspense
      fallback={
        <AuthLayout>
          <div className="max-w-5xl mx-auto py-20 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold text-muted animate-pulse">{t("Loading payroll run...")}</p>
          </div>
        </AuthLayout>
      }
    >
      <PaymentRunProcessPageContent />
    </Suspense>
  );
}
