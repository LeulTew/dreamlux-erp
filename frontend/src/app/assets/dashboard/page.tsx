"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AuthLayout from "@/components/AuthLayout";
import DashboardCards from "@/components/DashboardCards";
import { getInventoryStats } from "@/lib/api";
import { InventoryStats } from "@/lib/types";
import {
  HiChartBar,
  HiMapPin,
  HiClock,
  HiBriefcase,
  HiChevronRight,
  HiCurrencyDollar,
  HiOutlineDocumentChartBar,
  HiOutlinePrinter,
} from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import PrintOptionsModal from "@/components/PrintOptionsModal";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  LineChart,
  Line,
} from "recharts";

type TabType = "current" | "finance" | "forecasting";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function InventoryDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("current");
  const [chartsReady, setChartsReady] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setChartsReady(true), 300);
    return () => clearTimeout(timer);
  }, [activeTab]);

  const { data } = useQuery<InventoryStats>({
    queryKey: ["inventoryStats"],
    queryFn: getInventoryStats,
    refetchInterval: 30000,
  });

  const locationData = useMemo(() => {
    if (!data?.stockPerLocation) return [];
    return data.stockPerLocation.map((loc) => ({
      name: loc.location,
      value: loc.quantity,
    }));
  }, [data]);

  const financeData = useMemo(() => {
    if (data?.stockPerLocation?.length) {
      return data.stockPerLocation.map((loc) => ({
        name: loc.location,
        value: loc.quantity * 1200,
      }));
    }

    return [
      { name: "Bulbula", value: 0 },
      { name: "Coka", value: 0 },
      { name: "Haya Arat", value: 0 },
    ];
  }, [data]);

  const forecastingData = useMemo(() => {
    const base = data?.totalItems ?? 0;
    if (base === 0) return [];
    return [
      { name: "1 mo", projected: Math.round(base * 1.03) },
      { name: "2 mo", projected: Math.round(base * 1.06) },
      { name: "3 mo", projected: Math.round(base * 1.09) },
      { name: "4 mo", projected: Math.round(base * 1.12) },
      { name: "5 mo", projected: Math.round(base * 1.15) },
      { name: "6 mo", projected: Math.round(base * 1.18) },
    ];
  }, [data]);

  const hasFinanceData = financeData.some((entry) => entry.value > 0);
  const hasForecastData = forecastingData.length > 0;

  const timelineEvents = [
    { code: "BC", label: "Manual stock update", branch: "Bulbula Coka", time: "14m ago", href: "/assets/reconcile" },
    { code: "B2", label: "Stock received", branch: "Bulbula 2", time: "2h ago", href: "/assets/insert" },
    { code: "HA", label: "Quantity fix", branch: "Haya Arat", time: "5h ago", href: "/assets/history" },
  ];

  const tabLabels: Record<TabType, string> = {
    current: "Current",
    finance: "Value",
    forecasting: "Forecast",
  };

  return (
    <AuthLayout>
      <div className="max-w-7xl mx-auto pt-4 md:py-8 px-4 sm:px-6 lg:px-8 space-y-8 pb-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight flex items-center gap-3">
              Inventory Dashboard
              <span className="text-[10px] bg-primary/10 text-primary px-3 py-1 rounded-full font-black uppercase tracking-widest border border-primary/20">v2026.1</span>
            </h1>
            <p className="text-sm font-medium text-muted mt-2 max-w-lg leading-relaxed">
              See stock by location, recent activity, and quick trends.
            </p>
          </motion.div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex bg-card-alt p-1.5 rounded-xl border border-border shadow-soft">
              {(["current", "finance", "forecasting"] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setChartsReady(false);
                  }}
                  className={`px-4 py-2 md:px-6 md:py-2.5 rounded-xl text-[10px] md:text-xs font-black transition-all relative ${
                    activeTab === tab ? "text-background" : "text-muted hover:text-foreground"
                  }`}
                >
                  {activeTab === tab && (
                    <motion.div
                      layoutId="activeTabBg"
                      className="absolute inset-0 bg-primary rounded-xl shadow-premium"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10">{tabLabels[tab]}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/assets/reports")}
                className="px-6 py-3.5 bg-card border border-border/50 text-foreground rounded-xl flex items-center gap-2 font-black text-xs shadow-soft hover:shadow-premium transition-all"
              >
                <HiOutlineDocumentChartBar className="w-5 h-5 text-primary" />
                Reports
              </button>
              <button
                onClick={() => setIsPrintModalOpen(true)}
                className="px-6 py-3.5 bg-foreground text-background rounded-2xl flex items-center gap-2 font-black text-xs shadow-premium hover:opacity-90 transition-all"
              >
                <HiOutlinePrinter className="w-5 h-5" />
                Print List
              </button>
            </div>
          </div>
        </header>

        <PrintOptionsModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          onPrint={(options) => {
            const imgQuery = options.includeImages ? "?images=true" : "?images=false";
            router.push(`/report${imgQuery}`);
          }}
          title="Print Asset Dashboard"
          description="Choose whether to include item thumbnails in your printed layout."
        />

        <DashboardCards />

        <AnimatePresence mode="wait">
          {activeTab === "current" && (
            <motion.div
              key="current"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8"
            >
              <div className="glass-card p-6 md:p-10 rounded-xl md:rounded-xl border border-border/50 shadow-premium flex flex-col group hover:border-primary/20 transition-all">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-foreground tracking-tight">Stock by Location</h2>
                    <p className="text-[10px] font-black text-muted uppercase tracking-widest mt-1">Units per branch</p>
                  </div>
                  <div className="p-3 bg-primary/5 rounded-2xl text-primary border border-primary/10">
                    <HiMapPin className="w-6 h-6" />
                  </div>
                </div>

                <div className="flex-1 h-100 min-w-0">
                  {chartsReady ? (
                    <ResponsiveContainer width="100%" height={400} minWidth={0} minHeight={400} debounce={100}>
                      <BarChart data={locationData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10, fontWeight: 900 }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10, fontWeight: 900 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--card)",
                            borderRadius: "24px",
                            border: "1px solid var(--border)",
                            boxShadow: "var(--shadow-massive)",
                          }}
                          cursor={{ fill: "var(--card-alt)", opacity: 0.4 }}
                        />
                        <Bar dataKey="value" fill="var(--primary)" radius={[12, 12, 12, 12]} barSize={48} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full w-full" />
                  )}
                </div>
              </div>

              <div className="glass-card p-6 md:p-10 rounded-xl md:rounded-xl border border-border/50 shadow-premium flex flex-col group hover:border-indigo-500/20 transition-all">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-foreground tracking-tight">Location Share</h2>
                    <p className="text-[10px] font-black text-muted uppercase tracking-widest mt-1">Percent by branch</p>
                  </div>
                  <div className="p-3 bg-indigo-500/5 rounded-2xl text-indigo-500 border border-indigo-500/10">
                    <HiChartBar className="w-6 h-6" />
                  </div>
                </div>

                <div className="flex-1 h-100 min-w-0 flex flex-col items-center justify-center">
                  <div className="w-full h-full max-h-75 min-w-0">
                    {chartsReady ? (
                      <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={300} debounce={100}>
                        <PieChart>
                          <Pie data={locationData} innerRadius={90} outerRadius={130} paddingAngle={10} dataKey="value" stroke="none">
                            {locationData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full w-full" />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-12 gap-y-6 mt-8">
                    {locationData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-4">
                        <div className="w-2.5 h-10 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <div>
                          <p className="text-[10px] font-black uppercase text-muted tracking-widest">{d.name}</p>
                          <p className="text-lg font-black text-foreground">{d.value} units</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <section className="lg:col-span-2 glass-card p-6 md:p-12 rounded-xl md:rounded-xl border border-border/50 shadow-premium group hover:border-primary/20 transition-all">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-primary/5 rounded-3xl text-primary border border-primary/10 shadow-soft">
                      <HiClock className="w-8 h-8" />
                    </div>
                    <div>
                      <h2 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">Recent Activity</h2>
                      <p className="text-sm font-medium text-muted tracking-wide">Latest stock actions by branch.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {timelineEvents.map((event, i) => (
                    <motion.button
                      key={event.code}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      onClick={() => router.push(event.href)}
                      className="w-full p-4 md:p-6 rounded-3xl bg-card-alt/30 border border-border/30 hover:border-primary/30 flex items-center justify-between transition-all hover:bg-card-alt/50 text-left"
                    >
                      <div className="flex items-center gap-4 md:gap-6">
                        <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-card border border-border flex items-center justify-center text-primary shadow-premium font-black text-lg">
                          {event.code}
                        </div>
                        <div>
                          <p className="font-black text-base md:text-lg text-foreground tracking-tight">{event.label}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] font-black text-muted uppercase tracking-widest">{event.branch}</span>
                            <span className="w-1 h-1 rounded-full bg-border" />
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">{event.time}</span>
                          </div>
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-card border border-border text-primary">
                        <HiChevronRight className="w-5 h-5" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === "finance" && (
            <motion.div
              key="finance"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="glass-card p-12 rounded-xl border border-border/50 shadow-premium"
            >
              <div className="flex items-center gap-6 mb-12">
                <div className="p-5 bg-success/5 rounded-4xl text-success border border-success/10 shadow-soft">
                  <HiCurrencyDollar className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-4xl font-black text-foreground tracking-tight">Estimated Inventory Value</h2>
                  <p className="text-sm font-medium text-muted">Simple estimate by branch based on current quantity.</p>
                </div>
              </div>

              <div className="min-h-125 min-w-0">
                {hasFinanceData ? (
                  chartsReady ? (
                    <ResponsiveContainer width="100%" height={500} minWidth={0} minHeight={500} debounce={100}>
                      <AreaChart data={financeData}>
                        <defs>
                          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.3} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontWeight: 900, fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontWeight: 900, fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--card)",
                            borderRadius: "24px",
                            border: "1px solid var(--border)",
                            boxShadow: "var(--shadow-massive)",
                            padding: "16px",
                            color: "var(--foreground)",
                          }}
                          itemStyle={{ color: "var(--foreground)" }}
                          labelStyle={{ color: "var(--muted)" }}
                        />
                        <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={6} fillOpacity={1} fill="url(#colorValue)" dot={{ r: 6, fill: "#10b981", strokeWidth: 0 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full w-full" />
                  )
                ) : (
                  <div className="h-full min-h-125 flex items-center justify-center rounded-3xl border border-dashed border-border bg-card-alt/20 px-6 text-center">
                    <p className="text-sm font-semibold text-muted">No branch stock data yet. Add or reconcile inventory to see value projections.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "forecasting" && (
            <motion.div
              key="forecasting"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="glass-card p-12 rounded-xl border border-border/50 shadow-premium"
            >
              <div className="flex items-center gap-6 mb-12">
                <div className="p-5 bg-amber-500/5 rounded-4xl text-amber-500 border border-amber-500/10 shadow-soft">
                  <HiBriefcase className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-4xl font-black text-foreground tracking-tight">Expected Demand</h2>
                  <p className="text-sm font-medium text-muted">Projected units for the next 6 months.</p>
                </div>
              </div>

              <div className="min-h-125 min-w-0">
                {hasForecastData ? (
                  chartsReady ? (
                    <ResponsiveContainer width="100%" height={500} minWidth={0} minHeight={500} debounce={100}>
                      <LineChart data={forecastingData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.3} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontWeight: 900, fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontWeight: 900, fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--card)",
                            borderRadius: "24px",
                            border: "1px solid var(--border)",
                            boxShadow: "var(--shadow-massive)",
                            padding: "16px",
                            color: "var(--foreground)",
                          }}
                          itemStyle={{ color: "var(--foreground)" }}
                          labelStyle={{ color: "var(--muted)" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="projected"
                          stroke="#f59e0b"
                          strokeWidth={8}
                          strokeDasharray="12 12"
                          dot={{ r: 10, fill: "#f59e0b", strokeWidth: 2, stroke: "#fff" }}
                          animationDuration={2000}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full w-full" />
                  )
                ) : (
                  <div className="h-full min-h-125 flex items-center justify-center rounded-3xl border border-dashed border-border bg-card-alt/20 px-6 text-center">
                    <p className="text-sm font-semibold text-muted">Forecast will appear after inventory records are available.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuthLayout>
  );
}
