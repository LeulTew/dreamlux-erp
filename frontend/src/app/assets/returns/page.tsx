"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HiArchiveBoxArrowDown, HiArrowLeft, HiArrowRight, HiCheckCircle } from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import ForbiddenState from "@/components/ForbiddenState";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "@/components/ui/StatusBadge";
import toast from "@/lib/toast";
import { getReturnQueue, getEventReturns, recordEventReturn } from "@/lib/api";
import type { ReturnQueueEntry, EventReturnAllocation, EventReturnReceipt } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/use-language";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Inventory Returns": "Inventory Returns",
    "Reconcile dispatched items back into inventory, item by item.": "Reconcile dispatched items back into inventory, item by item.",
    "Events": "Events",
    "Outstanding": "Outstanding",
    "Accounted": "Accounted",
    "Dispatched": "Dispatched",
    "Open returns": "Open returns",
    "No returns pending.": "No returns pending.",
    "Departed allocations appear here until every item is accounted for.": "Departed allocations appear here until every item is accounted for.",
    "Back to queue": "Back to queue",
    "Good": "Good",
    "Damaged": "Damaged",
    "Lost": "Lost",
    "Repair": "Repair",
    "Notes": "Notes",
    "Record return": "Record return",
    "Return recorded": "Return recorded",
    "Fully returned": "Fully returned",
    "Enter at least one quantity": "Enter at least one quantity",
    "Exceeds outstanding quantity": "Exceeds outstanding quantity",
    "Receipt history": "Receipt history",
    "Failed to load returns.": "Failed to load returns.",
    "Retry": "Retry",
    "outstanding": "outstanding",
    "of": "of",
  },
  am: {
    "Inventory Returns": "የክምችት መመለሻዎች",
    "Reconcile dispatched items back into inventory, item by item.": "የተላኩ እቃዎችን በአንድ በአንድ ወደ ክምችት ያስታርቁ።",
    "Events": "ዝግጅቶች",
    "Outstanding": "ያልተመለሰ",
    "Accounted": "የተመዘገበ",
    "Dispatched": "የተላከ",
    "Open returns": "መመለሻ ክፈት",
    "No returns pending.": "በመጠባበቅ ላይ ያለ መመለሻ የለም።",
    "Departed allocations appear here until every item is accounted for.": "የተነሱ ምደባዎች ሁሉም እቃ እስኪመዘገብ ድረስ እዚህ ይታያሉ።",
    "Back to queue": "ወደ ተራው ተመለስ",
    "Good": "ጤናማ",
    "Damaged": "የተበላሸ",
    "Lost": "የጠፋ",
    "Repair": "በጥገና",
    "Notes": "ማስታወሻ",
    "Record return": "መመለሻ መዝግብ",
    "Return recorded": "መመለሻ ተመዝግቧል",
    "Fully returned": "ሙሉ በሙሉ ተመልሷል",
    "Enter at least one quantity": "ቢያንስ አንድ ብዛት ያስገቡ",
    "Exceeds outstanding quantity": "ካልተመለሰው ብዛት ይበልጣል",
    "Receipt history": "የደረሰኝ ታሪክ",
    "Failed to load returns.": "መመለሻዎችን መጫን አልተሳካም።",
    "Retry": "እንደገና ሞክር",
    "outstanding": "ያልተመለሰ",
    "of": "ከ",
  },
};

type ReturnFormState = {
  good: string;
  damaged: string;
  lost: string;
  repair: string;
  notes: string;
  idempotencyKey: string;
};

const emptyForm = (): ReturnFormState => ({
  good: "",
  damaged: "",
  lost: "",
  repair: "",
  notes: "",
  idempotencyKey: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
});

function toQty(value: string): number {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ET", { month: "short", day: "2-digit", year: "numeric" }).format(date);
}

