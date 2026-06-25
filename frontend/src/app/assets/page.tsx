"use client";
import { Button } from "@/components/ui/button";
import { PillButton } from "@/components/ui/PillButton";
import DatePicker from "@/components/ui/DatePicker";
import { Suspense, useState, useCallback, useMemo, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import {
  getItems,
  getStores,
  updateItem,
  deleteItem,
  recoverItem,
  bulkDeleteItems,
  reconcileItems,
  exportExcel,
  exportCSV,
} from "@/lib/api";
import { Item, Store, ItemsResponse } from "@/lib/types";
import AuthLayout from "@/components/AuthLayout";
import OfficeFilterChips from "@/components/OfficeFilterChips";
import ImageCell from "@/components/ImageCell";
import MobileAssetCard from "@/components/MobileAssetCard";
import EditAssetSheet from "@/components/EditAssetSheet";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import PaginationControls from "@/components/PaginationControls";
import AdvancedStatsDashboard from "@/components/AdvancedStatsDashboard";
import AdvancedFilterBuilder, { FilterRule } from "@/components/AdvancedFilterBuilder";
import { useAuth } from "@/hooks/useAuth";
import toast from "react-hot-toast";
import { fuzzySearch } from "@/lib/fuzzy-search";
import { useLanguage } from "@/hooks/use-language";
import { SortableHeader } from "@/components/ui/SortableHeader";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Assets": "Assets",
    "Asset Catalog": "Managing asset catalog",
    "Total Records": "Total Records",
    "Search": "Search...",
    "All Offices": "All Offices",
    "Low Stock": "Low Stock",
    "Active Catalog": "Active Catalog",
    "Add Asset": "Add Asset",
    "Quick Edit": "Quick Edit",
    "Reconcile": "Reconcile",
    "Done": "Done",
    "Select": "Select",
    "Export": "Export",
    "Choose Format": "Choose Format",
    "CSV Spreadsheet": "CSV Spreadsheet",
    "Excel Workbook": "Excel Workbook",
    "Image": "Image",
    "Asset Name": "Asset Name",
    "Qty": "Qty",
    "Office": "Office",
    "Actions": "Actions",
    "Selected": "Selected",
    "Delete": "Delete",
    "Save Changes": "Save Changes",
    "Cancel": "Cancel",
    "No assets found": "No assets found",
    "Delete Record": "Delete Record",
    "Delete Warning": "Are you sure you want to delete this asset?",
    "Delta": "Delta",
    "View Only": "View Only",
    "Counted": "Counted",
    "by": "by",
    "Edit": "Edit",
    "Recover": "Recover"
  },
  am: {
    "Assets": "ንብረቶች",
    "Asset Catalog": "የንብረት መዝገብ መቆጣጠሪያ",
    "Total Records": "ጠቅላላ መዝገቦች",
    "Search": "ፈልግ...",
    "All Offices": "ሁሉም ቢሮዎች",
    "Low Stock": "ያለቀባቸው ንብረቶች",
    "Active Catalog": "ንቁ መዝገብ",
    "Add Asset": "ንብረት መዝግብ",
    "Quick Edit": "ፈጣን ማስተካከያ",
    "Reconcile": "ማስታረቅ",
    "Done": "አጠናቅቅ",
    "Select": "ምረጥ",
    "Export": "ላክ",
    "Choose Format": "ቅርጸት ይምረጡ",
    "CSV Spreadsheet": "CSV ሰንጠረዥ",
    "Excel Workbook": "Excel ሰንጠረዥ",
    "Image": "ምስል",
    "Asset Name": "የንብረት ስም",
    "Qty": "ብዛት",
    "Office": "ቢሮ",
    "Actions": "ክንውኖች",
    "Selected": "ተመርጧል",
    "Delete": "ሰርዝ",
    "Save Changes": "ለውጦችን አስቀምጥ",
    "Cancel": "ሰርዝ",
    "No assets found": "ምንም ንብረት አልተገኘም",
    "Delete Record": "ንብረት ሰርዝ",
    "Delete Warning": "ይህንን ንብረት መሰረዝ እርግጠኛ ነዎት?",
    "Delta": "ልዩነት",
    "View Only": "ለማየት ብቻ",
    "Counted": "የተቆጠረው",
    "by": "በ",
    "Edit": "አስተካክል",
    "Recover": "መልስ"
  }
};
import {
  HiPlus,
  HiMiniArrowUturnLeft,
  HiTrash,
  HiCheckCircle,
  HiPencilSquare,
  HiTableCells,
  HiDocumentText,
  HiDocumentArrowDown,
} from "react-icons/hi2";
import Select from "@/components/ui/Select";

