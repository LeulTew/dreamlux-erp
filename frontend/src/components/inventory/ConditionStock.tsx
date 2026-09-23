"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, RefreshCw, Search, X } from "lucide-react";
import ForbiddenState from "@/components/ForbiddenState";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/use-language";
import { useModalFocus } from "@/hooks/use-modal-focus";
import { useConditionResolution } from "@/hooks/use-condition-resolution";
import { getConditionAuthority, getConditionItem, getConditionStock } from "@/lib/condition-stock-api";
import {
  ConditionAccessChanged, conditionQuantity, isConditionOutcome, isConditionSource,
  type ConditionDraft, type ConditionHistoryCursor, type ConditionStockItem,
} from "@/lib/condition-stock";
import { conditionStockCopy, type ConditionCopy } from "@/lib/condition-stock-copy";
import { extractPayrollHttpError } from "@/lib/payroll-error";

const responseStatus = (error: unknown) => extractPayrollHttpError(error).status ?? undefined;

const ACTION = "inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground [@media(hover:hover)]:hover:bg-card-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:text-muted";
const PRIMARY = `${ACTION} border-primary-dark bg-primary-dark text-primary-foreground [@media(hover:hover)]:hover:bg-primary-dark`;
const FIELD = "min-h-12 w-full min-w-0 rounded-md border border-border bg-card px-3 py-2 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:text-muted";
const emptyDraft = (): ConditionDraft => ({ source_condition: "damaged", outcome: "good", quantity: "", notes: "" });
type Writer = ReturnType<typeof useConditionResolution>;

function ItemIdentity({ item, copy }: { item: ConditionStockItem; copy: ConditionCopy }) {
  return <div className="mt-1 grid gap-1 text-xs text-muted" data-condition-item-identity>
    <p className="break-words">{copy.location}: {item.store_name ?? copy.notRecorded}</p>
    {item.store_is_active === false && <p>{copy.inactiveLocation}</p>}
    {item.store_id !== null && item.store_is_active === null && <p>{copy.unknownLocationStatus}</p>}
    <p className="break-words">{copy.unit}: {item.unit_of_measurement ?? copy.notRecorded}</p>
    <p className="break-all">{copy.itemReference}: <span className="font-mono">{item.id}</span></p>
  </div>;
}

function Balances({ item, copy }: { item: ConditionStockItem; copy: ConditionCopy }) {
  return <div className="grid grid-cols-3 gap-2 border-y border-border py-4" aria-label={copy.title}>
    {([
      ["owned", item.quantity], ["damaged", item.unavailable_damaged_quantity], ["repair", item.unavailable_repair_quantity],
    ] as const).map(([key, value]) => <div key={key} className="min-w-0">
      <span className="block text-3xl font-bold tracking-tight tabular-nums text-foreground">{value}</span>
      <span className="mt-0.5 block text-xs leading-tight font-medium text-muted">{copy[key]}</span>
    </div>)}
  </div>;
}

