"use client";
import Link from "next/link";
import { format } from "date-fns";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AuthLayout from "@/components/AuthLayout";
import { getPayrollRuns, updatePayrollRunStatus, exportPayrollPDF, permanentlyDeletePayrollRun } from "@/lib/api";
import { HiClock, HiOutlineChevronRight, HiPencilSquare, HiPrinter, HiArrowUturnLeft, HiArrowPath, HiTrash } from "react-icons/hi2";
import { Suspense, useEffect, useMemo, useState } from "react";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import PaginationControls from "@/components/PaginationControls";
import toast from "react-hot-toast";
import { useLanguage } from "@/hooks/use-language";
import { FancyButton } from "@/components/ui/FancyButton";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Archive": "Archive",
    "Payroll snaphosts & history": "Payroll snapshots & history",
    "Active": "Active",
    "Trash": "Trash",
    "New Payout": "New Payout",
    "Year": "Year",
    "All Years": "All Years",
    "Status": "Status",
    "All Status": "All Status",
    "Draft": "Draft",
    "Finalized": "Finalized",
    "Sort By": "Sort By",
    "Period Date": "Period Date",
    "Total Value": "Total Value",
    "Order": "Order",
    "Ascending": "Ascending",
    "Descending": "Descending",
    "Retrieving payroll audit history...": "Retrieving payroll audit history...",
    "Trash is empty": "Trash is empty",
    "No payroll records found in the archive": "No payroll records found in the archive",
    "Payout Total": "Payout Total",
    "Employees": "Employees",
    "Details": "Details",
    "Restore Run": "Restore Run",
    "Delete Permanently": "Delete Permanently",
    "Move to Trash": "Move to Trash",
    "Confirm Restore": "Confirm Restore"
  },
  am: {
    "Archive": "ማህደር",
    "Payroll snaphosts & history": "የክፍያ ታሪክ እና ቅጽበታዊ መግለጫዎች",
    "Active": "ገባሪ",
    "Trash": "መጣያ",
    "New Payout": "አዲስ ክፍያ",
    "Year": "ዓመት",
    "All Years": "ሁሉም ዓመታት",
    "Status": "ሁኔታ",
    "All Status": "ሁሉም ሁኔታዎች",
    "Draft": "ረቂቅ",
    "Finalized": "የተጠናቀቀ",
    "Sort By": "በምን ይደረደር",
    "Period Date": "የክፍያ ጊዜ",
    "Total Value": "አጠቃላይ ዋጋ",
    "Order": "ቅደም ተከተል",
    "Ascending": "ከትንሽ ወደ ትልቅ",
    "Descending": "ከታላቅ ወደ ትንሽ",
    "Retrieving payroll audit history...": "የክፍያ መዛግብት ታሪክ በመፈለግ ላይ...",
    "Trash is empty": "መጣያው ባዶ ነው",
    "No payroll records found in the archive": "ምንም የክፍያ መዛግብት በማህደሩ ውስጥ አልተገኙም",
    "Payout Total": "ጠቅላላ ክፍያ",
    "Employees": "ሠራተኞች",
    "Details": "ዝርዝሮች",
    "Restore Run": "ክፍያውን መልስ",
    "Delete Permanently": "ለዘለቄታው ሰርዝ",
    "Move to Trash": "ወደ መጣያ ውሰድ",
    "Confirm Restore": "መልሶ ማግኘትን አረጋግጥ"
  }
};

type PayrollRunRow = {
  id: string;
  month?: number;
  year?: number;
  period_start?: string;
  period_end?: string;
  total_payroll_value?: number;
  status?: string;
  created_at?: string;
};

