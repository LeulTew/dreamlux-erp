"use client";

import { useQuery } from "@tanstack/react-query";
import { getInventoryStats } from "@/lib/api";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  HiInboxStack,
  HiExclamationTriangle,
  HiMapPin,
  HiCheckBadge,
  HiChartBar,
  HiSquares2X2,
} from "react-icons/hi2";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
];

export default function AdvancedStatsDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "analytics">(
    "overview",
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["inventoryStats"],
    queryFn: getInventoryStats,
    refetchInterval: 60000, // Refresh every minute
  });

  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      // Use double requestAnimationFrame to ensure layout is fully computed
      requestAnimationFrame(() => setChartsReady(true));
    });
    return () => cancelAnimationFrame(frameId);
  }, [activeTab]);

  if (isLoading) {
    return (
      <div className="space-y-6 mb-8 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-28 bg-card-alt rounded-xl border border-border/50"
            />
          ))}
        </div>
        <div className="h-64 bg-card-alt rounded-2xl border border-border/50" />
      </div>
    );
  }

  if (error || !data) return null;

  const reconciliationRate =
    data.totalEntries > 0
      ? Math.round((data.reconciledRecently / data.totalEntries) * 100)
      : 0;

  return (
    <div className="space-y-6 mb-10">
      {/* Tab Switcher */}
      <div className="flex items-center p-1 bg-card-alt w-fit rounded-2xl border border-border/40 shadow-sm">
        <button
          onClick={() => {
            setActiveTab("overview");
            setChartsReady(false);
          }}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
            activeTab === "overview"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          <HiSquares2X2 className="w-4 h-4" />
          OVERVIEW
        </button>
        <button
          onClick={() => {
            setActiveTab("analytics");
            setChartsReady(false);
          }}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
            activeTab === "analytics"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          <HiChartBar className="w-4 h-4" />
          ANALYTICS
        </button>
      </div>

      {activeTab === "overview" ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.1,
              },
            },
          }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {/* Total Assets */}
          <motion.div
            variants={{
              hidden: { y: 20, opacity: 0 },
              visible: { y: 0, opacity: 1 },
            }}
            className="bg-card p-6 rounded-xl border border-border/50 shadow-sm relative overflow-hidden group"
          >
            <div className="absolute -right-2 -bottom-2 opacity-5 text-foreground group-hover:scale-110 transition-transform">
              <HiInboxStack className="w-24 h-24" />
            </div>
            <h3 className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider mb-1">
              Total Assets
            </h3>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">
                {data.totalItems}
              </span>
              <span className="text-xs font-bold text-muted">Items</span>
            </div>
            <p className="text-[10px] text-muted mt-2 font-medium">
              Across all locations
            </p>
          </motion.div>
          {/* Low Stock with Action Link */}
          <Link
            href="/assets?filter=low-stock"
            className="block h-full"
          >
            <motion.div
              variants={{
                hidden: { y: 20, opacity: 0 },
                visible: { y: 0, opacity: 1 },
              }}
              className="bg-card p-6 rounded-xl border border-border/50 shadow-sm relative overflow-hidden group cursor-pointer h-full"
            >
              <div className="absolute -right-2 -bottom-2 opacity-5 text-danger group-hover:scale-110 transition-transform">
                <HiExclamationTriangle className="w-24 h-24" />
              </div>
              <h3 className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider mb-1">
                Low Stock
              </h3>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-danger">
                  {data.lowStockItems}
                </span>
                <span className="text-xs font-bold text-danger/60">Alerts</span>
              </div>
              <div className="text-[10px] text-primary group-hover:underline mt-2 font-semibold uppercase tracking-wider inline-block relative z-10">
                Resolve Alerts →
              </div>
            </motion.div>
          </Link>

          {/* Active Hubs */}
          <motion.div
            variants={{
              hidden: { y: 20, opacity: 0 },
              visible: { y: 0, opacity: 1 },
            }}
            className="bg-card p-6 rounded-xl border border-border/50 shadow-sm relative overflow-hidden group"
          >
            <div className="absolute -right-2 -bottom-2 opacity-5 text-primary group-hover:scale-110 transition-transform">
              <HiMapPin className="w-24 h-24" />
            </div>
            <h3 className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider mb-1">
              Active Hubs
            </h3>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">
                {data.stockPerLocation.length}
              </span>
              <span className="text-xs font-bold text-muted">Stores</span>
            </div>
            <p className="text-[10px] text-muted mt-2 font-medium">
              Localized tracking
            </p>
          </motion.div>

          {/* Audit Health with Action Link */}
          <Link
            href="/assets?reconcile=true"
            className="block h-full"
          >
            <motion.div
              variants={{
                hidden: { y: 20, opacity: 0 },
                visible: { y: 0, opacity: 1 },
              }}
              className="bg-card p-6 rounded-xl border border-border/50 shadow-sm relative overflow-hidden group cursor-pointer h-full"
            >
              <div className="absolute -right-2 -bottom-2 opacity-5 text-success group-hover:scale-110 transition-transform">
                <HiCheckBadge className="w-24 h-24" />
              </div>
              <h3 className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider mb-1">
                Audit Health
              </h3>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-success">
                  {reconciliationRate}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-muted/10 rounded-full mt-2.5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${reconciliationRate}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full bg-success"
                />
              </div>
              <div className="text-[10px] text-success group-hover:underline mt-2 font-semibold uppercase tracking-wider inline-block relative z-10">
                Run Audit →
              </div>
            </motion.div>
          </Link>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          <div className="bg-card p-8 rounded-2xl border border-border/50 shadow-sm min-h-87.5">
            <h3 className="text-xs font-bold text-foreground/80 uppercase tracking-wider mb-8 flex items-center gap-2">
              <HiMapPin className="text-primary w-4 h-4" />
              Distribution by Store
            </h3>
            <div className="h-62.5 w-full min-w-0">
              {chartsReady ? (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  minHeight={1}
                  debounce={50}
                >
                  <PieChart>
                    <Pie
                      data={data.stockPerLocation}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="quantity"
                      nameKey="location"
                    >
                      {data.stockPerLocation.map((_entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111",
                        border: "none",
                        borderRadius: "12px",
                        fontSize: "10px",
                        color: "#fff",
                      }}
                      itemStyle={{ color: "#fff" }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      wrapperStyle={{
                        fontSize: "10px",
                        fontWeight: "black",
                        paddingTop: "20px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full" />
              )}
            </div>
          </div>

          <div className="bg-card p-8 rounded-2xl border border-border/50 shadow-sm min-h-87.5">
            <h3 className="text-xs font-bold text-foreground/80 uppercase tracking-wider mb-8 flex items-center gap-2">
              <HiInboxStack className="text-accent w-4 h-4" />
              Stock Density Node
            </h3>
            <div className="h-62.5 w-full min-w-0">
              {chartsReady ? (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  minHeight={1}
                  debounce={50}
                >
                  <BarChart data={data.stockPerLocation}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#8882"
                    />
                    <XAxis
                      dataKey="location"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#888", fontSize: 10, fontWeight: "bold" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#888", fontSize: 10, fontWeight: "bold" }}
                    />
                    <Tooltip
                      cursor={{ fill: "#8881" }}
                      contentStyle={{
                        backgroundColor: "#111",
                        border: "none",
                        borderRadius: "12px",
                        fontSize: "10px",
                        color: "#fff",
                      }}
                    />
                    <Bar
                      dataKey="quantity"
                      fill="#3b82f6"
                      radius={[8, 8, 0, 0]}
                      barSize={50}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full" />
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