function Recovery({ writer, copy, canWrite, footer, onRetry, onRelease }: {
  writer: Writer; copy: ConditionCopy; canWrite: boolean; footer: HTMLDivElement | null; onRetry: () => void; onRelease: () => void;
}) {
  const { state } = writer;
  const uncertain = state.phase === "unknown" || state.phase === "conflict";
  const actions = <div className="flex flex-wrap gap-2">
    {state.phase === "pending" && <p role="status" className="flex min-h-12 items-center font-semibold">{copy.saving}</p>}
    {uncertain && <button type="button" className={`${ACTION} flex-1`} disabled={writer.checking} onClick={() => void writer.check()}>
      <Search className="size-4 shrink-0" />{writer.checking ? copy.checking : copy.check}
    </button>}
    {canWrite && state.phase === "unknown" && <button type="button" className={`${ACTION} flex-1`}
      disabled={writer.checking || state.storageWarning} onClick={onRetry}>{copy.retry}</button>}
    {(state.phase === "rejected" || state.phase === "acknowledged") && <button type="button" className={ACTION} onClick={onRelease}>
      {!canWrite ? copy.finishReview : state.phase === "rejected" ? copy.editRejected : copy.another}
    </button>}
    {state.storageWarning && <button type="button" className={ACTION} onClick={writer.reloadStorage}>{copy.storageRetry}</button>}
  </div>;
  return <div className="space-y-3" aria-live="polite">
    {state.phase === "acknowledged" && <div role="status" className="space-y-1">
      <p className="flex items-center gap-2 font-semibold"><Check className="size-4 text-success" />{copy.saved}</p>
      <p className="text-sm text-muted">{copy.savedHelp}</p>
      <p className="break-all text-xs text-muted">{copy.historyIdentity}: {state.receipt?.id}</p>
    </div>}
    {uncertain && <p role="alert" className="text-sm text-foreground">{copy.unknown}</p>}
    {(writer.notice || state.failure) && !(uncertain && (writer.notice ?? state.failure) === "unknown")
      && <p role="alert" className="text-sm text-danger">{copy[writer.notice ?? state.failure!]}</p>}
    {state.storageWarning && <p role="alert" className="text-sm text-danger">{copy.storage}</p>}
    {state.intent && <p className="break-all text-xs text-muted">{copy.request}: {state.intent.payload.idempotency_key}</p>}
    {footer ? createPortal(actions, footer) : actions}
  </div>;
}

