"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiPrinter,
  HiArrowDownTray,
  HiMagnifyingGlass,
  HiArrowPath,
  HiPlus,
  HiCheck,
  HiXMark,
  HiPencilSquare,
  HiTrash,
  HiBanknotes,
  HiCalendarDays,
  HiArrowTrendingUp,
  HiDocumentArrowDown,
} from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import ForbiddenState from "@/components/ForbiddenState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import StatusBadge from "@/components/ui/StatusBadge";
import PaginationControls from "@/components/PaginationControls";
import ResponsiveDrawer from "@/components/ui/ResponsiveDrawer";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import toast from "@/lib/toast";
import { useLanguage } from "@/hooks/use-language";
import { useRecordListPreferences } from "@/hooks/useRecordListPreferences";
import { createPermissionMatcher } from "@/lib/permission-matcher";
import { generateReportPdf } from "@/lib/pdf-report";
import {
  api,
  FINANCE_OPEX_CATEGORIES,
  getHisabReport,
  downloadHisabExport,
  getFinanceOperationalExpenses,
  createFinanceOperationalExpense,
  updateFinanceOperationalExpense,
  deleteFinanceOperationalExpense,
  approveFinanceOperationalExpense,
  rejectFinanceOperationalExpense,
} from "@/lib/api";
import type { FinanceOperationalExpense } from "@/lib/types";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Hisab Reports": "Hisab Reports",
    "Weekly and monthly event profitability with non-event operational spend.": "Weekly and monthly event profitability with non-event operational spend.",
    "Weekly": "Weekly",
    "Monthly": "Monthly",
    "Rollup": "Rollup",
    "Operational Ledger": "Operational Ledger",
    "Start Date": "Start Date",
    "End Date": "End Date",
    "Print Report": "Print Report",
    "Export": "Export",
    "Export CSV": "Export CSV",
    "Export XLSX": "Export XLSX",
    "Event Income": "Event Income",
    "Event Expenses": "Event Expenses",
    "Event Profit": "Event Profit",
    "Operational Spend": "Operational Spend",
    "Net": "Net",
    "Event": "Event",
    "Date": "Date",
    "Income": "Income",
    "Period Summary": "Period Summary",
    "Period": "Period",
    "Operational": "Operational",
    "Transport": "Transport",
    "Rental": "Rental",
    "Labour": "Labour",
    "Other": "Other",
    "Office Lunch": "Office Lunch",
    "Lunch": "Lunch",
    "Utilities": "Utilities",
    "Supplies": "Supplies",
    "Maintenance": "Maintenance",
    "Total": "Total",
    "Profit": "Profit",
    "Category": "Category",
    "Amount": "Amount",
    "Recently Edited": "Recently Edited",
    "Description": "Description",
    "Status": "Status",
    "Actions": "Actions",
    "Add Expense": "Add Expense",
    "Edit Expense": "Edit Expense",
    "Save Expense": "Save Expense",
    "Approve": "Approve",
    "Reject": "Reject",
    "Rejection reason": "Rejection reason",
    "Reason required": "Reason required",
    "Delete": "Delete",
    "Delete Expense": "Delete Expense",
    "This will remove the operational expense from the ledger.": "This will remove the operational expense from the ledger.",
    "Edit": "Edit",
    "Cancel": "Cancel",
    "Search descriptions...": "Search descriptions...",
    "All Statuses": "All Statuses",
    "All Categories": "All Categories",
    "Pending": "Pending",
    "Approved": "Approved",
    "Rejected": "Rejected",
    "Reset": "Reset",
    "Import Hisab": "Import Hisab",
    "Net Profit": "Net Profit",
    "No data found for the selected date range.": "No data found for the selected date range.",
    "No operational expenses recorded yet.": "No operational expenses recorded yet.",
    "Non-Event Expenses": "Non-Event Expenses",
    "Events Total": "Events Total",
    "Pending exposure": "Pending exposure",
    "Expense created": "Expense created",
    "Expense updated": "Expense updated",
    "Expense deleted": "Expense deleted",
    "Expense approved": "Expense approved",
    "Expense rejected": "Expense rejected",
    "Forbidden: Insufficient privileges": "Forbidden: Insufficient privileges",
    "Only Owners, Accountants, and explicitly permissioned roles can access Hisab reports.": "Only Owners, Accountants, and explicitly permissioned roles can access Hisab reports.",
    "Workspace unavailable": "Workspace unavailable",
    "Dream Lux Weekly & Monthly Hisab Report": "Dream Lux Weekly & Monthly Hisab Report",
    "Date Range": "Date Range",
    "Generated on": "Generated on",
    "Premium Event Logistics & Rentals": "Premium Event Logistics & Rentals",
    "Rejected:": "Rejected:",
    "Recorded by": "Recorded by",
  },
  am: {
    "Hisab Reports": "የሂሳብ ሪፖርቶች",
    "Weekly and monthly event profitability with non-event operational spend.": "ሳምንታዊ እና ወርሃዊ የዝግጅት ትርፋማነት ከዝግጅት ውጪ ካሉ የስራ ማስኬጃ ወጪዎች ጋር።",
    "Weekly": "ሳምንታዊ",
    "Monthly": "ወርሃዊ",
    "Rollup": "ማጠቃለያ",
    "Operational Ledger": "የስራ ማስኬጃ መዝገብ",
    "Start Date": "የመጀመሪያ ቀን",
    "End Date": "የማብቂያ ቀን",
    "Print Report": "ሪፖርት አትም",
    "Export": "አውጣ",
    "Export CSV": "በCSV አውጣ",
    "Export XLSX": "በXLSX አውጣ",
    "Event Income": "የዝግጅት ገቢ",
    "Event Expenses": "የዝግጅት ወጪዎች",
    "Event Profit": "የዝግጅት ትርፍ",
    "Operational Spend": "የስራ ማስኬጃ ወጪ",
    "Net": "የተጣራ",
    "Event": "ዝግጅት",
    "Date": "ቀን",
    "Income": "ገቢ",
    "Period Summary": "የወቅት ማጠቃለያ",
    "Period": "ወቅት",
    "Operational": "የስራ ማስኬጃ",
    "Transport": "ትራንስፖርት",
    "Rental": "ኪራይ",
    "Labour": "ሰራተኛ",
    "Other": "ሌላ",
    "Office Lunch": "የቢሮ ምሳ",
    "Lunch": "ምሳ",
    "Utilities": "መገልገያዎች",
    "Supplies": "አቅርቦቶች",
    "Maintenance": "ጥገና",
    "Total": "ድምር",
    "Profit": "ትርፍ",
    "Category": "ምድብ",
    "Amount": "መጠን",
    "Recently Edited": "በቅርብ የተስተካከለ",
    "Description": "መግለጫ",
    "Status": "ሁኔታ",
    "Actions": "ተግባሮች",
    "Add Expense": "ወጪ ጨምር",
    "Edit Expense": "ወጪ አርትዕ",
    "Save Expense": "ወጪ አስቀምጥ",
    "Approve": "አጽድቅ",
    "Reject": "አትቀበል",
    "Rejection reason": "የመከልከያ ምክንያት",
    "Reason required": "ምክንያት ያስፈልጋል",
    "Delete": "ሰርዝ",
    "Delete Expense": "ወጪ ሰርዝ",
    "This will remove the operational expense from the ledger.": "ይህ የስራ ማስኬጃ ወጪውን ከመዝገቡ ያስወግዳል።",
    "Edit": "አርትዕ",
    "Cancel": "ተወው",
    "Search descriptions...": "መግለጫዎችን ፈልግ...",
    "All Statuses": "ሁሉም ሁኔታዎች",
    "All Categories": "ሁሉም ምድቦች",
    "Pending": "በመጠባበቅ ላይ",
    "Approved": "የጸደቀ",
    "Rejected": "የተከለከለ",
    "Reset": "ዳግም ጀምር",
    "Import Hisab": "ሂሳብ አስገባ",
    "Net Profit": "የተጣራ ትርፍ",
    "No data found for the selected date range.": "ከተመረጠው የቀን ገደብ ምንም መረጃ አልተገኘም።",
    "No operational expenses recorded yet.": "እስካሁን ምንም የስራ ማስኬጃ ወጪ አልተመዘገበም።",
    "Non-Event Expenses": "ከዝግጅት ውጪ ወጪዎች",
    "Events Total": "የዝግጅቶች ድምር",
    "Pending exposure": "በመጠባበቅ ላይ ያለ ወጪ",
    "Expense created": "ወጪ ተፈጥሯል",
    "Expense updated": "ወጪ ተዘምኗል",
    "Expense deleted": "ወጪ ተሰርዟል",
    "Expense approved": "ወጪ ጸድቋል",
    "Expense rejected": "ወጪ ተከልክሏል",
    "Forbidden: Insufficient privileges": "ክልክል ነው: በቂ ፈቃድ የለዎትም",
    "Only Owners, Accountants, and explicitly permissioned roles can access Hisab reports.": "የሂሳብ ሪፖርቶችን ማግኘት የሚችሉት ባለቤቶች፣ የሂሳብ ባለሙያዎች እና በግልጽ ፈቃድ የተሰጣቸው ሚናዎች ብቻ ናቸው።",
    "Workspace unavailable": "የስራ ቦታ አልተገኘም",
    "Dream Lux Weekly & Monthly Hisab Report": "የድሪም ላክስ ሳምንታዊ እና ወርሃዊ የሂሳብ ሪፖርት",
    "Date Range": "የቀን ገደብ",
    "Generated on": "የተዘጋጀበት ቀን",
    "Premium Event Logistics & Rentals": "ፕሪሚየም የዝግጅት ሎጂስቲክስ እና ኪራይ",
    "Rejected:": "ተከልክሏል:",
    "Recorded by": "የመዘገበው",
  },
};

