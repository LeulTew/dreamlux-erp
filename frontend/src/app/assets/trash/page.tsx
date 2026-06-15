"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import PaginationControls from "@/components/PaginationControls";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import QuantityModal from "@/components/QuantityModal";
import { getItems, getStores, recoverItem, permanentlyDeleteItem } from "@/lib/api";
import { Item, ItemsResponse, Store } from "@/lib/types";
import { HiArrowLeft, HiMiniArrowUturnLeft, HiTrash } from "react-icons/hi2";
import Select from "@/components/ui/Select";
import toast from "react-hot-toast";

const ITEMS_PER_PAGE = 10;

export default function TrashPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

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
  });

  const items = useMemo(() => data?.items || [], [data?.items]);
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  const recoverMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => recoverItem(id, quantity),
    onSuccess: () => {
      toast.success("Item restored");
      setItemToRecover(null);
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
    },
    onError: () => toast.error("Failed to restore item"),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id: string) => permanentlyDeleteItem(id),
    onSuccess: () => {
      toast.success("Item permanently deleted");
      setItemToPermanentlyDelete(null);
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryStats"] });
    },
    onError: () => toast.error("Permanent delete failed"),
  });

  return (
    <AuthLayout>
      <div className="page-container-lg space-y-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/assets")}
              className="p-2.5 rounded-2xl bg-card-alt border border-border hover:bg-border transition-all"
            >
              <HiArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
                <HiTrash className="w-6 h-6 text-danger" />
                Trash
              </h1>
              <p className="text-sm text-muted font-medium">{total} deleted item{total !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-card border border-border rounded-3xl p-4 shadow-sm">
          <div className="lg:col-span-3">
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Location</label>
            <Select
              options={[
                { id: "all", label: "All Locations" },
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
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search deleted items..."
              className="w-full px-3 py-2.5 rounded-2xl border border-border bg-card-alt text-foreground text-sm font-semibold placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Deleted From</label>
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
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Deleted To</label>
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
                setStoreFilter("all");
                setSearch("");
                setFromDateTime("");
                setToDateTime("");
                setPage(1);
              }}
              className="w-full px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest bg-card-alt text-foreground border border-border hover:bg-border transition-all"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="overflow-hidden glass-card rounded-4xl border border-border/30">
          <table className="w-full text-left border-collapse hidden md:table">
            <thead>
              <tr className="bg-card-alt/30 border-b border-border/50 text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                <th className="px-6 py-4">Item</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Quantity (at delete)</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center text-muted">Loading trash...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center text-muted">Trash is empty.</td>
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
                          className="px-3 py-2 rounded-xl bg-success text-white text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all inline-flex items-center gap-1"
                        >
                          <HiMiniArrowUturnLeft className="w-4 h-4" />
                          Restore
                        </button>
                        <button
                          onClick={() => setItemToPermanentlyDelete(item)}
                          className="px-3 py-2 rounded-xl bg-danger text-white text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all"
                        >
                          Permanent Delete
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
              <div className="px-4 py-12 text-center text-muted">Loading trash...</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-12 text-center text-muted">Trash is empty.</div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="px-4 py-4 space-y-3 active:bg-primary-light/10 transition-colors"
                  onClick={() => router.push(`/assets?id=${item.id}`)}
                >
                  <div>
                    <div className="font-bold text-foreground">{item.name}</div>
                    <div className="text-xs text-muted mt-1">{item.store?.name || "Unknown"}</div>
                  </div>
                  <div className="text-xs text-muted">Quantity at delete: {item.quantity}</div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setItemToRecover(item)}
                      className="flex-1 px-3 py-2 rounded-xl bg-success text-white text-[11px] font-black uppercase tracking-wider"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => setItemToPermanentlyDelete(item)}
                      className="flex-1 px-3 py-2 rounded-xl bg-danger text-white text-[11px] font-black uppercase tracking-wider"
                    >
                      Permanent Delete
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
          title="Restore Item"
          message="Set restored quantity for"
          itemName={itemToRecover?.name || ""}
          confirmLabel="Restore"
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
          title="Permanent Delete"
          message="This will permanently remove"
          itemName={itemToPermanentlyDelete?.name || ""}
        />
      </div>
    </AuthLayout>
  );
}