import QuantityModal from "@/components/QuantityModal";
import ReconcileReviewModal from "@/components/ReconcileReviewModal";

const columnHelper = createColumnHelper<Item>();

type InlineFieldUpdate =
  | { field: "name"; value: string }
  | { field: "description"; value: string }
  | { field: "quantity"; value: number }
  | { field: "store_id"; value: string };

type InlineMutationPayload = InlineFieldUpdate & { id: string };

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function useAssetsTable(
  items: Item[],
  columns: ReturnType<typeof buildColumns>,
) {
  "use no memo";
  // eslint-disable-next-line react-hooks/incompatible-library
  return useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
}

function buildColumns(
  editMode: boolean,
  selectMode: boolean,
  selectedIds: Set<string>,
  toggleSelect: (id: string) => void,
  offices: Store[],
  debouncedUpdate: (id: string, field: string, value: string | number) => void,
  setEditingItem: (item: Item) => void,
  setItemToDelete: (item: Item) => void,
  canManageAssets: boolean,
  showTrash: boolean,
  recoverMutation: {
    mutate: (payload: { id: string; quantity: number }) => void;
  },
  toggleSelectAll: () => void,
  isAllSelected: boolean,
  reconcileMode: boolean,
  reconcileCounts: Map<string, number>,
  setReconcileCount: (id: string, qty: number) => void,
  setItemToRecover: (item: Item) => void,
  t: (key: string) => string,
  sortBy: string,
  sortOrder: string,
  setSortBy: (val: string) => void,
  setSortOrder: (val: string) => void,
) {
  return [
    ...(selectMode
      ? [
          columnHelper.display({
            id: "select",
            header: () => (
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                className="w-4.5 h-4.5 rounded border-border accent-primary cursor-pointer"
              />
            ),
            cell: ({ row }) => (
              <input
                type="checkbox"
                checked={selectedIds.has(row.original.id)}
                onChange={() => toggleSelect(row.original.id)}
                className="w-4.5 h-4.5 rounded border-border accent-primary cursor-pointer"
              />
            ),
            size: 40,
          }),
        ]
      : []),
    columnHelper.display({
      id: "image",
      header: t("Image"),
      cell: ({ row }) => (
        <ImageCell src={row.original.image_url} alt={row.original.name} />
      ),
      size: 80,
    }),
    columnHelper.accessor("name", {
      header: () => (
        <SortableHeader
          label={t("Asset Name")}
          sortKey="name"
          currentSortBy={sortBy}
          currentSortOrder={sortOrder}
          onSort={(key, order) => {
            setSortBy(key);
            setSortOrder(order);
          }}
        />
      ),
      cell: ({ row, getValue }) =>
        editMode ? (
          <div className="flex-1">
            <input
              type="text"
              defaultValue={getValue()}
              onChange={(e) => debouncedUpdate(row.original.id, "name", e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingItem(row.original)}
            className="font-medium text-foreground hover:text-primary transition-all text-left cursor-pointer hover:underline"
          >
            {getValue()}
          </button>
        ),
    }),
    columnHelper.accessor("quantity", {
      header: () => (
        <SortableHeader
          label={t("Qty")}
          sortKey="quantity"
          currentSortBy={sortBy}
          currentSortOrder={sortOrder}
          onSort={(key, order) => {
            setSortBy(key);
            setSortOrder(order);
          }}
        />
      ),
      cell: ({ row, getValue }) => {
        if (reconcileMode) {
          const currentCount = reconcileCounts.get(row.original.id) ?? getValue();
          const diff = currentCount - getValue();
          return (
            <div className="flex flex-col gap-1 items-center">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setReconcileCount(row.original.id, Math.max(0, currentCount - 1))}
                  className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center font-bold hover:bg-accent hover:text-white transition-all active:scale-90"
                >
                  −
                </button>
                <input
                  type="number"
                  value={currentCount}
                  min={0}
                  onChange={(e) => setReconcileCount(row.original.id, parseInt(e.target.value) || 0)}
                  className="w-16 px-1 py-1.5 rounded-lg border-2 border-accent bg-accent/5 text-foreground text-center font-semibold focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all text-sm appearance-none"
                />
                <button
                  onClick={() => setReconcileCount(row.original.id, currentCount + 1)}
                  className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center font-bold hover:bg-accent hover:text-white transition-all active:scale-90"
                >
                  +
                </button>
              </div>
              {diff !== 0 && (
                <span className={`text-[10px] font-semibold uppercase ${diff > 0 ? "text-emerald-500 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"}`}>
                  {diff > 0 ? `+${diff}` : diff} {t("Delta")}
                </span>
              )}
            </div>
          );
        }
        return editMode ? (
          <input
            type="number"
            defaultValue={getValue()}
            min={0}
            onChange={(e) =>
              debouncedUpdate(
                row.original.id,
                "quantity",
                parseInt(e.target.value),
              )
            }
            className="w-20 px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-center font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        ) : (
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">{getValue()}</span>
            {row.original.last_counted_at && (
              <span className="text-[10px] text-muted font-medium">
                {t("Counted")}: {new Date(row.original.last_counted_at).toLocaleDateString()}
                {row.original.last_counted_by && ` ${t("by")} ${row.original.last_counted_by.full_name}`}
              </span>
            )}
          </div>
        );
      },
      size: 80,
    }),
    columnHelper.accessor("store.name", {
      header: t("Office"),
      cell: ({ row, getValue }) =>
        editMode ? (
          <Select
            options={offices.map((s) => ({ id: s.id, label: s.name }))}
            value={row.original.store.id}
            onChange={(val) => debouncedUpdate(row.original.id, "store_id", val)}
          />
        ) : (
          <span className="inline-block px-3 py-1 rounded-full bg-primary-light text-primary-dark text-xs font-medium">
            {getValue()}
          </span>
        ),
    }),
    columnHelper.display({
      id: "actions",
      header: t("Actions"),
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {!canManageAssets ? (
            <span className="text-[10px] font-semibold text-muted/50 uppercase tracking-wider px-2">{t("View Only")}</span>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setEditingItem(row.original)}
                className="p-2 rounded-lg hover:bg-primary-light text-muted hover:text-primary transition-all"
                title={t("Edit")}
              >
                <HiPencilSquare className="w-4 h-4" />
              </button>
              {showTrash ? (
                <button
                  onClick={() => setItemToRecover(row.original)}
                  className="p-2 rounded-lg hover:bg-green-50 text-muted hover:text-success transition-all"
                  title={t("Recover")}
                >
                  <HiMiniArrowUturnLeft className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => setItemToDelete(row.original)}
                  className="p-2 rounded-lg hover:bg-red-50 text-muted hover:text-danger transition-all"
                  title={t("Delete")}
                >
                  <HiTrash className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      ),
      size: 100,
    }),
  ];
}

type StockFilterMode = "all" | "low-stock";

function AssetsContent() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [officeFilter, setOfficeFilter] = useState(() => searchParams.get("store") || "all");
  const [stockFilter, setStockFilter] = useState<StockFilterMode>(() =>
    searchParams.get("filter") === "low-stock" ? "low-stock" : "all"
  );
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") || "");
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("q") || "");
  const [fromDateTime, setFromDateTime] = useState(() => searchParams.get("from") || "");
  const [toDateTime, setToDateTime] = useState(() => searchParams.get("to") || "");
  const [advancedFilters, setAdvancedFilters] = useState<FilterRule[]>([]);
  const [filterLogic, setFilterLogic] = useState<"and" | "or">("and");
  const [limit, setLimit] = useState(10);
  const showTrash = false;
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [reconcileMode, setReconcileMode] = useState(() => searchParams.get("reconcile") === "true");
  const [reconcileCounts, setReconcileCounts] = useState<Map<string, number>>(new Map());
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);
  const [itemToRecover, setItemToRecover] = useState<Item | null>(null);
  const [showReconcileReview, setShowReconcileReview] = useState(false);

  const [page, setPage] = useState(1);
  const [editMode, setEditMode] = useState(false);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  useEffect(() => {
    const urlStore = searchParams.get("store") || "all";
    if (urlStore !== officeFilter) {
      setTimeout(() => setOfficeFilter(urlStore), 0);
    }

    const urlFilter = searchParams.get("filter") === "low-stock" ? "low-stock" : "all";
    if (urlFilter !== stockFilter) {
      setTimeout(() => setStockFilter(urlFilter), 0);
    }

    const urlQ = searchParams.get("q") || "";
    if (urlQ !== searchInput) {
      setTimeout(() => setSearchInput(urlQ), 0);
    }

    const urlFrom = searchParams.get("from") || "";
    if (urlFrom !== fromDateTime) {
      setTimeout(() => setFromDateTime(urlFrom), 0);
    }

    const urlTo = searchParams.get("to") || "";
    if (urlTo !== toDateTime) {
      setTimeout(() => setToDateTime(urlTo), 0);
    }

    const urlReconcile = searchParams.get("reconcile") === "true";
    if (urlReconcile !== reconcileMode) {
      setTimeout(() => setReconcileMode(urlReconcile), 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (officeFilter !== "all") params.set("store", officeFilter);
    if (stockFilter === "low-stock") params.set("filter", "low-stock");
    if (searchTerm) params.set("q", searchTerm);
    if (fromDateTime) params.set("from", fromDateTime);
    if (toDateTime) params.set("to", toDateTime);
    if (reconcileMode) params.set("reconcile", "true");

    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [officeFilter, stockFilter, searchTerm, fromDateTime, toDateTime, reconcileMode, pathname, router]);

  const { data: offices = [] } = useQuery<Store[]>({
    queryKey: ["offices"],
    queryFn: getStores,
  });

  const { data, isLoading } = useQuery<ItemsResponse>({
    queryKey: ["assets", officeFilter, page, limit, stockFilter, searchTerm, fromDateTime, toDateTime, sortBy, sortOrder],
    queryFn: () =>
      getItems(
        page,
        limit,
        searchTerm || undefined,
        officeFilter === "all" ? undefined : officeFilter,
        false,
        undefined,
        stockFilter === "low-stock" ? "low-stock" : undefined,
        fromDateTime || undefined,
        toDateTime || undefined,
        sortBy,
        sortOrder,
      ),
  });

  const items = useMemo(() => data?.items || [], [data?.items]);
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const filteredItems = useMemo(() => {
    let result = items;

    if (searchTerm) {
      result = fuzzySearch(result, searchTerm, {
        keys: ["name", "description", "store.name"],
        threshold: 0.35,
      });
    }

    if (advancedFilters.length > 0) {
      result = result.filter(item => {
        const matchFn = filterLogic === "or" ? "some" : "every";
        return advancedFilters[matchFn](rule => {
          let fieldVal: string | number | undefined;
          if (rule.field === "store.name") fieldVal = item.store?.name;
          else if (rule.field === "description") fieldVal = item.description || undefined;
          else if (rule.field === "name") fieldVal = item.name;
          else if (rule.field === "quantity") fieldVal = item.quantity;
          else fieldVal = undefined;

          if (fieldVal === undefined || fieldVal === null) return false;

          const sVal = String(fieldVal).toLowerCase();
          const rVal = rule.value.toLowerCase();
          const nVal = Number(fieldVal);
          const nrVal = Number(rule.value);

          switch (rule.operator) {
            case "contains": return sVal.includes(rVal);
            case "equals": return sVal === rVal;
            case "not_equals": return sVal !== rVal;
            case "greater_than": return !isNaN(nVal) && !isNaN(nrVal) && nVal > nrVal;
            case "less_than": return !isNaN(nVal) && !isNaN(nrVal) && nVal < nrVal;
            case "between": {
              const parts = rule.value.split("|");
              const start = parts[0] || "";
              const end = parts[1] || "";
              return sVal >= start.toLowerCase() && sVal <= end.toLowerCase();
            }
            default: return true;
          }
        });
      });
    }

    return result;
  }, [items, searchTerm, advancedFilters, filterLogic]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredItems.length) return new Set();
      return new Set(filteredItems.map((i) => i.id));
    });
  }, [filteredItems]);

  const inlineUpdateMutation = useMutation({
    mutationFn: ({ id, field, value }: InlineMutationPayload) =>
      updateItem(id, { [field]: value }),
    onSuccess: () => {
      toast.success("Updated");
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
    },
    onError: () => {
      toast.error("Update failed");
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => {
      toast.success("Asset deleted");
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
    },
    onError: () => {
      toast.error("Failed to delete");
    },
  });

  const recoverMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      recoverItem(id, quantity),
    onSuccess: () => {
      toast.success("Asset recovered");
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
    },
    onError: () => {
      toast.error("Failed to recover");
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: (counts: { id: string; quantity: number }[]) => reconcileItems(counts),
    onSuccess: () => {
      toast.success("Inventory Reconciled");
      setReconcileMode(false);
      setReconcileCounts(new Map());
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
    },
    onError: () => {
      toast.error("Reconciliation failed");
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteItems(ids),
    onSuccess: (_, ids) => {
      toast.success(`Deleted ${ids.length} asset${ids.length !== 1 ? "s" : ""}`);
      setShowBulkDeleteModal(false);
      setSelectedIds(new Set());
      setSelectMode(false);
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
    },
    onError: () => {
      toast.error("Bulk delete failed");
    },
  });

  const setReconcileCount = (id: string, qty: number) => {
    setReconcileCounts(prev => {
      const next = new Map(prev);
      next.set(id, qty);
      return next;
    });
  };

  const handleApplyReconciliation = () => {
    if (reconcileCounts.size === 0) {
      setReconcileMode(false);
      return;
    }
    setShowReconcileReview(true);
  };

  const confirmReconciliation = () => {
    const payload = Array.from(reconcileCounts.entries()).map(([id, quantity]) => ({ id, quantity }));
    reconcileMutation.mutate(payload, {
      onSuccess: () => setShowReconcileReview(false)
    });
  };

  const reviewBatch = useMemo(() => {
    return Array.from(reconcileCounts.entries()).map(([id, quantity]) => {
      const item = items.find(i => i.id === id);
      return {
        id,
        name: item?.name || "Unknown Asset",
        expected: item?.quantity || 0,
        actual: quantity
      };
    });
  }, [reconcileCounts, items]);

  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);

  const { hasPermission, isLoading: authLoading } = useAuth();
  const canManageAssets =
    hasPermission("assets:write") ||
    hasPermission("assets:delete") ||
    hasPermission("assets:reconcile");

  const handleExportPDF = () => {
    if (total === 0) {
      toast.error("No items to export");
      return;
    }
    window.open(`/report?store=${officeFilter}`, "_blank");
  };

  const handleExportExcel = async () => {
    if (total === 0) {
      toast.error("No items to export");
      return;
    }
    setExportingXlsx(true);
    try {
      await exportExcel(officeFilter);
      toast.success("Excel downloaded!");
    } catch {
      toast.error("Excel export failed");
    }
    setExportingXlsx(false);
  };

  const handleExportCSV = async () => {
    if (total === 0) {
      toast.error("No items to export");
      return;
    }
    setExportingCSV(true);
    try {
      await exportCSV(officeFilter);
      toast.success("CSV downloaded!");
    } catch {
      toast.error("CSV export failed");
    }
    setExportingCSV(false);
  };

  const debouncedUpdate = useCallback(
    (id: string, field: string, value: string | number) => {
      const key = `${id}-${field}`;
      if (debounceTimers.has(key)) {
        clearTimeout(debounceTimers.get(key)!);
      }
      debounceTimers.set(
        key,
        setTimeout(() => {
          inlineUpdateMutation.mutate({
            id,
            field,
            value,
          } as InlineMutationPayload);
          debounceTimers.delete(key);
        }, 800),
      );
    },
    [inlineUpdateMutation],
  );

  const columns = buildColumns(
    editMode,
    selectMode,
    selectedIds,
    toggleSelect,
    offices,
    debouncedUpdate,
    setEditingItem,
    setItemToDelete,
    canManageAssets,
    showTrash,
    recoverMutation,
    toggleSelectAll,
    filteredItems.length > 0 && selectedIds.size === filteredItems.length,
    reconcileMode,
    reconcileCounts,
    setReconcileCount,
    setItemToRecover,
    t,
    sortBy,
    sortOrder,
    setSortBy,
    setSortOrder,
  );

  const table = useAssetsTable(filteredItems, columns);

  const handleBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedIds));
  };

  return (
    <div className="page-container pb-12">
        {/* Header */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-border/40">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{t("Assets")}</h1>
              <p className="text-sm text-muted font-medium">{total} {t("Total Records")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <Button
               onClick={handleExportPDF}
               variant="secondary"
               className="h-11 px-4 text-xs font-semibold"
             >
               <HiDocumentText className="w-4.5 h-4.5 text-danger" />
               {t("PDF")}
             </Button>
             <Button
               onClick={handleExportExcel}
               disabled={exportingXlsx}
               variant="secondary"
               className="h-11 px-4 text-xs font-semibold"
             >
               <HiTableCells className="w-4.5 h-4.5 text-success" />
               {t("XLSX")}
             </Button>
             <Button
               onClick={handleExportCSV}
               disabled={exportingCSV}
               variant="secondary"
               className="h-11 px-4 text-xs font-semibold"
             >
               <HiDocumentArrowDown className="w-4.5 h-4.5 text-accent" />
               {t("CSV")}
             </Button>

             <div className="w-px h-6 bg-border hidden sm:block mx-1" />

            <Button
              onClick={() => {
                if (reconcileMode) {
                  setReconcileMode(false);
                  setReconcileCounts(new Map());
                } else {
                  setReconcileMode(true);
                  setEditMode(false);
                  setSelectMode(false);
                }
              }}
              variant={reconcileMode ? "default" : "secondary"}
              className="px-4 py-2 text-sm font-medium h-auto"
            >
              <HiCheckCircle className="w-4 h-4" />
              {reconcileMode ? t("Cancel Count") : t("Reconcile")}
            </Button>

            <button
              onClick={() => {
                setSelectMode(false);
                setReconcileMode(false);
                setSelectedIds(new Set());
                router.push("/assets/trash");
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all bg-card-alt text-foreground border border-border"
            >
              <HiTrash className="w-4 h-4" />
              {t("Trash")}
            </button>
            <Button
              onClick={() => {
                setEditMode(!editMode);
                setReconcileMode(false);
              }}
              variant={editMode ? "outline" : "secondary"}
              className="hidden md:flex px-4 py-2 text-sm font-medium h-auto"
            >
              <HiPencilSquare className="w-4 h-4" />
              {editMode ? t("Done") : t("Quick Edit")}
            </Button>
            <Button
              onClick={() => {
                setSelectMode(!selectMode);
                setReconcileMode(false);
                if (selectMode) setSelectedIds(new Set());
              }}
              variant={selectMode ? "outline" : "secondary"}
              className="hidden md:flex px-4 py-2 text-sm font-medium h-auto"
            >
              <HiTableCells className="w-4.5 h-4.5" />
              {selectMode ? t("Cancel Selection") : t("Select")}
            </Button>

            {!authLoading && canManageAssets && (
              <>
                <div className="w-px h-6 bg-border hidden sm:block mx-1" />
                <PillButton
                  onClick={() => router.push("/assets/insert")}
                  variant="primary"
                  className="h-11 px-6 text-sm font-bold shadow-md shadow-amber-500/10"
                  icon={
                    <HiPlus className="w-4.5 h-4.5" />
                  }
                >
                  {t("Add Asset")}
                </PillButton>
              </>
            )}
          </div>
        </header>

      {selectMode && !showTrash && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border rounded-2xl 2xl:rounded-4xl p-4">
          <span className="text-sm font-bold text-foreground">
            {selectedIds.size} asset{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setSelectedIds(new Set())}
              variant="secondary"
              className="px-4 py-2 text-sm font-medium h-auto"
            >
              Clear
            </Button>
            <Button
              onClick={() => setShowBulkDeleteModal(true)}
              disabled={selectedIds.size === 0}
              variant="destructive"
              className="px-4 py-2 text-sm font-medium h-auto"
            >
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      {reconcileMode && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-accent shadow-md rounded-xl p-4 text-white">
          <div className="flex items-center gap-2">
            <HiCheckCircle className="w-5 h-5" />
            <span className="text-sm font-semibold">
              TRACKED COUNT MODE: Update physical quantities with audit trail
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setReconcileMode(false);
                setReconcileCounts(new Map());
              }}
              className="h-10 px-4 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyReconciliation}
              disabled={reconcileMutation.isPending}
              className="h-10 px-5 rounded-xl text-sm font-semibold bg-white text-accent hover:bg-white/90 disabled:opacity-50 transition-all shadow-sm"
            >
              {reconcileMutation.isPending ? "Applying..." : "Apply All Counts"}
            </button>
          </div>
        </div>
      )}

      <AdvancedStatsDashboard />

      <OfficeFilterChips
        offices={offices}
        selected={officeFilter}
        onChange={(s: string) => { setOfficeFilter(s); setPage(1); }}
      />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-3 bg-card border border-border rounded-2xl 2xl:rounded-4xl p-4 shadow-sm">
        <div className="lg:col-span-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-2 px-1">{t("Filter Method")}</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setStockFilter("all");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all duration-300 ${
                stockFilter === "all"
                  ? "bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white shadow-md shadow-amber-500/10 hover:scale-[1.02] active:scale-[0.97]"
                  : "bg-card-alt text-foreground border border-border hover:bg-border/50"
              }`}
            >
              {t("Active Catalog")}
            </button>
            <button
              onClick={() => {
                setStockFilter("low-stock");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all ${
                stockFilter === "low-stock"
                  ? "bg-danger text-white shadow-sm"
                  : "bg-card-alt text-foreground border border-border hover:bg-border/50"
              }`}
            >
              {t("Low Stock")}
            </button>
            <button
              onClick={() => {
                setReconcileMode(false);
                setSelectedIds(new Set());
                router.push("/assets/trash");
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all bg-card-alt text-foreground border border-border hover:bg-border/50"
            >
              {t("Trash")}
            </button>
          </div>
        </div>

        <div className="lg:col-span-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-2 px-1">{t("Search")}</label>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("Search Placeholder")}
            className="w-full h-11 px-4 rounded-xl border border-border bg-card-alt text-foreground text-sm font-semibold placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>

        <div className="lg:col-span-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-2 px-1">{t("From")}</label>
          <DatePicker
            showTime
            value={fromDateTime}
            onChange={(val) => {
              setFromDateTime(val);
              setPage(1);
            }}
            placeholder={t("From")}
          />
        </div>

        <div className="lg:col-span-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 mb-2 px-1">{t("To")}</label>
          <DatePicker
            showTime
            value={toDateTime}
            onChange={(val) => {
              setToDateTime(val);
              setPage(1);
            }}
            placeholder={t("To")}
          />
        </div>

        <div className="lg:col-span-2 flex items-end gap-2">
          <AdvancedFilterBuilder
            pageKey="assets"
            fields={[
              { key: "name", label: t("Asset Name"), type: "string" },
              { key: "store.name", label: t("Office"), type: "string" },
              { key: "quantity", label: t("Quantity"), type: "number" },
              { key: "description", label: t("Description"), type: "string" },
            ]}
            rules={advancedFilters}
            logic={filterLogic}
            onChange={(rules, logic) => {
              setAdvancedFilters(rules);
              setFilterLogic(logic);
              setPage(1);
            }}
            data={items}
          />
          <button
            onClick={() => {
              setOfficeFilter("all");
              setStockFilter("all");
              setSearchInput("");
              setSearchTerm("");
              setFromDateTime("");
              setToDateTime("");
              setReconcileMode(false);
              setAdvancedFilters([]);
              setPage(1);
            }}
            className="flex-1 h-11 px-3 rounded-xl text-[10px] sm:text-xs font-semibold uppercase tracking-wider bg-card-alt text-foreground border border-border hover:bg-border transition-all"
          >
            {t("Clear Filters")}
          </button>
        </div>
      </div>

      <div className="mt-8 overflow-hidden glass-card rounded-4xl hidden md:block">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-card-alt/30 border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground/85 font-semibold">
              {table.getHeaderGroups()[0].headers.map((header) => (
                <th key={header.id} className="px-6 py-5" style={{ width: header.getSize() }}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout" initial={false}>
            {table.getRowModel().rows.map((row) => (
              <motion.tr
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={row.id}
                className="border-b border-border/30 hover:bg-primary-light/5 transition-all group"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-6 py-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </motion.tr>
            ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Mobile View */}
      <div className="md:hidden mt-6 space-y-3">
        {isLoading ? (
          <div className="py-20 text-center text-muted animate-pulse">Loading assets... / በመጫን ላይ...</div>
        ) : filteredItems.length > 0 ? (
          filteredItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              {selectMode && !showTrash && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  className="w-5 h-5 rounded border-border accent-primary cursor-pointer shrink-0"
                />
              )}
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => {
                  if (selectMode && !showTrash) {
                    toggleSelect(item.id);
                    return;
                  }
                  setEditingItem(item);
                }}
              >
                <MobileAssetCard
                  item={item}
                  onEdit={(it) => setEditingItem(it)}
                  onDelete={(it) => setItemToDelete(it)}
                />
              </div>
            </div>
          ))
        ) : (
          <div className="py-20 text-center bg-card rounded-2xl border border-dashed border-border text-muted">
            {t("No assets found")}
          </div>
        )}
      </div>

      <PaginationControls
        page={page}
        totalPages={Math.max(1, totalPages)}
        onPageChange={setPage}
        pageSize={limit}
        onPageSizeChange={(newLimit) => {
          setLimit(newLimit);
          setPage(1);
        }}
        totalItems={total}
        pageSizeOptions={[10, 20, 50, 100]}
      />

      {editingItem && (
          <EditAssetSheet item={editingItem} onClose={() => setEditingItem(null)} />
        )}

      <DeleteConfirmModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={() => itemToDelete && deleteMutation.mutate(itemToDelete.id)}
        isDeleting={deleteMutation.isPending}
        title={t("Delete Record")}
        message={t("Delete Warning")}
        itemName={itemToDelete?.name || ""}
      />

      <DeleteConfirmModal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={handleBulkDelete}
        isDeleting={bulkDeleteMutation.isPending}
        title={t("Delete Selected Assets")}
        message={t("Delete Warning")}
        itemName={`${selectedIds.size} selected`}
      />

      <QuantityModal
        isOpen={!!itemToRecover}
        onClose={() => setItemToRecover(null)}
        onConfirm={(qty) => {
          if (itemToRecover) {
            recoverMutation.mutate({ id: itemToRecover.id, quantity: qty });
          }
        }}
        title="Recover Asset"
        message="Set initial recovery quantity for"
        itemName={itemToRecover?.name || ""}
        confirmLabel="Restore to Stock"
      />

      <ReconcileReviewModal
        isOpen={showReconcileReview}
        onClose={() => setShowReconcileReview(false)}
        onConfirm={confirmReconciliation}
        isSubmitting={reconcileMutation.isPending}
        counts={reviewBatch}
      />
    </div>
  );
}

export default function AssetsPage() {
  return (
    <AuthLayout>
      <Suspense
        fallback={
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <AssetsContent />
      </Suspense>
    </AuthLayout>
  );
}
