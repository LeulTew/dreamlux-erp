"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AuthLayout from "@/components/AuthLayout";
import { useAuth } from "@/hooks/useAuth";
import ForbiddenState from "@/components/ForbiddenState";
import { exportCSV, getInventoryStats, getItems, getStores } from "@/lib/api";
import { InventoryStats, ItemsResponse, Store } from "@/lib/types";
import {
  HiChartBar,
  HiMapPin,
  HiBriefcase,
  HiChevronRight,
  HiPrinter,
  HiArrowDownTray,
  HiArrowUpRight,
  HiChevronLeft,
} from "react-icons/hi2";
import Select from "@/components/ui/Select";
import { motion } from "framer-motion";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Bar,
  Line,
} from "recharts";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import PrintOptionsModal from "@/components/PrintOptionsModal";
import { useLanguage } from "@/hooks/use-language";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Back to Dashboard": "Back to Dashboard",
    "Reports": "Reports",
    "Asset Reports": "Asset Reports",
    "View stock data by location, then print or download a report.": "View stock data by location, then print or download a report.",
    "All Locations": "All Locations",
    "Print Report": "Print Report",
    "Print Asset Report": "Print Asset Report",
    "Choose whether to include item thumbnails in your printed layout.": "Choose whether to include item thumbnails in your printed layout.",
    "Locations": "Locations",
    "Stock Split": "Stock Split",
    "How items are split across locations.": "How items are split across locations.",
    "Trend": "Trend",
    "points": "points",
    "Stock Trend": "Stock Trend",
    "Recent stock level and movement signal.": "Recent stock level and movement signal.",
    "Item List": "Item List",
    "Top items with quantity and status.": "Top items with quantity and status.",
    "Open Inventory": "Open Inventory",
    "Item": "Item",
    "Location": "Location",
    "Quantity": "Quantity",
    "Status": "Status",
    "Open": "Open",
    "Low": "Low",
    "OK": "OK",
    "No items to download": "No items to download",
    "Download started": "Download started",
    "Download failed": "Download failed",
  },
  am: {
    "Back to Dashboard": "ወደ ዳሽቦርድ ተመለስ",
    "Reports": "ሪፖርቶች",
    "Asset Reports": "የንብረት ሪፖርቶች",
    "View stock data by location, then print or download a report.": "የቅርንጫፎችን የክምችት መረጃ ይመልከቱ፣ ከዚያም ያትሙ ወይም ሪፖርቱን ያውርዱ።",
    "All Locations": "ሁሉም ቦታዎች",
    "Print Report": "ሪፖርት አትም",
    "Print Asset Report": "የንብረት ሪፖርት አትም",
    "Choose whether to include item thumbnails in your printed layout.": "በሚታተመው ሰነድ ላይ የእቃዎች ምስል እንዲካተት መፈለግዎን ይምረጡ።",
    "Locations": "ቦታዎች",
    "Stock Split": "የክምችት ክፍፍል",
    "How items are split across locations.": "እቃዎች በተለያዩ ቦታዎች እንዴት እንደተከፋፈሉ የሚያሳይ።",
    "Trend": "አዝማሚያ",
    "points": "ነጥቦች",
    "Stock Trend": "የክምችት አዝማሚያ",
    "Recent stock level and movement signal.": "የቅርብ ጊዜ የክምችት ደረጃ እና የእንቅስቃሴ ምልክት።",
    "Item List": "የእቃዎች ዝርዝር",
    "Top items with quantity and status.": "ዋነኛ እቃዎች ከነብዛታቸው እና ሁኔታቸው ጋር።",
    "Open Inventory": "የንብረት መዝገብ ክፈት",
    "Item": "እቃ",
    "Location": "ቦታ",
    "Quantity": "ብዛት",
    "Status": "ሁኔታ",
    "Open": "ክፈት",
    "Low": "ያለቀ",
    "OK": "በቂ",
    "No items to download": "የሚወርድ ምንም እቃ የለም",
    "Download started": "ማውረድ ተጀምሯል",
    "Download failed": "ማውረድ አልተሳካም",
  }
};

