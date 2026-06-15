"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import { getItems, getStores } from "@/lib/api";
import { Item, Store } from "@/lib/types";
import { 
  HiChevronLeft, 
  HiExclamationTriangle, 
  HiMapPin, 
  HiPencilSquare,
  HiOutlineClipboardDocumentCheck,
  HiOutlineDocumentArrowDown,
  HiOutlineInbox,
} from "react-icons/hi2";
import Select from "@/components/ui/Select";
import PaginationControls from "@/components/PaginationControls";
import { motion } from "framer-motion";

export default function LowStockPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [store, setStore] = useState<string>("all");

  const { data: storeData } = useQuery<Store[]>({
    queryKey: ["stores"],
    queryFn: getStores,
  });

  const { data: itemData, isLoading } = useQuery<{ items: Item[]; total: number }>({
    queryKey: ["lowStock", store, page],
    queryFn: () => getItems(page, 10, undefined, store === "all" ? undefined : store, false, undefined, "low-stock"),
  });

  return (
    <AuthLayout>
      <div className="max-w-6xl mx-auto space-y-8 pb-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.back()}
              className="p-3 rounded-2xl bg-card-alt border border-border hover:bg-border transition-all shadow-sm"
            >
              <HiChevronLeft className="w-5 h-5 text-foreground" />
            </button>
            <div>
              <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-3">
                <HiExclamationTriangle className="w-8 h-8 text-danger" />
                Low Stock Operations
              </h1>
              <p className="text-sm font-medium text-muted mt-1">
                Prioritized queue of items requiring reorder or reconciliation.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select
              options={[
                { id: "all", label: "All Locations" },
                ...(storeData?.map(s => ({ id: s.id, label: s.name })) || [])
              ]}
              value={store}
              onChange={(val) => {
                setStore(val);
                setPage(1);
              }}
              className="min-w-48"
            />
            <button className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-on-primary font-black hover:opacity-90 transition-all shadow-premium text-sm">
              <HiOutlineDocumentArrowDown className="w-4 h-4" />
              Export Queue
            </button>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card p-6 rounded-3xl border border-danger/20 bg-danger/5 shadow-premium">
            <h3 className="text-xs font-black uppercase tracking-widest text-danger/70 mb-1">Total Critical Items</h3>
            <p className="text-4xl font-black text-danger">{itemData?.total || 0}</p>
          </div>
          <div className="glass-card p-6 rounded-3xl border border-border/50 shadow-premium">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted mb-1">Impacted Locations</h3>
            <p className="text-4xl font-black text-foreground">
              {new Set(itemData?.items.map(i => i.store.id)).size}
            </p>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02 }}
            onClick={() => router.push("/assets/reconcile")}
            className="glass-card p-6 rounded-3xl border border-primary/20 bg-primary/5 shadow-premium text-left group"
          >
            <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-1">Action Required</h3>
            <div className="flex items-center justify-between">
              <p className="text-lg font-black text-foreground group-hover:text-primary transition-colors">Start Batch Count</p>
              <HiOutlineClipboardDocumentCheck className="w-6 h-6 text-primary" />
            </div>
          </motion.button>
        </div>

        {/* Main List */}
        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 bg-card-alt/20 animate-pulse rounded-4xl" />
            ))
          ) : itemData?.items.length === 0 ? (
            <div className="py-24 text-center glass-card rounded-xl border border-dashed border-border flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-4xl bg-success/10 border border-success/20 flex items-center justify-center">
                <HiOutlineInbox className="w-10 h-10 text-success" />
              </div>
              <div>
                <h3 className="text-xl font-black text-foreground">All Clear!</h3>
                <p className="text-muted font-medium">No items are currently below the critical threshold.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {itemData?.items.map((item, idx) => (
                <motion.div 
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="group relative glass-card p-6 md:p-8 rounded-xl border border-border/50 shadow-premium hover:shadow-massive hover:border-danger/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
                >
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.name} className="w-20 h-20 rounded-3xl object-cover border-2 border-border shadow-md" />
                      ) : (
                        <div className="w-20 h-20 rounded-3xl bg-card-alt border-2 border-border flex items-center justify-center text-muted">
                          <HiExclamationTriangle className="w-8 h-8" />
                        </div>
                      )}
                      <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-danger text-white flex items-center justify-center font-black text-xs shadow-massive border-2 border-card">
                        !
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-foreground tracking-tight">{item.name}</h4>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase bg-primary/10 text-primary border border-primary/20">
                          <HiMapPin className="w-3 h-3 mr-1" />
                          {item.store.name}
                        </span>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase bg-danger/10 text-danger border border-danger/20">
                          Critical Stock
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-4 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-8">
                    <div className="text-left md:text-right">
                      <p className="text-[10px] font-black text-muted uppercase tracking-widest">Available</p>
                      <p className="text-4xl font-black text-danger tracking-tighter leading-none">{item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-2">
                       <button 
                        onClick={() => router.push(`/assets?id=${item.id}&edit=true`)}
                        className="p-3 rounded-2xl bg-card-alt border border-border hover:bg-border transition-all text-foreground hover:text-primary active:scale-90"
                      >
                        <HiPencilSquare className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => router.push(`/assets/reconcile?highlightId=${item.id}`)}
                        className="p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-on-primary transition-all active:scale-90"
                      >
                        <HiOutlineClipboardDocumentCheck className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {itemData && itemData.total > 10 && (
          <div className="py-6 flex justify-center">
            <PaginationControls 
              page={page}
              totalPages={Math.ceil(itemData.total / 10)}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
