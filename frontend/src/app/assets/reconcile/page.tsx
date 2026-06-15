"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import { getReconcilePreview, saveLocalReconcileFallbackRun, submitReconcile, getStores } from "@/lib/api";
import { Item, ReconcileSummary, Store } from "@/lib/types";
import { 
  HiChevronLeft, 
  HiOutlineClipboardDocumentCheck, 
  HiOutlineChevronRight,
  HiXMark,
  HiCheckBadge,
  HiOutlineArrowRight,
  HiMagnifyingGlass,
} from "react-icons/hi2";
import Select from "@/components/ui/Select";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import PaginationControls from "@/components/PaginationControls";
import { useLanguage } from "@/hooks/use-language";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "No items match your criteria.": "No items match your criteria.",
    "Qty": "Qty",
    "Physical Count": "Physical Count",
    "Counted": "Counted",
    "Diff": "Diff",
    "Net": "Net",
    "Notes...": "Notes...",
    "Confirm": "Confirm",
    "Count Finalized": "Count Finalized",
    "Reconciliation run": "Reconciliation run",
    "has been securely committed to the audit ledger.": "has been securely committed to the audit ledger.",
    "Counts were saved, but the audit trail ledger is temporarily unavailable. Please retry later to restore full audit commit tracking.": "Counts were saved, but the audit trail ledger is temporarily unavailable. Please retry later to restore full audit commit tracking.",
    "Discrepancies": "Discrepancies",
    "Net Flow": "Net Flow",
    "Audit Trail Detail": "Audit Trail Detail",
    "View Audit History": "View Audit History",
    "Dismiss View": "Dismiss View",
    "Finalize Reconciliation?": "Finalize Reconciliation?",
    "You are about to submit": "You are about to submit",
    "count records. This will create an permanent audit trail for stock adjustments.": "count records. This will create an permanent audit trail for stock adjustments.",
    "Impacted Items": "Impacted Items",
    "adjustments": "adjustments",
    "Operator Notes": "Operator Notes",
    "Back to Edit": "Back to Edit",
    "Confirm & Post": "Confirm & Post"
  },
  am: {
    "No items match your criteria.": "ምንም ንብረት ከእርስዎ ፍላጎት ጋር አይዛመድም።",
    "Qty": "ብዛት",
    "Physical Count": "የአካል ቆጠራ",
    "Counted": "የተቆጠረው",
    "Diff": "ልዩነት",
    "Net": "የተጣራ",
    "Notes...": "ማስታወሻዎች...",
    "Confirm": "አረጋግጥ",
    "Count Finalized": "ቆጠራ ተጠናቋል",
    "Reconciliation run": "የማስታረቅ ተግባር",
    "has been securely committed to the audit ledger.": "በኦዲት መዝገብ ላይ በደህና ተመዝግቧል።",
    "Counts were saved, but the audit trail ledger is temporarily unavailable. Please retry later to restore full audit commit tracking.": "ቆጠራዎች ተቀምጠዋል፣ ነገር ግን የኦዲት መዝገብ ለጊዜው አይገኝም። እባክዎን የኦዲት ቁጥጥርን ሙሉ በሙሉ ለማስቀጠል ቆይተው እንደገና ይሞክሩ።",
    "Discrepancies": "ልዩነቶች",
    "Net Flow": "የተጣራ ፍሰት",
    "Audit Trail Detail": "የኦዲት መዝገብ ዝርዝር",
    "View Audit History": "የኦዲት ታሪክን ተመልከት",
    "Dismiss View": "እይታን ዝጋ",
    "Finalize Reconciliation?": "ማስታረቅን ያጠናቅቁ?",
    "You are about to submit": "ለማስገባት እያዘጋጁ ነው",
    "count records. This will create an permanent audit trail for stock adjustments.": "የቆጠራ መዛግብት። ይህ ለክምችት ማስተካከያዎች ቋሚ የኦዲት መዝገብ ይፈጥራል።",
    "Impacted Items": "የተጎዱ ንብረቶች",
    "adjustments": "ማስተካከያዎች",
    "Operator Notes": "የኦፕሬተር ማስታወሻዎች",
    "Back to Edit": "ወደ ማስተካከያ ተመለስ",
    "Confirm & Post": "አረጋግጥ እና ይለጥፉ"
  }
};

