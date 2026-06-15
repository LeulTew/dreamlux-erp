"use client";

import { Suspense, useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import Select from "@/components/ui/Select";
import {
  clearReconcileHistory,
  deleteReconcileHistoryRun,
  getReconcileHistory,
  getReconcileRunDetail,
  getStores,
  setReconcileHistoryTrash,
  trashAllReconcileHistory,
  undoReconcileHistoryItem,
  undoReconcileHistoryRun,
} from "@/lib/api";
import { ReconcileRun, ReconcileRunDetail, Store } from "@/lib/types";
import { fuzzySearch } from "@/lib/fuzzy-search";
import toast from "react-hot-toast";
import { 
  HiChevronLeft, 
  HiClock, 
  HiUserCircle, 
  HiMapPin, 
  HiChevronRight,
  HiOutlineInboxStack,
  HiXMark,
  HiReceiptPercent,
  HiOutlineCalendarDays,
  HiMagnifyingGlass,
  HiArrowUturnLeft,
  HiTrash
} from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import PaginationControls from "@/components/PaginationControls";
import { useLanguage } from "@/hooks/use-language";

type ConfirmType = "trash" | "delete" | "clear" | "undo" | "undo-item";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "All Time": "All Time",
    "Today": "Today",
    "Last 7 Days": "Last 7 Days",
    "This Month": "This Month",
    "Custom Range": "Custom Range",
    "From": "From",
    "To": "To",
    "Apply Custom Range": "Apply Custom Range",
    "Inventory Audit History": "Inventory Audit History",
    "Monthly reconciliation timeline and adjustment logs.": "Monthly reconciliation timeline and adjustment logs.",
    "Search audits...": "Search audits...",
    "All Locations": "All Locations",
    "Active": "Active",
    "Trash": "Trash",
    "Move All To Trash": "Move All To Trash",
    "Clear Trash": "Clear Trash",
    "Select": "Select",
    "Done": "Done",
    "Deselect All": "Deselect All",
    "Select All on Page": "Select All on Page",
    "Loading history...": "Loading history...",
    "Unable To Load History": "Unable To Load History",
    "The audit feed request failed. Try refresh or check API deployment/auth.": "The audit feed request failed. Try refresh or check API deployment/auth.",
    "Trash Is Empty": "Trash Is Empty",
    "No History Found": "No History Found",
    "Soft-deleted audit entries will appear here.": "Soft-deleted audit entries will appear here.",
    "Run a reconciliation to see adjustments here.": "Run a reconciliation to see adjustments here.",
    "Bulk Reconciliation": "Bulk Reconciliation",
    "diffs": "diffs",
    "Prior → Adjustment": "Prior → Adjustment",
    "Previous": "Previous",
    "Adjust": "Adjust",
    "Batch Summary": "Batch Summary",
    "entries": "entries",
    "Net": "Net",
    "Selected": "Selected",
    "Undo All": "Undo All",
    "Restore": "Restore",
    "Delete": "Delete",
    "Processing...": "Processing...",
    "Undo blocked: item changed since the selected audit entry.": "Undo blocked: item changed since the selected audit entry.",
    "Undo applied with inverse audit record.": "Undo applied with inverse audit record.",
    "Undo blocked: one or more items changed since that run.": "Undo blocked: one or more items changed since that run.",
    "Run undo applied with inverse audit record.": "Run undo applied with inverse audit record.",
    "Bulk undo completed": "Bulk undo completed",
    "Failed to undo some records": "Failed to undo some records",
    "Undo": "Undo",
    "Revert Adjustment?": "Revert Adjustment?",
    "Move to Trash?": "Move to Trash?",
    "Restore Record?": "Restore Record?",
    "Trash All History?": "Trash All History?",
    "Clear Trash?": "Clear Trash?",
    "Delete History Record?": "Delete History Record?",
    "Cancel": "Cancel",
    "Confirm Undo": "Confirm Undo",
    "Move to Trash": "Move to Trash",
    "Move All": "Move All",
    "Clear Permanently": "Clear Permanently",
    "Delete Permanently": "Delete Permanently",
    "This will permanently delete all records in the trash. This cannot be undone.": "This will permanently delete all records in the trash. This cannot be undone.",
    "This creates a new inverse reconciliation run for": "This creates a new inverse reconciliation run for",
    "Undo is only allowed when the item's current quantity still matches the latest recorded final value.": "Undo is only allowed when the item's current quantity still matches the latest recorded final value.",
    "Are you sure you want to move the audit record for": "Are you sure you want to move the audit record for",
    "Are you sure you want to restore the audit record for": "Are you sure you want to restore the audit record for",
    "All active history records will be moved to trash.": "All active history records will be moved to trash.",
    "Are you sure you want to permanently delete the audit record for": "Are you sure you want to permanently delete the audit record for",
    "This action is irreversible.": "This action is irreversible.",
    "Adjustment Report": "Adjustment Report",
    "Summary of item counts and discrepancy adjustments.": "Summary of item counts and discrepancy adjustments.",
    "Items Counted": "Items Counted",
    "Discrepancies": "Discrepancies",
    "Operator Note": "Operator Note",
    "Movement Logs": "Movement Logs",
    "Final": "Final",
    "Record Not Found": "Record Not Found",
    "This run profile is no longer available in the audit log.": "This run profile is no longer available in the audit log.",
    "Close History View": "Close History View",
  },
  am: {
    "All Time": "ሁልጊዜ",
    "Today": "ዛሬ",
    "Last 7 Days": "ላለፉት 7 ቀናት",
    "This Month": "በዚህ ወር",
    "Custom Range": "የተወሰነ ቀን",
    "From": "ከ",
    "To": "እስከ",
    "Apply Custom Range": "ቀን ማስተካከያውን ተግብር",
    "Inventory Audit History": "የንብረት እርቅ ታሪክ",
    "Monthly reconciliation timeline and adjustment logs.": "የወርሃዊ እርቅ ሂደት እና የማስተካከያ ምዝግብ ማስታወሻዎች።",
    "Search audits...": "እርቆችን ፈልግ...",
    "All Locations": "ሁሉም ቦታዎች",
    "Active": "ንቁ",
    "Trash": "ቆሻሻ መጣያ",
    "Move All To Trash": "ሁሉንም ወደ ቆሻሻ መጣያ ውሰድ",
    "Clear Trash": "ቆሻሻ መጣያውን አጽዳ",
    "Select": "ምረጥ",
    "Done": "አጠናቅቅ",
    "Deselect All": "ሁሉንም አትምረጥ",
    "Select All on Page": "በገጹ ያሉትን ሁሉንም ምረጥ",
    "Loading history...": "ታሪክ በመጫን ላይ...",
    "Unable To Load History": "ታሪኩን መጫን አልተቻለም",
    "The audit feed request failed. Try refresh or check API deployment/auth.": "የእርቅ ታሪክ ጥያቄ አልተሳካም። እባክዎን ገጹን ያድሱት ወይም የግንኙነት ሁኔታውን ያረጋግጡ።",
    "Trash Is Empty": "ቆሻሻ መጣያው ባዶ ነው",
    "No History Found": "ምንም ታሪክ አልተገኘም",
    "Soft-deleted audit entries will appear here.": "በጊዜያዊነት የተሰረዙ እርቆች እዚህ ይዘረዘራሉ።",
    "Run a reconciliation to see adjustments here.": "የእቃዎች እርቅ ሲያካሂዱ ማስተካከያዎቹ እዚህ ይዘረዘራሉ።",
    "Bulk Reconciliation": "የጅምላ እርቅ",
    "diffs": "ልዩነቶች",
    "Prior → Adjustment": "ቀድሞ የነበረ → ማስተካከያ",
    "Previous": "የቀድሞ",
    "Adjust": "አስተካክል",
    "Batch Summary": "የቡድን ማጠቃለያ",
    "entries": "መዝገቦች",
    "Net": "የተጣራ",
    "Selected": "ተመርጧል",
    "Undo All": "ሁሉንም መልስ",
    "Restore": "መልስ",
    "Delete": "ሰርዝ",
    "Processing...": "በማቀነባበር ላይ...",
    "Undo blocked: item changed since the selected audit entry.": "መልስ መመለስ አልተቻለም፡ እቃው ከተመረጠው ኦዲት በኋላ ተቀይሯል።",
    "Undo applied with inverse audit record.": "መልስ መመለስ በተሳካ ሁኔታ ተተግብሯል።",
    "Undo blocked: one or more items changed since that run.": "መልስ መመለስ አልተቻለም፡ ከተመረጠው እርቅ በኋላ አንድ ወይም ከዚያ በላይ እቃዎች ተቀይረዋል።",
    "Run undo applied with inverse audit record.": "የእርቅ እርምጃው በተሳካ ሁኔታ ተመልሷል።",
    "Bulk undo completed": "የጅምላ መልስ መመለስ ተጠናቋል",
    "Failed to undo some records": "አንዳንድ መዝገቦችን መመለስ አልተቻለም",
    "Undo": "መልስ",
    "Revert Adjustment?": "ማስተካከያውን መመለስ ይፈልጋሉ?",
    "Move to Trash?": "ወደ ቆሻሻ መጣያ መውሰድ ይፈልጋሉ?",
    "Restore Record?": "መዝገቡን መመለስ ይፈልጋሉ?",
    "Trash All History?": "ሁሉንም ታሪክ ወደ ቆሻሻ መጣያ መውሰድ?",
    "Clear Trash?": "ቆሻሻ መጣያውን ማጽዳት?",
    "Delete History Record?": "የታሪክ መዝገብ መሰረዝ?",
    "Cancel": "ሰርዝ",
    "Confirm Undo": "መመለሱን አረጋግጥ",
    "Move to Trash": "ወደ ቆሻሻ መጣያ ውሰድ",
    "Move All": "ሁሉንም ውሰድ",
    "Clear Permanently": "ለዘላለም አጽዳ",
    "Delete Permanently": "በቋሚነት ሰርዝ",
    "This will permanently delete all records in the trash. This cannot be undone.": "ይህ በቆሻሻ መጣያ ውስጥ ያሉትን ሁሉንም መዝገቦች በቋሚነት ያጠፋል። ይህ ሊመለስ አይችልም።",
    "This creates a new inverse reconciliation run for": "ይህ ተቃራኒ የሆነ አዲስ የእርቅ ሂደት ይፈጥራል ለ",
    "Undo is only allowed when the item's current quantity still matches the latest recorded final value.": "የእቃው የአሁኑ ብዛት ከተመዘገበው የመጨረሻ ዋጋ ጋር የሚዛመድ ከሆነ ብቻ መመለስ ይፈቀዳል።",
    "Are you sure you want to move the audit record for": "የእርቅ መዝገቡን ወደ ቆሻሻ መጣያ መውሰድ እርግጠኛ ነዎት ለ",
    "Are you sure you want to restore the audit record for": "የእርቅ መዝገቡን ከቆሻሻ መጣያ መመለስ እርግጠኛ ነዎት ለ",
    "All active history records will be moved to trash.": "ሁሉም ንቁ የታሪክ መዝገቦች ወደ ቆሻሻ መጣያ ይወሰዳሉ።",
    "Are you sure you want to permanently delete the audit record for": "የእርቅ መዝገቡን በቋሚነት ለመሰረዝ እርግጠኛ ነዎት ለ",
    "This action is irreversible.": "ይህ ተግባር ወደኋላ ሊመለስ የማይችል ነው።",
    "Adjustment Report": "የማስተካከያ ሪፖርት",
    "Summary of item counts and discrepancy adjustments.": "የእቃዎች ቆጠራ እና የልዩነቶች ማስተካከያ ማጠቃለያ።",
    "Items Counted": "የተቆጠሩ እቃዎች",
    "Discrepancies": "ልዩነቶች",
    "Operator Note": "የኦፕሬተር ማስታወሻ",
    "Movement Logs": "የእንቅስቃሴ ምዝግብ ማስታወሻዎች",
    "Final": "የመጨረሻ",
    "Record Not Found": "መዝገቡ አልተገኘም",
    "This run profile is no longer available in the audit log.": "ይህ የእርቅ መዝገብ በኦዲት መዝገብ ውስጥ አይገኝም።",
    "Close History View": "የታሪክ እይታን ዝጋ",
  }
};

