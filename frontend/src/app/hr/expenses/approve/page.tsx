"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { HiCheckCircle, HiXCircle } from "react-icons/hi2";

import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getPendingEventExpenses, reviewEventExpense } from "@/lib/api";
import type { EventExpense } from "@/lib/types";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";

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
  },
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
      queryClient.invalidateQueries({ queryKey: ["pending-event-expenses"] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      toast.error(err.response?.data?.error || err.message || t("Reason required"));
    },
  });

  if (authLoading || !isAuthenticated || !hasPermission("expenses:approve")) {
    return (
      <AuthLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  const expenses = expensesQuery.data || [];

  return (
    <AuthLayout>
      <div className="page-container-lg space-y-5">
        <div className="border-b border-border pb-5">
          <h1 className="text-2xl font-black text-foreground">{t("Expense Approval Queue")}</h1>
          <p className="mt-1 text-sm text-muted">{t("Review pending event expenses before they affect event cost and profit.")}</p>
        </div>

        {expensesQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted">{t("No pending expenses.")}</div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {expenses.map((expense: EventExpense) => {
              const comment = reviewComments[expense.id] || "";
              return (
                <div key={expense.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_280px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold text-foreground">{expense.event_name || t("Event")}</h2>
                      <span className="rounded border border-border bg-card-alt px-2 py-0.5 text-xs font-semibold text-muted">{t(expense.category)}</span>
                    </div>
                    <div className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-2">
                      <div>{t("Client")}: <span className="font-semibold text-foreground">{expense.client_name || "-"}</span></div>
                      <div>{t("Amount")}: <span className="font-semibold text-foreground">{formatCurrency(expense.amount)}</span></div>
                      <div className="sm:col-span-2">{expense.description}</div>
                      <div>{t("Submitted")}: <span className="font-semibold text-foreground">{expense.submitted_by_name || "-"}</span></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Input
                      value={comment}
                      onChange={(eventChange) => setReviewComments((current) => ({ ...current, [expense.id]: eventChange.target.value }))}
                      placeholder={t("Review comment")}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        loading={reviewMutation.isPending}
                        onClick={() => reviewMutation.mutate({ id: expense.id, status: "Approved" })}
                      >
                        <HiCheckCircle className="h-4 w-4" />
                        {t("Approve")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        loading={reviewMutation.isPending}
                        onClick={() => {
                          if (!comment.trim()) {
                            toast.error(t("Reason required"));
                            return;
                          }
                          reviewMutation.mutate({ id: expense.id, status: "Rejected", rejected_reason: comment });
                        }}
                      >
                        <HiXCircle className="h-4 w-4" />
                        {t("Reject")}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
