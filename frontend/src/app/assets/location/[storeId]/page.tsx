"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import AuthLayout from "@/components/AuthLayout";
import { exportCSV, getItems, getInventoryStats, getStores } from "@/lib/api";
import { InventoryStats, ItemsResponse, Store } from "@/lib/types";
import { 
  HiChevronLeft, 
  HiMapPin, 
  HiChartBar, 
  HiExclamationTriangle, 
  HiArrowDownTray, 
  HiAdjustmentsVertical,
  HiBriefcase
} from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import PaginationControls from "@/components/PaginationControls";
import MobileAssetCard from "@/components/MobileAssetCard";
import ImageCell from "@/components/ImageCell";
import toast from "react-hot-toast";

export default function LocationDrilldownPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const [page, setPage] = useState(1);
  const limit = 10;

  const { data: stores } = useQuery<Store[]>({
    queryKey: ["stores"],
    queryFn: getStores,
  });

  const activeStore = useMemo(() => 
    stores?.find(s => s.id === storeId), 
  [stores, storeId]);

  const { data: stats } = useQuery<InventoryStats>({
    queryKey: ["inventoryStats"],
    queryFn: getInventoryStats,
  });

  const { data: itemsResponse, isLoading: itemsLoading } = useQuery<ItemsResponse>({
    queryKey: ["location-items", storeId, page],
    queryFn: () => getItems(page, limit, undefined, storeId),
    enabled: !!storeId,
  });

  const locationStats = useMemo(() => {
    return stats?.stockPerLocation.find(l => l.location === activeStore?.name);
  }, [stats, activeStore]);

  const handleExport = async () => {
    try {
      await exportCSV(storeId);
      toast.success("Download started");
    } catch {
      toast.error("Download failed");
    }
  };

  if (!storeId) return null;

  return (
    <AuthLayout>
      <div className="space-y-8 pb-20">
        {/* Breadcrumbs & Header */}
        <header className="flex flex-col gap-6">
          <button 
            onClick={() => router.push('/assets/dashboard')}
            className="flex items-center gap-2 text-muted hover:text-foreground transition-all group w-fit"
          >
            <HiChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-xs font-black uppercase tracking-widest">Back to Dashboard</span>
          </button>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="flex items-center gap-3 mb-2">
                 <div className="p-2 bg-primary/10 text-primary rounded-lg border border-primary/20">
                    <HiMapPin className="w-5 h-5" />
                 </div>
                 <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Location Details</span>
              </div>
              <h1 className="text-5xl font-black text-foreground tracking-tighter leading-none">
                 {activeStore?.name || "Loading location..."}
              </h1>
              <p className="text-sm font-medium text-muted mt-4 max-w-lg leading-relaxed">
                 Items and stock status for {activeStore?.name}.
              </p>
            </motion.div>

            <div className="flex items-center gap-3">
                <button onClick={handleExport} className="px-6 py-4 bg-card border border-border/50 text-foreground rounded-2xl flex items-center gap-2 font-black text-xs shadow-soft hover:shadow-premium transition-all">
                  <HiArrowDownTray className="w-5 h-5 text-primary" />
                  Download CSV
               </button>
               <button 
                  onClick={() => router.push(`/assets/reconcile?store=${storeId}`)}
                  className="px-6 py-4 bg-foreground text-background rounded-2xl flex items-center gap-2 font-black text-xs shadow-premium hover:opacity-90 transition-all"
               >
                  <HiAdjustmentsVertical className="w-5 h-5" />
                  Reconcile
               </button>
            </div>
          </div>
        </header>

        {/* Local KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card p-8 rounded-[2.5rem] border border-border/50 shadow-soft">
             <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted">Total Units</span>
                <HiChartBar className="w-5 h-5 text-primary" />
             </div>
             <div className="flex items-end gap-2">
                <span className="text-4xl font-black text-foreground">{locationStats?.quantity || 0}</span>
                <span className="text-xs font-bold text-muted mb-1.5 uppercase">Resources</span>
             </div>
          </div>

          <div className="glass-card p-8 rounded-[2.5rem] border border-border/50 shadow-soft">
             <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted">Critical Stock</span>
                <HiExclamationTriangle className={`w-5 h-5 ${locationStats?.lowStockItems && locationStats.lowStockItems > 0 ? 'text-danger' : 'text-muted opacity-30'}`} />
             </div>
             <div className="flex items-end gap-2">
                <span className={`text-4xl font-black ${locationStats?.lowStockItems && locationStats.lowStockItems > 0 ? 'text-danger' : 'text-foreground'}`}>
                   {locationStats?.lowStockItems || 0}
                </span>
                 <span className="text-xs font-bold text-muted mb-1.5 uppercase">Need Refill</span>
             </div>
          </div>

          <div className="glass-card p-8 rounded-[2.5rem] border border-border/50 shadow-soft">
             <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted">System Health</span>
                <div className="w-2 h-2 rounded-full bg-success animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
             </div>
             <div className="flex items-end gap-2">
                <span className="text-4xl font-black text-foreground">100%</span>
                <span className="text-xs font-bold text-muted mb-1.5 uppercase">Verified</span>
             </div>
          </div>
        </div>

        {/* Items Surface */}
        <section className="glass-card rounded-[3rem] border border-border/50 shadow-premium overflow-hidden bg-white/50 dark:bg-black/20">
          <div className="p-8 border-b border-border/50 flex items-center justify-between bg-card-alt/30">
            <h2 className="text-xl font-black text-foreground tracking-tight">Items in This Location</h2>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted bg-card px-4 py-2 rounded-full border border-border/50 shadow-sm">
               {itemsResponse?.total || 0} Items
            </div>
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-black uppercase text-muted tracking-widest bg-card-alt/50">
                  <th className="px-8 py-5">Item</th>
                  <th className="px-8 py-5">Quantity</th>
                  <th className="px-8 py-5">Status</th>
                  <th className="px-8 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                <AnimatePresence mode="wait">
                  {itemsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={4} className="px-8 py-6 h-20 bg-muted/5" />
                      </tr>
                    ))
                  ) : itemsResponse?.items.length === 0 ? (
                    <tr>
                       <td colSpan={4} className="px-8 py-20 text-center">
                          <div className="flex flex-col items-center gap-4">
                             <div className="p-6 bg-muted/10 rounded-full text-muted">
                                <HiBriefcase className="w-12 h-12" />
                             </div>
                             <p className="text-sm font-black uppercase tracking-widest text-muted">No items found in this node</p>
                          </div>
                       </td>
                    </tr>
                  ) : (
                    itemsResponse?.items.map((item, index) => (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-primary/5 transition-all group"
                      >
                        <td className="px-8 py-6">
                           <div className="flex items-center gap-4">
                             <div className="w-12 h-12 rounded-2xl overflow-hidden border border-border/50 shadow-soft shrink-0">
                               <ImageCell src={item.image_url} alt={item.name} />
                             </div>
                             <div>
                               <p className="font-black text-foreground tracking-tight line-clamp-1">{item.name}</p>
                               <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-0.5">ID: {item.id.slice(0, 8)}</p>
                             </div>
                           </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-3">
                             <span className={`text-xl font-black ${item.quantity <= 5 ? 'text-danger' : 'text-foreground'}`}>
                                {item.quantity}
                             </span>
                             <div className="flex-1 max-w-20 h-1.5 bg-muted/20 rounded-full overflow-hidden">
                                <div 
                                   className={`h-full rounded-full ${item.quantity <= 5 ? 'bg-danger/80' : 'bg-primary/80'}`} 
                                   style={{ width: `${Math.min(100, item.quantity * 2)}%` }}
                                />
                             </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                           <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                              item.quantity <= 5 
                                ? 'bg-danger/10 text-danger border-danger/20' 
                                : 'bg-success/10 text-success border-success/20'
                           }`}>
                              {item.quantity <= 5 ? 'Low Stock' : 'Stable'}
                           </span>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <button 
                            onClick={() => router.push(`/assets?id=${item.id}`)}
                            className="p-3 bg-card border border-border shadow-soft rounded-xl text-muted hover:text-primary hover:border-primary/20 transition-all opacity-0 group-hover:opacity-100"
                          >
                             <HiAdjustmentsVertical className="w-5 h-5" />
                          </button>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden p-6 space-y-4">
            {itemsLoading ? (
               Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-40 rounded-3xl bg-muted/5 animate-pulse" />
               ))
            ) : (
               itemsResponse?.items.map(item => (
                  <div key={item.id} onClick={() => router.push(`/assets?id=${item.id}`)} className="cursor-pointer">
                    <MobileAssetCard item={item} />
                  </div>
               ))
            )}
          </div>

          <div className="p-8 border-t border-border/30 bg-card-alt/10">
            <PaginationControls
              page={page}
              totalPages={Math.ceil((itemsResponse?.total || 0) / limit)}
              onPageChange={setPage}
            />
          </div>
        </section>
      </div>
    </AuthLayout>
  );
}