interface ConfirmState {
  type: ConfirmType;
  runId?: string;
  itemId?: string;
  itemName?: string;
  quantity?: number;
  expectedCurrentQuantity?: number;
  trashed?: boolean;
  storeId?: string | null;
}

function DateRangePicker({ onRangeChange }: { onRangeChange: (start: string, end: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeRange, setActiveRange] = useState('all');
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const presets = [
    { id: 'all', label: t('All Time') },
    { id: 'today', label: t('Today') },
    { id: 'week', label: t('Last 7 Days') },
    { id: 'month', label: t('This Month') },
  ];

  const handlePreset = (id: string) => {
    setActiveRange(id);
    if (id === 'custom') return; // Stay open for manual input
    
    const end = new Date().toISOString().split('T')[0];
    let start = '';

    if (id === 'today') start = end;
    else if (id === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      start = d.toISOString().split('T')[0];
    } else if (id === 'month') {
      const d = new Date();
      d.setDate(1);
      start = d.toISOString().split('T')[0];
    } else {
      start = '';
    }

    onRangeChange(start, start ? end : '');
    setIsOpen(false);
  };

  const [localStart, setLocalStart] = useState("");
  const [localEnd, setLocalEnd] = useState("");

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-card-alt border border-border px-4 py-2 rounded-xl hover:bg-border transition-all min-w-35"
      >
        <HiOutlineCalendarDays className="w-5 h-5 text-primary shrink-0" />
        <span className="text-sm font-black text-foreground capitalize whitespace-nowrap">
          {presets.find(p => p.id === activeRange)?.label || t('Custom Range')}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-[calc(100vw-2rem)] md:w-80 bg-card border border-border shadow-massive rounded-2xl p-4 z-50 flex flex-col gap-4 overflow-hidden"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-2 gap-2">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handlePreset(p.id)}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeRange === p.id 
                        ? 'bg-primary text-background' 
                        : 'text-muted hover:bg-card-alt hover:text-foreground'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-border space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted tracking-widest px-1">{t("From")}</label>
                  <input 
                    type="date" 
                    value={localStart}
                    onChange={(e) => setLocalStart(e.target.value)}
                    className="w-full bg-card-alt border border-border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted tracking-widest px-1">{t("To")}</label>
                  <input 
                    type="date" 
                    value={localEnd}
                    onChange={(e) => setLocalEnd(e.target.value)}
                    className="w-full bg-card-alt border border-border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-primary transition-colors"
                  />
                </div>
                <button 
                  disabled={!localStart || !localEnd}
                  onClick={() => {
                    setActiveRange('custom');
                    onRangeChange(localStart, localEnd);
                    setIsOpen(false);
                  }}
                  className="w-full py-2.5 rounded-xl bg-foreground text-background text-[10px] font-black uppercase tracking-[0.2em] shadow-lg disabled:opacity-50 active:scale-95 transition-all"
                >
                  {t("Apply Custom Range")}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function HistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const [page, setPage] = useState(1);
  const [store, setStore] = useState<string>("all");
  const [view, setView] = useState<"active" | "trash">("active");
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [searchTerm, setSearchTerm] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const queryClient = useQueryClient();
  const initialRunId = searchParams.get("runId");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      handleResize();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);

  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    initialRunId === "null" ? null : initialRunId
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const { data: storeData } = useQuery<Store[]>({
    queryKey: ["stores"],
    queryFn: getStores,
  });

  const { data: historyData, isLoading, isError } = useQuery<{ runs: ReconcileRun[]; total: number }>({
    queryKey: ["reconcileHistory", view, store, page, dateRange.start, dateRange.end],
    queryFn: () => getReconcileHistory({ 
      view,
      store, 
      page, 
      limit: 10,
      startDate: dateRange.start || undefined,
      endDate: dateRange.end || undefined
    }),
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const filteredRuns = useMemo(() => {
    const runs = historyData?.runs || [];
    if (!searchTerm) return runs;
    return fuzzySearch(runs, searchTerm, {
      keys: ["initiated_by.full_name", "store.name", "notes", "initiated_by_name", "store_name", "primary_item_name"], 
      threshold: 0.3
    });
  }, [historyData?.runs, searchTerm]);

  const refreshHistory = async () => {
    await queryClient.invalidateQueries({ queryKey: ["reconcileHistory"] });
    await queryClient.invalidateQueries({ queryKey: ["reconcileRunDetail"] });
  };

  const getUndoErrorMessage = (error: unknown): string => {
    const response = (error as { response?: { status?: number; data?: { error?: string; details?: string; message?: string } } })?.response;
    if (response?.status === 409) {
      return (
        response.data?.details ||
        t("Undo blocked: only the latest change for this item can be undone.")
      );
    }

    return (
      response?.data?.error ||
      response?.data?.details ||
      response?.data?.message ||
      (error as Error)?.message ||
      t("Undo failed.")
    );
  };

  const trashMutation = useMutation({
    mutationFn: ({ runId, trashed }: { runId: string; trashed: boolean }) =>
      setReconcileHistoryTrash(runId, trashed),
    onSuccess: async (_data, variables) => {
      if (variables.trashed && selectedRunId === variables.runId) {
        setSelectedRunId(null);
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          params.delete("runId");
          const queryString = params.toString();
          router.replace(queryString ? `/assets/history?${queryString}` : "/assets/history");
        }
      }
      setConfirmState(null);
      await refreshHistory();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (runId: string) => deleteReconcileHistoryRun(runId),
    onSuccess: async () => {
      setConfirmState(null);
      await refreshHistory();
    },
  });

  const clearMutation = useMutation({
    mutationFn: clearReconcileHistory,
    onSuccess: async () => {
      setConfirmState(null);
      setSelectedRunId(null);
      setPage(1);
      await refreshHistory();
    },
  });

  const undoMutation = useMutation({
    mutationFn: (payload: {
      runId: string;
      itemId: string;
      quantity: number;
      expectedCurrentQuantity: number;
      itemName?: string;
      storeId?: string | null;
    }) =>
      undoReconcileHistoryItem({
        runId: payload.runId,
        itemId: payload.itemId,
        quantity: payload.quantity,
        expectedCurrentQuantity: payload.expectedCurrentQuantity,
        itemName: payload.itemName,
        store_id: payload.storeId,
      }),
    onSuccess: async (data) => {
      if ((data.failed_item_ids || []).length > 0 || data.count === 0) {
        toast.error(t("Undo blocked: item changed since the selected audit entry."));
      } else {
        toast.success(t("Undo applied with inverse audit record."));
      }
      await refreshHistory();
    },
    onError: (error) => {
      toast.error(getUndoErrorMessage(error));
    },
  });

  const undoRunMutation = useMutation({
    mutationFn: (runId: string) => undoReconcileHistoryRun(runId),
    onSuccess: async (data) => {
      if ((data.failed_item_ids || []).length > 0 || data.count === 0) {
        toast.error(t("Undo blocked: one or more items changed since that run."));
      } else {
        toast.success(t("Run undo applied with inverse audit record."));
      }
      await refreshHistory();
    },
    onError: (error) => {
      toast.error(getUndoErrorMessage(error));
    },
  });

  const trashAllMutation = useMutation({
    mutationFn: trashAllReconcileHistory,
    onSuccess: async () => {
      setConfirmState(null);
      setSelectedRunId(null);
      setSelectedIds(new Set());
      setPage(1);
      await refreshHistory();
    },
  });

  const bulkTrashMutation = useMutation({
    mutationFn: async (payload: { ids: string[]; trashed: boolean }) => {
      await Promise.all(payload.ids.map(id => setReconcileHistoryTrash(id, payload.trashed)));
    },
    onSuccess: async () => {
      setSelectedIds(new Set());
      await refreshHistory();
    }
  });

  const bulkUndoMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await undoReconcileHistoryRun(id);
      }
    },
    onSuccess: async () => {
      toast.success(t("Bulk undo completed"));
      setSelectedIds(new Set());
      await refreshHistory();
    },
    onError: (err) => {
      toast.error(t("Failed to undo some records"));
      console.error(err);
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => deleteReconcileHistoryRun(id)));
    },
    onSuccess: async () => {
      setSelectedIds(new Set());
      await refreshHistory();
    }
  });

  const toggleSelect = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredRuns.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRuns.map(r => r.id)));
    }
  };

  async function onConfirm() {
    if (!confirmState) return;

    try {
      if (confirmState.type === "undo") {
        await undoRunMutation.mutateAsync(confirmState.runId!);
        setConfirmState(null);
      } else if (confirmState.type === "undo-item") {
        await undoMutation.mutateAsync({
          runId: confirmState.runId!,
          itemId: confirmState.itemId!,
          quantity: confirmState.quantity!,
          expectedCurrentQuantity: confirmState.expectedCurrentQuantity!,
          itemName: confirmState.itemName,
          storeId: confirmState.storeId,
        });
        setConfirmState(null);
      } else if (confirmState.type === "trash") {
        await trashMutation.mutateAsync({ runId: confirmState.runId!, trashed: Boolean(confirmState.trashed ?? true) });
      } else if (confirmState.type === "delete") {
        await deleteMutation.mutateAsync(confirmState.runId!);
      } else if (confirmState.type === "clear") {
        if (view === "active") {
          await trashAllMutation.mutateAsync();
        } else {
          await clearMutation.mutateAsync();
        }
      }
    } catch {
      // Mutation-level handlers already provide user-facing feedback.
    }
  }

  const { data: runDetail, isLoading: isLoadingDetail } = useQuery<ReconcileRunDetail>({
    queryKey: ["reconcileRunDetail", selectedRunId],
    queryFn: () => getReconcileRunDetail(selectedRunId!),
    enabled: !!selectedRunId && selectedRunId !== "null",
  });

  const handleCloseDetail = () => {
    setSelectedRunId(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("runId");
    const queryString = params.toString();
    router.replace(queryString ? `/assets/history?${queryString}` : "/assets/history");
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 shrink-0">
            <button 
              onClick={() => router.back()}
              className="p-2 rounded-xl bg-card-alt border border-border hover:bg-border transition-colors"
            >
              <HiChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
                <HiClock className="w-6 h-6 text-primary" />
                Inventory Audit History
              </h1>
              <p className="text-sm text-muted font-medium">Monthly reconciliation timeline and adjustment logs.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap md:flex-nowrap w-full md:w-auto">
            <div className="relative w-full sm:flex-1 md:w-56 min-w-0">
              <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input 
                type="text"
                placeholder="Search audits..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-card-alt border border-border rounded-xl pl-9 pr-4 py-2 text-sm font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              />
            </div>

            <DateRangePicker onRangeChange={(start, end) => {
              setDateRange({ start, end });
              setPage(1);
            }} />
            
            <Select
              options={[
                { id: "all", label: "All Locations" },
                ...(storeData?.map(s => ({ id: s.id, label: s.name })) || [])
              ]}
              value={store}
              onChange={(val) => { setStore(val); setPage(1); }}
              className="w-full sm:min-w-40 sm:w-auto"
            />

            <div className="flex items-center gap-1 bg-card-alt border border-border rounded-xl p-1">
              <button
                onClick={() => {
                  setView("active");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
                  view === "active" ? "bg-primary text-background" : "text-muted hover:text-foreground"
                }`}
              >
                Active
              </button>
              <button
                onClick={() => {
                  setView("trash");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
                  view === "trash" ? "bg-primary text-background" : "text-muted hover:text-foreground"
                }`}
              >
                Trash
              </button>
            </div>

            <button
              onClick={() => setConfirmState({ type: "clear" })}
              disabled={clearMutation.isPending || trashAllMutation.isPending}
              className="px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
            >
              {clearMutation.isPending || trashAllMutation.isPending
                ? "Processing..."
                : view === "active"
                  ? "Move All To Trash"
                  : "Clear Trash"}
            </button>

            <button
              onClick={() => {
                setSelectionMode((prev) => {
                  if (prev) {
                    setSelectedIds(new Set());
                  }
                  return !prev;
                });
              }}
              className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-colors ${
                selectionMode
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card-alt text-foreground hover:bg-border"
              }`}
            >
              {selectionMode ? "Done" : "Select"}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4">
          {!isLoading && filteredRuns.length > 0 && selectionMode && (
            <div className="flex items-center gap-2 px-2">
              <button 
                onClick={selectAll}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted hover:text-foreground hover:bg-card-alt transition-colors"
              >
                <div className={`w-4 h-4 rounded-sm border-2 transition-all flex items-center justify-center ${
                  selectedIds.size === filteredRuns.length ? 'bg-primary border-primary' : 'border-border'
                }`}>
                  {selectedIds.size === filteredRuns.length && <div className="w-2 h-2 bg-background rounded-full scale-[0.6]" />}
                </div>
                {selectedIds.size === filteredRuns.length ? 'Deselect All' : 'Select All on Page'}
              </button>
            </div>
          )}
          
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-card-alt/20 animate-pulse rounded-3xl" />
            ))
          ) : isError ? (
            <div className="py-20 text-center glass-card rounded-4xl border border-danger/30 bg-danger/5 flex flex-col items-center gap-3">
              <HiXMark className="w-10 h-10 text-danger/70" />
              <div>
                <h3 className="text-lg font-bold text-foreground">Unable To Load History</h3>
                <p className="text-sm text-muted">The audit feed request failed. Try refresh or check API deployment/auth.</p>
              </div>
            </div>
          ) : filteredRuns.length === 0 ? (
            <div className="py-20 text-center glass-card rounded-4xl border border-dashed border-border flex flex-col items-center gap-3">
              <HiOutlineInboxStack className="w-12 h-12 text-muted/30" />
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {view === "trash" ? "Trash Is Empty" : "No History Found"}
                </h3>
                <p className="text-sm text-muted">
                  {view === "trash"
                    ? "Soft-deleted audit entries will appear here."
                    : "Run a reconciliation to see adjustments here."}
                </p>
              </div>
            </div>
          ) : (
            filteredRuns.map((run) => (
              <motion.div
                key={run.id}
                initial={{ opacity: 1 }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.995 }}
                onClick={() => {
                  if (selectionMode) {
                    const next = new Set(selectedIds);
                    if (next.has(run.id)) {
                      next.delete(run.id);
                    } else {
                      next.add(run.id);
                    }
                    setSelectedIds(next);
                    return;
                  }
                  setSelectedRunId(run.id);
                }}
                className={`group w-full text-left glass-card border rounded-3xl p-4 md:p-5 shadow-premium hover:shadow-massive hover:border-primary/30 transition-all flex items-center gap-4 cursor-pointer relative ${
                  selectedIds.has(run.id) ? 'bg-primary/5 border-primary/40' : 'border-border/50'
                }`}
              >
                {/* Selection Checkbox */}
                {selectionMode && (
                  <div 
                    onClick={(e) => toggleSelect(run.id, e)}
                    className={`shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                      selectedIds.has(run.id) ? 'bg-primary border-primary' : 'border-border group-hover:border-primary/50'
                    }`}
                  >
                    {selectedIds.has(run.id) && <div className="w-2.5 h-2.5 bg-background rounded-full scale-75" />}
                  </div>
                )}

                <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-card-alt border border-border items-center justify-center text-primary group-hover:bg-primary group-hover:text-background transition-colors">
                      <HiClock className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-3 mb-1">
                        <h3 className="font-black text-foreground text-sm md:text-lg truncate tracking-tight">
                          {run.primary_item_name || "Bulk Reconciliation"}
                        </h3>
                        <span className="flex items-center gap-1 text-[8px] md:text-[10px] font-black uppercase text-muted tracking-[0.15em]">
                          <HiOutlineCalendarDays className="w-2.5 h-2.5" />
                          {new Date(run.completed_at || run.started_at).toLocaleDateString(undefined, {
                            month: 'short', day: 'numeric'
                          })}
                        </span>
                        {run.discrepancy_count !== undefined && run.discrepancy_count > 0 && (
                          <span className="inline-flex shrink-0 px-2 py-0.5 rounded-full bg-amber-500/5 text-amber-500/80 text-[8px] font-black uppercase tracking-widest border border-amber-500/10">
                            {run.discrepancy_count} diffs
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] md:text-[10px] font-black uppercase text-muted/60 tracking-widest">
                        <span className="flex items-center gap-1">
                          <HiMapPin className="w-2.5 h-2.5" />
                          {(typeof run.store === 'object' ? run.store?.name : run.store_name) || 'Main'}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <HiUserCircle className="w-2.5 h-2.5" />
                          {((typeof run.initiated_by === 'object' ? run.initiated_by?.full_name : run.initiated_by_name) || 'Admin').split(' ')[0]}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-3 md:gap-6 pt-3 md:pt-0 border-t md:border-t-0 border-border/50">
                    <div className="flex items-center gap-3">
                      {run.item_count === 1 && run.first_prev !== undefined ? (
                        <div className="flex flex-col items-end">
                          <span className="text-[7px] font-black text-muted/50 uppercase tracking-[0.2em]">Prior → Adjustment</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-bold text-muted uppercase">Previous: {run.first_prev}</span>
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                              (run.first_delta ?? 0) === 0 ? 'bg-muted/10 text-muted' : 
                              (run.first_delta ?? 0) > 0 ? 'bg-success/5 text-success/70 border border-success/10' : 'bg-danger/5 text-danger/70 border border-danger/10'
                            }`}>
                              Adjust {(run.first_delta ?? 0) > 0 ? '+' : ''}{run.first_delta}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end">
                          <span className="text-[7px] font-black text-muted/50 uppercase tracking-[0.2em]">Batch Summary</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-bold text-muted uppercase tracking-tight">{run.item_count} entries</span>
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                              (run.total_delta ?? 0) === 0 ? 'bg-muted/10 text-muted' : 
                              (run.total_delta ?? 0) > 0 ? 'bg-success/5 text-success/70 border border-success/10' : 'bg-danger/5 text-danger/70 border border-danger/10'
                            }`}>
                              Net {(run.total_delta ?? 0) > 0 ? '+' : ''}{run.total_delta}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="p-2 rounded-xl bg-card-alt border border-border group-hover:bg-primary group-hover:border-primary/20 group-hover:text-background transition-all">
                        <HiChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Floating Bulk Actions Bar */}
        <AnimatePresence>
          {selectionMode && selectedIds.size > 0 && (
            <motion.div 
              initial={{ y: 50, opacity: 0, x: '-50%' }}
              animate={{ y: 0, opacity: 1, x: '-50%' }}
              exit={{ y: 50, opacity: 0, x: '-50%' }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl"
            >
              <div className="bg-foreground text-background shadow-massive rounded-4xl px-6 py-4 flex items-center justify-between border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="bg-primary px-3 py-1 rounded-full text-[10px] font-black text-background uppercase tracking-widest">
                    {selectedIds.size} Selected
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setSelectedIds(new Set())}
                    className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                  >
                    <HiXMark className="w-5 h-5" />
                  </button>
                  <div className="w-px h-6 bg-white/10 mx-1" />
                  
                  {view === "active" ? (
                    <>
                      <button 
                        onClick={() => bulkUndoMutation.mutate(Array.from(selectedIds))}
                        disabled={bulkUndoMutation.isPending}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-background text-xs font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
                      >
                        {bulkUndoMutation.isPending ? "..." : "Undo All"}
                      </button>
                      <button 
                        onClick={() => bulkTrashMutation.mutate({ ids: Array.from(selectedIds), trashed: true })}
                        disabled={bulkTrashMutation.isPending}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-danger text-white text-xs font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
                      >
                        {bulkTrashMutation.isPending ? "..." : "Trash"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => bulkTrashMutation.mutate({ ids: Array.from(selectedIds), trashed: false })}
                        disabled={bulkTrashMutation.isPending}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-background text-xs font-black uppercase tracking-widest hover:opacity-90"
                      >
                        {bulkTrashMutation.isPending ? "..." : "Restore"}
                      </button>
                      <button 
                        onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                        disabled={bulkDeleteMutation.isPending}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-danger text-white text-xs font-black uppercase tracking-widest hover:opacity-90"
                      >
                        {bulkDeleteMutation.isPending ? "..." : "Delete"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {historyData && historyData.total > 10 && (
          <div className="pt-4 flex justify-center">
            <PaginationControls 
              page={page}
              totalPages={Math.ceil(historyData.total / 10)}
              onPageChange={setPage}
            />
          </div>
        )}

        <AnimatePresence>

        {confirmState && (
          <>
            <div
              className="fixed inset-0 z-80 bg-black/60 backdrop-blur-md"
              onClick={() => {
                if (clearMutation.isPending || trashAllMutation.isPending || trashMutation.isPending || deleteMutation.isPending || undoMutation.isPending || undoRunMutation.isPending) {
                  return;
                }
                setConfirmState(null);
              }}
            />

            <div className="fixed inset-0 z-90 flex items-end md:items-center justify-center p-0 md:p-4 pointer-events-none">
              <div className="w-full max-w-md bg-card border border-border rounded-t-xl md:rounded-4xl shadow-massive p-7 pointer-events-auto max-h-[90vh] overflow-y-auto">
                <div className="flex justify-center pt-1 pb-2 md:hidden">
                  <div className="w-12 h-1.5 rounded-full bg-border/60" />
                </div>

                <div className="space-y-3 text-center">
                  <h3 className="text-xl font-black text-foreground tracking-tight">
                    {confirmState?.type === "undo" || confirmState?.type === "undo-item" ? "Revert Adjustment?" :
                      confirmState?.type === "trash" ? ((confirmState.trashed ?? true) ? "Move to Trash?" : "Restore Record?") : 
                      confirmState?.type === "clear" ? (view === "active" ? "Trash All History?" : "Clear Trash?") :
                      "Delete History Record?"}
                  </h3>
                  <p className="text-sm text-muted font-medium leading-relaxed">
                    {confirmState?.type === "undo" || confirmState?.type === "undo-item"
                      ? `This creates a new inverse reconciliation run for ${confirmState.itemName || "this item"}. Undo is only allowed when the item's current quantity still matches the latest recorded final value.`
                      : confirmState?.type === "trash"
                        ? ((confirmState.trashed ?? true)
                          ? `Are you sure you want to move the audit record for "${confirmState.itemName}" to trash?`
                          : `Are you sure you want to restore the audit record for "${confirmState.itemName}" from trash?`)
                        : confirmState?.type === "clear"
                          ? (view === "active" ? "All active history records will be moved to trash." : "This will permanently delete all records in the trash. This cannot be undone.")
                          : `Are you sure you want to permanently delete the audit record for "${confirmState.itemName}"? This action is irreversible.`}
                  </p>
                </div>

                <div className="mt-7 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setConfirmState(null)}
                    disabled={clearMutation.isPending || trashAllMutation.isPending || trashMutation.isPending || deleteMutation.isPending || undoMutation.isPending || undoRunMutation.isPending}
                    className="py-3 rounded-2xl bg-card-alt text-foreground font-black border border-border hover:bg-border transition-all disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onConfirm}
                    disabled={clearMutation.isPending || trashAllMutation.isPending || trashMutation.isPending || deleteMutation.isPending || undoMutation.isPending || undoRunMutation.isPending}
                    className={`py-3 rounded-2xl font-black hover:opacity-90 transition-all disabled:opacity-60 ${
                      confirmState?.type !== "undo" && confirmState?.type !== "undo-item" ? "bg-danger text-white" : "bg-primary text-background"
                    }`}
                  >
                    {trashMutation.isPending && confirmState?.type === "trash" ? ((confirmState.trashed ?? true) ? "Moving to Trash..." : "Restoring...") :
                      clearMutation.isPending || trashAllMutation.isPending || deleteMutation.isPending || undoMutation.isPending || undoRunMutation.isPending ? "Processing..." : 
                      confirmState?.type === "undo" || confirmState?.type === "undo-item" ? "Confirm Undo" :
                      confirmState?.type === "trash" ? ((confirmState.trashed ?? true) ? "Move to Trash" : "Restore") : 
                      confirmState?.type === "clear" ? (view === "active" ? "Move All" : "Clear Permanently") :
                      "Delete Permanently"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
          {selectedRunId && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleCloseDetail}
                className="fixed inset-0 z-60 bg-black/60 backdrop-blur-md"
              />
              <motion.div 
                initial={isMobile ? { y: '100%' } : { x: '100%' }}
                animate={isMobile ? { y: 0 } : { x: 0 }}
                exit={isMobile ? { y: '100%' } : { x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className={`fixed bg-card z-70 border-white/10 shadow-massive overflow-hidden flex flex-col ${
                  isMobile 
                    ? "inset-x-0 bottom-0 top-[10%] rounded-t-xl border-t" 
                    : "right-0 top-0 bottom-0 w-full max-w-2xl border-l"
                }`}
              >
                <header className="px-8 py-6 md:p-8 border-b border-border flex items-center justify-between">
                  {isMobile && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-border/60" />
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-black text-foreground tracking-tight">Adjustment Report</h2>
                    </div>
                    <p className="text-sm font-medium text-muted">Summary of item counts and discrepancy adjustments.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        if (runDetail) {
                          if (view === "trash") {
                            setConfirmState({
                              type: "trash",
                              runId: runDetail.id,
                              itemName: runDetail.primary_item_name || "this run",
                              trashed: false,
                            });
                            return;
                          }

                          setConfirmState({
                            type: "undo",
                            runId: runDetail.id,
                            itemName: runDetail.primary_item_name || "this run",
                          });
                        }
                      }}
                      className="p-3 rounded-2xl bg-primary/10 text-primary hover:bg-primary hover:text-background transition-all"
                      title={view === "trash" ? "Restore Run" : "Undo Entire Run"}
                    >
                      {view === "trash" ? <HiOutlineInboxStack className="w-5 h-5" /> : <HiArrowUturnLeft className="w-5 h-5" />}
                    </button>
                    <button 
                      onClick={() => {
                        if (runDetail) {
                          setConfirmState({
                            type: "trash",
                            runId: runDetail.id,
                            itemName: runDetail.primary_item_name || "this run",
                            trashed: true,
                          });
                        }
                      }}
                      hidden={view === "trash"}
                      disabled={trashMutation.isPending}
                      className="p-3 rounded-2xl bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all disabled:opacity-60"
                      title="Move Run to Trash"
                    >
                      <HiTrash className={`w-5 h-5 ${trashMutation.isPending ? "animate-pulse" : ""}`} />
                    </button>
                    <button 
                      onClick={handleCloseDetail}
                      className="p-3 rounded-2xl bg-card-alt hover:bg-border transition-colors text-muted"
                    >
                      <HiXMark className="w-6 h-6" />
                    </button>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                  {isLoadingDetail ? (
                    <div className="space-y-4">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-16 bg-card-alt/20 animate-pulse rounded-2xl" />
                      ))}
                    </div>
                  ) : runDetail ? (
                    <>
                      <section className="grid grid-cols-2 gap-4">
                        <div className="p-5 rounded-3xl bg-card-alt/50 border border-border">
                          <p className="text-[10px] font-black uppercase text-muted tracking-widest mb-1">Items Counted</p>
                          <p className="text-2xl font-black text-foreground">{runDetail.items.length}</p>
                        </div>
                        <div className="p-5 rounded-3xl bg-card-alt/50 border border-border">
                          <p className="text-[10px] font-black uppercase text-muted tracking-widest mb-1">Discrepancies</p>
                          <p className="text-2xl font-black text-amber-500">
                            {runDetail.items.filter(i => i.delta !== 0).length}
                          </p>
                        </div>
                      </section>

                      {runDetail.notes && 
                        !runDetail.notes.startsWith("System Correction") && 
                        !runDetail.notes.startsWith("Physical Count") && 
                        !runDetail.notes.toLowerCase().includes("legacy") &&
                        !runDetail.notes.includes("update event for table") && (
                        <section className="bg-primary/5 border border-primary/10 p-6 rounded-3xl relative overflow-hidden">
                          <HiReceiptPercent className="absolute -right-2 -bottom-2 w-24 h-24 text-primary/5 rotate-12" />
                          <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-2">Operator Note</h3>
                          <p className="text-sm font-medium text-foreground relative z-10 leading-relaxed font-mono">
                            &ldquo;{runDetail.notes}&rdquo;
                          </p>
                        </section>
                      )}

                      <section className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-muted">Movement Logs</h3>
                        <div className="space-y-2">
                          {runDetail.items.map((entry) => (
                            <div key={entry.id} className="group p-4 rounded-2xl border border-border hover:border-primary/30 hover:bg-card-alt/30 transition-all flex items-center justify-between">
                              <div className="space-y-0.5">
                                <p className="font-bold text-foreground">{entry.item_name}</p>
                                <div className="flex items-center gap-2 text-[10px] font-bold text-muted uppercase">
                                  <span>Previous: {entry.previous_quantity}</span>
                                  <span>•</span>
                                  <span>Adjust: {entry.delta > 0 ? '+' : ''}{entry.delta}</span>
                                  <span>•</span>
                                  <span>Final: {entry.counted_quantity}</span>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-3 text-right">
                                <div>
                                  <span className={`inline-block px-3 py-1 rounded-lg text-sm font-black ${
                                    entry.delta === 0 ? 'bg-muted/10 text-muted' : 
                                    entry.delta > 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                                  }`}>
                                    {entry.delta > 0 ? '+' : ''}{entry.delta}
                                  </span>
                                  <p className="text-[10px] font-medium text-muted mt-1">
                                    by {entry.counted_by_name}
                                  </p>
                                </div>
                                {entry.delta !== 0 && view !== "trash" && (
                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (!runDetail) return;
                                      setConfirmState({
                                        type: "undo-item",
                                        runId: runDetail.id,
                                        itemId: entry.item_id,
                                        itemName: entry.item_name,
                                        quantity: entry.previous_quantity,
                                        expectedCurrentQuantity: entry.counted_quantity,
                                        storeId: runDetail.store_id || (typeof runDetail.store === 'object' ? runDetail.store?.id : null),
                                      });
                                    }}
                                    disabled={undoMutation.isPending || deleteMutation.isPending || trashMutation.isPending}
                                    className="px-3 py-2 rounded-xl border border-border text-[10px] font-black uppercase tracking-widest hover:border-primary disabled:opacity-60"
                                  >
                                    {undoMutation.isPending ? "Undoing..." : "Undo"}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-4">
                      <div className="w-20 h-20 rounded-4xl bg-danger/5 border border-danger/10 flex items-center justify-center">
                        <HiXMark className="w-10 h-10 text-danger" />
                      </div>
                      <div>
                        <h4 className="font-black text-foreground">Record Not Found</h4>
                        <p className="text-sm text-muted">This run profile is no longer available in the audit log.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-8 border-t border-border bg-card-alt/20">
                  <button 
                    onClick={handleCloseDetail}
                    className="w-full py-4 rounded-2xl bg-card border border-border text-foreground font-black hover:bg-border transition-all shadow-premium"
                  >
                    Close History View
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
  );
}

export default function HistoryPage() {
  return (
    <AuthLayout>
      <Suspense
        fallback={
          <div className="max-w-5xl mx-auto py-20 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold text-muted animate-pulse">Loading history...</p>
          </div>
        }
      >
        <HistoryContent />
      </Suspense>
    </AuthLayout>
  );
}
