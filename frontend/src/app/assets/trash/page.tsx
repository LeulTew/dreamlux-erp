"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import { useAuth } from "@/hooks/useAuth";
import ForbiddenState from "@/components/ForbiddenState";
import PaginationControls from "@/components/PaginationControls";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import QuantityModal from "@/components/QuantityModal";
import { getItems, getStores, recoverItem, permanentlyDeleteItem } from "@/lib/api";
import { Item, ItemsResponse, Store } from "@/lib/types";
import { HiArrowLeft, HiMiniArrowUturnLeft, HiTrash } from "react-icons/hi2";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import toast from "@/lib/toast";
import { useLanguage } from "@/hooks/use-language";

const ITEMS_PER_PAGE = 10;

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Trash": "Trash",
    "deleted item": "deleted item",
    "deleted items": "deleted items",
    "Location": "Location",
    "All Locations": "All Locations",
    "Search": "Search",
    "Search deleted items...": "Search deleted items...",
    "Deleted From": "Deleted From",
    "Deleted To": "Deleted To",
    "Clear": "Clear",
    "Item": "Item",
    "Quantity (at delete)": "Quantity (at delete)",
    "Actions": "Actions",
    "Loading trash...": "Loading trash...",
    "Trash is empty.": "Trash is empty.",
    "Restore": "Restore",
    "Permanent Delete": "Permanent Delete",
    "Quantity at delete": "Quantity at delete",
    "Restore Item": "Restore Item",
    "Set restored quantity for": "Set restored quantity for",
    "This will permanently remove": "This will permanently remove",
    "Item restored": "Item restored",
    "Failed to restore item": "Failed to restore item",
    "Item permanently deleted": "Item permanently deleted",
    "Permanent delete failed": "Permanent delete failed",
  },
  am: {
    "Trash": "ቆሻሻ መጣያ",
    "deleted item": "የተሰረዘ እቃ",
    "deleted items": "የተሰረዙ እቃዎች",
    "Location": "ቦታ",
    "All Locations": "ሁሉም ቦታዎች",
    "Search": "ፈልግ",
    "Search deleted items...": "የተሰረዙ እቃዎችን ፈልግ...",
    "Deleted From": "ከተሰረዘበት ቀን",
    "Deleted To": "እስከተሰረዘበት ቀን",
    "Clear": "አፅዳ",
    "Item": "እቃ",
    "Quantity (at delete)": "ብዛት (ሲሰረዝ)",
    "Actions": "ድርጊቶች",
    "Loading trash...": "ቆሻሻ መጣያ በመጫን ላይ...",
    "Trash is empty.": "ቆሻሻ መጣያው ባዶ ነው።",
    "Restore": "መልስ",
    "Permanent Delete": "በቋሚነት ሰርዝ",
    "Quantity at delete": "ብዛት በሚሰረዝበት ጊዜ",
    "Restore Item": "እቃውን መልስ",
    "Set restored quantity for": "የሚመለሰውን ብዛት ይወስኑ ለ",
    "This will permanently remove": "ይህ በቋሚነት ያስወግዳል",
    "Item restored": "እቃው ተመልሷል",
    "Failed to restore item": "እቃውን መመለስ አልተሳካም",
    "Item permanently deleted": "እቃው በቋሚነት ተሰርዟል",
    "Permanent delete failed": "በቋሚነት መሰረዝ አልተሳካም",
  }
};