function ConditionDetail({ actorId, itemId, canWrite, canReadMovements, copy, lang, writer, footer, draft, setDraft }: {
  actorId: string; itemId: string; canWrite: boolean; canReadMovements: boolean; copy: ConditionCopy; lang: string;
  writer: Writer; footer: HTMLDivElement | null; draft: ConditionDraft; setDraft: (draft: ConditionDraft) => void;
}) {
  const [cursors, setCursors] = useState<ConditionHistoryCursor[]>([]);
  const [confirmation, setConfirmation] = useState<{ draft: ConditionDraft; retry: boolean } | null>(null);
  const focus = useModalFocus();
  const cursor = cursors.at(-1);
  const query = useQuery({
    queryKey: ["condition-stock", actorId, "item", itemId, cursor ?? null],
    queryFn: ({ signal }) => getConditionItem(actorId, itemId, { cursor, signal }),
    retry: false, networkMode: "always",
  });
  const item = query.data?.item;
  const ownIntent = writer.state.intent?.item_id === itemId ? writer.state.intent : null;
  const shown = ownIntent?.draft ?? draft;
  const quantity = conditionQuantity(shown.quantity);
  const balance = item && (shown.source_condition === "damaged" ? item.unavailable_damaged_quantity : item.unavailable_repair_quantity);
  const blocked = !canWrite || Boolean(item?.deleted_at) || writer.state.phase !== "idle" || query.isFetching || query.isError;
  const valid = quantity !== null && balance !== undefined && quantity <= balance && shown.notes.length <= 1000;
  const release = () => {
    if (!ownIntent || !writer.release(ownIntent.payload.idempotency_key)) return;
    setDraft(writer.state.phase === "rejected" ? { ...ownIntent.draft } : emptyDraft());
  };
  const retry = () => {
    if (!canWrite || !ownIntent) return;
    if (ownIntent.payload.outcome === "lost") setConfirmation({ draft: { ...ownIntent.draft }, retry: true });
    else writer.retry();
  };
  return <>
    {query.isError && <div role="alert" className="space-y-3">
      <p className="text-danger">{[401, 403].includes(responseStatus(query.error) ?? 0) ? copy.access
        : responseStatus(query.error) === 404 ? copy.missing : copy.unavailable}</p>
      <button type="button" className={ACTION} onClick={() => void query.refetch()}><RefreshCw className="size-4" />{copy.refresh}</button>
    </div>}
    {query.isPending && <div aria-label={copy.loading} className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>}
    {item && <div className="space-y-5">
      <h2 className="break-words text-lg font-semibold text-foreground">{item.name}</h2>
      <ItemIdentity item={item} copy={copy} />
      <Balances item={item} copy={copy} />
      <p className="text-sm text-muted">{copy.balancesHelp}</p>
      {item.deleted_at && <p className="text-sm font-semibold">{copy.archivedHelp}</p>}
      {!canWrite && <p className="text-sm font-semibold">{copy.readOnly}</p>}
      {(query.isFetching || query.isError || writer.refreshFailed) && <p role="status" className="text-sm text-warning">{copy.stale}</p>}
      <form id={`condition-resolution-${itemId}`} className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        if (blocked || !valid) return;
        if (draft.outcome === "lost") setConfirmation({ draft: { ...draft }, retry: false });
        else writer.submit(item, draft);
      }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">{copy.source}
            <select aria-label={copy.source} className={FIELD} value={shown.source_condition} disabled={blocked}
              onChange={(event) => { if (isConditionSource(event.target.value)) setDraft({ ...draft, source_condition: event.target.value }); }}>
              <option value="damaged">{copy.damaged}</option><option value="repair">{copy.repair}</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">{copy.outcome}
            <select aria-label={copy.outcome} className={FIELD} value={shown.outcome} disabled={blocked}
              onChange={(event) => { if (isConditionOutcome(event.target.value)) setDraft({ ...draft, outcome: event.target.value }); }}>
              {(["good", "damaged", "repair", "lost"] as const).map((value) => <option key={value} value={value}>{copy[value]}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">{copy.quantity}
            <input className={`${FIELD} tabular-nums`} aria-label={copy.quantity} inputMode="numeric"
              value={shown.quantity} maxLength={32} disabled={blocked} aria-describedby="condition-quantity-limit"
              onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} />
          </label>
          <label className="space-y-1 text-sm font-medium">{copy.notes}
            <textarea className={FIELD} aria-label={copy.notes} value={shown.notes} maxLength={1000} rows={2} disabled={blocked}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </label>
        </div>
        <p id="condition-quantity-limit" className="text-sm text-muted">{copy.limit}</p>
        {shown.source_condition === shown.outcome && <p className="text-sm text-muted">{copy.sameCondition}</p>}
      </form>
    </div>}
    {ownIntent ? <Recovery writer={writer} copy={copy} footer={footer} canWrite={canWrite && Boolean(item && !item.deleted_at)} onRetry={retry} onRelease={release} />
      : writer.state.intent ? <p className="text-sm text-warning">{copy.activeRequest}</p>
        : writer.notice ? <p role="alert" className="text-sm text-danger">{copy[writer.notice]}</p> : null}
    {!ownIntent && writer.state.storageWarning && <div role="alert" className="space-y-2">
      <p className="text-sm text-danger">{copy.storage}</p>
      <button type="button" className={ACTION} onClick={writer.reloadStorage}>{copy.storageRetry}</button>
    </div>}
    {query.data && <section className="space-y-3 border-t border-border pt-4" aria-label={copy.history}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{copy.history}</h2>
        <button type="button" className={ACTION} disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw className="size-4" />{copy.refresh}
        </button>
      </div>
      <p className="text-xs text-muted">{copy.historicalTime}</p>
      {query.data.history.length === 0 ? <p className="text-sm text-muted">{copy.historyEmpty}</p>
        : <ol className="divide-y divide-border">{query.data.history.map((row) => <li key={row.id} className="space-y-1 py-3 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span className="tabular-nums">{row.quantity}</span>{copy[row.source_condition]}<ArrowRight aria-hidden="true" className="size-4" />{copy[row.outcome]}
          </p>
          <p className="break-words">{row.notes ?? copy.notRecorded}</p>
          <p className="text-muted">{copy.actor}: {row.created_by_name ?? row.created_by ?? copy.notRecorded}</p>
          <p className="text-muted">{row.created_at ? new Intl.DateTimeFormat(lang === "am" ? "am-ET" : "en-ET",
            { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(row.created_at)) : copy.notRecorded}</p>
          <p className="break-all text-xs text-muted">{copy.historyIdentity}: {row.id}</p>
        </li>)}</ol>}
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" className={ACTION} disabled={!cursors.length || query.isFetching} onClick={() => setCursors((previous) => previous.slice(0, -1))}>
          <ArrowLeft className="size-4" />{copy.previous}
        </button>
        <button type="button" className={ACTION} disabled={!query.data.next_cursor || query.isFetching}
          onClick={() => { if (query.data.next_cursor) setCursors((previous) => [...previous, query.data.next_cursor!]); }}>
          {copy.next}<ArrowRight className="size-4" />
        </button>
      </div>
    </section>}
    {canReadMovements && <Link className={ACTION} href={`/assets/movements?itemId=${encodeURIComponent(itemId)}`}>{copy.movements}</Link>}
    {footer && canWrite && item && !item.deleted_at && !ownIntent && createPortal(
      <button type="submit" form={`condition-resolution-${itemId}`} className={`${PRIMARY} w-full sm:w-auto`} disabled={blocked || !valid}>{copy.resolve}</button>,
      footer,
    )}
    <Sheet open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null); }}>
      <SheetContent side="bottom" showCloseButton={false} {...focus}
        className="mx-auto max-h-[90dvh] max-w-xl overflow-y-auto rounded-t-xl p-4 motion-reduce:animate-none motion-reduce:transition-none">
        <SheetTitle>{copy.lossTitle}</SheetTitle>
        <SheetDescription>{copy.lossBody}</SheetDescription>
        {item && <div>
          <p className="break-words font-semibold">{item.name}</p>
          <ItemIdentity item={item} copy={copy} />
        </div>}
        <p className="font-semibold tabular-nums">{copy.quantity}: {confirmation?.draft.quantity}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className={ACTION} onClick={() => setConfirmation(null)}>{copy.keepEditing}</button>
          <button type="button" className={`${ACTION} border-danger text-danger`} disabled={!canWrite}
            onClick={() => {
              const confirmed = confirmation;
              setConfirmation(null);
              if (!confirmed) return;
              if (confirmed.retry) writer.retry();
              else if (item) writer.submit(item, confirmed.draft);
            }}>{copy.confirmLoss}</button>
        </div>
      </SheetContent>
    </Sheet>
  </>;
}

