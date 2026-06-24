"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { HiCheck, HiXMark, HiClipboardDocumentList, HiChevronDown } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";

import AuthLayout from "@/components/AuthLayout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import PaginationControls from "@/components/PaginationControls";
import { getPendingEventExpenses, reviewEventExpense } from "@/lib/api";
import type { EventExpense } from "@/lib/types";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Expense Approval Queue": "Expense Approval Queue",
    "Review pending event expenses before they affect event cost and profit.": "Review pending event expenses before they affect event cost and profit.",
    "No pending expenses.": "No pending expenses.",
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
  },
  am: {
    "Expense Approval Queue": "የወጪ ማጽደቂያ ዝርዝር",
    "Review pending event expenses before they affect event cost and profit.": "የዝግጅት ወጪና ትርፍ ከመቀየሩ በፊት በመጠባበቅ ላይ ያሉ ወጪዎችን ይመልከቱ።",
    "No pending expenses.": "በመጠባበቅ ላይ ያለ ወጪ የለም።",
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
  return `ETB ${Number(value || 0).toLocaleString()}`;
}

export default function ExpenseApprovalPage() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const limit = 10;

  const { hasPermission, isLoading: authLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        router.replace("/login");
      } else if (!hasPermission("expenses:approve")) {
        router.replace("/");
      }
    }
  }, [authLoading, isAuthenticated, hasPermission, router]);

  const expensesQuery = useQuery({
    queryKey: ["pending-event-expenses"],
    queryFn: getPendingEventExpenses,
    enabled: isAuthenticated && hasPermission("expenses:approve"),
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
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      toast.error(err.response?.data?.error || err.message || t("Reason required"));
    },
  });

  const expenses = expensesQuery.data || [];
  const totalPages = Math.ceil(expenses.length / limit) || 1;
  const safePage = Math.min(page, totalPages);
  const paginatedExpenses = expenses.slice((safePage - 1) * limit, safePage * limit);

  if (authLoading || !isAuthenticated || !hasPermission("expenses:approve")) {
    return (
      <AuthLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="page-container-lg space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-5">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20 shrink-0">
              <HiClipboardDocumentList className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-foreground tracking-tight">{t("Expense Approval Queue")}</h1>
                <span className="px-2.5 py-0.5 text-[10px] font-black bg-primary/10 text-primary rounded-full uppercase tracking-wider animate-pulse">
                  {expenses.length} {t("Pending")}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground font-semibold leading-relaxed">
                {t("Review pending event expenses before they affect event cost and profit.")}
              </p>
            </div>
          </div>
        </div>

        {expensesQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full animate-pulse" />
            <Skeleton className="h-20 w-full animate-pulse" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted">{t("No pending expenses.")}</div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-4">
              {paginatedExpenses.map((expense: EventExpense) => {
                const comment = reviewComments[expense.id] || "";
                const categoryClass = categoryStyles[expense.category] || "bg-card-alt text-muted border-border/80";
                const isExpanded = expandedExpenseId === expense.id;
                
                return (
                  <div
                    key={expense.id}
                    className="bg-card border border-border/70 rounded-2xl shadow-sm hover:shadow-md hover:border-border/90 transition-all duration-300 relative overflow-hidden group p-5"
                  >
                    {/* Visual accent bar on the left */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary/60 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    
                    {/* Compact Main Row Layout */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h2 className="text-base font-extrabold text-foreground tracking-tight group-hover:text-primary transition-colors">
                            {expense.event_name || t("Event")}
                          </h2>
                          <span className={cn("rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider", categoryClass)}>
                            {t(expense.category)}
                          </span>
                        </div>
                        
                        <p className="mt-2 text-xs font-semibold text-muted-foreground leading-relaxed max-w-3xl">
                          {expense.description || <span className="italic opacity-60">No description provided</span>}
                        </p>

                        <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-1.5 text-xs font-medium text-muted-foreground">
                          <div>
                            <span className="opacity-60">{t("Client")}:</span>{" "}
                            <span className="font-extrabold text-foreground">{expense.client_name || "-"}</span>
                          </div>
                          <div>
                            <span className="opacity-60">{t("Submitted")}:</span>{" "}
                            <span className="font-extrabold text-foreground">{expense.submitted_by_name || "-"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Hand Stats + Toggle Actions */}
                      <div className="flex items-center gap-5 shrink-0 self-end sm:self-center">
                        <div className="text-right">
                          <span className="block text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60">{t("Amount")}</span>
                          <span className="font-black text-amber-500 text-base tracking-wide">{formatCurrency(expense.amount)}</span>
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => setExpandedExpenseId(isExpanded ? null : expense.id)}
                          className={cn(
                            "flex items-center gap-1.5 px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-250 active:scale-95 group/btn shadow-sm cursor-pointer select-none",
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

                    {/* Expandable Review Comment & Decent Action Buttons */}
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
                            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end bg-card-alt/45 p-4 rounded-xl border border-border/40">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 px-1">
                                  {t("Review comment")}
                                </label>
                                <Input
                                  value={comment}
                                  onChange={(eventChange) => setReviewComments((current) => ({ ...current, [expense.id]: eventChange.target.value }))}
                                  placeholder={t("Enter comment or reject reason...")}
                                  className="bg-card border-border/80 focus:border-primary/50 text-xs h-[40px] rounded-lg"
                                />
                              </div>
                              
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  disabled={reviewMutation.isPending}
                                  onClick={() => reviewMutation.mutate({ id: expense.id, status: "Approved" })}
                                  className="h-10 px-5 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
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
                                  className="h-10 px-5 rounded-xl text-xs font-black uppercase tracking-wider bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:border-rose-500/40 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
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
            <PaginationControls page={safePage} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