function ReturnsContent() {
  const { hasPermission, isAuthenticated, isLoading } = useAuth();
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const canManageReturns = hasPermission("event_allocations:write") || hasPermission("assets:write");
  const selectedEventId = searchParams.get("event");
  const [forms, setForms] = useState<Record<string, ReturnFormState>>({});

  const queueQuery = useQuery<{ queue: ReturnQueueEntry[]; total: number }>({
    queryKey: ["event-return-queue"],
    queryFn: () => getReturnQueue(),
    enabled: isAuthenticated && canManageReturns && !selectedEventId,
  });

  const detailQuery = useQuery<{
    event: { id: string; name: string; client_name: string | null; status: string };
    allocations: EventReturnAllocation[];
    receipts: EventReturnReceipt[];
  }>({
    queryKey: ["event-returns", selectedEventId],
    queryFn: () => getEventReturns(selectedEventId as string),
    enabled: isAuthenticated && canManageReturns && Boolean(selectedEventId),
  });

  const recordMutation = useMutation({
    mutationFn: ({ allocationId, payload }: {
      allocationId: string;
      payload: { good_quantity: number; damaged_quantity: number; lost_quantity: number; repair_quantity: number; notes: string | null; idempotency_key: string };
    }) => recordEventReturn(selectedEventId as string, allocationId, payload),
    onSuccess: (data: { fully_returned: boolean }, variables) => {
      toast.success(data.fully_returned ? t("Fully returned") : t("Return recorded"));
      setForms((prev) => ({ ...prev, [variables.allocationId]: emptyForm() }));
      queryClient.invalidateQueries({ queryKey: ["event-returns", selectedEventId] });
      queryClient.invalidateQueries({ queryKey: ["event-return-queue"] });
      // Availability and stock views change when returns land.
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["event-workspace"] });
    },
    onError: (err: unknown) => {
      const error = err as Error & { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || error.message || "Failed to record the return");
    },
  });

  if (isLoading) {
    return (
      <AuthLayout>
        <div className="page-container-lg space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AuthLayout>
    );
  }

  if (!isAuthenticated || !canManageReturns) {
    return (
      <AuthLayout>
        <ForbiddenState title="Access Restricted" description="Only authorized personnel can process inventory returns." />
      </AuthLayout>
    );
  }

  const getForm = (allocationId: string): ReturnFormState => forms[allocationId] ?? emptyForm();
  const setFormField = (allocationId: string, field: keyof ReturnFormState, value: string) => {
    setForms((prev) => ({ ...prev, [allocationId]: { ...getForm(allocationId), [field]: value } }));
  };

  const handleRecord = (allocation: EventReturnAllocation) => {
    const form = getForm(allocation.id);
    const good = toQty(form.good);
    const damaged = toQty(form.damaged);
    const lost = toQty(form.lost);
    const repair = toQty(form.repair);
    const quantities = [good, damaged, lost, repair];
    if (quantities.some((q) => Number.isNaN(q) || q < 0 || !Number.isInteger(q))) {
      toast.error(t("Enter at least one quantity"));
      return;
    }
    const total = good + damaged + lost + repair;
    if (total <= 0) {
      toast.error(t("Enter at least one quantity"));
      return;
    }
    if (total > allocation.outstanding_quantity) {
      toast.error(`${t("Exceeds outstanding quantity")} (${allocation.outstanding_quantity})`);
      return;
    }
    recordMutation.mutate({
      allocationId: allocation.id,
      payload: {
        good_quantity: good,
        damaged_quantity: damaged,
        lost_quantity: lost,
        repair_quantity: repair,
        notes: form.notes.trim() || null,
        idempotency_key: form.idempotencyKey,
      },
    });
  };

  // ----- Event detail view -----
  if (selectedEventId) {
    const detail = detailQuery.data;
    const receiptsByAllocation = new Map<string, EventReturnReceipt[]>();
    for (const receipt of detail?.receipts ?? []) {
      const list = receiptsByAllocation.get(receipt.allocation_id) ?? [];
      list.push(receipt);
      receiptsByAllocation.set(receipt.allocation_id, list);
    }

    return (
      <AuthLayout>
        <div className="page-container-lg space-y-5">
          <button
            type="button"
            onClick={() => router.push(pathname)}
            className="inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-widest text-muted [@media(hover:hover)]:hover:text-foreground transition-colors"
          >
            <HiArrowLeft className="h-4 w-4" />
            {t("Back to queue")}
          </button>

          {detailQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : detailQuery.isError || !detail ? (
            <div className="rounded-md border border-danger/30 bg-danger/5 p-6 text-center">
              <p className="text-sm font-bold text-danger">{t("Failed to load returns.")}</p>
              <button
                type="button"
                onClick={() => detailQuery.refetch()}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-4 text-xs font-black uppercase tracking-widest text-foreground"
              >
                {t("Retry")}
              </button>
            </div>
          ) : (
            <>
              <div className="border-b border-border pb-4">
                <h1 className="text-lg 2xl:text-2xl font-bold text-foreground tracking-tight">{detail.event.name}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
                  {detail.event.client_name && <span>{detail.event.client_name}</span>}
                  <StatusBadge status={detail.event.status} />
                </div>
              </div>

              <div className="space-y-4">
                {detail.allocations.map((allocation) => {
                  const form = getForm(allocation.id);
                  const receipts = receiptsByAllocation.get(allocation.id) ?? [];
                  const isClosed = allocation.status === "Returned";
                  return (
                    <section key={allocation.id} className="rounded-md border border-border bg-card p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-sm font-black text-foreground">
                            {allocation.item_name}
                            <span className="ml-2 text-xs font-semibold text-muted">
                              {allocation.quantity_allocated} {allocation.unit_of_measurement || "pcs"}
                              {allocation.store_name ? ` · ${allocation.store_name}` : ""}
                            </span>
                          </h2>
                          <div className="mt-1 text-[11px] font-semibold text-muted tabular-nums">
                            {t("Good")} {allocation.returned_good_quantity} · {t("Damaged")} {allocation.returned_damaged_quantity} · {t("Lost")} {allocation.returned_lost_quantity} · {t("Repair")} {allocation.returned_repair_quantity}
                          </div>
                        </div>
                        {isClosed ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-success/25 bg-success/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-success">
                            <HiCheckCircle className="h-4 w-4" />
                            {t("Fully returned")}
                          </span>
                        ) : (
                          <span className="tabular-nums rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-black text-warning">
                            {allocation.outstanding_quantity} {t("of")} {allocation.quantity_allocated} {t("outstanding")}
                          </span>
                        )}
                      </div>

                      {!isClosed && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,110px)_minmax(0,1fr)_auto] lg:items-end">
                          {([
                            ["good", t("Good")],
                            ["damaged", t("Damaged")],
                            ["lost", t("Lost")],
                            ["repair", t("Repair")],
                          ] as const).map(([field, label]) => (
                            <div key={field}>
                              <label htmlFor={`${field}-${allocation.id}`} className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">
                                {label}
                              </label>
                              <input
                                id={`${field}-${allocation.id}`}
                                type="number"
                                min={0}
                                max={allocation.outstanding_quantity}
                                step={1}
                                value={form[field]}
                                onChange={(e) => setFormField(allocation.id, field, e.target.value)}
                                className="h-11 w-full rounded-md border border-border bg-card-alt px-3 text-sm tabular-nums text-foreground outline-none focus:ring-2 focus:ring-primary/20"
                              />
                            </div>
                          ))}
                          <div>
                            <label htmlFor={`notes-${allocation.id}`} className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">
                              {t("Notes")}
                            </label>
                            <input
                              id={`notes-${allocation.id}`}
                              type="text"
                              value={form.notes}
                              onChange={(e) => setFormField(allocation.id, "notes", e.target.value)}
                              className="h-11 w-full rounded-md border border-border bg-card-alt px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={recordMutation.isPending}
                            onClick={() => handleRecord(allocation)}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-xs font-black uppercase tracking-widest text-primary-foreground transition-colors [@media(hover:hover)]:hover:bg-primary-dark disabled:opacity-50"
                          >
                            <HiArchiveBoxArrowDown className="h-4 w-4" />
                            {t("Record return")}
                          </button>
                        </div>
                      )}

                      {receipts.length > 0 && (
                        <div className="mt-4 border-t border-border/60 pt-3">
                          <h3 className="text-[10px] font-black uppercase tracking-wider text-muted">{t("Receipt history")}</h3>
                          <ul className="mt-2 space-y-1.5">
                            {receipts.map((receipt) => (
                              <li key={receipt.id} className="text-xs font-medium text-muted tabular-nums">
                                {formatDate(receipt.created_at)} — {t("Good")} {receipt.good_quantity}, {t("Damaged")} {receipt.damaged_quantity}, {t("Lost")} {receipt.lost_quantity}, {t("Repair")} {receipt.repair_quantity}
                                {" · "}{receipt.outstanding_before} → {receipt.outstanding_after}
                                {receipt.created_by_name ? ` · ${receipt.created_by_name}` : ""}
                                {receipt.notes ? ` · ${receipt.notes}` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </AuthLayout>
    );
  }

  // ----- Queue view -----
  const queue = queueQuery.data?.queue || [];

  return (
    <AuthLayout>
      <div className="page-container-lg space-y-5">
        <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="rounded-sm bg-primary/10 p-2 text-primary">
                <HiArchiveBoxArrowDown className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg 2xl:text-2xl font-bold text-foreground tracking-tight leading-tight">{t("Inventory Returns")}</h1>
                <p className="text-[11px] text-muted font-medium leading-tight mt-1">{t("Reconcile dispatched items back into inventory, item by item.")}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:min-w-[220px]">
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <div className="tabular-nums text-3xl font-black tracking-tight text-foreground">{queue.length}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted/80 mt-1 leading-tight">{t("Events")}</div>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <div className="tabular-nums text-3xl font-black tracking-tight text-foreground">
                {queue.reduce((sum, item) => sum + Number(item.outstanding_quantity || 0), 0)}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted/80 mt-1 leading-tight">{t("Outstanding")}</div>
            </div>
          </div>
        </div>

        <section className="overflow-hidden rounded-md border border-border bg-card">
          {queueQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : queueQuery.isError ? (
            <div className="p-8 text-center">
              <p className="text-sm font-bold text-danger">{t("Failed to load returns.")}</p>
              <button
                type="button"
                onClick={() => queueQuery.refetch()}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card-alt px-4 text-xs font-black uppercase tracking-widest text-foreground"
              >
                {t("Retry")}
              </button>
            </div>
          ) : queue.length === 0 ? (
            <div className="p-8 text-center">
              <HiCheckCircle className="mx-auto h-8 w-8 text-muted" />
              <h2 className="mt-3 text-base font-black text-foreground">{t("No returns pending.")}</h2>
              <p className="mt-1 text-sm font-medium text-muted">{t("Departed allocations appear here until every item is accounted for.")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {queue.map((item) => (
                <div key={item.event_id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_240px_150px] md:items-center">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-black text-foreground">{item.event_name}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
                      {item.client_name && <span>{item.client_name}</span>}
                      <span className="opacity-40">|</span>
                      <span>{formatDate(item.start_date)} - {formatDate(item.end_date)}</span>
                      <StatusBadge status={item.event_status} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="tabular-nums text-xl font-bold tracking-tight text-foreground">{item.dispatched_quantity}</div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted/80 mt-0.5 leading-tight">{t("Dispatched")}</div>
                    </div>
                    <div>
                      <div className="tabular-nums text-xl font-bold tracking-tight text-foreground">{item.accounted_quantity}</div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted/80 mt-0.5 leading-tight">{t("Accounted")}</div>
                    </div>
                    <div>
                      <div className="tabular-nums text-xl font-bold tracking-tight text-warning">{item.outstanding_quantity}</div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted/80 mt-0.5 leading-tight">{t("Outstanding")}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`${pathname}?event=${item.event_id}`)}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-sm border border-border bg-card-alt px-4 text-xs font-black uppercase tracking-widest text-foreground transition-colors [@media(hover:hover)]:hover:border-primary/30 [@media(hover:hover)]:hover:bg-primary-light/10 [@media(hover:hover)]:hover:text-primary"
                  >
                    {t("Open returns")}
                    <HiArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AuthLayout>
  );
}

export default function ReturnsPage() {
  return (
    <Suspense
      fallback={
        <AuthLayout>
          <div className="page-container-lg space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </AuthLayout>
      }
    >
      <ReturnsContent />
    </Suspense>
  );
}
