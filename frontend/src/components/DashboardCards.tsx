"use client";

import { useQuery } from "@tanstack/react-query";
import { getInventoryStats } from "@/lib/api";
import { HiOutlineExclamationTriangle, HiOutlineCubeTransparent, HiOutlineMapPin, HiOutlineClock } from "react-icons/hi2";
import { motion } from "framer-motion";

export default function DashboardCards() {
  const { data, isLoading } = useQuery({
    queryKey: ["inventoryStats"],
    queryFn: getInventoryStats,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse bg-card/50 h-32 rounded-xl border border-border"></div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const cards = [
    {
      label: "Total Inventory",
      value: data.totalEntries,
      subValue: `${data.totalItems} Units`,
      icon: HiOutlineCubeTransparent,
      color: "text-primary",
      bg: "bg-primary/5",
      border: "border-primary/20"
    },
    {
      label: "Critical Stock",
      value: data.lowStockItems,
      subValue: "Requires reorder",
      icon: HiOutlineExclamationTriangle,
      color: "text-danger",
      bg: "bg-danger/5",
      border: "border-danger/20"
    },
    {
      label: "Active Locations",
      value: data.stockPerLocation?.length || 0,
      subValue: "Live monitoring",
      icon: HiOutlineMapPin,
      color: "text-indigo-500",
      bg: "bg-indigo-500/5",
      border: "border-indigo-500/20"
    },
    {
      label: "Last Reconciliation",
      value: data.reconciledRecently,
      subValue: "Items checked this month",
      icon: HiOutlineClock,
      color: "text-success",
      bg: "bg-success/5",
      border: "border-success/20"
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, idx) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: idx * 0.1 }}
          className="glass-card p-6 rounded-xl border border-border/50 shadow-md flex flex-col justify-between group hover:border-primary/30 transition-all hover:-translate-y-1"
        >
          <div className="flex items-start justify-between">
            <div className={`p-3 rounded-lg ${card.bg} ${card.color} border ${card.border} group-hover:scale-110 transition-transform`}>
              <card.icon className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-6">
            <h3 className="text-[11px] font-semibold uppercase text-muted-foreground/80 tracking-wider leading-none mb-2">{card.label}</h3>
            <p className="text-3xl font-bold text-foreground tracking-tight leading-none">{card.value}</p>
            <p className="text-xs font-medium text-muted-foreground/80 mt-2 flex items-center gap-1">
              {card.subValue}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}