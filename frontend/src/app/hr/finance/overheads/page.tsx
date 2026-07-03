"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HiPrinter,
  HiMagnifyingGlass,
  HiArrowPath,
  HiPlus,
  HiCheck,
  HiXMark,
  HiPencilSquare,
  HiTrash,
  HiLockClosed,
  HiLockOpen,
} from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import ForbiddenState from "@/components/ForbiddenState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Select from "@/components/ui/Select";
import StatusBadge from "@/components/ui/StatusBadge";
import PaginationControls from "@/components/PaginationControls";
import ResponsiveDrawer from "@/components/ui/ResponsiveDrawer";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import toast from "@/lib/toast";
import { useLanguage } from "@/hooks/use-language";
import { createPermissionMatcher } from "@/lib/permission-matcher";
import {
  api,
  getFinanceOverheads,
  getFinanceOverheadSummary,
  createFinanceOverhead,
  updateFinanceOverhead,
  deleteFinanceOverhead,
  approveFinanceOverhead,
  rejectFinanceOverhead,
  closeOverheadMonth,
  reopenOverheadMonth,
  getEmployees,
  OVERHEAD_CATEGORIES,
} from "@/lib/api";
import type { FinanceOverhead } from "@/lib/types";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Overhead Register": "Overhead Register",
    "Manage monthly overheads, shared expenses, and staff operational payments.": "Manage monthly overheads, shared expenses, and staff operational payments.",
    "Month": "Month",
    "Office Staff": "Office Staff",
    "Store Staff": "Store Staff",
    "Shared with Koti": "Shared with Koti",
    "Rental & Other": "Rental & Other",
    "Subtotal Monthly": "Subtotal Monthly",
    "Staff Payments": "Staff Payments",
    "Non-Payroll Overhead": "Non-Payroll Overhead",
    "Pending Exposure": "Pending Exposure",
    "Category": "Category",
    "Amount": "Amount",
    "Description": "Description",
    "Payee": "Payee",
    "Scope": "Scope",
    "Kind": "Kind",
    "Status": "Status",
    "Actions": "Actions",
    "Add Expense": "Add Expense",
    "Edit Expense": "Edit Expense",
    "Save Expense": "Save Expense",
    "Delete Expense": "Delete Expense",
    "Approve": "Approve",
    "Reject": "Reject",
    "Close Month": "Close Month",
    "Reopen Month": "Reopen Month",
    "Month Closed": "Month Closed",
    "Closed By": "Closed By",
    "This month is closed for edits.": "This month is closed for edits.",
    "Rejection reason": "Rejection reason",
    "Reason required": "Reason required",
    "Cancel": "Cancel",
    "Notes": "Notes",
    "Is Recurring?": "Is Recurring?",
    "Shared With": "Shared With",
    "Employee Link": "Employee Link",
    "Payment Kind": "Payment Kind",
    "Due Date": "Due Date",
    "Optional Payee": "Optional Payee",
    "Workspace unavailable": "Workspace unavailable",
    "No data found for the selected filter criteria.": "No data found for the selected filter criteria.",
    "Overhead": "Overhead",
    "Staff Payment": "Staff Payment",
    "General": "General",
    "Office": "Office",
    "Store": "Store",
    "Shared": "Shared",
    "Salary": "Salary",
    "Fuel": "Fuel",
    "Car Rental": "Car Rental",
    "Office Rent": "Office Rent",
    "Store Rent": "Store Rent",
    "Wifi": "Wifi",
    "Water & Electric": "Water & Electric",
    "Marketing/Boost": "Marketing/Boost",
    "Sticker": "Sticker",
    "Seasonal/Ekub": "Seasonal/Ekub",
    "Food": "Food",
    "House Expense": "House Expense",
    "Supplies": "Supplies",
    "Other": "Other",
  },
  am: {
    "Overhead Register": "የወጪ መዝገብ",
    "Manage monthly overheads, shared expenses, and staff operational payments.": "ወርሃዊ ወጪዎችን፣ የጋራ ወጪዎችን እና የሰራተኞች ክፍያዎችን ያስተዳድሩ።",
    "Month": "ወር",
    "Office Staff": "የቢሮ ሰራተኞች",
    "Store Staff": "የመጋዘን ሰራተኞች",
    "Shared with Koti": "ከኮቲ ጋር የተጋራ",
    "Rental & Other": "ኪራይ እና ሌሎች",
    "Subtotal Monthly": "ወርሃዊ ድምር",
    "Staff Payments": "የሰራተኞች ክፍያዎች",
    "Non-Payroll Overhead": "የማይከፈልበት ወጪ",
    "Pending Exposure": "በጥበቃ ላይ ያለ ወጪ",
    "Category": "ዓይነት",
    "Amount": "መጠን",
    "Description": "ዝርዝር መግለጫ",
    "Payee": "ተከፋይ",
    "Scope": "ወሰን",
    "Kind": "ዓይነት",
    "Status": "ሁኔታ",
    "Actions": "ድርጊቶች",
    "Add Expense": "ወጪ መዝግብ",
    "Edit Expense": "ወጪ አሻሽል",
    "Save Expense": "ወጪ አስቀምጥ",
    "Delete Expense": "ወጪ ሰርዝ",
    "Approve": "አጽድቅ",
    "Reject": "ውድቅ አድርግ",
    "Close Month": "ወር ዝጋ",
    "Reopen Month": "ወር ክፈት",
    "Month Closed": "ወሩ ተዘግቷል",
    "Closed By": "የዘጋው ተጠቃሚ",
    "This month is closed for edits.": "ይህ ወር ለውጦች ተዘግቷል።",
    "Rejection reason": "ውድቅ የተደረገበት ምክንያት",
    "Reason required": "ምክንያት ያስፈልጋል",
    "Cancel": "ሰርዝ",
    "Notes": "ማስታወሻዎች",
    "Is Recurring?": "ተደጋጋሚ ነው?",
    "Shared With": "የተጋራው ከማን ጋር",
    "Employee Link": "ሰራተኛ አገናኝ",
    "Payment Kind": "የክፍያ ዓይነት",
    "Due Date": "የመክፈያ ቀን",
    "Optional Payee": "አማራጭ ተከፋይ",
    "Workspace unavailable": "ስራ ቦታው አይገኝም",
    "No data found for the selected filter criteria.": "ለተመረጡት ማጣሪያዎች ምንም ውሂብ አልተገኘም።",
    "Overhead": "የስራ ማስኬጃ",
    "Staff Payment": "የሰራተኛ ክፍያ",
    "General": "አጠቃላይ",
    "Office": "ቢሮ",
    "Store": "መጋዘን",
    "Shared": "የተጋራ",
    "Salary": "ደመወዝ",
    "Fuel": "ነዳጅ",
    "Car Rental": "የመኪና ኪራይ",
    "Office Rent": "የቢሮ ኪራይ",
    "Store Rent": "የመጋዘን ኪራይ",
    "Wifi": "ዋይፋይ",
    "Water & Electric": "ውሃ እና መብራት",
    "Marketing/Boost": "ማስታወቂያ",
    "Sticker": "ስቲከር",
    "Seasonal/Ekub": "እቁብ",
    "Food": "ምግብ",
    "House Expense": "የቤት ወጪ",
    "Supplies": "አቅርቦቶች",
    "Other": "ሌሎች",
  },
};