export default function ReconcilePage() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const router = useRouter();
  const queryClient = useQueryClient();
  const [store, setStore] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState("");
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [filter, setFilter] = useState<string>("all"); // 'all', 'low-stock', 'discrepancy', 'uncounted'
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<'name' | 'quantity' | 'updated_at'>('name');
  const [showConfirm, setShowConfirm] = useState(false);
  const [summaryData, setSummaryData] = useState<ReconcileSummary | null>(null);

  const { data: storeData } = useQuery<Store[]>({
    queryKey: ["stores"],
    queryFn: getStores,
  });

  const { data: previewData, isLoading } = useQuery<{ items: Item[]; total: number }>({
    queryKey: ["reconcilePreview", store, page, filter === "low-stock" ? "low-stock" : undefined, searchTerm.trim() || undefined],
    queryFn: () => getReconcilePreview({ 
      store, 
      page, 
      limit: 10,
      filter: filter === "low-stock" ? "low-stock" : undefined,
      search: searchTerm.trim() || undefined,
    }),
    placeholderData: (previous) => previous,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const reconcileMutation = useMutation({
    mutationFn: submitReconcile,
    onSuccess: (data) => {
      const failedIds = new Set(data.failed_item_ids || []);
      const previewById = new Map((previewData?.items || []).map((item) => [item.id, item]));
      const successfulEntries = Array.from(counts.entries())
        .filter(([id]) => !failedIds.has(id))
        .map(([id, quantity]) => {
          const item = previewById.get(id);
          const previousQuantity = Number(item?.quantity ?? quantity);
          const countedQuantity = Number(quantity);
          return {
            id,
            name: item?.name || "Item",
            previousQuantity,
            countedQuantity,
            delta: countedQuantity - previousQuantity,
          };
        });

      let resolvedRunId = data.run_id;
      const shouldCreateLocalFallback = !resolvedRunId;

      if (shouldCreateLocalFallback && successfulEntries.length > 0) {
        const nowIso = new Date().toISOString();
        const localRunId = `local_audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const selectedStore = storeData?.find((entry) => entry.id === store);

        saveLocalReconcileFallbackRun({
          id: localRunId,
          started_at: nowIso,
          completed_at: nowIso,
          initiated_by_name: "Current User",
          store_id: store === "all" ? null : store,
          store_name: store === "all" ? "All Locations" : selectedStore?.name || null,
          notes: notes || null,
          item_count: successfulEntries.length,
          primary_item_name: successfulEntries[0]?.name || null,
          total_delta: successfulEntries.reduce((sum, row) => sum + row.delta, 0),
          discrepancy_count: successfulEntries.filter((row) => row.delta !== 0).length,
          first_prev: successfulEntries[0]?.previousQuantity,
          first_delta: successfulEntries[0]?.delta,
          items: successfulEntries.map((row, index) => ({
            id: `${localRunId}_line_${index + 1}`,
            item_id: row.id,
            item_name: row.name,
            previous_quantity: row.previousQuantity,
            counted_quantity: row.countedQuantity,
            delta: row.delta,
            counted_at: nowIso,
            counted_by_name: "Current User",
          })),
        });

        resolvedRunId = localRunId;
      }

      if (resolvedRunId) {
        toast.success("Reconciliation submitted successfully");
      } else {
        toast.success(data.audit_warning || "Counts saved. Audit trail is temporarily unavailable.");
      }

      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["reconcileHistory"] });
      queryClient.invalidateQueries({ queryKey: ["reconcilePreview"] });
      setSummaryData({
        ...data,
        run_id: resolvedRunId,
      });
      setShowConfirm(false);
    },
    onError: (err: unknown) => {
      setShowConfirm(false);
      const message =
        (err as { response?: { data?: { error?: string; details?: string; message?: string } } })?.response?.data?.error ||
        (err as { response?: { data?: { error?: string; details?: string; message?: string } } })?.response?.data?.details ||
        (err as { response?: { data?: { error?: string; details?: string; message?: string } } })?.response?.data?.message ||
        "Failed to submit reconciliation";
      toast.error(message);
    }
  });

  const handleCountChange = (id: string, value: string) => {
    const num = Number(value);
    const newCounts = new Map(counts);
    if (!Number.isFinite(num) || value.trim() === "") {
      newCounts.delete(id);
    } else {
      newCounts.set(id, Math.max(0, Math.trunc(num)));
    }
    setCounts(newCounts);
  };

  const handleSubmit = () => {
    if (counts.size === 0) {
      toast.error("Please enter at least one count");
      return;
    }
    reconcileMutation.mutate({
      items: Array.from(counts.entries()).map(([id, quantity]) => ({ id, quantity })),
      store_id: store === "all" ? null : store,
      notes
    });
  };

  const stats = {
    changed: Array.from(counts.entries()).filter(([id, qty]) => {
      const item = previewData?.items.find(i => i.id === id);
      return item && qty !== item.quantity;
    }).length,
    totalDelta: Array.from(counts.entries()).reduce((acc, [id, qty]) => {
      const item = previewData?.items.find(i => i.id === id);
      return acc + (item ? qty - item.quantity : 0);
    }, 0),
    itemsCounted: counts.size
  };

  const filteredItems = useMemo(() => {
    let items = previewData?.items || [];
    
    // Apply type filter
    if (filter === 'discrepancy') {
      items = items.filter(item => {
        const count = counts.get(item.id);
        return count !== undefined && count !== item.quantity;
      });
    } else if (filter === 'uncounted') {
      items = items.filter(item => !counts.has(item.id));
    }

    // Apply Sorting
    return [...items].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'quantity') return b.quantity - a.quantity;
      if (sortBy === 'updated_at') {
        const dateA = a.last_counted_at || a.updated_at || '';
        const dateB = b.last_counted_at || b.updated_at || '';
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      }
      return 0;
    });
  }, [previewData?.items, filter, counts, sortBy]);

  const getLastEditedLabel = (item: Item) => {
    const source = item.last_counted_at || item.updated_at || item.created_at;
    if (!source) return "Never";
    const parsed = new Date(source);
    if (!Number.isFinite(parsed.getTime())) return "Never";
    return parsed.toLocaleString();
  };

  return (
    <AuthLayout>
      <div className="page-container space-y-6 pb-32">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4 shrink-0">
            <button 
              onClick={() => router.back()}
              className="p-2 rounded-xl bg-card-alt border border-border hover:bg-border transition-colors hidden md:block"
            >
              <HiChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
                <HiOutlineClipboardDocumentCheck className="w-6 h-6 text-primary" />
                Inventory Count
              </h1>
              <p className="text-xs md:text-sm text-muted font-medium">Physical stock verification.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
            <div className="relative flex-1 md:w-64">
              <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input 
                type="text"
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-card-alt border border-border rounded-xl pl-9 pr-4 py-2 text-sm font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              />
            </div>
            <Select
              options={[
                { id: "all", label: "All Locations" },
                ...(storeData?.map(s => ({ id: s.id, label: s.name })) || [])
              ]}
              value={store}
              onChange={(val) => { setStore(val); setPage(1); }}
              className="min-w-48"
            />
            
          </div>
        </header>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 p-1.5 bg-card-alt/50 border border-border rounded-2xl">
          {[
            { id: 'all', label: 'All Items' },
            { id: 'low-stock', label: 'Low Stock' },
            { id: 'discrepancy', label: 'Discrepancies' },
            { id: 'uncounted', label: 'Pending' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setFilter(f.id);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                filter === f.id 
                  ? 'bg-primary text-background shadow-lg shadow-primary/20 scale-[1.02]' 
                  : 'text-muted hover:text-foreground hover:bg-border/50'
              }`}
            >
              {f.label}
            </button>
          ))}

          <Select
            options={[
              { id: "name", label: "Sort by Name" },
              { id: "quantity", label: "Sort by Qty" },
              { id: "updated_at", label: "Sort by Last Update" },
            ]}
            value={sortBy}
            onChange={(val) => setSortBy(val as typeof sortBy)}
            className="min-w-44"
          />
        </div>

        <div className="space-y-4">
          {/* Desktop Table */}
          <div className="hidden md:block glass-card rounded-3xl overflow-hidden border border-border/50 shadow-premium">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-card-alt/50 border-b border-border">
                    <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest text-muted">Item Name</th>
                    <th className="px-6 py-4 text-center text-xs font-black uppercase tracking-widest text-muted">Stored At</th>
                    <th className="px-6 py-4 text-center text-xs font-black uppercase tracking-widest text-muted">Current Qty</th>
                    <th className="px-6 py-4 text-center text-xs font-black uppercase tracking-widest text-muted">Physical Count</th>
                    <th className="px-6 py-4 text-center text-xs font-black uppercase tracking-widest text-muted">Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={5} className="px-6 py-8"><div className="h-4 bg-border/20 rounded w-full" /></td>
                      </tr>
                    ))
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center text-muted font-bold">No items match your criteria.</td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const countValue = counts.get(item.id);
                      const delta = countValue !== undefined ? countValue - item.quantity : 0;
                      
                      return (
                        <tr key={item.id} className="hover:bg-card-alt/30 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="font-bold text-foreground">{item.name}</div>
                            <div className="text-xs text-muted flex items-center gap-1 mt-0.5">
                              Last: {getLastEditedLabel(item)}
                              {item.last_counted_by && ` • ${item.last_counted_by.full_name}`}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-primary/10 text-primary border border-primary/20">
                              {item.store?.name || 'General Inventory'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center font-mono font-bold text-foreground">
                            {item.quantity}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => handleCountChange(item.id, String(Math.max(0, (counts.get(item.id) ?? item.quantity) - 1)))}
                                className="w-8 h-8 rounded-lg bg-card-alt border border-border flex items-center justify-center font-bold hover:bg-primary hover:text-background transition-all active:scale-95 text-lg"
                              >
                                −
                              </button>
                              <div className="relative inline-block w-20">
                                <input 
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="--"
                                  value={counts.get(item.id) ?? ""}
                                  onChange={(e) => handleCountChange(item.id, e.target.value)}
                                  className="w-full bg-card border border-border group-hover:border-primary/50 focus:border-primary rounded-xl px-2 py-1.5 text-center font-black text-base transition-all focus:ring-4 focus:ring-primary/10 appearance-none"
                                />
                              </div>
                              <button 
                                onClick={() => handleCountChange(item.id, String((counts.get(item.id) ?? item.quantity) + 1))}
                                className="w-8 h-8 rounded-lg bg-card-alt border border-border flex items-center justify-center font-bold hover:bg-primary hover:text-background transition-all active:scale-95 text-lg"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {countValue !== undefined && (
                              <motion.span 
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className={`text-sm font-black px-3 py-1 rounded-lg ${
                                  delta === 0 ? 'bg-muted/10 text-muted' : 
                                  delta > 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                                }`}
                              >
                                {delta > 0 ? '+' : ''}{delta}
                              </motion.span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-card rounded-2xl p-6 border border-border animate-pulse h-32" />
              ))
            ) : filteredItems.length === 0 ? (
              <div className="bg-card rounded-2xl p-10 border border-border text-center text-muted font-bold">{t("No items match your criteria.")}</div>
            ) : (
              filteredItems.map((item) => {
                const countValue = counts.get(item.id);
                const delta = countValue !== undefined ? countValue - item.quantity : 0;
                return (
                  <motion.div 
                    layout
                    key={item.id}
                    className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm space-y-4"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 pr-4">
                        <div className="font-bold text-foreground leading-tight">{item.name}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full">
                            {item.store?.name || 'General Inventory'}
                          </span>
                          <span className="text-[10px] text-muted font-medium italic">
                            {t("Qty")}: <span className="text-foreground font-black">{item.quantity}</span>
                          </span>
                        </div>
                      </div>
                      
                      {countValue !== undefined && (
                        <div className={`px-2 py-1 rounded-lg text-[10px] font-black ${
                          delta === 0 ? 'bg-muted/10 text-muted' : 
                          delta > 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                        }`}>
                          {delta > 0 ? '+' : ''}{delta}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 relative">
                        <input 
                          type="number"
                          min="0"
                          step="1"
                          placeholder={t("Physical Count")}
                          value={counts.get(item.id) ?? ""}
                          onChange={(e) => handleCountChange(item.id, e.target.value)}
                          className="w-full bg-card-alt border border-border focus:border-primary rounded-xl px-4 py-3 text-sm font-black transition-all outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={() => handleCountChange(item.id, String(Math.max(0, (counts.get(item.id) ?? item.quantity) - 1)))}
                          className="w-10 h-10 rounded-xl bg-card-alt border border-border flex items-center justify-center font-bold hover:bg-primary hover:text-background active:bg-primary active:text-background transition-colors"
                        >
                          -
                        </button>
                        <button 
                          onClick={() => handleCountChange(item.id, String((counts.get(item.id) ?? item.quantity) + 1))}
                          className="w-10 h-10 rounded-xl bg-card-alt border border-border flex items-center justify-center font-bold hover:bg-primary hover:text-background active:bg-primary active:text-background transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {previewData && previewData.total > 10 && (
          <div className="flex justify-center pt-2">
            <PaginationControls 
              page={page}
              totalPages={Math.ceil(previewData.total / 10)}
              onPageChange={setPage}
            />
          </div>
        )}

        {/* Action Bar */}
        <div className="fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] md:bottom-8 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-lg md:max-w-4xl z-40">
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className="bg-card/95 backdrop-blur-3xl border border-white/20 shadow-massive rounded-xl p-3 md:p-4 flex flex-col md:flex-row items-center gap-2 md:gap-4"
          >
            <div className="flex-1 flex items-center justify-around md:justify-start md:gap-8 w-full md:w-auto px-1 md:px-4">
              <div className="flex flex-col items-center md:items-start leading-tight">
                <span className="text-[8px] font-black uppercase tracking-widest text-muted">{t("Counted")}</span>
                <span className="text-sm md:text-xl font-black text-foreground">{stats.itemsCounted}</span>
              </div>
              <div className="flex flex-col items-center md:items-start leading-tight">
                <span className="text-[8px] font-black uppercase tracking-widest text-muted">{t("Diff")}</span>
                <span className={`text-sm md:text-xl font-black ${stats.changed > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {stats.changed}
                </span>
              </div>
              <div className="flex flex-col items-center md:items-start leading-tight">
                <span className="text-[8px] font-black uppercase tracking-widest text-muted">{t("Net")}</span>
                <span className="text-sm md:text-xl font-black text-primary">
                  {stats.totalDelta > 0 ? '+' : ''}{stats.totalDelta}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 w-full md:w-auto">
              <div className="relative group flex-1 md:w-56">
                <input 
                  type="text"
                  placeholder={t("Notes...")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-card-alt border border-border rounded-2xl pl-4 pr-3 py-2 text-xs font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all text-foreground placeholder:text-muted/70"
                />
              </div>
              <button 
                onClick={() => setShowConfirm(true)}
                disabled={counts.size === 0 || reconcileMutation.isPending}
                className="flex items-center justify-center gap-1.5 px-4 md:px-10 py-2.5 md:py-4 rounded-2xl bg-primary text-background font-black hover:opacity-90 transition-all active:scale-95 disabled:bg-card-alt disabled:text-muted shadow-premium whitespace-nowrap text-xs md:text-base border border-primary/20"
              >
                {reconcileMutation.isPending ? '...' : t("Confirm")}
                <HiOutlineChevronRight className="w-3.5 h-3.5 md:w-5 md:h-5" />
              </button>
            </div>
          </motion.div>
        </div>

        <AnimatePresence>
          {summaryData && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setSummaryData(null)}
                className="fixed inset-0 z-80 bg-black/70 backdrop-blur-xl"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="fixed inset-0 z-90 flex items-center justify-center p-4 pointer-events-none"
              >
                <div className="bg-card w-full max-w-lg rounded-xl border border-border/50 shadow-massive p-10 pointer-events-auto text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-linear-to-r from-success via-primary to-primary" />
                  
                  <div className="w-24 h-24 rounded-full bg-success/10 border border-success/20 flex items-center justify-center mx-auto mb-8 shadow-premium">
                    <HiCheckBadge className="w-12 h-12 text-success" />
                  </div>

                  <h2 className="text-4xl font-black text-foreground tracking-tighter mb-4">{t("Count Finalized")}</h2>
                  <p className="text-muted font-medium mb-10 leading-relaxed px-4">
                    {summaryData.run_id ? (
                      <>
                        {t("Reconciliation run")} <code className="text-[10px] bg-card-alt px-2 py-0.5 rounded font-black">{summaryData.run_id.slice(0, 8)}</code> {t("has been securely committed to the audit ledger.")}
                      </>
                    ) : (
                      <>
                        {t("Counts were saved, but the audit trail ledger is temporarily unavailable. Please retry later to restore full audit commit tracking.")}
                      </>
                    )}
                  </p>

                  <div className="grid grid-cols-2 gap-4 mb-10">
                    <div className="p-6 bg-card-alt/50 rounded-3xl border border-border/50">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">{t("Discrepancies")}</p>
                      <p className="text-2xl font-black text-foreground">{summaryData.summary.changed_rows}</p>
                    </div>
                    <div className="p-6 bg-card-alt/50 rounded-3xl border border-border/50">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-1">{t("Net Flow")}</p>
                      <p className={`text-2xl font-black ${summaryData.summary.total_delta === 0 ? 'text-muted' : summaryData.summary.total_delta > 0 ? 'text-success' : 'text-danger'}`}>
                        {summaryData.summary.total_delta > 0 ? '+' : ''}{summaryData.summary.total_delta}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() =>
                        router.push(
                          summaryData.run_id ? `/assets/history?runId=${summaryData.run_id}` : "/assets/history"
                        )
                      }
                      className="w-full py-5 rounded-2xl bg-foreground text-background font-black flex items-center justify-center gap-3 hover:scale-105 transition-all shadow-premium"
                    >
                      {summaryData.run_id ? t("Audit Trail Detail") : t("View Audit History")}
                      <HiOutlineArrowRight className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => {
                        setSummaryData(null);
                        setCounts(new Map());
                        setNotes("");
                      }}
                      className="w-full py-4 text-muted font-black text-xs uppercase tracking-widest hover:text-foreground transition-all"
                    >
                      {t("Dismiss View")}
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}

          {showConfirm && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowConfirm(false)}
                className="fixed inset-0 z-60 bg-black/60 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="fixed inset-0 z-70 flex items-center justify-center p-4 pointer-events-none"
              >
                <div className="bg-card w-full max-w-lg rounded-4xl border border-border shadow-massive p-8 pointer-events-auto overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-4">
                    <button onClick={() => setShowConfirm(false)} className="p-2 rounded-xl hover:bg-card-alt text-muted transition-colors">
                      <HiXMark className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="text-center space-y-3 mb-8">
                    <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-4 border border-primary/20">
                      <HiOutlineClipboardDocumentCheck className="w-10 h-10 text-primary" />
                    </div>
                    <h2 className="text-2xl font-black text-foreground tracking-tight">{t("Finalize Reconciliation?")}</h2>
                    <p className="text-muted font-medium text-sm px-4">
                      {t("You are about to submit")} <strong className="text-foreground">{stats.itemsCounted}</strong> {t("count records. This will create an permanent audit trail for stock adjustments.")}
                    </p>
                  </div>

                  <div className="bg-card-alt/50 rounded-3xl p-6 border border-border mb-8 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-muted">{t("Impacted Items")}</span>
                      <span className="text-lg font-black text-foreground">{stats.changed} {t("adjustments")}</span>
                    </div>
                    {notes && (
                      <div className="border-t border-border pt-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted block mb-1">{t("Operator Notes")}</span>
                        <p className="text-sm font-medium text-foreground italic">&ldquo;{notes}&rdquo;</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4">
                    <button 
                      onClick={() => setShowConfirm(false)}
                      className="flex-1 py-4 rounded-2xl bg-card-alt text-foreground font-black hover:bg-border transition-all active:scale-95 border border-border"
                    >
                      {t("Back to Edit")}
                    </button>
                    <button 
                      onClick={handleSubmit}
                      disabled={reconcileMutation.isPending}
                      className="flex-1 py-4 rounded-2xl bg-primary text-background font-black hover:opacity-90 transition-all active:scale-95 shadow-premium flex items-center justify-center gap-2"
                    >
                      {reconcileMutation.isPending ? '...' : t("Confirm & Post")}
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </AuthLayout>
  );
}
