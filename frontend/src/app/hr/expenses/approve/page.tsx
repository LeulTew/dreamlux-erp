"use client";

import { useState, useEffect, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import toast from "@/lib/toast";
import { HiCheck, HiXMark, HiClipboardDocumentList, HiChevronDown } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";

import AuthLayout from "@/components/AuthLayout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import PaginationControls from "@/components/PaginationControls";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { getPendingEventExpenses, getExpenseHistory, reviewEventExpense } from "@/lib/api";
import type { EventExpense } from "@/lib/types";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/ui/StatusBadge";
import ForbiddenState from "@/components/ForbiddenState";
import Select from "@/components/ui/Select";

// Distinguish HTTP failure classes so the queue can render the right state
// (issue #148: authentication vs authorization vs schema/validation vs network).
function classifyLoadError(error: unknown): { kind: "auth" | "forbidden" | "network" | "server"; status?: number; reference?: string } {
  const e = error as { response?: { status?: number; data?: { error?: string; reference?: string } }; message?: string; code?: string };
  const status = e?.response?.status;
  const reference = e?.response?.data?.reference;
  if (status === 401) return { kind: "auth", status, reference };
  if (status === 403) return { kind: "forbidden", status, reference };
  if (status === undefined) return { kind: "network", reference };
  return { kind: "server", status, reference };
}

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Expense Approval Queue": "Expense Approval Queue",
    "Review pending event expenses before they affect event cost and profit.": "Review pending event expenses before they affect event cost and profit.",
    "No pending expenses.": "No pending expenses.",
    "No history records found.": "No history records found.",
    Event: "Event",
    Client: "Client",
    Category: "Category",
    Amount: "Amount",
    Submitted: "Submitted",
    "Review comment": "Review comment",
    Approve: "Approve",
    Reject: "Reject",
    "Expense approved": "Expense approved",
    "Expense rejected": "Expense rejected",
    "Reason required": "Reason required",
    Fuel: "Fuel",
    Labor: "Labor",
    Transportation: "Transportation",
    "Equipment Rental": "Equipment Rental",
    Consumables: "Consumables",
    Other: "Other",
    Review: "Review",
    Collapse: "Collapse",
    "Enter comment or reject reason...": "Enter comment or reject reason...",
    "Pending Queue": "Pending Queue",
    History: "History",
    "Date From": "Date From",
    "Date To": "Date To",
    "Min Amount": "Min Amount",
    "Max Amount": "Max Amount",
    "All Categories": "All Categories",
    "All Statuses": "All Statuses",
    "Search event, category or submitter...": "Search event, category or submitter...",
    "Search reviewer...": "Search reviewer...",
    Reviewer: "Reviewer",
    Decision: "Decision",
    "Date Reviewed": "Date Reviewed",
    Reason: "Reason",
    Approved: "Approved",
    Rejected: "Rejected",
    Pending: "Pending",
    Receipt: "Receipt",
    "View Receipt": "View Receipt",
    "You do not have permission to review expense approvals.": "You do not have permission to review expense approvals.",
    "Your session has expired. Please sign in again.": "Your session has expired. Please sign in again.",
    "Network problem — could not reach the server.": "Network problem — could not reach the server.",
    "Something went wrong loading the queue.": "Something went wrong loading the queue.",
    "Reference": "Reference",
    "Retry": "Retry"
  },
  am: {
    "Expense Approval Queue": "የወጪ ማጽደቂያ ዝርዝር",
    "Review pending event expenses before they affect event cost and profit.": "የዝግጅት ወጪና ትርፍ ከመቀየሩ በፊት በመጠባበቅ ላይ ያሉ ወጪዎችን ይመልከቱ።",
    "No pending expenses.": "በመጠባበቅ ላይ ያለ ወጪ የለም።",
    "No history records found.": "ምንም የታሪክ መዝገብ አልተገኘም።",
    Event: "ዝግጅት",
    Client: "ደንበኛ",
    Category: "ምድብ",
    Amount: "መጠን",
    Submitted: "ያስገባው",
    "Review comment": "የግምገማ አስተያየት",
    Approve: "አጽድቅ",
    Reject: "ውድቅ አድርግ",
    "Expense approved": "ወጪ ጸድቋል",
    "Expense rejected": "ወጪ ውድቅ ተደርጓል",
    "Reason required": "ምክንያት ያስፈልጋል",
    Fuel: "ነዳጅ",
    Labor: "ሰራተኛ",
    Transportation: "ትራንስፖርት",
    "Equipment Rental": "የመሳሪያ ኪራይ",
    Consumables: "የሚጠቀሙ እቃዎች",
    Other: "ሌላ",
    Review: "ገምግም",
    Collapse: "አጣጥፍ",
    "Enter comment or reject reason...": "አስተያየት ወይም ውድቅ የተደረገበትን ምክንያት ያስገቡ...",
    "Pending Queue": "በመጠባበቅ ላይ ያሉ",
    History: "ታሪክ",
    "Date From": "ከቀን",
    "Date To": "እስከ ቀን",
    "Min Amount": "ቢያንስ ወጪ",
    "Max Amount": "ቢበዛ ወጪ",
    "All Categories": "ሁሉም ምድቦች",
    "All Statuses": "ሁሉም ሁኔታዎች",
    "Search event, category or submitter...": "ዝግጅት፣ ምድብ ወይም አቅራቢ ይፈልጉ...",
    "Search reviewer...": "ገምጋሚ ይፈልጉ...",
    Reviewer: "ገምጋሚ",
    Decision: "ውሳኔ",
    "Date Reviewed": "የተገመገመበት ቀን",
    Reason: "ምክንያት",
    Approved: "ጸድቋል",
    Rejected: "ውድቅ ተደርጓል",
    Pending: "በመጠባበቅ ላይ",
    Receipt: "ደረሰኝ",
    "View Receipt": "ደረሰኝ ይመልከቱ",
    "You do not have permission to review expense approvals.": "የወጪ ማጽደቆችን ለመገምገም ፍቃድ የለዎትም።",
    "Your session has expired. Please sign in again.": "ክፍለ ጊዜዎ አብቅቷል። እባክዎ እንደገና ይግቡ።",
    "Network problem — could not reach the server.": "የኔትወርክ ችግር — ሰርቨሩን ማግኘት አልተቻለም።",
    "Something went wrong loading the queue.": "ዝርዝሩን በመጫን ላይ ችግር ተፈጥሯል።",
    "Reference": "ማጣቀሻ",
    "Retry": "እንደገና ሞክር"
  },
};