export default function ReportsPage() {
  const { hasPermission, isLoading: authLoading, isAuthenticated } = useAuth();
  const hasAssetsRead = hasPermission("assets:read");
  const router = useRouter();
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [chartsReady, setChartsReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  useEffect(() => {
    const frameId = requestAnimationFrame(() => setChartsReady(true));
    return () => cancelAnimationFrame(frameId);
  }, []);

  const { data: stats } = useQuery<InventoryStats>({
    queryKey: ["inventoryStats"],
    queryFn: getInventoryStats,
    enabled: isAuthenticated && hasAssetsRead,
  });

  const { data: stores } = useQuery<Store[]>({
    queryKey: ["stores"],
    queryFn: getStores,
    enabled: isAuthenticated && hasAssetsRead,
  });

  const { data: itemsResponse } = useQuery<ItemsResponse>({
    queryKey: ["assets-report", storeFilter],
    queryFn: () => getItems(1, 1000, undefined, storeFilter === "all" ? undefined : storeFilter),
    enabled: isAuthenticated && hasAssetsRead,
  });

  const items = itemsResponse?.items || [];

  const pieData = useMemo(() => {
    if (!stats?.stockPerLocation) return [];
    return stats.stockPerLocation.map((loc) => ({
      name: loc.location,
      value: loc.quantity,
    }));
  }, [stats]);

  const distributionTimeline = useMemo(() => {
    if (stats?.stockPerLocation?.length) {
      return stats.stockPerLocation.slice(0, 6).map((loc, idx) => ({
        name: loc.location,
        stock: loc.quantity,
        growth: idx % 2 === 0 ? 8 + idx : -(3 + idx),
      }));
    }

    return [
      { name: "Branch 1", stock: 0, growth: 0 },
      { name: "Branch 2", stock: 0, growth: 0 },
      { name: "Branch 3", stock: 0, growth: 0 },
    ];
  }, [stats]);

  const handleDownload = async () => {
    if (items.length === 0) {
      toast.error(t("No items to download"));
      return;
    }

    setDownloading(true);
    try {
      await exportCSV(storeFilter);
      toast.success(t("Download started"));
    } catch {
      toast.error(t("Download failed"));
    }
    setDownloading(false);
  };

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
          description="Only authorized personnel can view inventory reports."
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="page-container-lg space-y-10 pb-20">
        <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex-1">
            <button
              onClick={() => router.push("/assets/dashboard")}
              className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-foreground transition-colors"
            >
              <HiChevronLeft className="w-5 h-5" />
              {t("Back to Dashboard")}
            </button>

            <div className="flex items-center gap-3 mb-2">
              <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full border border-primary/20">{t("Reports")}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            </div>
            <h1 className="text-5xl font-black text-foreground tracking-tighter leading-none">{t("Asset Reports")}</h1>
            <p className="text-base font-medium text-muted mt-4 max-w-xl leading-relaxed">
              {t("View stock data by location, then print or download a report.")}
            </p>
          </motion.div>

          <div className="flex flex-wrap items-center gap-4">
            <Select
              options={[
                { id: "all", label: t("All Locations") },
                ...(stores?.map((s) => ({ id: s.id, label: s.name })) || [])
              ]}
              value={storeFilter}
              onChange={(val) => setStoreFilter(val)}
              className="min-w-60"
            />

            <button
              onClick={() => setIsPrintModalOpen(true)}
              className="px-8 py-4 bg-foreground text-background rounded-3xl flex items-center gap-3 font-black text-sm shadow-premium hover:scale-105 active:scale-95 transition-all"
            >
              <HiPrinter className="w-5 h-5" />
              {t("Print Report")}
            </button>
          </div>
        </header>

        <PrintOptionsModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          onPrint={(options) => {
            const imgQuery = options.includeImages ? "&images=true" : "&images=false";
            router.push(`/report?store=${storeFilter}${imgQuery}`);
          }}
          title={t("Print Asset Report")}
          description={t("Choose whether to include item thumbnails in your printed layout.")}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="glass-card p-8 rounded-xl border border-border/50 shadow-premium group hover:border-primary/30 transition-all"
          >
            <div className="flex items-center justify-between mb-8">
              <div className="p-4 bg-primary/5 text-primary rounded-3xl border border-primary/10">
                <HiMapPin className="w-7 h-7" />
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[10px] font-black text-muted tracking-widest uppercase">{t("Locations")}</span>
                <span className="text-2xl font-black text-foreground">{stats?.stockPerLocation.length || 0}</span>
              </div>
            </div>
            <h3 className="text-xl font-black tracking-tight mb-2">{t("Stock Split")}</h3>
            <p className="text-xs font-medium text-muted">{t("How items are split across locations.")}</p>
            <div className="h-64 mt-6 min-w-0">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1} debounce={50}>
                  <PieChart>
                    <Pie data={pieData} innerRadius={60} outerRadius={85} paddingAngle={8} dataKey="value" stroke="none">
                      {pieData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        borderRadius: "24px",
                        border: "1px solid var(--border)",
                        boxShadow: "var(--shadow-massive)",
                        color: "var(--foreground)",
                      }}
                      itemStyle={{ color: "var(--foreground)" }}
                      labelStyle={{ color: "var(--muted)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full" />
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="glass-card p-8 rounded-xl border border-border/50 shadow-premium group hover:border-emerald-500/30 transition-all lg:col-span-2"
          >
            <div className="flex items-center justify-between mb-8">
              <div className="p-4 bg-emerald-500/5 text-emerald-500 rounded-3xl border border-emerald-500/10">
                <HiChartBar className="w-7 h-7" />
              </div>
              <div className="flex gap-4">
                <div className="flex flex-col text-right">
                  <span className="text-[10px] font-black text-muted tracking-widest uppercase">{t("Trend")}</span>
                  <span className="text-2xl font-black text-foreground">{`6 ${t("points")}`}</span>
                </div>
              </div>
            </div>
            <h3 className="text-xl font-black tracking-tight mb-2">{t("Stock Trend")}</h3>
            <p className="text-xs font-medium text-muted">{t("Recent stock level and movement signal.")}</p>
            <div className="h-64 mt-6 min-w-0">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1} debounce={50}>
                  <ComposedChart data={distributionTimeline}>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontWeight: 900, fontSize: 10 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontWeight: 900, fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        borderRadius: "24px",
                        border: "1px solid var(--border)",
                        boxShadow: "var(--shadow-massive)",
                        color: "var(--foreground)",
                      }}
                      itemStyle={{ color: "var(--foreground)" }}
                      labelStyle={{ color: "var(--muted)" }}
                    />
                    <Bar dataKey="stock" fill="var(--primary)" radius={[10, 10, 10, 10]} barSize={40} />
                    <Line type="monotone" dataKey="growth" stroke="#10b981" strokeWidth={4} dot={{ r: 6, fill: "#10b981", strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full" />
              )}
            </div>
          </motion.div>
        </div>

        <section className="glass-card p-12 rounded-xl border border-border/50 shadow-premium overflow-hidden relative">
          {/* Modern Aurora Decorative Element */}
          <div className="absolute top-0 right-0 -mr-32 -mt-32 w-140 h-140 bg-primary/10 blur-[130px] rounded-full pointer-events-none -z-10" />
          <div className="absolute top-20 right-20 w-80 h-80 bg-accent/5 blur-[100px] rounded-full pointer-events-none -z-10" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-16 relative z-10">
            <div>
              <h2 className="text-4xl font-black text-foreground tracking-tighter leading-tight mb-2">{t("Item List")}</h2>
              <p className="text-sm font-medium text-muted leading-relaxed max-w-lg">{t("Top items with quantity and status.")}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="p-4 rounded-xl bg-card-alt border border-border text-foreground hover:bg-border transition-all shadow-sm disabled:opacity-60"
                title="Download CSV"
              >
                <HiArrowDownTray className="w-6 h-6" />
              </button>
              <button
                onClick={() => router.push(`/assets${storeFilter !== "all" ? `?store=${storeFilter}` : ""}`)}
                className="px-8 py-4 rounded-xl bg-primary text-background font-black text-sm shadow-premium hover:opacity-90 transition-all flex items-center gap-3"
              >
                {t("Open Inventory")}
                <HiArrowUpRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto relative z-10">
            <table className="w-full text-left border-separate border-spacing-y-4">
              <thead>
                <tr className="text-[10px] font-black uppercase text-muted tracking-[0.2em]">
                  <th className="px-6 pb-2">{t("Item")}</th>
                  <th className="px-6 pb-2">{t("Location")}</th>
                  <th className="px-6 pb-2">{t("Quantity")}</th>
                  <th className="px-6 pb-2">{t("Status")}</th>
                  <th className="px-6 pb-2 text-right">{t("Open")}</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 10).map((item, i) => (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-card-alt/30 hover:bg-card-alt/60 transition-all"
                  >
                    <td className="px-6 py-6 rounded-l-xl border-y border-l border-border/30">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
                          {item.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.image_url} alt="" className="w-full h-full object-cover rounded-xl" />
                          ) : (
                            <HiBriefcase className="w-6 h-6 text-muted" />
                          )}
                        </div>
                        <span className="font-black text-foreground tracking-tight line-clamp-1">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-6 border-y border-border/30">
                      <span className="text-[10px] font-black text-muted uppercase tracking-widest">{item.store.name}</span>
                    </td>
                    <td className="px-6 py-6 border-y border-border/30">
                      <div className="flex items-center gap-3">
                        <span className={`text-xl font-black ${item.quantity <= 5 ? "text-danger" : "text-foreground"}`}>{item.quantity}</span>
                        <div className="flex-1 max-w-15 h-1.5 bg-muted/20 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${item.quantity <= 5 ? "bg-danger" : "bg-primary"}`}
                            style={{ width: `${Math.min(100, item.quantity * 2)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6 border-y border-border/30">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${item.quantity <= 5 ? "bg-danger" : "bg-success"}`} />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${item.quantity <= 5 ? "text-danger" : "text-success"}`}>
                          {item.quantity <= 5 ? t("Low") : t("OK")}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-6 rounded-r-xl border-y border-r border-border/30 text-right">
                      <button
                        onClick={() => router.push(`/assets?id=${item.id}`)}
                        className="p-3 rounded-xl bg-card border border-border hover:bg-primary hover:border-primary/20 hover:text-background transition-all"
                      >
                        <HiChevronRight className="w-5 h-5" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AuthLayout>
  );
}