type ExpenseFormState = {
  expense_date: string;
  category: string;
  amount: string;
  description: string;
};

const EMPTY_FORM: ExpenseFormState = {
  expense_date: new Date().toISOString().slice(0, 10),
  category: "Other",
  amount: "",
  description: "",
};

export default function HisabReportPage() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const queryClient = useQueryClient();
  const router = useRouter();

  const currentYear = new Date().getFullYear();
  const [periodType, setPeriodType] = useState<"week" | "month">("week");
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [activeTab, setActiveTab] = useState<"rollup" | "ledger">("rollup");
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Rollup state
  const [rollupPage, setRollupPage] = useState(1);

  // Ledger state
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerStatus, setLedgerStatus] = useState("");
  const [ledgerCategory, setLedgerCategory] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerSortBy, setLedgerSortBy] = useState("expense_date");
  const [ledgerSortOrder, setLedgerSortOrder] = useState<"asc" | "desc">("desc");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<FinanceOperationalExpense | null>(null);
  const [form, setForm] = useState<ExpenseFormState>(EMPTY_FORM);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deletingExpense, setDeletingExpense] = useState<FinanceOperationalExpense | null>(null);

  const { data: authData, isLoading: authLoading } = useQuery({
    queryKey: ["auth-permissions"],
    queryFn: async () => {
      const res = await api.get("/auth/permissions");
      return res.data;
    },
  });

  const hasPermission = createPermissionMatcher(authData?.permission_slugs || [], !!authData?.is_superuser);
  const hasHisabRead = hasPermission("finance:hisab:read");
  const canWrite = hasPermission("finance:opex:write");
  const canApprove = hasPermission("finance:opex:approve");
  const {
    preference: listPreference,
    isLoaded: prefsLoaded,
    isReady: prefsReady,
    markApplied,
    save: savePreference,
  } = useRecordListPreferences("operational_expenses");
  const prefsHydratedRef = useRef(false);

  useEffect(() => {
    if (!prefsLoaded || prefsHydratedRef.current) return;
    if (!listPreference) {
      prefsHydratedRef.current = true;
      markApplied();
      return;
    }
    const timer = setTimeout(() => {
      prefsHydratedRef.current = true;
      const filters = listPreference.filters as { status?: string; category?: string; search?: string };
      if (filters.status) setLedgerStatus(filters.status);
      if (filters.category) setLedgerCategory(filters.category);
      if (filters.search) setLedgerSearch(filters.search);
      if (listPreference.sort?.sortBy) {
        setLedgerSortBy(listPreference.sort.sortBy);
        setLedgerSortOrder(listPreference.sort.sortOrder);
      }
      if (listPreference.active_tab === "ledger" || listPreference.active_tab === "rollup") {
        setActiveTab(listPreference.active_tab);
      }
      markApplied();
    }, 0);
    return () => clearTimeout(timer);
  }, [prefsLoaded, listPreference, markApplied]);

  useEffect(() => {
    if (!prefsReady) return;
    savePreference({
      sort: { sortBy: ledgerSortBy, sortOrder: ledgerSortOrder },
      filters: { status: ledgerStatus, category: ledgerCategory, search: ledgerSearch },
      pageSize: 20,
      activeTab,
    });
  }, [prefsReady, ledgerSortBy, ledgerSortOrder, ledgerStatus, ledgerCategory, ledgerSearch, activeTab, savePreference]);

  const rollupLimit = 10;
  const { data: rollup, isLoading: rollupLoading, isError: rollupError } = useQuery({
    queryKey: ["hisab-report", periodType, startDate, endDate, rollupPage],
    queryFn: () => getHisabReport({ period_type: periodType, start_date: startDate, end_date: endDate, page: rollupPage, limit: rollupLimit }),
    enabled: !!hasHisabRead,
  });

  const ledgerLimit = 20;
  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ["finance-opex", ledgerPage, ledgerStatus, ledgerCategory, ledgerSearch, ledgerSortBy, ledgerSortOrder, startDate, endDate],
    queryFn: () =>
      getFinanceOperationalExpenses({
        page: ledgerPage,
        limit: ledgerLimit,
        status: ledgerStatus || undefined,
        category: ledgerCategory || undefined,
        search: ledgerSearch || undefined,
        start_date: startDate,
        end_date: endDate,
        sortBy: ledgerSortBy,
        sortOrder: ledgerSortOrder,
      }),
    enabled: !!hasHisabRead && prefsReady && activeTab === "ledger",
  });

  const invalidateFinanceQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["finance-opex"] });
    queryClient.invalidateQueries({ queryKey: ["hisab-report"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: { id?: string; data: { expense_date: string; category: string; amount: number; description: string } }) =>
      payload.id
        ? updateFinanceOperationalExpense(payload.id, payload.data)
        : createFinanceOperationalExpense(payload.data),
    onSuccess: (_data, variables) => {
      toast.success(variables.id ? t("Expense updated") : t("Expense created"));
      setIsFormOpen(false);
      setEditingExpense(null);
      setForm(EMPTY_FORM);
      invalidateFinanceQueries();
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      toast.error(err.response?.data?.error || err.message || t("Workspace unavailable"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFinanceOperationalExpense(id),
    onSuccess: () => {
      toast.success(t("Expense deleted"));
      setDeletingExpense(null);
      invalidateFinanceQueries();
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      toast.error(err.response?.data?.error || err.message || t("Workspace unavailable"));
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (payload: { id: string; decision: "approve" | "reject"; reason?: string }) =>
      payload.decision === "approve"
        ? approveFinanceOperationalExpense(payload.id)
        : rejectFinanceOperationalExpense(payload.id, payload.reason || ""),
    onSuccess: (_data, variables) => {
      toast.success(variables.decision === "approve" ? t("Expense approved") : t("Expense rejected"));
      setRejectingId(null);
      setRejectReason("");
      invalidateFinanceQueries();
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      toast.error(err.response?.data?.error || err.message || t("Workspace unavailable"));
    },
  });

  const formatCurrency = (value: number) =>
    `ETB ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleExport = async (format: "csv" | "xlsx") => {
    setIsExportOpen(false);
    try {
      await downloadHisabExport({ period_type: periodType, start_date: startDate, end_date: endDate, format });
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(axiosErr.response?.data?.error || axiosErr.message || t("Workspace unavailable"));
    }
  };

  const handleResetFilters = () => {
    setStartDate(`${currentYear}-01-01`);
    setEndDate(`${currentYear}-12-31`);
    setLedgerStatus("");
    setLedgerCategory("");
    setLedgerSearch("");
    setLedgerPage(1);
    setRollupPage(1);
  };

  const openCreateForm = () => {
    setEditingExpense(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const openEditForm = (expense: FinanceOperationalExpense) => {
    setEditingExpense(expense);
    setForm({
      expense_date: String(expense.expense_date).slice(0, 10),
      category: expense.category,
      amount: String(expense.amount),
      description: expense.description,
    });
    setIsFormOpen(true);
  };

  const handleSubmitForm = () => {
    const amount = Number(form.amount);
    if (!form.expense_date || !form.category || !form.description.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error(t("Workspace unavailable"));
      return;
    }
    saveMutation.mutate({
      id: editingExpense?.id,
      data: {
        expense_date: form.expense_date,
        category: form.category,
        amount,
        description: form.description.trim(),
      },
    });
  };

  if (authLoading) {
    return (
      <AuthLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  if (!authData || !hasHisabRead) {
    return (
      <AuthLayout>
        <ForbiddenState
          title="Forbidden: Insufficient privileges"
          description="Only Owners, Accountants, and explicitly permissioned roles can access Hisab reports."
        />
      </AuthLayout>
    );
  }

  const periods = rollup?.periods || [];
  const summary = rollup?.summary;
  const ledgerRows = ledger?.expenses || [];

  return (
    <AuthLayout>
      {/* Print output uses generateReportPdf (issue #189), not screenshot CSS. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .dl-radius-sm { border-radius: var(--radius-sm) !important; }
        .dl-radius-md { border-radius: var(--radius-md) !important; }
        .dl-radius-lg { border-radius: var(--radius-lg) !important; }
        .dl-radius-xl { border-radius: var(--radius-xl) !important; }
        .dl-radius-2xl { border-radius: var(--radius-2xl) !important; }
        .dl-radius-3xl { border-radius: var(--radius-3xl) !important; }
        .dl-radius-4xl { border-radius: var(--radius-4xl) !important; }
      `}} />

      <div className="page-container-lg space-y-6 px-4 sm:px-6 md:px-8 pt-4 md:py-8">
        {/* Screen Header */}
        <div className="flex flex-col gap-4 border-b border-border/50 pb-5 lg:flex-row lg:items-end lg:justify-between no-print">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center dl-radius-xl border border-primary/30 bg-primary-light text-primary-dark">
                <HiBanknotes className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl md:text-2xl font-black text-foreground tracking-tight">{t("Hisab Reports")}</h1>
                <p className="mt-1 text-xs md:text-sm text-muted font-medium">{t("Weekly and monthly event profitability with non-event operational spend.")}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasPermission("finance:imports:write") && (
              <Button
                onClick={() => router.push("/hr/finance/imports")}
                variant="outline"
                className="flex items-center gap-2 font-bold cursor-pointer h-[44px]"
              >
                <HiDocumentArrowDown className="h-4 w-4" />
                {t("Import Hisab")}
              </Button>
            )}
            <Button
              onClick={() => router.push("/hr/finance/net-profit")}
              variant="outline"
              className="flex items-center gap-2 font-bold cursor-pointer h-[44px]"
            >
              <HiArrowTrendingUp className="h-4 w-4" />
              {t("Net Profit")}
            </Button>
            <Button
              onClick={() => {
                if (periods.length === 0) return;
                generateReportPdf({
                  title: t("Hisab Reports"),
                  subtitle: `${startDate} → ${endDate}`,
                  output: "print",
                  orientation: "l",
                  fileName: `hisab-${startDate}_${endDate}.pdf`,
                  sections: [{
                    title: t("Period Summary"),
                    columns: [t("Period"), t("Income"), t("Event Expenses"), t("Operational"), t("Net")],
                    rows: periods.map((p) => [
                      periodType === "month" ? p.label : `${p.period_start} — ${p.period_end}`,
                      formatCurrency(p.eventTotals.income),
                      formatCurrency(p.eventTotals.expenses),
                      formatCurrency(p.operational.total),
                      formatCurrency(p.net),
                    ]),
                    foot: summary ? [[
                      t("Total"),
                      formatCurrency(summary.eventIncome),
                      formatCurrency(summary.eventExpenses),
                      formatCurrency(summary.operationalExpenses),
                      formatCurrency(summary.net),
                    ]] : undefined,
                    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
                  }],
                });
              }}
              variant="outline"
              className="flex items-center gap-2 font-bold cursor-pointer h-[44px]"
            >
              <HiPrinter className="h-4 w-4" />
              {t("Print Report")}
            </Button>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="toolbar-container bg-card border border-border dl-radius-2xl 2xl:dl-radius-4xl p-3.5 no-print">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {/* Period type segmented control */}
              <div className="flex h-[44px] items-center dl-radius-xl border border-border bg-card-alt p-1">
                {(["week", "month"] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => { setPeriodType(option); setRollupPage(1); }}
                    className={`h-full px-4 text-xs font-black uppercase tracking-wider dl-radius-lg transition-all ${periodType === option ? "bg-primary text-primary-foreground" : "text-muted [@media(hover:hover)]:hover:text-foreground"}`}
                  >
                    {option === "week" ? t("Weekly") : t("Monthly")}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("Start Date")}</span>
                <DatePicker value={startDate} onChange={(val) => { setStartDate(val); setRollupPage(1); }} className="w-36 h-[44px]" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("End Date")}</span>
                <DatePicker value={endDate} onChange={(val) => { setEndDate(val); setRollupPage(1); }} className="w-36 h-[44px]" />
              </div>

              <button
                onClick={handleResetFilters}
                className="h-[44px] px-4 text-xs font-black uppercase tracking-wider dl-radius-xl bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-foreground transition-all active:scale-[0.98] flex items-center gap-1.5"
              >
                <HiArrowPath className="w-3.5 h-3.5" />
                {t("Reset")}
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => setIsExportOpen(!isExportOpen)}
                className="flex items-center gap-1.5 px-3.5 h-[44px] text-xs font-black uppercase tracking-wider dl-radius-xl bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-foreground"
              >
                <HiArrowDownTray className="w-4 h-4" />
                {t("Export")}
              </button>
              {isExportOpen && (
                <div className="absolute right-0 mt-1.5 w-40 bg-card border border-border dl-radius-xl shadow-massive z-10 py-1">
                  <button onClick={() => handleExport("csv")} className="w-full text-left px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground [@media(hover:hover)]:hover:bg-card-alt">
                    {t("Export CSV")}
                  </button>
                  <button onClick={() => handleExport("xlsx")} className="w-full text-left px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground [@media(hover:hover)]:hover:bg-card-alt">
                    {t("Export XLSX")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs-container border-b border-border/50 pb-px flex flex-wrap gap-2 no-print">
          {[
            { id: "rollup", label: t("Rollup") },
            { id: "ledger", label: t("Operational Ledger") },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "rollup" | "ledger")}
              className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted [@media(hover:hover)]:hover:text-foreground"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* KPI strip */}
        {summary && (
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
            <div className="dl-radius-2xl border border-border bg-card p-4">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("Event Income")}</div>
              <div className="mt-2 text-xl font-black text-foreground font-mono tabular-nums">{formatCurrency(summary.eventIncome)}</div>
            </div>
            <div className="dl-radius-2xl border border-border bg-card p-4">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("Event Expenses")}</div>
              <div className="mt-2 text-xl font-black text-foreground font-mono tabular-nums">{formatCurrency(summary.eventExpenses)}</div>
            </div>
            <div className="dl-radius-2xl border border-border bg-card p-4">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("Event Profit")}</div>
              <div className={`mt-2 text-xl font-black font-mono tabular-nums ${summary.eventProfit >= 0 ? "text-success" : "text-danger"}`}>
                {formatCurrency(summary.eventProfit)}
              </div>
            </div>
            <div className="dl-radius-2xl border border-border bg-card p-4">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("Operational Spend")}</div>
              <div className="mt-2 text-xl font-black text-foreground font-mono tabular-nums">{formatCurrency(summary.operationalExpenses)}</div>
            </div>
            <div className="dl-radius-2xl border border-border bg-card p-4 col-span-2 lg:col-span-1">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("Net")}</div>
              <div className={`mt-2 text-xl font-black font-mono tabular-nums ${summary.net >= 0 ? "text-success" : "text-danger"}`}>
                {formatCurrency(summary.net)}
              </div>
            </div>
          </div>
        )}

        {/* Rollup view */}
        {activeTab === "rollup" && (
          rollupLoading ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
              <Skeleton className="h-64 w-full" />
            </div>
          ) : rollupError || !rollup ? (
            <div className="dl-radius-2xl 2xl:dl-radius-4xl border border-border bg-card p-8 text-center text-muted">
              {t("Workspace unavailable")}
            </div>
          ) : periods.length === 0 ? (
            <div className="dl-radius-2xl 2xl:dl-radius-4xl border border-border bg-card p-8 text-center text-sm text-muted">
              {t("No data found for the selected date range.")}
            </div>
          ) : (
            <div className="space-y-6">
              {periods.map((period) => (
                <section key={period.period_start} className="dl-radius-2xl 2xl:dl-radius-4xl border border-border bg-card p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
                    <div className="flex items-center gap-2">
                      <HiCalendarDays className="h-5 w-5 text-primary-dark" />
                      <h2 className="text-xs font-black text-foreground uppercase tracking-wider">
                        {periodType === "month" ? period.label : `${t("Date")}: ${period.period_start} — ${period.period_end}`}
                      </h2>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-black font-mono tabular-nums ${period.net >= 0 ? "text-success" : "text-danger"}`}>
                        {formatCurrency(period.net)}
                      </div>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-wider mt-0.5">{t("Net")}</div>
                    </div>
                  </div>

                  {period.events.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-card-alt/30 border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                            <th className="px-4 py-3">{t("Event")}</th>
                            <th className="px-4 py-3">{t("Date")}</th>
                            <th className="px-4 py-3 text-right">{t("Income")}</th>
                            <th className="px-4 py-3 text-right">{t("Transport")}</th>
                            <th className="px-4 py-3 text-right">{t("Rental")}</th>
                            <th className="px-4 py-3 text-right">{t("Labour")}</th>
                            <th className="px-4 py-3 text-right">{t("Other")}</th>
                            <th className="px-4 py-3 text-right">{t("Total")}</th>
                            <th className="px-4 py-3 text-right">{t("Profit")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {period.events.map((event) => (
                            <tr key={event.event_id} className="border-b border-border/50 [@media(hover:hover)]:hover:bg-card-alt/20 transition-all font-semibold text-foreground">
                              <td className="px-4 py-3 font-bold max-w-[220px] truncate">{event.event_name}</td>
                              <td className="px-4 py-3 font-mono text-muted">{event.event_date}</td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(event.income)}</td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(event.transport)}</td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(event.rental)}</td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(event.labour)}</td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(event.other)}</td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums font-bold">{formatCurrency(event.expense_total)}</td>
                              <td className={`px-4 py-3 text-right font-mono tabular-nums font-bold ${event.profit >= 0 ? "text-success" : "text-danger"}`}>
                                {formatCurrency(event.profit)}
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-card-alt/40 font-black text-foreground">
                            <td className="px-4 py-3 uppercase tracking-wider text-[10px]" colSpan={2}>{t("Events Total")}</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(period.eventTotals.income)}</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(period.eventTotals.transport)}</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(period.eventTotals.rental)}</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(period.eventTotals.labour)}</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(period.eventTotals.other)}</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(period.eventTotals.expenses)}</td>
                            <td className={`px-4 py-3 text-right font-mono tabular-nums ${period.eventTotals.profit >= 0 ? "text-success" : "text-danger"}`}>
                              {formatCurrency(period.eventTotals.profit)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(period.operational.byCategory.length > 0 || period.operational.pendingExposure > 0) && (
                    <div className="dl-radius-xl border border-border/60 bg-card-alt/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                        <h3 className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">{t("Non-Event Expenses")}</h3>
                        {period.operational.pendingExposure > 0 && (
                          <span className="text-[10px] font-bold text-warning uppercase tracking-wider">
                            {t("Pending exposure")}: <span className="font-mono tabular-nums">{formatCurrency(period.operational.pendingExposure)}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        {period.operational.byCategory.map((entry) => (
                          <div key={entry.category} className="flex items-baseline gap-1.5">
                            <span className="font-mono tabular-nums text-sm font-black text-foreground">{formatCurrency(entry.amount)}</span>
                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{t(entry.category)}</span>
                          </div>
                        ))}
                        <div className="flex items-baseline gap-1.5 ml-auto">
                          <span className="font-mono tabular-nums text-sm font-black text-foreground">{formatCurrency(period.operational.total)}</span>
                          <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("Total")}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              ))}
              {(rollup?.totalPages || 1) > 1 && (
                <div className="mt-4">
                  <PaginationControls page={rollupPage} totalPages={rollup?.totalPages || 1} onPageChange={setRollupPage} />
                </div>
              )}
            </div>
          )
        )}

        {/* Ledger view */}
        {activeTab === "ledger" && (
          <section className="dl-radius-2xl 2xl:dl-radius-4xl border border-border bg-card p-5 space-y-4 no-print">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
                <div className="relative flex-1 max-w-xs">
                  <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    placeholder={t("Search descriptions...")}
                    value={ledgerSearch}
                    onChange={(e) => { setLedgerSearch(e.target.value); setLedgerPage(1); }}
                    className="w-full pl-10 pr-4 h-[44px] dl-radius-xl bg-card-alt text-sm focus:ring-1 focus:ring-primary/30 outline-none border border-border transition-all"
                  />
                </div>
                <Select
                  options={[
                    { id: "", label: t("All Statuses") },
                    { id: "Pending", label: t("Pending") },
                    { id: "Approved", label: t("Approved") },
                    { id: "Rejected", label: t("Rejected") },
                  ]}
                  value={ledgerStatus}
                  onChange={(val) => { setLedgerStatus(val); setLedgerPage(1); }}
                  className="min-w-[150px]"
                />
                <Select
                  options={[
                    { id: "", label: t("All Categories") },
                    ...FINANCE_OPEX_CATEGORIES.map((category) => ({ id: category, label: t(category) })),
                  ]}
                  value={ledgerCategory}
                  onChange={(val) => { setLedgerCategory(val); setLedgerPage(1); }}
                  className="min-w-[160px]"
                />
                <Select
                  options={[
                    { id: "expense_date", label: t("Date") },
                    { id: "recent", label: t("Recently Edited") },
                    { id: "amount", label: t("Amount") },
                  ]}
                  value={ledgerSortBy}
                  onChange={(value) => { setLedgerSortBy(value); setLedgerPage(1); }}
                  className="min-w-[160px]"
                />
              </div>
              {canWrite && (
                <Button onClick={openCreateForm} className="flex items-center gap-2 font-bold h-[44px]">
                  <HiPlus className="h-4 w-4" />
                  {t("Add Expense")}
                </Button>
              )}
            </div>

            {ledgerLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : ledgerRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">{t("No operational expenses recorded yet.")}</div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-card-alt/30 border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                        <th className="px-4 py-3">{t("Date")}</th>
                        <th className="px-4 py-3">{t("Category")}</th>
                        <th className="px-4 py-3">{t("Description")}</th>
                        <th className="px-4 py-3 text-right">{t("Amount")}</th>
                        <th className="px-4 py-3">{t("Status")}</th>
                        {(canWrite || canApprove) && <th className="px-4 py-3 text-right">{t("Actions")}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerRows.map((expense) => (
                        <tr key={expense.id} className="border-b border-border/50 [@media(hover:hover)]:hover:bg-card-alt/20 transition-all font-semibold text-foreground align-top">
                          <td className="px-4 py-3 font-mono text-muted whitespace-nowrap">{String(expense.expense_date).slice(0, 10)}</td>
                          <td className="px-4 py-3 font-bold whitespace-nowrap">{t(expense.category)}</td>
                          <td className="px-4 py-3 max-w-[280px]">
                            <span className="block truncate">{expense.description}</span>
                            {expense.status === "Rejected" && expense.rejected_reason && (
                              <span className="block text-[10px] text-danger font-bold mt-1">{t("Rejected:")} {expense.rejected_reason}</span>
                            )}
                            {expense.created_by_username && (
                              <span className="block text-[10px] text-muted mt-0.5">{t("Recorded by")} {expense.created_by_username}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums font-bold whitespace-nowrap">{formatCurrency(expense.amount)}</td>
                          <td className="px-4 py-3"><StatusBadge status={expense.status} /></td>
                          {(canWrite || canApprove) && (
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {canApprove && expense.status === "Pending" && rejectingId !== expense.id && (
                                  <>
                                    <button
                                      onClick={() => reviewMutation.mutate({ id: expense.id, decision: "approve" })}
                                      disabled={reviewMutation.isPending}
                                      aria-label={t("Approve")}
                                      className="flex items-center gap-1 h-[36px] px-3 text-[10px] font-black uppercase tracking-wider dl-radius-lg border border-success/40 text-success [@media(hover:hover)]:hover:bg-success/10 transition-all disabled:opacity-50"
                                    >
                                      <HiCheck className="w-3.5 h-3.5" />
                                      {t("Approve")}
                                    </button>
                                    <button
                                      onClick={() => { setRejectingId(expense.id); setRejectReason(""); }}
                                      disabled={reviewMutation.isPending}
                                      aria-label={t("Reject")}
                                      className="flex items-center gap-1 h-[36px] px-3 text-[10px] font-black uppercase tracking-wider dl-radius-lg border border-danger/40 text-danger [@media(hover:hover)]:hover:bg-danger/10 transition-all disabled:opacity-50"
                                    >
                                      <HiXMark className="w-3.5 h-3.5" />
                                      {t("Reject")}
                                    </button>
                                  </>
                                )}
                                {canApprove && rejectingId === expense.id && (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      autoFocus
                                      value={rejectReason}
                                      onChange={(e) => setRejectReason(e.target.value)}
                                      placeholder={t("Rejection reason")}
                                      className="h-[36px] w-40 px-3 dl-radius-lg bg-card-alt text-xs outline-none border border-border focus:ring-1 focus:ring-danger/30"
                                    />
                                    <button
                                      onClick={() => {
                                        if (!rejectReason.trim()) {
                                          toast.error(t("Reason required"));
                                          return;
                                        }
                                        reviewMutation.mutate({ id: expense.id, decision: "reject", reason: rejectReason.trim() });
                                      }}
                                      disabled={reviewMutation.isPending}
                                      aria-label={t("Reject")}
                                      className="h-[36px] px-3 text-[10px] font-black uppercase tracking-wider dl-radius-lg bg-danger text-white transition-all disabled:opacity-50"
                                    >
                                      {t("Reject")}
                                    </button>
                                    <button
                                      onClick={() => setRejectingId(null)}
                                      aria-label={t("Cancel")}
                                      className="h-[36px] px-2 text-[10px] font-black uppercase tracking-wider dl-radius-lg border border-border text-muted"
                                    >
                                      <HiXMark className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                                {canWrite && expense.status !== "Approved" && rejectingId !== expense.id && (
                                  <>
                                    <button
                                      onClick={() => openEditForm(expense)}
                                      aria-label={t("Edit")}
                                      className="flex items-center justify-center h-[36px] w-[36px] dl-radius-lg border border-border text-muted [@media(hover:hover)]:hover:text-foreground transition-all"
                                    >
                                      <HiPencilSquare className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setDeletingExpense(expense)}
                                      disabled={deleteMutation.isPending}
                                      aria-label={t("Delete")}
                                      className="flex items-center justify-center h-[36px] w-[36px] dl-radius-lg border border-danger/40 text-danger [@media(hover:hover)]:hover:bg-danger/10 transition-all disabled:opacity-50"
                                    >
                                      <HiTrash className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(ledger?.totalPages || 1) > 1 && (
                  <PaginationControls page={ledgerPage} totalPages={ledger?.totalPages || 1} onPageChange={setLedgerPage} />
                )}
              </div>
            )}
          </section>
        )}
      </div>

      <DeleteConfirmModal
        isOpen={!!deletingExpense}
        onClose={() => setDeletingExpense(null)}
        onConfirm={() => deletingExpense && deleteMutation.mutate(deletingExpense.id)}
        title={t("Delete Expense")}
        message={t("This will remove the operational expense from the ledger.")}
        itemName={deletingExpense ? `${t(deletingExpense.category)} — ${deletingExpense.description}` : ""}
        isDeleting={deleteMutation.isPending}
      />

      {/* Add / Edit expense drawer (bottom sheet on mobile) */}
      {isFormOpen && (
        <ResponsiveDrawer
          isOpen={isFormOpen}
          onClose={() => { setIsFormOpen(false); setEditingExpense(null); }}
          title={editingExpense ? t("Edit Expense") : t("Add Expense")}
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" className="h-[44px] font-bold" onClick={() => { setIsFormOpen(false); setEditingExpense(null); }}>
                {t("Cancel")}
              </Button>
              <Button className="h-[44px] font-bold" onClick={handleSubmitForm} disabled={saveMutation.isPending}>
                {t("Save Expense")}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Date")}</label>
              <DatePicker value={form.expense_date} onChange={(val) => setForm((f) => ({ ...f, expense_date: val }))} className="w-full h-[44px]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Category")}</label>
              <div className="flex flex-wrap gap-2">
                {FINANCE_OPEX_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    onClick={() => setForm((f) => ({ ...f, category }))}
                    className={`h-[40px] px-3.5 text-[11px] font-black uppercase tracking-wider dl-radius-lg border transition-all ${form.category === category ? "border-primary bg-primary/10 text-primary" : "border-border bg-card-alt text-muted [@media(hover:hover)]:hover:text-foreground"}`}
                  >
                    {t(category)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Amount")} (ETB)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full px-4 h-[44px] dl-radius-xl bg-card-alt text-sm font-mono tabular-nums outline-none border border-border focus:ring-1 focus:ring-primary/30 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Description")}</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-4 h-[44px] dl-radius-xl bg-card-alt text-sm outline-none border border-border focus:ring-1 focus:ring-primary/30 transition-all"
              />
            </div>
          </div>
        </ResponsiveDrawer>
      )}
    </AuthLayout>
  );
}