const categoryStyles: Record<string, string> = {
  Fuel: "bg-orange-500/10 text-orange-500 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30",
  Labor: "bg-blue-500/10 text-blue-500 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30",
  Transportation: "bg-purple-500/10 text-purple-500 border-purple-500/20 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30",
  "Equipment Rental": "bg-indigo-500/10 text-indigo-500 border-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/30",
  Consumables: "bg-teal-500/10 text-teal-500 border-teal-500/20 dark:bg-teal-500/20 dark:text-teal-400 dark:border-teal-500/30",
  Other: "bg-slate-500/10 text-slate-500 border-slate-500/20 dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-500/30",
};

function formatCurrency(value?: number | string | null) {
  return `ETB ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ExpenseApprovalContent() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Tab State
  const activeTab = searchParams.get("tab") === "history" ? "history" : "pending";

  // Search & Filter State
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") || "");
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("q") || "");
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get("category") || "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "");
  const [reviewerInput, setReviewerInput] = useState(() => searchParams.get("reviewer") || "");
  const [reviewerTerm, setReviewerTerm] = useState(() => searchParams.get("reviewer") || "");
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("date_from") || "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("date_to") || "");
  const [amountMin, setAmountMin] = useState(() => searchParams.get("amount_min") || "");
  const [amountMax, setAmountMax] = useState(() => searchParams.get("amount_max") || "");

  // Pagination & Sort State
  const [page, setPage] = useState(() => parseInt(searchParams.get("page") || "1", 10));
  const [sortBy, setSortBy] = useState(() => searchParams.get("sort_by") || "created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => (searchParams.get("sort_order") === "asc" ? "asc" : "desc"));

  // Inline comment state
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);

  const { hasPermission, isLoading: authLoading, isAuthenticated } = useAuth();

  // Redirect only truly unauthenticated users to login. Authenticated users who
  // lack the approval permission get an explicit forbidden state instead of a
  // silent bounce (issue #148).
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Sync Search Debounce
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchInput]);

  // Sync Reviewer Debounce
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setReviewerTerm(reviewerInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [reviewerInput]);

  // Sync Filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTab === "history") params.set("tab", "history");
    if (searchTerm) params.set("q", searchTerm);
    if (categoryFilter) params.set("category", categoryFilter);
    if (statusFilter && activeTab === "history") params.set("status", statusFilter);
    if (reviewerTerm && activeTab === "history") params.set("reviewer", reviewerTerm);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (amountMin) params.set("amount_min", amountMin);
    if (amountMax) params.set("amount_max", amountMax);
    if (page > 1) params.set("page", String(page));
    if (sortBy) {
      params.set("sort_by", sortBy);
      params.set("sort_order", sortOrder);
    }

    const queryStr = params.toString();
    const nextUrl = queryStr ? `${pathname}?${queryStr}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [
    activeTab,
    searchTerm,
    categoryFilter,
    statusFilter,
    reviewerTerm,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    page,
    sortBy,
    sortOrder,
    pathname,
    router
  ]);

  // Reset page when filters change
  const handleFilterChange = (setter: (v: string) => void, val: string) => {
    setter(val);
    setPage(1);
  };

  const handleTabChange = (tab: "pending" | "history") => {
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (tab === "history") {
      params.set("tab", "history");
    } else {
      params.delete("tab");
      params.delete("status");
      params.delete("reviewer");
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Queries
  const queryParams = {
    page,
    limit: 15,
    search: searchTerm,
    category: categoryFilter || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    amount_min: amountMin || undefined,
    amount_max: amountMax || undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
    ...(activeTab === "history" ? {
      status: statusFilter || undefined,
      reviewer: reviewerTerm || undefined,
    } : {})
  };

  const pendingQuery = useQuery({
    queryKey: ["pending-event-expenses", queryParams],
    queryFn: () => getPendingEventExpenses(queryParams),
    enabled: isAuthenticated && hasPermission("expenses:approve") && activeTab === "pending",
  });

  const historyQuery = useQuery({
    queryKey: ["history-event-expenses", queryParams],
    queryFn: () => getExpenseHistory(queryParams),
    enabled: isAuthenticated && hasPermission("expenses:approve") && activeTab === "history",
  });

  const reviewMutation = useMutation({
    mutationFn: (payload: { id: string; status: "Approved" | "Rejected"; rejected_reason?: string | null }) =>
      reviewEventExpense(payload.id, { status: payload.status, rejected_reason: payload.rejected_reason }),
    onSuccess: (_data, variables) => {
      toast.success(variables.status === "Approved" ? t("Expense approved") : t("Expense rejected"));
      setReviewComments((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      });
      setExpandedExpenseId(null);
      queryClient.invalidateQueries({ queryKey: ["pending-event-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["history-event-expenses"] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      toast.error(err.response?.data?.error || err.message || t("Reason required"));
    },
  });

  const activeQuery = activeTab === "pending" ? pendingQuery : historyQuery;
  const expensesList = activeQuery.data?.data || [];
  const totalRecords = activeQuery.data?.total || 0;
  const totalPages = activeQuery.data?.totalPages || 1;
  const safePage = Math.min(page, totalPages) || 1;

  const handleSort = (key: string, order: "asc" | "desc") => {
    setSortBy(key);
    setSortOrder(order);
    setPage(1);
  };

  if (authLoading || !isAuthenticated) {
    return (
      <AuthLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  if (!hasPermission("expenses:approve")) {
    return (
      <AuthLayout>
        <ForbiddenState description={t("You do not have permission to review expense approvals.")} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="page-container-lg space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/80 pb-5">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 dl-radius-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              <HiClipboardDocumentList className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-foreground tracking-tight">{t("Expense Approval Queue")}</h1>
                <span className="px-2.5 py-0.5 text-[10px] font-black bg-primary/10 text-primary dl-radius-lg uppercase tracking-wider animate-pulse">
                  {totalRecords} {t(activeTab === "pending" ? "Pending" : "Total")}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground font-semibold leading-relaxed">
                {t("Review pending event expenses before they affect event cost and profit.")}
              </p>
            </div>
          </div>

          {/* Dual Tabs Trigger */}
          <div className="flex bg-muted p-1 dl-radius-xl border border-border self-start md:self-center">
            <button
              onClick={() => handleTabChange("pending")}
              className={cn(
                "px-4 py-2 text-xs font-bold dl-radius-lg transition-all duration-200 select-none cursor-pointer",
                activeTab === "pending" ? "bg-primary text-primary-foreground" : "text-muted-foreground [@media(hover:hover)]:hover:text-foreground"
              )}
            >
              {t("Pending Queue")}
            </button>
            <button
              onClick={() => handleTabChange("history")}
              className={cn(
                "px-4 py-2 text-xs font-bold dl-radius-lg transition-all duration-200 select-none cursor-pointer",
                activeTab === "history" ? "bg-primary text-primary-foreground" : "text-muted-foreground [@media(hover:hover)]:hover:text-foreground"
              )}
            >
              {t("History")}
            </button>
          </div>
        </div>

        {/* Global Filter Toolbar */}
        <div className="bg-card border border-border/80 dl-radius-2xl p-4 space-y-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search Input */}
            <div className="flex flex-col gap-1">
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("Search event, category or submitter...")}
                className="bg-card-alt border-border text-xs h-[40px] dl-radius-lg"
              />
            </div>

            {/* Category Select */}
            <div className="flex flex-col gap-1">
              <Select
                value={categoryFilter}
                onChange={(v) => handleFilterChange(setCategoryFilter, v)}
                options={[
                  { id: "", label: t("All Categories") },
                  { id: "Fuel", label: t("Fuel") },
                  { id: "Labor", label: t("Labor") },
                  { id: "Transportation", label: t("Transportation") },
                  { id: "Equipment Rental", label: t("Equipment Rental") },
                  { id: "Consumables", label: t("Consumables") },
                  { id: "Other", label: t("Other") },
                ]}
              />
            </div>

            {/* Date Filters */}
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => handleFilterChange(setDateFrom, e.target.value)}
                placeholder={t("Date From")}
                className="bg-card-alt border-border text-xs h-[40px] dl-radius-lg w-full"
              />
              <span className="text-muted-foreground text-xs">-</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => handleFilterChange(setDateTo, e.target.value)}
                placeholder={t("Date To")}
                className="bg-card-alt border-border text-xs h-[40px] dl-radius-lg w-full"
              />
            </div>

            {/* Amount Filters */}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={amountMin}
                onChange={(e) => handleFilterChange(setAmountMin, e.target.value)}
                placeholder={t("Min Amount")}
                className="bg-card-alt border-border text-xs h-[40px] dl-radius-lg w-full"
              />
              <span className="text-muted-foreground text-xs">-</span>
              <Input
                type="number"
                value={amountMax}
                onChange={(e) => handleFilterChange(setAmountMax, e.target.value)}
                placeholder={t("Max Amount")}
                className="bg-card-alt border-border text-xs h-[40px] dl-radius-lg w-full"
              />
            </div>
          </div>

          {/* History Tab Extra Filters */}
          {activeTab === "history" && (
            <div className="grid gap-3 sm:grid-cols-2 border-t border-border/40 pt-3">
              {/* Status Select */}
              <div className="flex flex-col gap-1">
                <Select
                  value={statusFilter}
                  onChange={(v) => handleFilterChange(setStatusFilter, v)}
                  options={[
                    { id: "", label: t("All Statuses") },
                    { id: "Approved", label: t("Approved") },
                    { id: "Rejected", label: t("Rejected") },
                  ]}
                />
              </div>

              {/* Reviewer Search */}
              <div className="flex flex-col gap-1">
                <Input
                  value={reviewerInput}
                  onChange={(e) => setReviewerInput(e.target.value)}
                  placeholder={t("Search reviewer...")}
                  className="bg-card-alt border-border text-xs h-[40px] dl-radius-lg"
                />
              </div>
            </div>
          )}
        </div>

        {/* Query Loading/Error States */}
        {activeQuery.isError ? (
          (() => {
            const info = classifyLoadError(activeQuery.error);
            const message =
              info.kind === "forbidden" ? t("You do not have permission to review expense approvals.")
              : info.kind === "auth" ? t("Your session has expired. Please sign in again.")
              : info.kind === "network" ? t("Network problem — could not reach the server.")
              : t("Something went wrong loading the queue.");
            return (
              <div className="dl-radius-2xl border border-rose-500/25 bg-rose-500/5 p-6 text-center space-y-3">
                <p className="text-sm text-rose-600 dark:text-rose-400 font-bold">{message}</p>
                {info.reference && (
                  <p className="text-[11px] text-muted-foreground font-mono">{t("Reference")}: {info.reference}</p>
                )}
                {info.kind !== "forbidden" && (
                  <button
                    type="button"
                    onClick={() => activeQuery.refetch()}
                    className="inline-flex items-center justify-center h-9 px-4 dl-radius-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider active:scale-[0.98] transition-transform"
                  >
                    {t("Retry")}
                  </button>
                )}
              </div>
            );
          })()
        ) : activeQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full animate-pulse" />
            <Skeleton className="h-20 w-full animate-pulse" />
          </div>
        ) : expensesList.length === 0 ? (
          <div className="dl-radius-2xl border border-border bg-card p-8 text-center text-xs text-muted-foreground font-semibold">
            {t(activeTab === "pending" ? "No pending expenses." : "No history records found.")}
          </div>
        ) : (
          <div className="space-y-5">
            {activeTab === "pending" ? (
              /* PENDING TAB CARD LAYOUT */
              <div className="space-y-4">
                {expensesList.map((expense: EventExpense) => {
                  const comment = reviewComments[expense.id] || "";
                  const categoryClass = categoryStyles[expense.category] || "bg-card-alt text-muted border-border/80";
                  const isExpanded = expandedExpenseId === expense.id;

                  return (
                    <div
                      key={expense.id}
                      className="bg-card border border-border/70 dl-radius-2xl shadow-sm hover:shadow-md hover:border-border/90 transition-all duration-300 relative overflow-hidden group p-5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <h2 className="text-base font-extrabold text-foreground tracking-tight group-hover:text-primary transition-colors">
                              {expense.event_name || t("Event")}
                            </h2>
                            <span className={cn("dl-radius-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider", categoryClass)}>
                              {t(expense.category)}
                            </span>
                            <StatusBadge status="Pending" />
                          </div>
                          
                          <p className="mt-2 text-xs font-semibold text-muted-foreground leading-relaxed max-w-3xl">
                            {expense.description || <span className="italic opacity-60">No description provided</span>}
                          </p>

                          <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-1.5 text-[11px] font-medium text-muted-foreground">
                            <div>
                              <span className="opacity-60">{t("Client")}:</span>{" "}
                              <span className="font-extrabold text-foreground">{expense.client_name || "-"}</span>
                            </div>
                            <div>
                              <span className="opacity-60">{t("Submitted")}:</span>{" "}
                              <span className="font-extrabold text-foreground">{expense.submitted_by_name || "-"}</span>
                            </div>
                            {expense.created_at && (
                              <div>
                                <span className="opacity-60">{t("Submitted Date") || "Date"}:</span>{" "}
                                <span className="font-extrabold text-foreground">{new Date(expense.created_at).toLocaleDateString()}</span>
                              </div>
                            )}
                            {expense.receipt_image_key && (
                              <div className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 dl-radius-lg border border-amber-500/20">
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-extrabold uppercase">{t("Receipt")}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-5 shrink-0 self-end sm:self-center">
                          <div className="text-right">
                            <span className="block text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60">{t("Amount")}</span>
                            <span className="font-black text-amber-500 text-base tracking-wide tabular-nums font-mono">{formatCurrency(expense.amount)}</span>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => setExpandedExpenseId(isExpanded ? null : expense.id)}
                            className={cn(
                              "flex items-center gap-1.5 px-6 py-2.5 dl-radius-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-250 active:scale-95 group/btn shadow-sm cursor-pointer select-none",
                              isExpanded
                                ? "bg-primary/20 text-primary border border-primary/45"
                                : "bg-primary/5 hover:bg-primary/15 border border-primary/20 hover:border-primary/40 text-primary"
                            )}
                          >
                            <span>{isExpanded ? t("Collapse") : t("Review")}</span>
                            <HiChevronDown className={cn("w-4 h-4 transition-transform duration-250", isExpanded ? "rotate-180" : "group-hover/btn:translate-y-0.5")} />
                          </button>
                        </div>
                      </div>

                      {/* Expandable Actions */}
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="mt-4 pt-4 border-t border-border/45">
                              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end bg-card-alt/45 p-4 dl-radius-xl border border-border/40">
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 px-1">
                                    {t("Review comment")}
                                  </label>
                                  <Input
                                    value={comment}
                                    onChange={(eventChange) => setReviewComments((current) => ({ ...current, [expense.id]: eventChange.target.value }))}
                                    placeholder={t("Enter comment or reject reason...")}
                                    className="bg-card border-border/80 focus:border-primary/50 text-xs h-[40px] dl-radius-lg"
                                  />
                                </div>
                                
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    disabled={reviewMutation.isPending}
                                    onClick={() => reviewMutation.mutate({ id: expense.id, status: "Approved" })}
                                    className="h-10 px-5 dl-radius-xl text-xs font-black uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                                  >
                                    <HiCheck className="h-4.5 w-4.5" />
                                    <span>{t("Approve")}</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={reviewMutation.isPending}
                                    onClick={() => {
                                      if (!comment.trim()) {
                                        toast.error(t("Reason required"));
                                        return;
                                      }
                                      reviewMutation.mutate({ id: expense.id, status: "Rejected", rejected_reason: comment });
                                    }}
                                    className="h-10 px-5 dl-radius-xl text-xs font-black uppercase tracking-wider bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:border-rose-500/40 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                                  >
                                    <HiXMark className="h-4.5 w-4.5" />
                                    <span>{t("Reject")}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* HISTORY TAB TABLE LAYOUT */
              <div className="bg-card border border-border/80 dl-radius-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border/80 bg-muted/30">
                        <th className="p-4 text-xs font-semibold">
                          <SortableHeader
                            label={t("Event")}
                            sortKey="event_name"
                            currentSortBy={sortBy}
                            currentSortOrder={sortOrder}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="p-4 text-xs font-semibold">
                          <SortableHeader
                            label={t("Category")}
                            sortKey="category"
                            currentSortBy={sortBy}
                            currentSortOrder={sortOrder}
                            onSort={handleSort}
                          />
                        </th>
                        <th className="p-4 text-xs font-semibold text-right">
                          <SortableHeader
                            label={t("Amount")}
                            sortKey="amount"
                            currentSortBy={sortBy}
                            currentSortOrder={sortOrder}
                            onSort={handleSort}
                            align="right"
                          />
                        </th>
                        <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-[0.2em] text-[10px]">
                          {t("Submitted")}
                        </th>
                        <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-[0.2em] text-[10px]">
                          {t("Reviewer")}
                        </th>
                        <th className="p-4 text-xs font-semibold text-center">
                          <SortableHeader
                            label={t("Decision")}
                            sortKey="status"
                            currentSortBy={sortBy}
                            currentSortOrder={sortOrder}
                            onSort={handleSort}
                            align="center"
                          />
                        </th>
                        <th className="p-4 text-xs font-semibold text-right">
                          <SortableHeader
                            label={t("Date Reviewed")}
                            sortKey="approved_at"
                            currentSortBy={sortBy}
                            currentSortOrder={sortOrder}
                            onSort={handleSort}
                            align="right"
                          />
                        </th>
                        <th className="p-4 text-xs font-semibold text-muted-foreground uppercase tracking-[0.2em] text-[10px]">
                          {t("Reason")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {expensesList.map((expense: EventExpense) => {
                        const categoryClass = categoryStyles[expense.category] || "bg-card-alt text-muted border-border/80";
                        return (
                          <tr
                            key={expense.id}
                            className="border-b border-border/60 hover:bg-card-alt/40 transition-colors duration-150"
                          >
                            <td className="p-4 text-xs font-bold text-foreground max-w-[150px] truncate">
                              {expense.event_name || "-"}
                            </td>
                            <td className="p-4">
                              <span className={cn("dl-radius-xl border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider", categoryClass)}>
                                {t(expense.category)}
                              </span>
                            </td>
                            <td className="p-4 text-xs font-black text-right text-amber-500 tabular-nums font-mono">
                              {formatCurrency(expense.amount)}
                            </td>
                            <td className="p-4 text-xs font-semibold text-muted-foreground">
                              {expense.submitted_by_name || "-"}
                            </td>
                            <td className="p-4 text-xs font-semibold text-muted-foreground">
                              {expense.approved_by_name || "-"}
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex justify-center">
                                <StatusBadge status={expense.status} />
                              </div>
                            </td>
                            <td className="p-4 text-xs font-semibold text-muted-foreground text-right">
                              {expense.approved_at ? new Date(expense.approved_at).toLocaleDateString() : "-"}
                            </td>
                            <td className="p-4 text-xs text-muted-foreground max-w-[200px] truncate" title={expense.rejected_reason || ""}>
                              {expense.rejected_reason || "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <PaginationControls page={safePage} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
    </AuthLayout>
  );
}

export default function ExpenseApprovalPage() {
  return (
    <Suspense
      fallback={
        <AuthLayout>
          <div className="flex h-[50vh] items-center justify-center">
            <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        </AuthLayout>
      }
    >
      <ExpenseApprovalContent />
    </Suspense>
  );
}