function PaymentsPageContent() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedMonth = format(new Date(), "yyyy-MM");
  const queryClient = useQueryClient();
  const [view, setView] = useState<"active" | "trash">("active");
  const [page, setPage] = useState(1);
  const [yearFilter, setYearFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("period_start");
  const [sortOrder, setSortOrder] = useState("desc");
  const [confirmState, setConfirmState] = useState<{ id: string; action: "trash" | "restore" | "delete" } | null>(null);
  const highlightedId = searchParams.get("highlight");

  const { data: runs, isLoading, isRefetching, refetch } = useQuery<PayrollRunRow[]>({
    queryKey: ["payroll-runs", view, yearFilter, statusFilter, sortBy, sortOrder],
    queryFn: () => getPayrollRuns({ 
      view, 
      year: yearFilter === "ALL" ? undefined : yearFilter, 
      status: statusFilter === "ALL" ? undefined : statusFilter,
      sortBy,
      sortOrder
    }),
  });

  const trashMutation = useMutation({
    mutationFn: (id: string) => updatePayrollRunStatus(id, "TRASH"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success("Payroll run moved to trash");
      setConfirmState(null);
    },
    onError: () => {
      toast.error("Failed to trash payroll run");
    }
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => updatePayrollRunStatus(id, "DRAFT"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success("Payroll run restored");
      setConfirmState(null);
    },
    onError: () => {
      toast.error("Failed to restore payroll run");
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id: string) => permanentlyDeletePayrollRun(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast.success("Payroll run permanently deleted");
      setConfirmState(null);
    },
    onError: () => {
      toast.error("Failed to permanently delete payroll run");
    },
  });

  const sortedRuns = useMemo(() => runs ?? [], [runs]);

  const ITEMS_PER_PAGE = 8;
  const totalPages = Math.max(1, Math.ceil(sortedRuns.length / ITEMS_PER_PAGE));
  const paginatedRuns = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sortedRuns.slice(start, start + ITEMS_PER_PAGE);
  }, [page, sortedRuns]);

  const isMutating = trashMutation.isPending || restoreMutation.isPending || permanentDeleteMutation.isPending;

  useEffect(() => {
    if (!highlightedId || sortedRuns.length === 0) return;

    const highlightedIndex = sortedRuns.findIndex((run) => run.id === highlightedId);
    if (highlightedIndex === -1) return;

    const timer = setTimeout(() => {
      setPage(Math.floor(highlightedIndex / ITEMS_PER_PAGE) + 1);
    }, 0);
    return () => clearTimeout(timer);
  }, [highlightedId, sortedRuns]);

  const executeConfirmAction = async () => {
    if (!confirmState) return;
    if (confirmState.action === "trash") {
      await trashMutation.mutateAsync(confirmState.id);
      return;
    }
    if (confirmState.action === "restore") {
      await restoreMutation.mutateAsync(confirmState.id);
      return;
    }
    await permanentDeleteMutation.mutateAsync(confirmState.id);
  };

  const handleSync = async () => {
    await refetch();
    toast.success("Payroll history updated");
  };

  return (
    <AuthLayout>
      <div className="page-container pt-4 md:py-8 px-4 sm:px-6 md:px-8 space-y-6 md:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-border/40">
          <div>
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight text-foreground">{t("Archive")}</h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1 flex items-center gap-1.5 opacity-70">
              <HiClock className="w-3.5 h-3.5" />
              {t("Payroll snaphosts & history")}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-xl border border-border/50 bg-card-alt p-1">
              <button
                onClick={() => {
                  setView("active");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors ${
                  view === "active" ? "bg-primary text-background" : "text-muted hover:text-foreground"
                }`}
              >
                {t("Active")}
              </button>
              <button
                onClick={() => {
                  setView("trash");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors ${
                  view === "trash" ? "bg-primary text-background" : "text-muted hover:text-foreground"
                }`}
              >
                {t("Trash")}
              </button>
            </div>

            <div className="h-6 w-px bg-border/40 mx-1 hidden sm:block" />

            <button
              onClick={handleSync}
              disabled={isRefetching}
              className={`
                group inline-flex items-center justify-center w-10 h-10 rounded-xl border border-border/60 
                bg-card/50 backdrop-blur-xl text-foreground hover:bg-muted transition-all active:scale-95
                ${isRefetching ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              title="Sync History"
            >
              <HiArrowPath className={`w-4 h-4 transition-transform duration-700 ${isRefetching ? 'animate-spin' : 'group-hover:rotate-180'}`} />
            </button>

            <FancyButton
              onClick={() => router.push(`/hr/payments/run?date=${selectedMonth}`)}
            >
              {t("New Payout")}
            </FancyButton>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-card/40 backdrop-blur-md p-4 rounded-2xl border border-border/50 shadow-sm">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest pl-1">{t("Year")}</label>
            <select 
              value={yearFilter}
              onChange={(e) => { setYearFilter(e.target.value); setPage(1); }}
              className="w-full h-10 px-4 py-2 bg-card border border-border/80 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all"
            >
              <option value="ALL">{t("All Years")}</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest pl-1">{t("Status")}</label>
            <select 
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full h-10 px-4 py-2 bg-card border border-border/80 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all"
            >
              <option value="ALL">{t("All Status")}</option>
              <option value="DRAFT">{t("Draft")}</option>
              <option value="FINALIZED">{t("Finalized")}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest pl-1">{t("Sort By")}</label>
            <select 
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              className="w-full h-10 px-4 py-2 bg-card border border-border/80 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all"
            >
              <option value="period_start">{t("Period Date")}</option>
              <option value="total">{t("Total Value")}</option>
              <option value="status">{t("Status")}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest pl-1">{t("Order")}</label>
            <button
              onClick={() => { setSortOrder(sortOrder === "asc" ? "desc" : "asc"); setPage(1); }}
              className="w-full h-10 px-4 py-2 bg-card border border-border/80 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground transition-all flex items-center justify-between"
            >
              {sortOrder === "asc" ? t("Ascending") : t("Descending")}
              <span className="text-lg leading-none">{sortOrder === "asc" ? "↑" : "↓"}</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-20 text-center text-muted-foreground animate-pulse font-black uppercase text-[10px] tracking-[0.4em] bg-card rounded-xl border border-border/50 shadow-inner">
            {t("Retrieving payroll audit history...")}
          </div>
        ) : sortedRuns.length === 0 ? (
          <div className="p-20 text-center rounded-xl border-2 border-dashed border-border/50 text-muted-foreground font-black uppercase tracking-widest text-sm bg-card shadow-sm">
            {view === "trash" ? t("Trash is empty") : t("No payroll records found in the archive")}
          </div>
        ) : (
          <div className="grid gap-6">
            {paginatedRuns.map((run) => {
              const isH1 = run.period_start?.endsWith("-01") && run.period_end?.endsWith("-15");
              const isH2 = run.period_start?.endsWith("-16");
              const suffix = isH1 ? (lang === "am" ? " (1-15)" : " (1st-15th)") : isH2 ? (lang === "am" ? " (16-መጨረሻ)" : " (16th-End)") : "";

              // Use target month naming depending on language
              let periodText = "Period unknown";
              if (run.period_start && run.period_end) {
                const dateObj = new Date(run.period_start);
                if (lang === "am") {
                  const monthsAm = ["ጃንዋሪ", "ፌብሩዋሪ", "ማርች", "ኤፕሪል", "ሜይ", "ጁን", "ጁላይ", "ኦገስት", "ሴፕቴምበር", "ኦክቶበር", "ኖቬምበር", "ዲሴምበር"];
                  periodText = `${monthsAm[dateObj.getMonth()]} ${dateObj.getFullYear()}${suffix}`;
                } else {
                  periodText = `${format(dateObj, "MMM yyyy")}${suffix}`;
                }
              } else if (run.month && run.year) {
                const dateObj = new Date(run.year, run.month - 1);
                if (lang === "am") {
                  const monthsAm = ["ጃንዋሪ", "ፌብሩዋሪ", "ማርች", "ኤፕሪል", "ሜይ", "ጁን", "ጁላይ", "ኦገስት", "ሴፕቴምበር", "ኦክቶበር", "ኖቬምበር", "ዲሴምበር"];
                  periodText = `${monthsAm[dateObj.getMonth()]} ${dateObj.getFullYear()}${suffix}`;
                } else {
                  periodText = `${format(dateObj, "MMMM yyyy")}${suffix}`;
                }
              }

              const statusColors: Record<string, string> = {
                FINALIZED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                DRAFT: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                FLAGGED_WRONG: "bg-danger/10 text-danger border-danger/20",
              };

              const currentStatus = (run.status ?? "draft").toUpperCase();

              return (
                <div
                  key={run.id}
                  className={`group p-6 bg-card rounded-3xl border transition-all duration-300 relative overflow-hidden ${
                    highlightedId === run.id
                      ? "border-primary/60 ring-2 ring-primary/20"
                      : "border-border/60 hover:border-primary/40 hover:shadow-2xl"
                  }`}
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-[4rem] -mr-4 -mt-4 transition-transform group-hover:scale-110 pointer-events-none" />
                  
                  <div className="flex flex-col gap-6 md:flex-row md:items-center relative z-10">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Link href={`/hr/payments/${run.id}`} className="hover:text-primary transition-all">
                          <div className="font-black tracking-tight text-xl uppercase text-foreground hover:text-primary transition-all">{periodText}</div>
                        </Link>
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${statusColors[currentStatus] || "bg-muted text-muted-foreground"}`}>
                          {t(currentStatus)}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold opacity-60">
                        {run.created_at ? format(new Date(run.created_at), "PPP") : ""}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-8 md:gap-12">
                      <div className="text-left md:text-right">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black mb-1 opacity-70">{t("Payout Total")}</p>
                        <p className="text-lg font-black tracking-tighter text-foreground">ETB {Number(run.total_payroll_value ?? 0).toLocaleString()}</p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black mb-1 opacity-70">{t("Employees")}</p>
                        <p className="text-lg font-black text-foreground">{lang === "am" ? "ገባሪ" : "Active"}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <button
                          onClick={() => exportPayrollPDF(run.id)}
                          className="flex items-center justify-center gap-2 p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-500/10"
                          title="Print PDF"
                        >
                          <HiPrinter className="w-5 h-5" />
                        </button>
                        {currentStatus === "DRAFT" && (
                          <Link
                            href={`/hr/payments/run?date=${run.period_start ? run.period_start.slice(0, 7) : ""}&period_type=${run.period_start?.endsWith("-16") ? "h2" : run.period_start?.endsWith("-01") && run.period_end?.endsWith("-15") ? "h1" : "full"}`}
                            className="flex items-center justify-center gap-2 p-3 bg-amber-500 text-white rounded-2xl hover:bg-amber-600 transition-all active:scale-95 shadow-lg shadow-amber-500/10"
                            title="Edit Draft"
                          >
                            <HiPencilSquare className="w-5 h-5" />
                          </Link>
                        )}
                        {view === "active" ? (
                          <button
                            onClick={() => setConfirmState({ id: run.id, action: "trash" })}
                            className="flex items-center justify-center gap-2 p-3 bg-rose-600 text-white rounded-2xl hover:bg-rose-700 transition-all active:scale-95 shadow-lg shadow-rose-500/10"
                            title="Move to Trash"
                          >
                            <HiTrash className="w-5 h-5" />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => setConfirmState({ id: run.id, action: "restore" })}
                              className="flex items-center justify-center gap-2 p-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-500/10"
                              title="Restore"
                            >
                              <HiArrowUturnLeft className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => setConfirmState({ id: run.id, action: "delete" })}
                              className="flex items-center justify-center gap-2 p-3 bg-rose-700 text-white rounded-2xl hover:bg-rose-800 transition-all active:scale-95 shadow-lg shadow-rose-500/10"
                              title="Delete Permanently"
                            >
                              <HiTrash className="w-5 h-5" />
                            </button>
                          </>
                        )}
                        <Link
                          href={`/hr/payments/${run.id}`}
                          className="flex items-center justify-center gap-2 flex-1 md:flex-initial px-6 py-3 bg-card-alt border border-border rounded-2xl text-[10px] font-black uppercase tracking-widest text-foreground hover:bg-muted transition-all active:scale-95 group/btn shadow-sm"
                        >
                          {t("Details")}
                          <HiOutlineChevronRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sortedRuns.length > ITEMS_PER_PAGE && (
          <div className="pt-2 flex justify-center">
            <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}

        <DeleteConfirmModal 
          isOpen={!!confirmState}
          onClose={() => setConfirmState(null)}
          onConfirm={executeConfirmAction}
          variant={confirmState?.action === "restore" ? "primary" : "danger"}
          confirmLabel={confirmState?.action === "restore" ? t("Confirm Restore") : undefined}
          title={
            confirmState?.action === "restore"
              ? t("Restore Run")
              : confirmState?.action === "delete"
                ? t("Delete Permanently")
                : t("Move to Trash")
          }
          message={
            confirmState?.action === "restore"
              ? lang === "am" ? "ይህንን የደሞዝ ክፍያ ወደ ገባሪ ዝርዝር ይመልሱት?" : "Restore this payroll run to the active list?"
              : confirmState?.action === "delete"
                ? lang === "am" ? "ይህንን የደሞዝ ክፍያ እና ሁሉንም ተዛማጅ ዝርዝሮች ለዘለቄታው ያጥፉ? ይህ ድርጊት ሊመለስ አይችልም።" : "Permanently delete this payroll run and all related lines? This cannot be undone."
                : lang === "am" ? "ይህንን የደሞዝ ክፍያ ወደ መጣያ ይውሰዱት? ከገባሪ ዝርዝር ውስጥ ይወገዳል።" : "Archive this payroll run? It will be removed from the active list and moved to trash."
          }
          itemName={runs?.find(r => r.id === confirmState?.id)?.id.slice(0,8) || ""}
          isDeleting={isMutating}
        />
      </div>
    </AuthLayout>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense>
      <PaymentsPageContent />
    </Suspense>
  );
}