export default function TrashPage() {
  const { hasPermission, isLoading: authLoading, isAuthenticated } = useAuth();
  const hasAssetsRead = hasPermission("assets:read");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [fromDateTime, setFromDateTime] = useState("");
  const [toDateTime, setToDateTime] = useState("");
  const [page, setPage] = useState(1);
  const [itemToRecover, setItemToRecover] = useState<Item | null>(null);
  const [itemToPermanentlyDelete, setItemToPermanentlyDelete] = useState<Item | null>(null);

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["offices"],
    queryFn: getStores,
    enabled: isAuthenticated && hasAssetsRead,
  });

  const { data, isLoading } = useQuery<ItemsResponse>({
    queryKey: ["trash", page, storeFilter, search, fromDateTime, toDateTime],
    queryFn: () =>
      getItems(
        page,
        ITEMS_PER_PAGE,
        search.trim() || undefined,
        storeFilter === "all" ? undefined : storeFilter,
        true,
        "trash",
        undefined,
        fromDateTime || undefined,
        toDateTime || undefined,
      ),
    enabled: isAuthenticated && hasAssetsRead,
  });

  const items = useMemo(() => data?.items || [], [data?.items]);
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  const recoverMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => recoverItem(id, quantity),
    onSuccess: () => {
      toast.success(t("Item restored"));
      setItemToRecover(null);
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
    },
    onError: () => toast.error(t("Failed to restore item")),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id: string) => permanentlyDeleteItem(id),
    onSuccess: () => {
      toast.success(t("Item permanently deleted"));
      setItemToPermanentlyDelete(null);
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
    },
    onError: () => toast.error(t("Permanent delete failed")),
  });

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !hasAssetsRead) {
    return (
      <AuthLayout>
        <ForbiddenState
          title="Forbidden: Insufficient privileges"
          description="Only authorized personnel can view trashed inventory items."
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="page-container-lg space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/assets")}
              className="flex h-12 w-12 items-center justify-center rounded-[6px] border border-border bg-card-alt text-muted [@media(hover:hover)]:hover:bg-neutral-900 [@media(hover:hover)]:hover:text-white transition-all duration-200"
              aria-label="Back to assets"
            >
              <HiArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-black tracking-tight text-foreground md:text-2xl">Deleted Assets</h1>
              <p className="text-xs font-medium text-muted">{total} records in trash</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-card border border-border rounded-md p-4 shadow-sm">
          <div className="lg:col-span-3">
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">{t("Location")}</label>
            <Select
              options={[
                { id: "all", label: t("All Locations") },
                ...stores.map((store) => ({ id: store.id, label: store.name }))
              ]}
              value={storeFilter}
              onChange={(val) => {
                setStoreFilter(val);
                setPage(1);
              }}
            />
          </div>

          <div className="lg:col-span-3">
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">{t("Search")}</label>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t("Search deleted items...")}
              className="w-full px-3 py-2.5 rounded-md border border-border bg-card-alt text-foreground text-sm font-semibold placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">{t("Deleted From")}</label>
            <DatePicker
              showTime
              value={fromDateTime}
              onChange={(val) => {
                setFromDateTime(val);
                setPage(1);
              }}
              placeholder={t("Deleted From")}
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">{t("Deleted To")}</label>
            <DatePicker
              showTime
              value={toDateTime}
              onChange={(val) => {
                setToDateTime(val);
                setPage(1);
              }}
              placeholder={t("Deleted To")}
            />
          </div>

          <div className="lg:col-span-2 flex items-end">
            <button
              onClick={() => {
                setStoreFilter("all");
                setSearch("");
                setFromDateTime("");
                setToDateTime("");
                setPage(1);
              }}
              className="w-full px-4 py-2.5 rounded-md text-xs font-black uppercase tracking-widest bg-card-alt text-foreground border border-border hover:bg-border transition-all"
            >
              {t("Clear")}
            </button>
          </div>
        </div>

        <div className="overflow-hidden glass-card rounded-md border border-border/30">
          <table className="w-full text-left border-collapse hidden md:table">
            <thead>
              <tr className="bg-card-alt/30 border-b border-border/50 text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                <th className="px-6 py-4">{t("Item")}</th>
                <th className="px-6 py-4">{t("Location")}</th>
                <th className="px-6 py-4">{t("Quantity (at delete)")}</th>
                <th className="px-6 py-4">{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center text-muted">{t("Loading trash...")}</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center text-muted">{t("Trash is empty.")}</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b border-border/30 hover:bg-primary-light/5 transition-colors cursor-pointer group"
                    onClick={() => router.push(`/assets?id=${item.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-foreground group-hover:text-primary transition-colors">{item.name}</div>
                      {item.description && <div className="text-xs text-muted mt-1">{item.description}</div>}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">{item.store?.name || "Unknown"}</td>
                    <td className="px-6 py-4 text-sm text-foreground">{item.quantity}</td>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setItemToRecover(item)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600/10 text-emerald-600 border border-emerald-600/20 text-xs font-semibold hover:bg-emerald-600 hover:text-white transition-all active:scale-[0.98]"
                        >
                          <HiMiniArrowUturnLeft className="w-4 h-4" />
                          {t("Restore")}
                        </button>
                        <button
                          onClick={() => setItemToPermanentlyDelete(item)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-600/10 text-rose-600 border border-rose-600/20 text-xs font-semibold hover:bg-rose-600 hover:text-white transition-all active:scale-[0.98]"
                        >
                          {t("Permanent Delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="md:hidden divide-y divide-border/30">
            {isLoading ? (
              <div className="px-4 py-12 text-center text-muted">{t("Loading trash...")}</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-12 text-center text-muted">{t("Trash is empty.")}</div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="px-4 py-4 space-y-3 active:bg-primary-light/10 transition-colors"
                  onClick={() => router.push(`/assets?id=${item.id}`)}
                >
                  <div>
                    <div className="font-bold text-foreground">{item.name}</div>
                    <div className="text-xs text-muted mt-1">{item.store?.name || "Unknown"}</div>
                  </div>
                  <div className="text-xs text-muted">{t("Quantity at delete")}: {item.quantity}</div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setItemToRecover(item)}
                      className="flex-1 px-3 py-2 rounded-xl bg-success text-white text-[11px] font-black uppercase tracking-wider"
                    >
                      {t("Restore")}
                    </button>
                    <button
                      onClick={() => setItemToPermanentlyDelete(item)}
                      className="flex-1 px-3 py-2 rounded-xl bg-danger text-white text-[11px] font-black uppercase tracking-wider"
                    >
                      {t("Permanent Delete")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />

        <QuantityModal
          isOpen={!!itemToRecover}
          onClose={() => setItemToRecover(null)}
          onConfirm={(qty) => {
            if (itemToRecover) {
              recoverMutation.mutate({ id: itemToRecover.id, quantity: qty });
            }
          }}
          title={t("Restore Item")}
          message={t("Set restored quantity for")}
          itemName={itemToRecover?.name || ""}
          confirmLabel={t("Restore")}
        />

        <DeleteConfirmModal
          isOpen={!!itemToPermanentlyDelete}
          onClose={() => setItemToPermanentlyDelete(null)}
          onConfirm={() => {
            if (itemToPermanentlyDelete) {
              permanentDeleteMutation.mutate(itemToPermanentlyDelete.id);
            }
          }}
          isDeleting={permanentDeleteMutation.isPending}
          title={t("Permanent Delete")}
          message={t("This will permanently remove")}
          itemName={itemToPermanentlyDelete?.name || ""}
        />
      </div>
    </AuthLayout>
  );
}