function Operator({ actorId, canWrite, canReadMovements, initialItem }: {
  actorId: string; canWrite: boolean; canReadMovements: boolean; initialItem: string | null;
}) {
  const { lang } = useLanguage();
  const copy = conditionStockCopy(lang);
  const writer = useConditionResolution(actorId, true, canWrite);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [selected, setSelected] = useState(initialItem?.toLowerCase() ?? null);
  const [drafts, setDrafts] = useState<Record<string, ConditionDraft>>({});
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const fallbackFocus = useRef<HTMLHeadingElement>(null);
  const swipe = useRef<number | null>(null);
  const focus = useModalFocus(() => opener.current?.isConnected ? opener.current : fallbackFocus.current);
  const query = useQuery({
    queryKey: ["condition-stock", actorId, "list", search, archived, pages.at(-1) ?? null],
    queryFn: ({ signal }) => getConditionStock(actorId, { search, includeArchived: archived, after: pages.at(-1), signal }),
    retry: false, networkMode: "always",
  });
  const open = (id: string, element: HTMLElement) => { opener.current = element; setSelected(id); };
  return <div className="page-container-lg space-y-5 pb-24">
    <header className="space-y-2">
      <h1 ref={fallbackFocus} tabIndex={-1} className="text-2xl font-bold tracking-tight text-foreground">{copy.title}</h1>
      <p className="max-w-[70ch] text-sm text-muted">{copy.description}</p>
    </header>
    {writer.state.intent && <section className="space-y-2 border-y border-border py-3" aria-label={copy.recovery}>
      <p className="font-semibold">{writer.state.phase === "acknowledged" ? copy.saved : copy.recovery}</p>
      <button type="button" className={ACTION} onClick={(event) => open(writer.state.intent!.item_id, event.currentTarget)}>{copy.reviewRequest}</button>
    </section>}
    {writer.state.storageWarning && <div role="alert" className="space-y-2">
      <p className="text-sm text-danger">{copy.storage}</p>
      <button type="button" className={ACTION} onClick={writer.reloadStorage}>{copy.storageRetry}</button>
    </div>}
    {query.isError ? <div role="alert" className="space-y-3">
      <p className="text-danger">{[401, 403].includes(responseStatus(query.error) ?? 0) ? copy.access : copy.unavailable}</p>
      <button type="button" className={ACTION} onClick={() => void query.refetch()}><RefreshCw className="size-4" />{copy.refresh}</button>
    </div> : query.isPending ? <div className="space-y-3" aria-label={copy.loading}>
      {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-24 w-full" />)}
    </div> : query.data.items.length === 0 ? <p className="border-y border-border py-12 text-sm text-muted">{copy.empty}</p>
      : <ul className="divide-y divide-border border-y border-border">
        {query.data.items.map((item) => <li key={item.id} className="grid grid-cols-3 items-center gap-3 py-4 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <p className="truncate font-semibold" title={item.name}>{item.name}</p>
            <ItemIdentity item={item} copy={copy} />
            {item.deleted_at && <p className="text-xs text-muted">{copy.archived}</p>}
          </div>
          <button type="button" className={`${ACTION} justify-self-end sm:order-last`}
            aria-label={`${copy.inspect}: ${item.name}; ${copy.location}: ${item.store_name ?? copy.notRecorded}; ${copy.unit}: ${item.unit_of_measurement ?? copy.notRecorded}; ${copy.itemReference}: ${item.id}`}
            onClick={(event) => open(item.id, event.currentTarget)}>{copy.inspect}</button>
          {([
            ["owned", item.quantity], ["damaged", item.unavailable_damaged_quantity], ["repair", item.unavailable_repair_quantity],
          ] as const).map(([label, value]) => <div key={label} className="min-w-0">
            <span className="block text-3xl font-bold tracking-tight tabular-nums">{value}</span>
            <span className="mt-0.5 block text-xs leading-tight text-muted">{copy[label]}</span>
          </div>)}
        </li>)}
      </ul>}
    <div className="flex justify-between gap-2">
      <button type="button" className={ACTION} disabled={!pages.length || query.isFetching} onClick={() => setPages((previous) => previous.slice(0, -1))}>
        <ArrowLeft className="size-4" />{copy.previous}
      </button>
      <button type="button" className={ACTION} disabled={!query.data?.next_cursor || query.isFetching}
        onClick={() => { if (query.data?.next_cursor) setPages((previous) => [...previous, query.data.next_cursor!]); }}>
        {copy.next}<ArrowRight className="size-4" />
      </button>
    </div>
    <form className="sticky bottom-2 z-10 space-y-2 rounded-lg border border-border bg-card p-3 sm:static" onSubmit={(event) => {
      event.preventDefault(); setSearch(searchInput.trim()); setPages([]);
    }}>
      <label htmlFor="condition-search" className="text-sm font-medium">{copy.search}</label>
      <div className="flex gap-2">
        <input id="condition-search" type="search" className={FIELD} maxLength={100} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
        <button className={ACTION} type="submit" aria-label={copy.searchAction}><Search className="size-4" /></button>
      </div>
      <button type="button" role="checkbox" aria-checked={archived} className={ACTION}
        onClick={() => { setArchived(!archived); setPages([]); }}>
        {archived && <Check className="size-4" />}{copy.includeArchived}
      </button>
    </form>
    <Sheet open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <SheetContent side="bottom" showCloseButton={false} {...focus}
        className="mx-auto max-h-[92dvh] w-full max-w-3xl gap-0 overflow-hidden rounded-t-xl motion-reduce:animate-none motion-reduce:transition-none">
        <div className="flex min-h-12 items-center justify-center touch-none"
          onTouchStart={(event) => { swipe.current = event.touches[0].clientY; }}
          onTouchEnd={(event) => {
            if (swipe.current !== null && event.changedTouches[0].clientY - swipe.current > 60) setSelected(null);
            swipe.current = null;
          }}><span aria-hidden="true" className="h-1 w-8 rounded-full bg-muted" /></div>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 pb-3">
          <div className="min-w-0">
            <SheetTitle>{copy.title}</SheetTitle>
            <SheetDescription>{copy.inspect}</SheetDescription>
          </div>
          <button type="button" className={`${ACTION} shrink-0 px-3`} aria-label={copy.close} onClick={() => setSelected(null)}><X className="size-4" /></button>
        </div>
        <div data-condition-detail-scroll className="space-y-5 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {selected && <ConditionDetail key={selected} actorId={actorId} itemId={selected} canWrite={canWrite}
            canReadMovements={canReadMovements} copy={copy} lang={lang} writer={writer} footer={footer}
            draft={drafts[selected] ?? emptyDraft()} setDraft={(draft) => setDrafts((previous) => ({ ...previous, [selected]: draft }))} />}
        </div>
        <div ref={setFooter} className="shrink-0 border-t border-border bg-popover p-4 pb-[max(1rem,env(safe-area-inset-bottom))] empty:hidden" />
      </SheetContent>
    </Sheet>
  </div>;
}

