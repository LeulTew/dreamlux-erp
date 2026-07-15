"use client";

import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { HiArrowPath, HiArrowsRightLeft, HiOutlineInbox } from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import ForbiddenState from "@/components/ForbiddenState";
import PaginationControls from "@/components/PaginationControls";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/use-language";
import { getInventoryMovements } from "@/lib/api";
import type { InventoryMovement } from "@/lib/types";

type MovementCopy = {
  title: string; description: string; item: string; change: string; balance: string;
  source: string; recordedBy: string; recordedAt: string; empty: string;
  failed: string; retry: string; capitalInvestment: string; forbidden: string; loading: string;
};

const COPY: Record<"en" | "am", MovementCopy> = {
  en: {
    title: "Stock Movements",
    description: "Immutable inventory adjustments with their source and responsible user.",
    item: "Item",
    change: "Change",
    balance: "Balance",
    source: "Source",
    recordedBy: "Recorded by",
    recordedAt: "Recorded at",
    empty: "No stock movements match this view.",
    failed: "Stock movement history could not be loaded.",
    retry: "Try again",
    capitalInvestment: "Capital investment",
    forbidden: "Only authorized personnel can view inventory movement history.",
    loading: "Loading stock movements",
  },
  am: {
    title: "የክምችት እንቅስቃሴዎች",
    description: "ምንጭና ኃላፊ ተጠቃሚ ያላቸው የማይለወጡ የክምችት ለውጦች።",
    item: "ዕቃ",
    change: "ለውጥ",
    balance: "ቀሪ መጠን",
    source: "ምንጭ",
    recordedBy: "የመዘገበው",
    recordedAt: "የተመዘገበበት",
    empty: "ከዚህ እይታ ጋር የሚዛመድ የክምችት እንቅስቃሴ የለም።",
    failed: "የክምችት እንቅስቃሴ ታሪክ መጫን አልተቻለም።",
    retry: "እንደገና ሞክር",
    capitalInvestment: "የካፒታል ግዢ",
    forbidden: "የክምችት እንቅስቃሴ ታሪክን ማየት የሚችሉት ፈቃድ ያላቸው ሰራተኞች ብቻ ናቸው።",
    loading: "የክምችት እንቅስቃሴዎችን በመጫን ላይ",
  },
} as const;

function sourceLabel(sourceType: string, labels: MovementCopy): string {
  return sourceType === "capital_investment" ? labels.capitalInvestment : sourceType.replaceAll("_", " ");
}

function MovementRow({ movement, labels, locale }: { movement: InventoryMovement; labels: MovementCopy; locale: string }) {
  const unit = movement.unit_of_measurement || "pcs";
  return (
    <tr className="border-b border-border/60 align-top last:border-b-0">
      <td className="px-4 py-4 font-bold text-foreground">{movement.item_name}</td>
      <td className="px-4 py-4 font-mono font-bold tabular-nums text-success">+{movement.quantity_delta} {unit}</td>
      <td className="px-4 py-4 font-mono tabular-nums text-foreground">{movement.quantity_before} → {movement.quantity_after}</td>
      <td className="px-4 py-4 text-muted">
        <span className="block font-semibold text-foreground">{sourceLabel(movement.source_type, labels)}</span>
        <span className="block font-mono text-xs">{movement.source_id}</span>
      </td>
      <td className="px-4 py-4 text-muted">{movement.created_by_name || "—"}</td>
      <td className="px-4 py-4 whitespace-nowrap text-muted">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(movement.created_at))}</td>
    </tr>
  );
}

function MovementsContent() {
  const { lang } = useLanguage();
  const labels = COPY[lang === "am" ? "am" : "en"];
  const searchParams = useSearchParams();
  const sourceId = searchParams.get("sourceId") || undefined;
  const itemId = searchParams.get("itemId") || undefined;
  const [page, setPage] = useState(1);
  const { hasPermission, isLoading: authLoading, isAuthenticated } = useAuth();
  const canRead = hasPermission("assets:read");
  const query = useQuery({
    queryKey: ["inventory-movements", page, sourceId, itemId],
    queryFn: () => getInventoryMovements({ page, limit: 25, sourceId, itemId }),
    enabled: isAuthenticated && canRead,
  });

  if (authLoading) {
    return <div className="space-y-4"><Skeleton className="h-20 w-full dl-radius-xl" /><Skeleton className="h-80 w-full dl-radius-xl" /></div>;
  }
  if (!isAuthenticated || !canRead) {
    return <ForbiddenState title="Forbidden: Insufficient privileges" description={labels.forbidden} />;
  }

  return (
    <div className="page-container-lg space-y-5 pb-10">
      <header className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center dl-radius-xl border border-primary/25 bg-primary/10 text-primary">
          <HiArrowsRightLeft className="size-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-foreground">{labels.title}</h1>
          <p className="mt-1 max-w-[70ch] text-sm text-muted">{labels.description}</p>
        </div>
      </header>

      {query.isError ? (
        <div role="alert" className="flex flex-col items-start gap-3 dl-radius-xl border border-danger/30 bg-danger/5 p-5">
          <p className="font-semibold text-danger">{labels.failed}</p>
          <button onClick={() => query.refetch()} className="inline-flex min-h-12 items-center gap-2 dl-radius-md border border-border px-4 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <HiArrowPath className="size-4" /> {labels.retry}
          </button>
        </div>
      ) : query.isLoading ? (
        <div className="space-y-3" aria-label={labels.loading}>
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-16 w-full dl-radius-lg" />)}
        </div>
      ) : query.data?.movements.length ? (
        <>
          <div className="overflow-x-auto dl-radius-xl border border-border bg-card">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="border-b border-border bg-card-alt/40 text-xs font-bold text-muted">
                <tr>
                  <th className="px-4 py-3">{labels.item}</th><th className="px-4 py-3">{labels.change}</th><th className="px-4 py-3">{labels.balance}</th><th className="px-4 py-3">{labels.source}</th><th className="px-4 py-3">{labels.recordedBy}</th><th className="px-4 py-3">{labels.recordedAt}</th>
                </tr>
              </thead>
              <tbody>{query.data.movements.map((movement) => <MovementRow key={movement.id} movement={movement} labels={labels} locale={lang === "am" ? "am-ET" : "en-US"} />)}</tbody>
            </table>
          </div>
          <PaginationControls page={page} totalPages={query.data.totalPages} onPageChange={setPage} pageSize={query.data.limit} totalItems={query.data.total} />
        </>
      ) : (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 dl-radius-xl border border-dashed border-border bg-card p-6 text-center">
          <HiOutlineInbox className="size-10 text-muted" />
          <p className="font-semibold text-muted">{labels.empty}</p>
        </div>
      )}
    </div>
  );
}

export default function InventoryMovementsPage() {
  return <AuthLayout><Suspense fallback={<Skeleton className="h-80 w-full dl-radius-xl" />}><MovementsContent /></Suspense></AuthLayout>;
}