export default function OverheadsPage() {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();

  const t = (key: string): string => {
    return TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en?.[key] || key;
  };

  // State
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return new Date().toISOString().slice(0, 7); // YYYY-MM
  });
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<FinanceOverhead | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<FinanceOverhead | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const defaultForm = {
    expense_month: selectedMonth,
    due_date: "",
    category: "Salary",
    payee: "",
    scope: "Office" as "Office" | "Store" | "Shared" | "General",
    shared_with: "",
    payment_kind: "overhead" as "overhead" | "staff_payment",
    employee_id: "",
    is_recurring: false,
    amount: "",
    notes: "",
  };

  const [form, setForm] = useState(defaultForm);

  // Queries
  const { data: permissions } = useQuery({
    queryKey: ["auth-permissions"],
    queryFn: async () => {
      const res = await api.get("/auth/permissions");
      return res.data;
    },
  });

  const permissionList = permissions?.permission_slugs || [];
  const matches = createPermissionMatcher(permissionList);

  const canRead = matches("finance:overheads:read");
  const canWrite = matches("finance:overheads:write");
  const canApprove = matches("finance:overheads:approve");

  // Summary
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["finance-overheads-summary", selectedMonth],
    queryFn: () => getFinanceOverheadSummary(selectedMonth),
    enabled: canRead,
  });

  // Overheads list
  const { data: ledgerResponse, isLoading: listLoading, error: listError } = useQuery({
    queryKey: ["finance-overheads-list", selectedMonth, page, limit, statusFilter, categoryFilter, scopeFilter, kindFilter, searchQuery],
    queryFn: () =>
      getFinanceOverheads({
        month: selectedMonth,
        page,
        limit,
        status: statusFilter === "all" ? undefined : statusFilter,
        category: categoryFilter === "all" ? undefined : categoryFilter,
        scope: scopeFilter === "all" ? undefined : scopeFilter,
        payment_kind: kindFilter === "all" ? undefined : kindFilter,
        search: searchQuery.trim() || undefined,
      }),
    enabled: canRead,
  });

  // Employees for staff payments dropdown
  const { data: employeesResponse } = useQuery({
    queryKey: ["employees-lookup"],
    queryFn: () => getEmployees(1, 100, undefined, "Active"),
    enabled: canRead && isFormOpen,
  });
  const employeeList = employeesResponse?.employees || [];

  const isClosed = summary?.closed ?? false;

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (data: Partial<FinanceOverhead>) => {
      if (editingExpense) {
        return updateFinanceOverhead(editingExpense.id, data);
      }
      return createFinanceOverhead(data);
    },
    onSuccess: () => {
      toast.success(editingExpense ? t("Expense updated") : t("Expense created"));
      setIsFormOpen(false);
      setEditingExpense(null);
      queryClient.invalidateQueries({ queryKey: ["finance-overheads-list"] });
      queryClient.invalidateQueries({ queryKey: ["finance-overheads-summary"] });
    },
    onError: (err: unknown) => {
      const error = err as Error & { response?: { data?: { error?: string } } };
      const msg = error.response?.data?.error || error.message || "Failed to save";
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFinanceOverhead(id),
    onSuccess: () => {
      toast.success(t("Expense deleted"));
      setDeletingExpense(null);
      queryClient.invalidateQueries({ queryKey: ["finance-overheads-list"] });
      queryClient.invalidateQueries({ queryKey: ["finance-overheads-summary"] });
    },
    onError: (err: unknown) => {
      const error = err as Error & { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || error.message || "Delete failed");
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: "approve" | "reject"; reason?: string }) => {
      if (decision === "approve") {
        return approveFinanceOverhead(id);
      }
      return rejectFinanceOverhead(id, reason || "");
    },
    onSuccess: () => {
      toast.success(t("Expense reviewed"));
      setRejectingId(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["finance-overheads-list"] });
      queryClient.invalidateQueries({ queryKey: ["finance-overheads-summary"] });
    },
    onError: (err: unknown) => {
      const error = err as Error & { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || error.message || "Review failed");
    },
  });

  const monthCloseMutation = useMutation({
    mutationFn: ({ month, close }: { month: string; close: boolean }) => {
      if (close) {
        return closeOverheadMonth(month);
      }
      return reopenOverheadMonth(month);
    },
    onSuccess: (_, variables) => {
      toast.success(variables.close ? t("Month Closed") : t("Month Reopened"));
      queryClient.invalidateQueries({ queryKey: ["finance-overheads-list"] });
      queryClient.invalidateQueries({ queryKey: ["finance-overheads-summary"] });
    },
    onError: (err: unknown) => {
      const error = err as Error & { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || error.message || "Operation failed");
    },
  });

  if (!canRead) {
    return <ForbiddenState />;
  }

  // Helpers
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "ETB" }).format(val);
  };

  const handleMonthChange = (direction: "prev" | "next") => {
    const date = new Date(`${selectedMonth}-02`);
    date.setMonth(date.getMonth() + (direction === "prev" ? -1 : 1));
    setSelectedMonth(date.toISOString().slice(0, 7));
    setPage(1);
  };

  const handleOpenAddForm = () => {
    if (isClosed) return;
    setEditingExpense(null);
    setForm({
      ...defaultForm,
      expense_month: selectedMonth,
    });
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (expense: FinanceOverhead) => {
    if (isClosed || expense.status === "Approved") return;
    setEditingExpense(expense);
    setForm({
      expense_month: expense.expense_month.slice(0, 7),
      due_date: expense.due_date ? expense.due_date.slice(0, 10) : "",
      category: expense.category,
      payee: expense.payee || "",
      scope: expense.scope,
      shared_with: expense.shared_with || "",
      payment_kind: expense.payment_kind,
      employee_id: expense.employee_id || "",
      is_recurring: expense.is_recurring,
      amount: String(expense.amount),
      notes: expense.notes || "",
    });
    setIsFormOpen(true);
  };

  const handleSubmitForm = () => {
    const amountVal = Number.parseFloat(form.amount);
    if (Number.isNaN(amountVal) || amountVal <= 0) {
      toast.error(t("Amount must be a positive number"));
      return;
    }
    if (form.payment_kind === "staff_payment" && !form.employee_id) {
      toast.error(t("Employee Link is required for staff payments"));
      return;
    }
    if (form.scope === "Shared" && !form.shared_with.trim()) {
      toast.error(t("Shared With is required for Shared scope entries"));
      return;
    }

    const payload = {
      ...form,
      amount: amountVal,
      due_date: form.due_date || null,
      payee: form.payee.trim() || null,
      shared_with: form.scope === "Shared" ? form.shared_with.trim() : null,
      employee_id: form.payment_kind === "staff_payment" ? form.employee_id : null,
    };

    saveMutation.mutate(payload);
  };

  return (
    <AuthLayout>
      <style dangerouslySetInnerHTML={{ __html: `
        .dl-radius-sm { border-radius: var(--radius-sm); }
        .dl-radius-md { border-radius: var(--radius-md); }
        .dl-radius-lg { border-radius: var(--radius-lg); }
        .dl-radius-xl { border-radius: var(--radius-xl); }
        .dl-radius-2xl { border-radius: var(--radius-2xl); }
        .dl-radius-3xl { border-radius: var(--radius-3xl); }
        @media print {
          .no-print { display: none !important; }
        }
      `}} />

      <div className="space-y-6">
        {/* Header toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-4 no-print">
          <div>
            <h1 className="text-xl font-black tracking-wider text-foreground">{t("Overhead Register")}</h1>
            <p className="text-xs text-muted mt-1 max-w-xl">
              {t("Manage monthly overheads, shared expenses, and staff operational payments.")}
            </p>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {canApprove && (
              <button
                onClick={() => monthCloseMutation.mutate({ month: selectedMonth, close: !isClosed })}
                disabled={monthCloseMutation.isPending}
                className={`flex items-center gap-1.5 h-[40px] px-4 text-xs font-black uppercase tracking-wider dl-radius-lg border transition-all ${isClosed ? "border-success/30 text-success bg-success/5" : "border-border text-foreground bg-card [@media(hover:hover)]:hover:border-foreground"}`}
              >
                {isClosed ? <HiLockClosed className="w-4 h-4" /> : <HiLockOpen className="w-4 h-4" />}
                {isClosed ? t("Reopen Month") : t("Close Month")}
              </button>
            )}
            <button
              onClick={() => window.print()}
              aria-label={t("Print Report")}
              className="flex items-center justify-center w-[40px] h-[40px] dl-radius-lg border border-border text-muted bg-card [@media(hover:hover)]:hover:text-foreground transition-all"
            >
              <HiPrinter className="w-4 h-4" />
            </button>
            <button
              onClick={handleOpenAddForm}
              disabled={isClosed || !canWrite}
              className="flex items-center gap-1.5 h-[40px] px-4 text-xs font-black uppercase tracking-wider bg-primary text-primary-foreground dl-radius-lg shadow-gold transition-all disabled:opacity-50"
            >
              <HiPlus className="w-4 h-4" />
              {t("Add Expense")}
            </button>
          </div>
        </div>

        {/* Month selector & closed banner */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 no-print">
            <button onClick={() => handleMonthChange("prev")} className="h-[40px] px-3.5 border border-border bg-card dl-radius-lg text-muted [@media(hover:hover)]:hover:text-foreground font-black text-sm">
              &larr;
            </button>
            <div className="h-[40px] px-4 border border-border bg-card dl-radius-lg flex items-center font-bold text-sm text-foreground">
              {selectedMonth}
            </div>
            <button onClick={() => handleMonthChange("next")} className="h-[40px] px-3.5 border border-border bg-card dl-radius-lg text-muted [@media(hover:hover)]:hover:text-foreground font-black text-sm">
              &rarr;
            </button>
          </div>

          {isClosed && (
            <div className="flex items-center gap-2.5 p-4 bg-danger/5 border border-danger/20 text-danger dl-radius-xl text-xs font-semibold">
              <HiLockClosed className="w-4 h-4 shrink-0" />
              <div>
                <span className="font-black uppercase tracking-wider mr-1">{t("Month Closed")}:</span>
                {t("This month is closed for edits.")}
                {summary?.closure && (
                  <span className="ml-1 text-muted">
                    ({t("Closed By")} {summary.closure.closed_by_username})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Summary metric blocks */}
        {summaryLoading ? (
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-6 no-print">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-[96px] w-full dl-radius-xl" />)}
          </div>
        ) : summary ? (
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-6 font-semibold">
            <div className="dl-radius-xl border border-border bg-card p-4">
              <div className="text-[9px] font-bold text-muted uppercase tracking-wider">{t("Office Staff")}</div>
              <div className="mt-2 text-base font-black text-foreground font-mono tabular-nums">{formatCurrency(summary.blocks.officeStaff)}</div>
            </div>
            <div className="dl-radius-xl border border-border bg-card p-4">
              <div className="text-[9px] font-bold text-muted uppercase tracking-wider">{t("Store Staff")}</div>
              <div className="mt-2 text-base font-black text-foreground font-mono tabular-nums">{formatCurrency(summary.blocks.storeStaff)}</div>
            </div>
            <div className="dl-radius-xl border border-border bg-card p-4">
              <div className="text-[9px] font-bold text-muted uppercase tracking-wider">{t("Shared with Koti")}</div>
              <div className="mt-2 text-base font-black text-foreground font-mono tabular-nums">{formatCurrency(summary.blocks.shared)}</div>
            </div>
            <div className="dl-radius-xl border border-border bg-card p-4">
              <div className="text-[9px] font-bold text-muted uppercase tracking-wider">{t("Rental & Other")}</div>
              <div className="mt-2 text-base font-black text-foreground font-mono tabular-nums">{formatCurrency(summary.blocks.rentalAndOther)}</div>
            </div>
            <div className="dl-radius-xl border border-border bg-card p-4 bg-primary/5">
              <div className="text-[9px] font-bold text-primary-dark uppercase tracking-wider">{t("Subtotal Monthly")}</div>
              <div className="mt-2 text-base font-black text-foreground font-mono tabular-nums">{formatCurrency(summary.totals.subtotalMonthly)}</div>
            </div>
            <div className="dl-radius-xl border border-border bg-card p-4 bg-card-alt/30">
              <div className="text-[9px] font-bold text-muted uppercase tracking-wider">{t("Staff Payments")} / {t("Non-Payroll")}</div>
              <div className="mt-2 text-xs font-black text-foreground font-mono tabular-nums truncate">
                {formatCurrency(summary.totals.staffPayments)} / {formatCurrency(summary.totals.nonPayrollOverhead)}
              </div>
            </div>
          </div>
        ) : null}

        {/* Filters Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border border-border/60 bg-card p-3 dl-radius-xl no-print">
          <div className="relative flex-1 min-w-[200px]">
            <HiMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder={t("Search") + "..."}
              className="w-full pl-10 pr-4 h-[38px] text-xs font-semibold rounded-lg bg-card-alt border border-border/80 outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div className="w-[130px]">
            <Select
              value={statusFilter}
              onChange={(val) => { setStatusFilter(val); setPage(1); }}
              options={[
                { id: "all", label: t("Status") + ": " + t("All") },
                { id: "Pending", label: t("Pending") },
                { id: "Approved", label: t("Approved") },
                { id: "Rejected", label: t("Rejected") },
              ]}
              className="h-[38px] text-xs font-semibold"
            />
          </div>

          <div className="w-[135px]">
            <Select
              value={categoryFilter}
              onChange={(val) => { setCategoryFilter(val); setPage(1); }}
              options={[
                { id: "all", label: t("Category") + ": " + t("All") },
                ...OVERHEAD_CATEGORIES.map((cat) => ({ id: cat, label: t(cat) })),
              ]}
              className="h-[38px] text-xs font-semibold"
            />
          </div>

          <div className="w-[125px]">
            <Select
              value={scopeFilter}
              onChange={(val) => { setScopeFilter(val); setPage(1); }}
              options={[
                { id: "all", label: t("Scope") + ": " + t("All") },
                { id: "Office", label: t("Office") },
                { id: "Store", label: t("Store") },
                { id: "Shared", label: t("Shared") },
                { id: "General", label: t("General") },
              ]}
              className="h-[38px] text-xs font-semibold"
            />
          </div>

          <div className="w-[125px]">
            <Select
              value={kindFilter}
              onChange={(val) => { setKindFilter(val); setPage(1); }}
              options={[
                { id: "all", label: t("Kind") + ": " + t("All") },
                { id: "overhead", label: t("Overhead") },
                { id: "staff_payment", label: t("Staff Payment") },
              ]}
              className="h-[38px] text-xs font-semibold"
            />
          </div>

          <button
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
              setCategoryFilter("all");
              setScopeFilter("all");
              setKindFilter("all");
              setPage(1);
            }}
            aria-label={t("Reset Filters")}
            className="flex items-center justify-center w-[38px] h-[38px] rounded-lg border border-border/80 text-muted [@media(hover:hover)]:hover:text-foreground transition-all bg-card-alt"
          >
            <HiArrowPath className="w-4 h-4" />
          </button>
        </div>

        {/* Ledger Table */}
        {listLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-[52px] w-full dl-radius-lg" />)}
          </div>
        ) : listError || !ledgerResponse ? (
          <div className="dl-radius-xl border border-border bg-card p-8 text-center text-muted">
            {t("Workspace unavailable")}
          </div>
        ) : ledgerResponse.overheads.length === 0 ? (
          <div className="dl-radius-xl border border-border bg-card p-8 text-center text-sm text-muted">
            {t("No data found for the selected filter criteria.")}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto dl-radius-xl border border-border bg-card">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-card-alt/30 border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                    <th className="px-4 py-3.5">{t("Category")}</th>
                    <th className="px-4 py-3.5">{t("Scope")}</th>
                    <th className="px-4 py-3.5">{t("Kind")}</th>
                    <th className="px-4 py-3.5">{t("Payee")}</th>
                    <th className="px-4 py-3.5 max-w-[250px]">{t("Notes")}</th>
                    <th className="px-4 py-3.5 text-right">{t("Amount")}</th>
                    <th className="px-4 py-3.5">{t("Status")}</th>
                    <th className="px-4 py-3.5 text-right no-print">{t("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerResponse.overheads.map((expense) => (
                    <tr key={expense.id} className="border-b border-border/50 [@media(hover:hover)]:hover:bg-card-alt/20 transition-all font-semibold text-foreground align-top">
                      <td className="px-4 py-4 font-bold">{t(expense.category)}</td>
                      <td className="px-4 py-4">{t(expense.scope)}</td>
                      <td className="px-4 py-4 text-muted text-[10px] font-black uppercase tracking-wider">{t(expense.payment_kind === "staff_payment" ? "Staff Payment" : "Overhead")}</td>
                      <td className="px-4 py-4">
                        <span className="block truncate">
                          {expense.payment_kind === "staff_payment" ? expense.employee_name : expense.payee}
                        </span>
                        {expense.scope === "Shared" && expense.shared_with && (
                          <span className="block text-[10px] text-muted">{t("Shared with")}: {expense.shared_with}</span>
                        )}
                      </td>
                      <td className="px-4 py-4 max-w-[250px] whitespace-normal break-words font-medium">
                        {expense.notes}
                        {expense.status === "Rejected" && expense.rejected_reason && (
                          <span className="block text-[10px] text-danger font-bold mt-1">{t("Rejected:")} {expense.rejected_reason}</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right font-mono tabular-nums font-bold whitespace-nowrap">{formatCurrency(expense.amount)}</td>
                      <td className="px-4 py-4"><StatusBadge status={expense.status} /></td>
                      <td className="px-4 py-4 text-right no-print">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {canApprove && expense.status === "Pending" && rejectingId !== expense.id && (
                            <>
                              <button
                                onClick={() => reviewMutation.mutate({ id: expense.id, decision: "approve" })}
                                disabled={reviewMutation.isPending || isClosed}
                                aria-label={t("Approve")}
                                className="flex items-center gap-1 h-[32px] px-2.5 text-[10px] font-black uppercase tracking-wider dl-radius-md border border-success/40 text-success [@media(hover:hover)]:hover:bg-success/10 transition-all disabled:opacity-50"
                              >
                                <HiCheck className="w-3.5 h-3.5" />
                                {t("Approve")}
                              </button>
                              <button
                                onClick={() => { setRejectingId(expense.id); setRejectReason(""); }}
                                disabled={reviewMutation.isPending || isClosed}
                                aria-label={t("Reject")}
                                className="flex items-center gap-1 h-[32px] px-2.5 text-[10px] font-black uppercase tracking-wider dl-radius-md border border-danger/40 text-danger [@media(hover:hover)]:hover:bg-danger/10 transition-all disabled:opacity-50"
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
                                className="h-[32px] w-36 px-2 dl-radius-md bg-card-alt text-xs outline-none border border-border focus:ring-1 focus:ring-danger/30"
                              />
                              <button
                                onClick={() => {
                                  if (!rejectReason.trim()) {
                                    toast.error(t("Reason required"));
                                    return;
                                  }
                                  reviewMutation.mutate({ id: expense.id, decision: "reject", reason: rejectReason.trim() });
                                }}
                                disabled={reviewMutation.isPending || isClosed}
                                aria-label={t("Reject")}
                                className="h-[32px] px-2.5 text-[10px] font-black uppercase tracking-wider dl-radius-md bg-danger text-white transition-all disabled:opacity-50"
                              >
                                {t("Reject")}
                              </button>
                              <button
                                onClick={() => setRejectingId(null)}
                                aria-label={t("Cancel")}
                                className="h-[32px] px-1.5 text-[10px] font-black uppercase tracking-wider dl-radius-md border border-border text-muted"
                              >
                                <HiXMark className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          {canWrite && expense.status !== "Approved" && rejectingId !== expense.id && (
                            <>
                              <button
                                onClick={() => handleOpenEditForm(expense)}
                                disabled={isClosed}
                                aria-label={t("Edit")}
                                className="flex items-center justify-center h-[32px] w-[32px] dl-radius-md border border-border text-muted [@media(hover:hover)]:hover:text-foreground transition-all disabled:opacity-50"
                              >
                                <HiPencilSquare className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingExpense(expense)}
                                disabled={deleteMutation.isPending || isClosed}
                                aria-label={t("Delete")}
                                className="flex items-center justify-center h-[32px] w-[32px] dl-radius-md border border-danger/40 text-danger [@media(hover:hover)]:hover:bg-danger/10 transition-all disabled:opacity-50"
                              >
                                <HiTrash className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ledgerResponse.totalPages > 1 && (
              <PaginationControls page={page} totalPages={ledgerResponse.totalPages} onPageChange={setPage} />
            )}
          </div>
        )}
      </div>

      <DeleteConfirmModal
        isOpen={!!deletingExpense}
        onClose={() => setDeletingExpense(null)}
        onConfirm={() => deletingExpense && deleteMutation.mutate(deletingExpense.id)}
        title={t("Delete Expense")}
        message={t("This will remove the overhead expense from the ledger.")}
        itemName={deletingExpense ? `${t(deletingExpense.category)} — ${deletingExpense.payee || deletingExpense.notes || ""}` : ""}
        isDeleting={deleteMutation.isPending}
      />

      {/* Form drawer */}
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Month")}</label>
                <input
                  type="month"
                  value={form.expense_month}
                  onChange={(e) => setForm((f) => ({ ...f, expense_month: e.target.value }))}
                  className="w-full px-3 h-[44px] dl-radius-lg bg-card-alt text-sm outline-none border border-border focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Due Date")}</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="w-full px-3 h-[44px] dl-radius-lg bg-card-alt text-sm outline-none border border-border focus:ring-1 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Payment Kind")}</label>
                <Select
                  value={form.payment_kind}
                  onChange={(val) => setForm((f) => ({ ...f, payment_kind: val as "overhead" | "staff_payment", employee_id: "" }))}
                  options={[
                    { id: "overhead", label: t("Overhead") },
                    { id: "staff_payment", label: t("Staff Payment") },
                  ]}
                  className="h-[44px] text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Scope")}</label>
                <Select
                  value={form.scope}
                  onChange={(val) => setForm((f) => ({ ...f, scope: val as "Office" | "Store" | "Shared" | "General", shared_with: "" }))}
                  options={[
                    { id: "Office", label: t("Office") },
                    { id: "Store", label: t("Store") },
                    { id: "Shared", label: t("Shared") },
                    { id: "General", label: t("General") },
                  ]}
                  className="h-[44px] text-sm"
                />
              </div>
            </div>

            {form.payment_kind === "staff_payment" && (
              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Employee Link")}</label>
                <Select
                  value={form.employee_id}
                  onChange={(val) => setForm((f) => ({ ...f, employee_id: val }))}
                  options={[
                    { id: "", label: t("Select Employee") },
                    ...employeeList.map((emp: { id: string; full_name: string }) => ({ id: emp.id, label: emp.full_name })),
                  ]}
                  className="h-[44px] text-sm"
                />
              </div>
            )}

            {form.scope === "Shared" && (
              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Shared With")}</label>
                <input
                  type="text"
                  value={form.shared_with}
                  onChange={(e) => setForm((f) => ({ ...f, shared_with: e.target.value }))}
                  placeholder={t("e.g. Koti")}
                  className="w-full px-4 h-[44px] dl-radius-lg bg-card-alt text-sm outline-none border border-border focus:ring-1 focus:ring-primary/30"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Category")}</label>
              <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto border border-border/50 p-2 dl-radius-lg bg-card-alt">
                {OVERHEAD_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setForm((f) => ({ ...f, category: cat }))}
                    className={`h-[32px] px-3 text-[10px] font-black uppercase tracking-wider dl-radius-md border transition-all ${form.category === cat ? "border-primary bg-primary/10 text-primary" : "border-border/60 bg-card text-muted [@media(hover:hover)]:hover:text-foreground"}`}
                  >
                    {t(cat)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 items-end">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Amount")} (ETB)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-4 h-[44px] dl-radius-lg bg-card-alt text-sm font-mono tabular-nums outline-none border border-border focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div className="flex items-center gap-2 h-[44px] pb-2.5">
                <input
                  type="checkbox"
                  id="is_recurring"
                  checked={form.is_recurring}
                  onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))}
                  className="w-4 h-4 text-primary border-border rounded focus:ring-primary/30 bg-card-alt"
                />
                <label htmlFor="is_recurring" className="text-xs font-bold text-foreground cursor-pointer select-none">{t("Is Recurring?")}</label>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Payee")} ({t("Optional Payee")})</label>
              <input
                type="text"
                value={form.payee}
                onChange={(e) => setForm((f) => ({ ...f, payee: e.target.value }))}
                placeholder={t("e.g. Office Depot")}
                className="w-full px-4 h-[44px] dl-radius-lg bg-card-alt text-sm outline-none border border-border focus:ring-1 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{t("Notes")}</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full px-4 h-[44px] dl-radius-lg bg-card-alt text-sm outline-none border border-border focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>
        </ResponsiveDrawer>
      )}
    </AuthLayout>
  );
}
