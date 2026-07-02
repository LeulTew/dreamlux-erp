"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { HiArrowRight, HiClipboardDocumentCheck, HiTruck } from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import ForbiddenState from "@/components/ForbiddenState";
import { Skeleton } from "@/components/ui/skeleton";
import { getEventDispatchQueue } from "@/lib/api";
import type { EventDispatchQueueItem } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/use-language";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Dispatch Queue": "Dispatch Queue",
    "Storekeeper departure queue grouped by event.": "Storekeeper departure queue grouped by event.",
    "Events": "Events",
    "Allocations": "Allocations",
    "Ready": "Ready",
    "Departed": "Departed",
    "Open dispatch": "Open dispatch",
    "No dispatch work pending.": "No dispatch work pending.",
    "Check allocations from each event workspace before marking departure.": "Check allocations from each event workspace before marking departure.",
    "Pending": "Pending",
  },
  am: {
    "Dispatch Queue": "የመላኪያ ተራ",
    "Storekeeper departure queue grouped by event.": "በዝግጅት የተደራጀ የመጋዘን መነሻ ተራ።",
    "Events": "ዝግጅቶች",
    "Allocations": "ምደባዎች",
    "Ready": "ዝግጁ",
    "Departed": "ተነስቷል",
    "Open dispatch": "መላኪያ ክፈት",
    "No dispatch work pending.": "በመጠባበቅ ላይ ያለ መላኪያ የለም።",
    "Check allocations from each event workspace before marking departure.": "መነሻን ከማስመዝገብ በፊት ምደባዎችን ከየዝግጅቱ የስራ ቦታ ያረጋግጡ።",
    "Pending": "በመጠባበቅ ላይ",
  },
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ET", { month: "short", day: "2-digit", year: "numeric" }).format(date);
}

export default function DispatchQueuePage() {
  const { hasPermission, isAuthenticated, isLoading } = useAuth();
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const canManageDispatch = hasPermission("event_allocations:write") || hasPermission("assets:write");

  const queueQuery = useQuery<{ queue: EventDispatchQueueItem[] }>({
    queryKey: ["event-dispatch-queue"],
    queryFn: getEventDispatchQueue,
    enabled: isAuthenticated && canManageDispatch,
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

  if (!isAuthenticated || !canManageDispatch) {
    return (
      <AuthLayout>
        <ForbiddenState title="Access Restricted" description="Only authorized personnel can manage event dispatch." />
      </AuthLayout>
    );
  }

  const queue = queueQuery.data?.queue || [];
  const totalAllocations = queue.reduce((sum, item) => sum + Number(item.allocation_count || 0), 0);
  const totalReady = queue.reduce((sum, item) => sum + Number(item.checked_count || 0), 0);
  const totalDeparted = queue.reduce((sum, item) => sum + Number(item.departed_count || 0), 0);

  return (
    <AuthLayout>
      <div className="page-container-lg space-y-5">
        <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="rounded-sm bg-primary/10 p-2 text-primary">
                <HiTruck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg 2xl:text-2xl font-bold text-foreground tracking-tight leading-tight">{t("Dispatch Queue")}</h1>
                <p className="text-[11px] text-muted font-medium leading-tight mt-1">{t("Storekeeper departure queue grouped by event.")}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[280px]">
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <div className="tabular-nums text-3xl font-black tracking-tight text-foreground">{queue.length}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted/80 mt-1 leading-tight">{t("Events")}</div>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <div className="tabular-nums text-3xl font-black tracking-tight text-foreground">{totalReady}/{totalAllocations}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted/80 mt-1 leading-tight">{t("Ready")}</div>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <div className="tabular-nums text-3xl font-black tracking-tight text-foreground">{totalDeparted}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted/80 mt-1 leading-tight">{t("Departed")}</div>
            </div>
          </div>
        </div>

        <section className="overflow-hidden rounded-md border border-border bg-card">
          {queueQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : queue.length === 0 ? (
            <div className="p-8 text-center">
              <HiClipboardDocumentCheck className="mx-auto h-8 w-8 text-muted" />
              <h2 className="mt-3 text-base font-black text-foreground">{t("No dispatch work pending.")}</h2>
              <p className="mt-1 text-sm font-medium text-muted">{t("Check allocations from each event workspace before marking departure.")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {queue.map((item) => {
                const pendingCount = Math.max(0, Number(item.allocation_count || 0) - Number(item.checked_count || 0));
                return (
                  <div key={item.event_id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_240px_150px] md:items-center">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-black text-foreground">{item.event_name}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
                        <span>{item.client_name}</span>
                        <span className="opacity-40">|</span>
                        <span>{formatDate(item.start_date)} - {formatDate(item.end_date)}</span>
                        <span className="opacity-40">|</span>
                        <span className="truncate">{item.venue_location}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="tabular-nums text-xl font-bold tracking-tight text-foreground">{item.allocation_count}</div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted/80 mt-0.5 leading-tight">{t("Allocations")}</div>
                      </div>
                      <div>
                        <div className="tabular-nums text-xl font-bold tracking-tight text-foreground">{item.checked_count}</div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted/80 mt-0.5 leading-tight">{t("Ready")}</div>
                      </div>
                      <div>
                        <div className="tabular-nums text-xl font-bold tracking-tight text-foreground">{pendingCount}</div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted/80 mt-0.5 leading-tight">{t("Pending")}</div>
                      </div>
                    </div>
                    <Link
                      href={`/events/${item.event_id}`}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-sm border border-border bg-card-alt px-4 text-xs font-black uppercase tracking-widest text-foreground transition-colors md:hover:border-primary/30 md:hover:bg-primary-light/10 md:hover:text-primary"
                    >
                      {t("Open dispatch")}
                      <HiArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AuthLayout>
  );
}
