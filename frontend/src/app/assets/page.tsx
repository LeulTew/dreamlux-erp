"use client";
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
      header: "Image",
      cell: ({ row }) => (
        <ImageCell src={row.original.image_url} alt={row.original.name} />
      ),
      size: 80,
    }),
    columnHelper.accessor("name", {
      header: "Asset Name",
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
      header: "Qty",
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
                  className="w-16 px-1 py-1.5 rounded-lg border-2 border-accent bg-accent/5 text-foreground text-center font-black focus:outline-none focus:ring-4 focus:ring-accent/10 transition-all text-sm appearance-none"
                />
                <button
                  onClick={() => setReconcileCount(row.original.id, currentCount + 1)}
                  className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center font-bold hover:bg-accent hover:text-white transition-all active:scale-90"
                >
                  +
                </button>
              </div>
              {diff !== 0 && (
                <span className={`text-[10px] font-black uppercase ${diff > 0 ? "text-emerald-500 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"}`}>
                  {diff > 0 ? `+${diff}` : diff} Delta
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
                Counted: {new Date(row.original.last_counted_at).toLocaleDateString()}
                {row.original.last_counted_by && ` by ${row.original.last_counted_by.full_name}`}
              </span>
            )}
          </div>
        );
      },
      size: 80,
    }),
    columnHelper.accessor("store.name", {
      header: "Office",
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
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {!canManageAssets ? (
            <span className="text-[10px] font-black text-muted/40 uppercase tracking-widest px-2">View Only</span>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setEditingItem(row.original)}
                className="p-2 rounded-lg hover:bg-primary-light text-muted hover:text-primary transition-all"
                title="Edit"
              >
                <HiPencilSquare className="w-4 h-4" />
              </button>
              {showTrash ? (
                <button
                  onClick={() => setItemToRecover(row.original)}
                  className="p-2 rounded-lg hover:bg-green-50 text-muted hover:text-success transition-all"
                  title="Recover"
                >
                  <HiMiniArrowUturnLeft className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => setItemToDelete(row.original)}
                  className="p-2 rounded-lg hover:bg-red-50 text-muted hover:text-danger transition-all"
                  title="Delete"
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

const ITEMS_PER_PAGE = 10;
type StockFilterMode = "all" | "low-stock";

function AssetsContent() {
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
  const [page, setPage] = useState(1);
  const [editMode, setEditMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const showTrash = false;
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [reconcileMode, setReconcileMode] = useState(() => searchParams.get("reconcile") === "true");
  const [reconcileCounts, setReconcileCounts] = useState<Map<string, number>>(new Map());
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);
  const [itemToRecover, setItemToRecover] = useState<Item | null>(null);
  const [showReconcileReview, setShowReconcileReview] = useState(false);
  const [cachedRoleName, setCachedRoleName] = useState("");
  const [cachedPermissionSlugs, setCachedPermissionSlugs] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawUser = localStorage.getItem("user");
    if (!rawUser) return;
    try {
      const parsed = JSON.parse(rawUser) as {
        role?: string;
        role_name?: string;
        permission_slugs?: string[];
      };
      const nextRoleName = (parsed.role_name || parsed.role || "").toUpperCase();
      const nextPermissionSlugs = Array.isArray(parsed.permission_slugs) ? parsed.permission_slugs : [];
      Promise.resolve().then(() => {
        setCachedRoleName(nextRoleName);
        setCachedPermissionSlugs(nextPermissionSlugs);
      });
    } catch {
      Promise.resolve().then(() => {
        setCachedRoleName("");
        setCachedPermissionSlugs([]);
      });
    }
  }, []);

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
    queryKey: ["assets", officeFilter, page, stockFilter, searchTerm, fromDateTime, toDateTime],
    queryFn: () =>
      getItems(
        page,
        ITEMS_PER_PAGE,
        searchTerm || undefined,
        officeFilter === "all" ? undefined : officeFilter,
        false,
        undefined,
        stockFilter === "low-stock" ? "low-stock" : undefined,
        fromDateTime || undefined,
        toDateTime || undefined,
      ),
  });

  const items = useMemo(() => data?.items || [], [data?.items]);
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

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
        return advancedFilters.every(rule => {
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
            default: return true;
          }
        });
      });
    }

    return result;
  }, [items, searchTerm, advancedFilters]);

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

  const { isAdmin, isInventoryController, hasPermission, isLoading: authLoading } = useAuth();
  const cachedIsManager =
    cachedRoleName === "SUPER_ADMIN" ||
    cachedRoleName === "ADMIN" ||
    cachedRoleName === "SYSTEM_MANAGER" ||
    cachedRoleName === "INVENTORY_CONTROLLER";
  const cachedCanManageAssets =
    cachedIsManager ||
    cachedPermissionSlugs.includes("assets:write") ||
    cachedPermissionSlugs.includes("assets:delete") ||
    cachedPermissionSlugs.includes("assets:reconcile");
  const canManageAssets =
    isAdmin ||
    isInventoryController ||
    hasPermission("assets:write") ||
    hasPermission("assets:delete") ||
    cachedCanManageAssets;

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
  );

  const table = useAssetsTable(filteredItems, columns);

  const handleBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedIds));
  };

  return (
    <div className="pt-4 md:py-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary rounded-2xl text-background shadow-premium">
            <HiTableCells className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Inventory</h1>
            <p className="text-sm text-muted font-medium">{total} Assets Total</p>
          </div>
        </div>
          {!authLoading && canManageAssets && (
            <>
              <button
                onClick={() => router.push("/assets/insert")}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl text-sm font-black bg-primary text-background shadow-premium hover:opacity-90 active:scale-[0.98] transition-all"
              >
                <HiPlus className="w-5 h-5" />
                ADD ITEM
              </button>
              <div className="w-px h-6 bg-border hidden sm:block mx-1" />
            </>
          )}
        <div className="flex flex-wrap items-center gap-2">
            <button
               onClick={handleExportPDF}
               className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-black bg-card text-foreground shadow-premium hover:bg-card-alt transition-all disabled:opacity-50"
             >
               <HiDocumentText className="w-4 h-4 text-danger" />
               PDF
             </button>
             <button
               onClick={handleExportExcel}
               disabled={exportingXlsx}
               className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-black bg-card text-foreground shadow-premium hover:bg-card-alt transition-all disabled:opacity-50"
             >
               <HiTableCells className="w-4 h-4 text-success" />
               XLSX
             </button>
             <button
               onClick={handleExportCSV}
               disabled={exportingCSV}
               className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-black bg-card text-foreground shadow-premium hover:bg-card-alt transition-all disabled:opacity-50"
             >
               <HiDocumentArrowDown className="w-4 h-4 text-accent" />
               CSV
             </button>
 
             <div className="w-px h-6 bg-border hidden sm:block mx-1" />
 
            <button
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
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                reconcileMode ? "bg-accent text-white shadow-premium" : "bg-card-alt text-foreground border border-border"
              }`}
            >
              <HiCheckCircle className="w-4 h-4" />
              {reconcileMode ? "Cancel Count" : "Tracked Count"}
            </button>

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
              Trash
            </button>
            <button
              onClick={() => {
                setEditMode(!editMode);
                setReconcileMode(false);
              }}
              className={`hidden md:flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                editMode ? "bg-primary text-on-primary" : "bg-card-alt text-foreground border border-border"
              }`}
            >
              <HiPencilSquare className="w-4 h-4" />
              {editMode ? "Done" : "Quick Edit"}
            </button>
            <button
              onClick={() => {
                setSelectMode(!selectMode);
                setReconcileMode(false);
                if (selectMode) setSelectedIds(new Set());
              }}
              className={`hidden md:flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                selectMode ? "bg-primary text-on-primary" : "bg-card-alt text-foreground border border-border"
              }`}
            >
              <HiTableCells className="w-4 h-4" />
              {selectMode ? "Cancel Selection" : "Select"}
            </button>
        </div>
      </header>

      {selectMode && !showTrash && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border rounded-2xl p-4">
          <span className="text-sm font-bold text-foreground">
            {selectedIds.size} asset{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-card-alt border border-border hover:bg-border transition-all"
            >
              Clear
            </button>
            <button
              onClick={() => setShowBulkDeleteModal(true)}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-danger text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all"
            >
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {reconcileMode && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-accent shadow-premium rounded-2xl p-4 text-white">
          <div className="flex items-center gap-2">
            <HiCheckCircle className="w-5 h-5" />
            <span className="text-sm font-black">
              TRACKED COUNT MODE: Update physical quantities with audit trail
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setReconcileMode(false);
                setReconcileCounts(new Map());
              }}
              className="px-4 py-2 rounded-xl text-sm font-black bg-white/20 hover:bg-white/30 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyReconciliation}
              disabled={reconcileMutation.isPending}
              className="px-6 py-2 rounded-xl text-sm font-black bg-white text-accent hover:bg-white/90 disabled:opacity-50 transition-all shadow-lg"
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

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-3 bg-card border border-border rounded-3xl p-4 shadow-sm">
        <div className="lg:col-span-3">
          <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Filter Method</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setStockFilter("all");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
                stockFilter === "all"
                  ? "bg-primary text-on-primary shadow-premium"
                  : "bg-card-alt text-foreground border border-border"
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => {
                setStockFilter("low-stock");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
                stockFilter === "low-stock"
                  ? "bg-danger text-white shadow-premium"
                  : "bg-card-alt text-foreground border border-border"
              }`}
            >
              Low Stock
            </button>
            <button
              onClick={() => {
                setReconcileMode(false);
                setSelectedIds(new Set());
                router.push("/assets/trash");
              }}
              className="px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition-all bg-card-alt text-foreground border border-border"
            >
              Trash
            </button>
          </div>
        </div>

        <div className="lg:col-span-3">
          <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Search</label>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by item, description, or office..."
            className="w-full px-4 py-2.5 rounded-2xl border border-border bg-card-alt text-foreground text-sm font-semibold placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="lg:col-span-2">
          <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">From</label>
          <input
            type="datetime-local"
            value={fromDateTime}
            onChange={(e) => {
              setFromDateTime(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2.5 rounded-2xl border border-border bg-card-alt text-foreground text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="lg:col-span-2">
          <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">To</label>
          <input
            type="datetime-local"
            value={toDateTime}
            onChange={(e) => {
              setToDateTime(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2.5 rounded-2xl border border-border bg-card-alt text-foreground text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="lg:col-span-2 flex items-end">
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
            className="w-full px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest bg-card-alt text-foreground border border-border hover:bg-border transition-all"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="mt-4 px-2">
        <AdvancedFilterBuilder
          fields={[
            { key: "name", label: "Asset Name", type: "string" },
            { key: "store.name", label: "Office", type: "string" },
            { key: "quantity", label: "Quantity", type: "number" },
            { key: "description", label: "Description", type: "string" },
          ]}
          rules={advancedFilters}
          onChange={setAdvancedFilters}
        />
      </div>

      <div className="mt-8 overflow-hidden glass-card rounded-4xl hidden md:block">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-card-alt/30 border-b border-border/50 text-[10px] uppercase tracking-[0.2em] text-muted font-black">
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
          <div className="py-20 text-center text-muted animate-pulse">Loading assets...</div>
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
            No assets found.
          </div>
        )}
      </div>

      <PaginationControls
        page={page}
        totalPages={Math.max(1, totalPages)}
        onPageChange={setPage}
      />

      {editingItem && (
          <EditAssetSheet item={editingItem} onClose={() => setEditingItem(null)} />
        )}

      <DeleteConfirmModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={() => itemToDelete && deleteMutation.mutate(itemToDelete.id)}
        isDeleting={deleteMutation.isPending}
        title="Delete Asset"
        message="Are you sure you want to move this asset to trash?"
        itemName={itemToDelete?.name || ""}
      />

      <DeleteConfirmModal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={handleBulkDelete}
        isDeleting={bulkDeleteMutation.isPending}
        title="Delete Selected Assets"
        message="Are you sure you want to move these assets to trash?"
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