export function ConditionStock() {
  const auth = useAuth();
  const router = useRouter();
  const { lang } = useLanguage();
  const copy = conditionStockCopy(lang);
  const params = useSearchParams();
  const authority = useQuery({
    queryKey: ["condition-authority", auth.user?.id ?? null],
    queryFn: ({ signal }) => getConditionAuthority(auth.user?.id, signal),
    enabled: auth.isAuthenticated && !auth.isLoading,
    retry: false, networkMode: "always", staleTime: 0,
  });
  const canRead = authority.data?.canRead === true
    && (auth.hasPermission("assets:read") || auth.hasPermission("assets:reconcile"));
  if (auth.isLoading && (!auth.user || !canRead)) return <Skeleton className="h-96 w-full" aria-label={copy.loading} />;
  if (auth.isAuthenticated && authority.isPending) return <Skeleton className="h-96 w-full" aria-label={copy.loading} />;
  if (auth.isAuthenticated && authority.isError) {
    if (authority.error instanceof ConditionAccessChanged || [401, 403].includes(responseStatus(authority.error) ?? 0)) {
      return <ForbiddenState title={copy.title} description={copy.identityUnavailable}
        actionLabel={copy.signInAgain} onAction={() => router.push("/login")} />;
    }
    return <section className="page-container-lg flex min-h-[70dvh] flex-col gap-4 pb-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{copy.title}</h1>
      <p role="alert" className="text-sm text-danger">{copy.unavailable}</p>
      <button type="button" className={`${ACTION} mt-auto self-start`} disabled={authority.isFetching}
        onClick={() => void authority.refetch()}>
        <RefreshCw aria-hidden="true" className="size-4" />{authority.isFetching ? copy.loading : copy.refresh}
      </button>
    </section>;
  }
  if (!auth.isAuthenticated || !authority.data || !canRead) return <ForbiddenState title={copy.title} description={copy.forbidden}
    onAction={() => router.push("/")} />;
  const itemId = params.get("item")?.toLowerCase() ?? null;
  return <Operator key={`${authority.data.actorId}:${itemId ?? ""}`} actorId={authority.data.actorId}
    canWrite={!auth.isLoading && !authority.isFetching && authority.data.canResolve && auth.hasPermission("assets:reconcile")}
    canReadMovements={authority.data.canReadMovements && auth.hasPermission("assets:read")} initialItem={itemId} />;
}
