"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient, UseQueryResult } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  HiArrowLeft,
  HiCalendarDays,
  HiCheckCircle,
  HiClipboardDocumentCheck,
  HiCurrencyDollar,
  HiCube,
  HiMapPin,
  HiMinusCircle,
  HiPaintBrush,
  HiPhone,
  HiPlus,
  HiArrowTrendingUp,
  HiUser,
} from "react-icons/hi2";

import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createEventAllocation,
  createEventChecklistItem,
  deleteEventAllocation,
  getEventWorkspace,
  getItems,
  updateEventChecklistItem,
  updateEventDesign,
  getAvailableEmployees,
  getAvailableVehicles,
  createEmployeeAssignment,
  deleteEmployeeAssignment,
  createVehicleAssignment,
  deleteVehicleAssignment,
  updateEmployeeAttendance,
  createEventTripLog,
  createEventExpense,
  generateEventLaborExpense,
  getEventProfit,
} from "@/lib/api";
import type { EventChecklistItem, Item, EventAssignment, VehicleAssignment, Employee, Vehicle, EventExpense, EventTripLog, EventProfitSummary, CategoryCost } from "@/lib/types";
import { useLanguage } from "@/hooks/use-language";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Back to Events": "Back to Events",
    "Event Workspace": "Event Workspace",
    "Operational packet for event planning, store allocation, and day-of readiness.": "Operational packet for event planning, store allocation, and day-of readiness.",
    Details: "Details",
    "Inventory Allocation": "Inventory Allocation",
    Checklist: "Checklist",
    Client: "Client",
    Phone: "Phone",
    "Event Type": "Event Type",
    Venue: "Venue",
    Schedule: "Schedule",
    "Contract Price": "Contract Price",
    "Design Package": "Design Package",
    "Design Notes": "Design Notes",
    "Estimated Design Cost": "Estimated Design Cost",
    "Save Design": "Save Design",
    "No design notes yet. Add package, theme, color, or mockup direction.": "No design notes yet. Add package, theme, color, or mockup direction.",
    "Central Store Allocation": "Central Store Allocation",
    "Search inventory": "Search inventory",
    "Select item": "Select item",
    Quantity: "Quantity",
    Notes: "Notes",
    Allocate: "Allocate",
    "Available": "Available",
    "Allocated": "Allocated",
    "No allocations yet. Reserve inventory before event setup begins.": "No allocations yet. Reserve inventory before event setup begins.",
    Release: "Release",
    "Allocation exceeds available stock.": "Allocation exceeds available stock.",
    "Allocation saved": "Allocation saved",
    "Allocation released": "Allocation released",
    "Design details saved": "Design details saved",
    "Event Checklist": "Event Checklist",
    "Task title": "Task title",
    Owner: "Owner",
    "Due date": "Due date",
    "Add Task": "Add Task",
    Todo: "Todo",
    Done: "Done",
    "No checklist tasks yet. Add the first preparation task.": "No checklist tasks yet. Add the first preparation task.",
    "Task added": "Task added",
    "Task updated": "Task updated",
    "Loading workspace": "Loading workspace",
    "Workspace unavailable": "Workspace unavailable",
    "Try again from the Events page.": "Try again from the Events page.",
    "Required": "Required",
    Status: "Status",
    "Team & Vehicles": "Team & Vehicles",
    "Assign Staff": "Assign Staff",
    "Assign Vehicle": "Assign Vehicle",
    "Role": "Role",
    "Commission Amount": "Commission Amount",
    "Driver": "Driver",
    "Night Shift": "Night Shift",
    "Staff Member": "Staff Member",
    "Vehicle": "Vehicle",
    "Choose staff": "Choose staff",
    "Choose vehicle": "Choose vehicle",
    "Choose driver": "Choose driver",
    "Assign": "Assign",
    "No staff assigned yet.": "No staff assigned yet.",
    "No vehicles assigned yet.": "No vehicles assigned yet.",
    "Attendance": "Attendance",
    "Attended": "Attended",
    "Did not attend": "Did not attend",
    "Remove Assignment": "Remove Assignment",
    "Staff assigned": "Staff assigned",
    "Vehicle assigned": "Vehicle assigned",
    "Assignment removed": "Assignment removed",
    "Attendance updated": "Attendance updated",
    "Expenses & Trips": "Expenses & Trips",
    "Log Expense": "Log Expense",
    "Trip Log": "Trip Log",
    Category: "Category",
    Amount: "Amount",
    Description: "Description",
    "Receipt Key": "Receipt Key",
    "Submit Expense": "Submit Expense",
    "Expense submitted": "Expense submitted",
    "Generate Labor Expense": "Generate Labor Expense",
    "Labor expense generated": "Labor expense generated",
    "Choose vehicle assignment": "Choose vehicle assignment",
    Destination: "Destination",
    "Distance (km)": "Distance (km)",
    "Fuel Price": "Fuel Price",
    "Log Trip": "Log Trip",
    "Trip logged": "Trip logged",
    "Fuel cost preview": "Fuel cost preview",
    "No expenses yet. Log event costs as they happen.": "No expenses yet. Log event costs as they happen.",
    "No trips yet. Drivers can log distance after vehicle assignment.": "No trips yet. Drivers can log distance after vehicle assignment.",
    Pending: "Pending",
    Approved: "Approved",
    Rejected: "Rejected",
    Fuel: "Fuel",
    Labor: "Labor",
    Transportation: "Transportation",
    "Equipment Rental": "Equipment Rental",
    Consumables: "Consumables",
    Other: "Other",
    "Profit": "Profit",
    "Net Profit": "Net Profit",
    "Profit Margin": "Profit Margin",
    "Category Breakdown": "Category Breakdown",
    "No approved expenses yet. Profit is same as contract price.": "No approved expenses yet. Profit is same as contract price.",
    "Total Approved Expenses": "Total Approved Expenses",
  },
  am: {
    "Back to Events": "ወደ ዝግጅቶች ተመለስ",
    "Event Workspace": "የዝግጅት የስራ ቦታ",
    "Operational packet for event planning, store allocation, and day-of readiness.": "ለዝግጅት እቅድ፣ የመጋዘን ምደባ እና የዕለቱ ዝግጅት የስራ ፋይል።",
    Details: "ዝርዝሮች",
    "Inventory Allocation": "የዕቃ ምደባ",
    Checklist: "የስራ ዝርዝር",
    Client: "ደንበኛ",
    Phone: "ስልክ",
    "Event Type": "የዝግጅት አይነት",
    Venue: "ቦታ",
    Schedule: "ቀንና ሰዓት",
    "Contract Price": "የውል ዋጋ",
    "Design Package": "የዲዛይን ፓኬጅ",
    "Design Notes": "የዲዛይን ማስታወሻ",
    "Estimated Design Cost": "የተገመተ የዲዛይን ወጪ",
    "Save Design": "ዲዛይን አስቀምጥ",
    "No design notes yet. Add package, theme, color, or mockup direction.": "እስካሁን የዲዛይን ማስታወሻ የለም። ፓኬጅ፣ ገጽታ፣ ቀለም ወይም የሞክአፕ አቅጣጫ ያክሉ።",
    "Central Store Allocation": "የመካከለኛ መጋዘን ምደባ",
    "Search inventory": "ዕቃ ፈልግ",
    "Select item": "ዕቃ ምረጥ",
    Quantity: "ብዛት",
    Notes: "ማስታወሻ",
    Allocate: "መድብ",
    "Available": "ያለ",
    "Allocated": "የተመደበ",
    "No allocations yet. Reserve inventory before event setup begins.": "እስካሁን ምደባ የለም። የዝግጅት ማቀናበር ከመጀመሩ በፊት ዕቃ ያስይዙ።",
    Release: "ልቀቅ",
    "Allocation exceeds available stock.": "ምደባው ካለው ክምችት በላይ ነው።",
    "Allocation saved": "ምደባ ተቀምጧል",
    "Allocation released": "ምደባ ተለቋል",
    "Design details saved": "የዲዛይን ዝርዝር ተቀምጧል",
    "Event Checklist": "የዝግጅት የስራ ዝርዝር",
    "Task title": "የስራ ርዕስ",
    Owner: "ባለቤት",
    "Due date": "የማብቂያ ቀን",
    "Add Task": "ስራ ጨምር",
    Todo: "የሚሰራ",
    Done: "ተጠናቋል",
    "No checklist tasks yet. Add the first preparation task.": "እስካሁን የስራ ዝርዝር የለም። የመጀመሪያውን የዝግጅት ስራ ያክሉ።",
    "Task added": "ስራ ታክሏል",
    "Task updated": "ስራ ተዘምኗል",
    "Loading workspace": "የስራ ቦታ በመጫን ላይ",
    "Workspace unavailable": "የስራ ቦታ አልተገኘም",
    "Try again from the Events page.": "ከዝግጅቶች ገጽ እንደገና ይሞክሩ።",
    "Required": "ያስፈልጋል",
    Status: "ሁኔታ",
    "Team & Vehicles": "ቡድን እና ተሽከርካሪዎች",
    "Assign Staff": "ሠራተኛ መድብ",
    "Assign Vehicle": "ተሽከርካሪ መድብ",
    "Role": "ኃላፊነት",
    "Commission Amount": "የኮሚሽን መጠን",
    "Driver": "ሾፌር",
    "Night Shift": "የሌሊት ፈረቃ",
    "Staff Member": "የቡድን አባል",
    "Vehicle": "ተሽከርካሪ",
    "Choose staff": "ሠራተኛ ምረጥ",
    "Choose vehicle": "ተሽከርካሪ ምረጥ",
    "Choose driver": "ሾፌር ምረጥ",
    "Assign": "መድብ",
    "No staff assigned yet.": "እስካሁን ምንም ሠራተኛ አልተመደበም።",
    "No vehicles assigned yet.": "እስካሁን ምንም ተሽከርካሪ አልተመደበም።",
    "Attendance": "መገኘት",
    "Attended": "ተገኝቷል",
    "Did not attend": "አልተገኘም",
    "Remove Assignment": "ምደባን ሰርዝ",
    "Staff assigned": "ሠራተኛ ተመድቧል",
    "Vehicle assigned": "ተሽከርካሪ ተመድቧል",
    "Assignment removed": "ምደባ ተሰርዟል",
    "Attendance updated": "የመገኘት ሁኔታ ተዘምኗል",
    "Expenses & Trips": "ወጪዎች እና ጉዞዎች",
    "Log Expense": "ወጪ መዝግብ",
    "Trip Log": "የጉዞ መዝገብ",
    Category: "ምድብ",
    Amount: "መጠን",
    Description: "መግለጫ",
    "Receipt Key": "የደረሰኝ ቁልፍ",
    "Submit Expense": "ወጪ አስገባ",
    "Expense submitted": "ወጪ ቀርቧል",
    "Generate Labor Expense": "የሰራተኛ ወጪ አመንጭ",
    "Labor expense generated": "የሰራተኛ ወጪ ተፈጥሯል",
    "Choose vehicle assignment": "የተመደበ ተሽከርካሪ ምረጥ",
    Destination: "መድረሻ",
    "Distance (km)": "ርቀት (ኪ.ሜ)",
    "Fuel Price": "የነዳጅ ዋጋ",
    "Log Trip": "ጉዞ መዝግብ",
    "Trip logged": "ጉዞ ተመዝግቧል",
    "Fuel cost preview": "የነዳጅ ወጪ ቅድመ እይታ",
    "No expenses yet. Log event costs as they happen.": "እስካሁን ወጪ የለም። የዝግጅት ወጪዎችን ሲፈጠሩ ይመዝግቡ።",
    "No trips yet. Drivers can log distance after vehicle assignment.": "እስካሁን ጉዞ የለም። ሾፌሮች ተሽከርካሪ ከተመደበ በኋላ ርቀት መመዝገብ ይችላሉ።",
    Pending: "በመጠባበቅ ላይ",
    Approved: "ጸድቋል",
    Rejected: "ውድቅ ተደርጓል",
    Fuel: "ነዳጅ",
    Labor: "ሰራተኛ",
    Transportation: "ትራንስፖርት",
    "Equipment Rental": "የመሳሪያ ኪራይ",
    Consumables: "የሚጠቀሙ እቃዎች",
    Other: "ሌላ",
    "Profit": "ትርፍ",
    "Net Profit": "የተጣራ ትርፍ",
    "Profit Margin": "የትርፍ ህዳግ",
    "Category Breakdown": "የወጪ ዝርዝር በምድብ",
    "No approved expenses yet. Profit is same as contract price.": "እስካሁን የጸደቀ ወጪ የለም። ትርፉ ከውሉ ዋጋ ጋር እኩል ነው።",
    "Total Approved Expenses": "አጠቃላይ የጸደቁ ወጪዎች",
  },
};

type TabKey = "details" | "inventory" | "checklist" | "scheduling" | "expenses" | "profit";

const tabs: Array<{ id: TabKey; label: string; icon: typeof HiUser }> = [
  { id: "details", label: "Details", icon: HiUser },
  { id: "inventory", label: "Inventory Allocation", icon: HiCube },
  { id: "checklist", label: "Checklist", icon: HiClipboardDocumentCheck },
  { id: "scheduling", label: "Team & Vehicles", icon: HiCalendarDays },
  { id: "expenses", label: "Expenses & Trips", icon: HiCurrencyDollar },
  { id: "profit", label: "Profit", icon: HiArrowTrendingUp },
];

function formatDate(value?: string | null) {
  if (!value) return "-";
  return value.split("T")[0];
}

function formatTime(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 5);
}

function formatCurrency(value?: number | string | null) {
  return `ETB ${Number(value || 0).toLocaleString()}`;
}

function FieldRow({ label, value, icon: Icon }: { label: string; value: string; icon: typeof HiUser }) {
  return (
    <div className="rounded-lg border border-border bg-card-alt/40 p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-muted">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground break-words">{value || "-"}</div>
    </div>
  );
}

function DesignPackagePanel({
  eventId,
  initialNotes,
  initialCost,
  t,
}: {
  eventId: string;
  initialNotes: string;
  initialCost: number;
  t: (key: string) => string;
}) {
  const queryClient = useQueryClient();
  const [designNotes, setDesignNotes] = useState(initialNotes);
  const [designCost, setDesignCost] = useState(String(initialCost));

  const saveDesignMutation = useMutation({
    mutationFn: () =>
      updateEventDesign(eventId, {
        package_design_notes: designNotes,
        estimated_design_cost: Number(designCost || 0),
      }),
    onSuccess: () => {
      toast.success(t("Design details saved"));
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
    },
  });

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center gap-2">
        <HiPaintBrush className="h-5 w-5 text-primary-dark" />
        <h2 className="text-base font-bold text-foreground">{t("Design Package")}</h2>
      </div>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-muted">{t("Design Notes")}</label>
        <textarea
          value={designNotes}
          onChange={(eventChange) => setDesignNotes(eventChange.target.value)}
          placeholder={t("No design notes yet. Add package, theme, color, or mockup direction.")}
          className="min-h-32 w-full rounded-lg border border-input bg-card-alt px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-ring focus:ring-3 focus:ring-ring/30"
        />
        <label className="block text-xs font-semibold text-muted">{t("Estimated Design Cost")}</label>
        <Input
          type="number"
          min="0"
          value={designCost}
          onChange={(eventChange) => setDesignCost(eventChange.target.value)}
        />
        <Button
          type="button"
          onClick={() => saveDesignMutation.mutate()}
          disabled={saveDesignMutation.isPending}
          className="w-full"
        >
          {t("Save Design")}
        </Button>
      </div>
    </section>
  );
}

function EventProfitPanel({
  profitQuery,
  t,
}: {
  eventId: string;
  profitQuery: UseQueryResult<EventProfitSummary, Error>;
  t: (key: string) => string;
}) {
  const { data: profit, isLoading, isError } = profitQuery;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !profit) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted">
        {t("Workspace unavailable")}
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return `ETB ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const colors = {
    Fuel: "bg-amber-500",
    Labor: "bg-blue-500",
    Transportation: "bg-emerald-500",
    "Equipment Rental": "bg-indigo-500",
    Consumables: "bg-pink-500",
    Other: "bg-slate-500",
  };

  const svgColors = {
    Fuel: "#f59e0b",
    Labor: "#3b82f6",
    Transportation: "#10b981",
    "Equipment Rental": "#6366f1",
    Consumables: "#ec4899",
    Other: "#64748b",
  };

  const chartSegments: Array<{ category: string; amount: number; percentage: number; start: number; color: string }> = [];
  let tempSum = 0;
  for (const c of profit.categoryBreakdown) {
    if (c.amount > 0) {
      const percentage = profit.totalExpenses > 0 ? (c.amount / profit.totalExpenses) * 100 : 0;
      chartSegments.push({
        category: c.category,
        amount: c.amount,
        percentage,
        start: tempSum,
        color: svgColors[c.category as keyof typeof svgColors] || "#64748b",
      });
      tempSum += percentage;
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("Contract Price")}</div>
          <div className="mt-2 text-xl font-black text-foreground">{formatCurrency(profit.contractPrice)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("Total Approved Expenses")}</div>
          <div className="mt-2 text-xl font-black text-foreground">{formatCurrency(profit.totalExpenses)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("Net Profit")}</div>
          <div className={`mt-2 text-xl font-black ${profit.netProfit >= 0 ? "text-emerald-500" : "text-danger"}`}>
            {formatCurrency(profit.netProfit)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("Profit Margin")}</div>
          <div className={`mt-2 text-xl font-black ${profit.profitMargin >= 0 ? "text-emerald-500" : "text-danger"}`}>
            {profit.profitMargin.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-base font-bold text-foreground">{t("Category Breakdown")}</h2>
          
          {profit.totalExpenses === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              {t("No approved expenses yet. Profit is same as contract price.")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted uppercase">
                    <th className="py-2 font-bold">{t("Category")}</th>
                    <th className="py-2 text-right font-bold">{t("Amount")}</th>
                    <th className="py-2 text-right font-bold">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profit.categoryBreakdown.map((row: CategoryCost) => {
                    const percentage = profit.totalExpenses > 0 ? (row.amount / profit.totalExpenses) * 100 : 0;
                    const colorClass = colors[row.category as keyof typeof colors] || "bg-slate-500";
                    return (
                      <tr key={row.category} className="text-foreground">
                        <td className="py-3 flex items-center gap-2 font-semibold">
                          <span className={`h-2.5 w-2.5 rounded-full ${colorClass}`} />
                          {t(row.category)}
                        </td>
                        <td className="py-3 text-right font-mono font-bold">
                          {formatCurrency(row.amount)}
                        </td>
                        <td className="py-3 text-right font-mono text-muted">
                          {percentage.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4 flex flex-col justify-between">
          <div>
            <h2 className="mb-4 text-base font-bold text-foreground">{t("Category Breakdown")}</h2>
            
            {profit.totalExpenses === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted">
                {t("No approved expenses yet. Profit is same as contract price.")}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="relative pt-1">
                  <div className="flex mb-2 items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-primary-dark bg-primary-light">
                        {t("Total Approved Expenses")}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold inline-block text-foreground">
                        100%
                      </span>
                    </div>
                  </div>
                  
                  <svg width="100%" height="24" className="rounded-md overflow-hidden bg-muted">
                    {chartSegments.map((seg, idx: number) => (
                      <rect
                        key={idx}
                        x={`${seg.start}%`}
                        y="0"
                        width={`${seg.percentage}%`}
                        height="24"
                        fill={seg.color}
                      />
                    ))}
                  </svg>
                </div>

                <div className="space-y-3">
                  {profit.categoryBreakdown.map((row: CategoryCost) => {
                    if (row.amount === 0) return null;
                    const percentage = profit.totalExpenses > 0 ? (row.amount / profit.totalExpenses) * 100 : 0;
                    const colorClass = colors[row.category as keyof typeof colors] || "bg-slate-500";
                    return (
                      <div key={row.category} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold text-foreground">
                          <span>{t(row.category)}</span>
                          <span className="text-muted">{percentage.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className={`h-full ${colorClass}`} style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function EventWorkspacePage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("details");
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [allocationQty, setAllocationQty] = useState("1");
  const [allocationNotes, setAllocationNotes] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskOwner, setTaskOwner] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");

  const [userRole] = useState(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const payloadBase64 = token.split(".")[1];
          const payloadDecoded = JSON.parse(atob(payloadBase64));
          return payloadDecoded.role || "";
        } catch (e) {
          console.error("Failed to decode token:", e);
        }
      }
    }
    return "";
  });

  const hasProfitAccess = !!(userRole && ["OWNER", "ACCOUNTANT", "SUPER_ADMIN", "ADMIN"].includes(userRole.toUpperCase()));

  const profitQuery = useQuery({
    queryKey: ["event-profit", eventId],
    queryFn: () => getEventProfit(eventId),
    enabled: hasProfitAccess,
  });

  const visibleTabs = tabs.filter((t) => t.id !== "profit" || hasProfitAccess);

  const workspaceQuery = useQuery({
    queryKey: ["event-workspace", eventId],
    queryFn: () => getEventWorkspace(eventId),
  });

  const event = workspaceQuery.data?.event;
  const allocations = workspaceQuery.data?.allocations || [];
  const checklist = workspaceQuery.data?.checklist || [];

  const itemsQuery = useQuery({
    queryKey: ["event-allocation-items", itemSearch],
    queryFn: () => getItems(1, 30, itemSearch || undefined, "all", false),
  });

  const items = (itemsQuery.data?.items || []) as Item[];
  const selectedItem = items.find((item) => item.id === selectedItemId);
  const alreadyAllocated = allocations
    .filter((allocation) => allocation.item_id === selectedItemId && allocation.status !== "Returned")
    .reduce((sum, allocation) => sum + Number(allocation.quantity_allocated || 0), 0) || 0;
  const selectedAvailable = selectedItem ? Math.max(0, Number(selectedItem.quantity || 0) - alreadyAllocated) : 0;

  const allocationMutation = useMutation({
    mutationFn: () =>
      createEventAllocation(eventId, {
        item_id: selectedItemId,
        quantity_allocated: Number(allocationQty || 0),
        notes: allocationNotes || null,
      }),
    onSuccess: () => {
      toast.success(t("Allocation saved"));
      setAllocationQty("1");
      setAllocationNotes("");
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
    },
    onError: () => toast.error(t("Allocation exceeds available stock.")),
  });

  const releaseMutation = useMutation({
    mutationFn: (allocationId: string) => deleteEventAllocation(eventId, allocationId),
    onSuccess: () => {
      toast.success(t("Allocation released"));
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: () =>
      createEventChecklistItem(eventId, {
        title: taskTitle,
        owner_name: taskOwner || null,
        due_date: taskDueDate || null,
      }),
    onSuccess: () => {
      toast.success(t("Task added"));
      setTaskTitle("");
      setTaskOwner("");
      setTaskDueDate("");
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: (item: EventChecklistItem) =>
      updateEventChecklistItem(eventId, item.id, {
        status: item.status === "Done" ? "Todo" : "Done",
      }),
    onSuccess: () => {
      toast.success(t("Task updated"));
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
    },
  });

  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [assignRole, setAssignRole] = useState("");
  const [commissionAmt, setCommissionAmt] = useState("");
  const [selectedVehId, setSelectedVehId] = useState("");
  const [selectedDrvId, setSelectedDrvId] = useState("");
  const [nightShift, setNightShift] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState<EventExpense["category"]>("Other");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [receiptKey, setReceiptKey] = useState("");
  const [tripVehicleAssignmentId, setTripVehicleAssignmentId] = useState("");
  const [tripDestination, setTripDestination] = useState("");
  const [tripDistance, setTripDistance] = useState("");
  const [fuelPrice, setFuelPrice] = useState("");

  const assignments = workspaceQuery.data?.assignments || [];
  const vehicleAssignments = workspaceQuery.data?.vehicleAssignments || [];
  const expenses = workspaceQuery.data?.expenses || [];
  const trips = workspaceQuery.data?.trips || [];
  const selectedTripVehicle = vehicleAssignments.find((vehicleAssignment) => vehicleAssignment.id === tripVehicleAssignmentId);
  const fuelCostPreview =
    selectedTripVehicle && Number(tripDistance) > 0 && Number(fuelPrice) > 0
      ? Number((Number(tripDistance) * Number(selectedTripVehicle.fuel_consumption_rate || 0) * Number(fuelPrice)).toFixed(2))
      : 0;

  const availableEmployeesQuery = useQuery({
    queryKey: ["available-employees", eventId],
    queryFn: () => getAvailableEmployees(eventId),
    enabled: activeTab === "scheduling",
  });

  const availableVehiclesQuery = useQuery({
    queryKey: ["available-vehicles", eventId],
    queryFn: () => getAvailableVehicles(eventId),
    enabled: activeTab === "scheduling",
  });

  const assignEmployeeMutation = useMutation({
    mutationFn: (data: { employee_id: string; role: string; commission_amount: number }) =>
      createEmployeeAssignment(eventId, data),
    onSuccess: () => {
      toast.success(t("Staff assigned"));
      setSelectedEmpId("");
      setAssignRole("");
      setCommissionAmt("");
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
      queryClient.invalidateQueries({ queryKey: ["available-employees", eventId] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      toast.error(err.response?.data?.error || err.message || t("Assignment failed"));
    },
  });

  const removeEmployeeMutation = useMutation({
    mutationFn: (employeeId: string) => deleteEmployeeAssignment(eventId, employeeId),
    onSuccess: () => {
      toast.success(t("Assignment removed"));
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
      queryClient.invalidateQueries({ queryKey: ["available-employees", eventId] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      toast.error(err.response?.data?.error || err.message || t("Removal failed"));
    },
  });

  const assignVehicleMutation = useMutation({
    mutationFn: (data: { vehicle_id: string; driver_id?: string | null; is_night_shift?: boolean }) =>
      createVehicleAssignment(eventId, data),
    onSuccess: () => {
      toast.success(t("Vehicle assigned"));
      setSelectedVehId("");
      setSelectedDrvId("");
      setNightShift(false);
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
      queryClient.invalidateQueries({ queryKey: ["available-vehicles", eventId] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      toast.error(err.response?.data?.error || err.message || t("Assignment failed"));
    },
  });

  const removeVehicleMutation = useMutation({
    mutationFn: (vehicleId: string) => deleteVehicleAssignment(eventId, vehicleId),
    onSuccess: () => {
      toast.success(t("Assignment removed"));
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
      queryClient.invalidateQueries({ queryKey: ["available-vehicles", eventId] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      toast.error(err.response?.data?.error || err.message || t("Removal failed"));
    },
  });

  const toggleAttendanceMutation = useMutation({
    mutationFn: (payload: { employeeId: string; attended: boolean }) =>
      updateEmployeeAttendance(eventId, payload.employeeId, payload.attended),
    onSuccess: () => {
      toast.success(t("Attendance updated"));
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      toast.error(err.response?.data?.error || err.message || t("Update failed"));
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: () =>
      createEventExpense(eventId, {
        category: expenseCategory,
        amount: Number(expenseAmount || 0),
        description: expenseDescription,
        receipt_image_key: receiptKey || null,
      }),
    onSuccess: () => {
      toast.success(t("Expense submitted"));
      setExpenseCategory("Other");
      setExpenseAmount("");
      setExpenseDescription("");
      setReceiptKey("");
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      toast.error(err.response?.data?.error || err.message || t("Required"));
    },
  });

  const createTripMutation = useMutation({
    mutationFn: () =>
      createEventTripLog(eventId, {
        vehicle_assignment_id: tripVehicleAssignmentId,
        destination: tripDestination,
        distance_km: Number(tripDistance || 0),
        fuel_price_etb: Number(fuelPrice || 0),
      }),
    onSuccess: () => {
      toast.success(t("Trip logged"));
      setTripVehicleAssignmentId("");
      setTripDestination("");
      setTripDistance("");
      setFuelPrice("");
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      toast.error(err.response?.data?.error || err.message || t("Required"));
    },
  });

  const generateLaborMutation = useMutation({
    mutationFn: () => generateEventLaborExpense(eventId),
    onSuccess: () => {
      toast.success(t("Labor expense generated"));
      queryClient.invalidateQueries({ queryKey: ["event-workspace", eventId] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      toast.error(err.response?.data?.error || err.message || t("Required"));
    },
  });

  const schedule = event
    ? `${formatDate(event.start_date)}${event.start_date !== event.end_date ? ` - ${formatDate(event.end_date)}` : ""} ${formatTime(event.start_time)}${event.end_time ? ` - ${formatTime(event.end_time)}` : ""}`
    : "";

  const canAllocate =
    selectedItemId &&
    Number(allocationQty) > 0 &&
    Number(allocationQty) <= selectedAvailable &&
    !allocationMutation.isPending;

  return (
    <AuthLayout>
      <div className="page-container-lg space-y-5">
        <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <Link href="/events" className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-foreground">
              <HiArrowLeft className="h-4 w-4" />
              {t("Back to Events")}
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary-light text-primary-dark">
                <HiCalendarDays className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-black text-foreground">{event?.name || t("Event Workspace")}</h1>
                <p className="mt-1 text-sm text-muted">{t("Operational packet for event planning, store allocation, and day-of readiness.")}</p>
              </div>
            </div>
          </div>
          {event && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card-alt px-3 py-2 text-xs font-bold text-foreground">
              <span className="text-muted">{t("Status")}</span>
              <span>{event.status}</span>
            </div>
          )}
        </div>

        {workspaceQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : workspaceQuery.isError || !event ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <h2 className="text-lg font-bold text-foreground">{t("Workspace unavailable")}</h2>
            <p className="mt-2 text-sm text-muted">{t("Try again from the Events page.")}</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto border-b border-border">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex min-h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors ${
                      isActive
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t(tab.label)}
                  </button>
                );
              })}
            </div>

            {activeTab === "details" && (
              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <section className="rounded-lg border border-border bg-card p-4">
                  <h2 className="mb-4 text-base font-bold text-foreground">{t("Details")}</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FieldRow label={t("Client")} value={event.client_name} icon={HiUser} />
                    <FieldRow label={t("Phone")} value={event.client_phone || "-"} icon={HiPhone} />
                    <FieldRow label={t("Event Type")} value={event.event_type_name || "-"} icon={HiClipboardDocumentCheck} />
                    <FieldRow label={t("Venue")} value={event.venue_location} icon={HiMapPin} />
                    <FieldRow label={t("Schedule")} value={schedule} icon={HiCalendarDays} />
                    <FieldRow label={t("Contract Price")} value={formatCurrency(event.contract_price)} icon={HiCheckCircle} />
                  </div>
                </section>

                <DesignPackagePanel
                  key={`${event.id}:${event.updated_at}`}
                  eventId={eventId}
                  initialNotes={event.package_design_notes || ""}
                  initialCost={Number(event.estimated_design_cost || 0)}
                  t={t}
                />
              </div>
            )}

            {activeTab === "inventory" && (
              <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
                <section className="rounded-lg border border-border bg-card p-4">
                  <h2 className="mb-4 text-base font-bold text-foreground">{t("Central Store Allocation")}</h2>
                  <div className="space-y-3">
                    <Input
                      value={itemSearch}
                      onChange={(eventChange) => setItemSearch(eventChange.target.value)}
                      placeholder={t("Search inventory")}
                    />
                    <select
                      value={selectedItemId}
                      onChange={(eventChange) => setSelectedItemId(eventChange.target.value)}
                      className="h-9 w-full rounded-lg border border-input bg-card-alt px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                    >
                      <option value="">{t("Select item")}</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} - {t("Available")} {item.quantity}
                        </option>
                      ))}
                    </select>
                    {selectedItem && (
                      <div className="rounded-lg border border-border bg-card-alt/50 p-3 text-xs text-muted">
                        <div className="font-semibold text-foreground">{selectedItem.name}</div>
                        <div className="mt-1">
                          {t("Available")}: {selectedAvailable} | {t("Allocated")}: {alreadyAllocated}
                        </div>
                      </div>
                    )}
                    <Input
                      type="number"
                      min="1"
                      value={allocationQty}
                      onChange={(eventChange) => setAllocationQty(eventChange.target.value)}
                      placeholder={t("Quantity")}
                    />
                    <Input
                      value={allocationNotes}
                      onChange={(eventChange) => setAllocationNotes(eventChange.target.value)}
                      placeholder={t("Notes")}
                    />
                    <Button type="button" onClick={() => allocationMutation.mutate()} disabled={!canAllocate} className="w-full">
                      <HiPlus className="h-4 w-4" />
                      {t("Allocate")}
                    </Button>
                    {selectedItem && Number(allocationQty) > selectedAvailable && (
                      <p className="text-xs font-semibold text-danger">{t("Allocation exceeds available stock.")}</p>
                    )}
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card">
                  {allocations.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted">{t("No allocations yet. Reserve inventory before event setup begins.")}</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {allocations.map((allocation) => (
                        <div key={allocation.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground">{allocation.item_name}</div>
                            <div className="mt-1 text-xs text-muted">
                              {allocation.store_name || "-"} | {t("Allocated")}: {allocation.quantity_allocated} | {allocation.status}
                            </div>
                            {allocation.notes && <div className="mt-1 text-xs text-muted">{allocation.notes}</div>}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => releaseMutation.mutate(allocation.id)}
                            disabled={releaseMutation.isPending}
                          >
                            <HiMinusCircle className="h-4 w-4" />
                            {t("Release")}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeTab === "checklist" && (
              <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
                <section className="rounded-lg border border-border bg-card p-4">
                  <h2 className="mb-4 text-base font-bold text-foreground">{t("Event Checklist")}</h2>
                  <div className="space-y-3">
                    <Input value={taskTitle} onChange={(eventChange) => setTaskTitle(eventChange.target.value)} placeholder={t("Task title")} />
                    <Input value={taskOwner} onChange={(eventChange) => setTaskOwner(eventChange.target.value)} placeholder={t("Owner")} />
                    <Input type="date" value={taskDueDate} onChange={(eventChange) => setTaskDueDate(eventChange.target.value)} />
                    <Button
                      type="button"
                      onClick={() => {
                        if (!taskTitle.trim()) {
                          toast.error(t("Required"));
                          return;
                        }
                        addTaskMutation.mutate();
                      }}
                      disabled={addTaskMutation.isPending}
                      className="w-full"
                    >
                      <HiPlus className="h-4 w-4" />
                      {t("Add Task")}
                    </Button>
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card">
                  {checklist.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted">{t("No checklist tasks yet. Add the first preparation task.")}</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {checklist.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleTaskMutation.mutate(item)}
                          className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-card-alt/50"
                        >
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                              item.status === "Done"
                                ? "border-success bg-success text-white"
                                : "border-border bg-card-alt text-transparent"
                            }`}
                          >
                            <HiCheckCircle className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-sm font-semibold ${item.status === "Done" ? "text-muted line-through" : "text-foreground"}`}>
                              {item.title}
                            </span>
                            <span className="mt-1 block text-xs text-muted">
                              {item.owner_name || t("Owner")} | {item.due_date ? formatDate(item.due_date) : t("Due date")} | {t(item.status)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeTab === "scheduling" && (
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Team Assignment Panel */}
                <div className="space-y-4">
                  <section className="rounded-lg border border-border bg-card p-4">
                    <h2 className="mb-4 text-base font-bold text-foreground">{t("Assign Staff")}</h2>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-muted mb-1">{t("Staff Member")}</label>
                        <select
                          value={selectedEmpId}
                          onChange={(e) => setSelectedEmpId(e.target.value)}
                          className="h-9 w-full rounded-lg border border-input bg-card-alt px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                        >
                          <option value="">{t("Choose staff")}</option>
                          {(availableEmployeesQuery.data || []).map((emp: Employee) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.full_name} ({emp.position || "Staff"})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-muted mb-1">{t("Role")}</label>
                        <select
                          value={assignRole}
                          onChange={(e) => setAssignRole(e.target.value)}
                          className="h-9 w-full rounded-lg border border-input bg-card-alt px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                        >
                          <option value="">{t("Role")}</option>
                          <option value="Event Manager">Event Manager</option>
                          <option value="Supervisor">Supervisor</option>
                          <option value="Team Leader">Team Leader</option>
                          <option value="Décor Professional">Décor Professional</option>
                          <option value="Assistant">Assistant</option>
                          <option value="Driver">Driver</option>
                          <option value="Store Keeper">Store Keeper</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-muted mb-1">{t("Commission Amount")}</label>
                        <Input
                          type="number"
                          min="0"
                          value={commissionAmt}
                          onChange={(e) => setCommissionAmt(e.target.value)}
                          placeholder="ETB 0.00"
                        />
                      </div>

                      <Button
                        type="button"
                        onClick={() => {
                          if (!selectedEmpId || !assignRole) {
                            toast.error(t("Required"));
                            return;
                          }
                          assignEmployeeMutation.mutate({
                            employee_id: selectedEmpId,
                            role: assignRole,
                            commission_amount: Number(commissionAmt || 0),
                          });
                        }}
                        disabled={assignEmployeeMutation.isPending}
                        className="w-full"
                      >
                        <HiPlus className="h-4 w-4" />
                        {t("Assign")}
                      </Button>
                    </div>
                  </section>

                  <section className="rounded-lg border border-border bg-card">
                    {assignments.length === 0 ? (
                      <div className="p-8 text-center text-sm text-muted">{t("No staff assigned yet.")}</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {assignments.map((asg: EventAssignment) => (
                          <div key={asg.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="font-semibold text-foreground">{asg.employee_name}</div>
                              <div className="mt-1 text-xs text-muted">
                                {asg.role} | {formatCurrency(asg.commission_amount)}
                              </div>
                              <div className="mt-2 flex items-center gap-3">
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={asg.attended}
                                    onChange={(e) => toggleAttendanceMutation.mutate({ employeeId: asg.employee_id, attended: e.target.checked })}
                                    className="rounded border-border focus:ring-0 cursor-pointer"
                                  />
                                  <span>{t("Attended")}</span>
                                </label>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeEmployeeMutation.mutate(asg.employee_id)}
                              disabled={removeEmployeeMutation.isPending}
                            >
                              <HiMinusCircle className="h-4 w-4" />
                              {t("Release")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                {/* Vehicle Assignment Panel */}
                <div className="space-y-4">
                  <section className="rounded-lg border border-border bg-card p-4">
                    <h2 className="mb-4 text-base font-bold text-foreground">{t("Assign Vehicle")}</h2>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-muted mb-1">{t("Vehicle")}</label>
                        <select
                          value={selectedVehId}
                          onChange={(e) => setSelectedVehId(e.target.value)}
                          className="h-9 w-full rounded-lg border border-input bg-card-alt px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                        >
                          <option value="">{t("Choose vehicle")}</option>
                          {(availableVehiclesQuery.data || []).map((veh: Vehicle) => (
                            <option key={veh.id} value={veh.id}>
                              {veh.plate_number} - {veh.vehicle_type}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-muted mb-1">{t("Driver")}</label>
                        <select
                          value={selectedDrvId}
                          onChange={(e) => setSelectedDrvId(e.target.value)}
                          className="h-9 w-full rounded-lg border border-input bg-card-alt px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                        >
                          <option value="">{t("Choose driver")}</option>
                          {(availableEmployeesQuery.data || [])
                            .filter((emp: Employee) => (emp.position || "").toLowerCase() === "driver" || (emp.department || "").toLowerCase() === "logistics")
                            .map((emp: Employee) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.full_name}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2 py-1">
                        <input
                          type="checkbox"
                          id="nightShiftCheck"
                          checked={nightShift}
                          onChange={(e) => setNightShift(e.target.checked)}
                          className="rounded border-border focus:ring-0 cursor-pointer"
                        />
                        <label htmlFor="nightShiftCheck" className="text-xs font-semibold text-muted cursor-pointer">
                          {t("Night Shift")}
                        </label>
                      </div>

                      <Button
                        type="button"
                        onClick={() => {
                          if (!selectedVehId) {
                            toast.error(t("Required"));
                            return;
                          }
                          assignVehicleMutation.mutate({
                            vehicle_id: selectedVehId,
                            driver_id: selectedDrvId || null,
                            is_night_shift: nightShift,
                          });
                        }}
                        disabled={assignVehicleMutation.isPending}
                        className="w-full"
                      >
                        <HiPlus className="h-4 w-4" />
                        {t("Assign")}
                      </Button>
                    </div>
                  </section>

                  <section className="rounded-lg border border-border bg-card">
                    {vehicleAssignments.length === 0 ? (
                      <div className="p-8 text-center text-sm text-muted">{t("No vehicles assigned yet.")}</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {vehicleAssignments.map((va: VehicleAssignment) => (
                          <div key={va.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="font-semibold text-foreground">{va.plate_number}</div>
                              <div className="mt-1 text-xs text-muted">
                                {va.vehicle_type} | {va.driver_name ? `${t("Driver")}: ${va.driver_name}` : t("No Driver Assigned")}
                              </div>
                              {va.is_night_shift && (
                                <span className="mt-1.5 inline-flex items-center rounded bg-primary-light px-2 py-0.5 text-[10px] font-semibold text-primary-dark">
                                  {t("Night Shift")}
                                </span>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeVehicleMutation.mutate(va.vehicle_id)}
                              disabled={removeVehicleMutation.isPending}
                            >
                              <HiMinusCircle className="h-4 w-4" />
                              {t("Release")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            )}

            {activeTab === "expenses" && (
              <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-4">
                  <section className="rounded-lg border border-border bg-card p-4">
                    <h2 className="mb-4 text-base font-bold text-foreground">{t("Log Expense")}</h2>
                    <div className="space-y-3">
                      <select
                        value={expenseCategory}
                        onChange={(eventChange) => setExpenseCategory(eventChange.target.value as EventExpense["category"])}
                        className="h-9 w-full rounded-lg border border-input bg-card-alt px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                      >
                        {(["Transportation", "Equipment Rental", "Consumables", "Other", "Labor", "Fuel"] as EventExpense["category"][]).map((category) => (
                          <option key={category} value={category}>{t(category)}</option>
                        ))}
                      </select>
                      <Input type="number" min="0" value={expenseAmount} onChange={(eventChange) => setExpenseAmount(eventChange.target.value)} placeholder={t("Amount")} />
                      <Input value={expenseDescription} onChange={(eventChange) => setExpenseDescription(eventChange.target.value)} placeholder={t("Description")} />
                      <Input value={receiptKey} onChange={(eventChange) => setReceiptKey(eventChange.target.value)} placeholder={t("Receipt Key")} />
                      <Button
                        type="button"
                        className="w-full"
                        disabled={createExpenseMutation.isPending}
                        onClick={() => {
                          if (!expenseDescription.trim() || Number(expenseAmount) <= 0) {
                            toast.error(t("Required"));
                            return;
                          }
                          createExpenseMutation.mutate();
                        }}
                      >
                        <HiPlus className="h-4 w-4" />
                        {t("Submit Expense")}
                      </Button>
                      <Button type="button" variant="outline" className="w-full" disabled={generateLaborMutation.isPending} onClick={() => generateLaborMutation.mutate()}>
                        {t("Generate Labor Expense")}
                      </Button>
                    </div>
                  </section>

                  <section className="rounded-lg border border-border bg-card p-4">
                    <h2 className="mb-4 text-base font-bold text-foreground">{t("Trip Log")}</h2>
                    <div className="space-y-3">
                      <select
                        value={tripVehicleAssignmentId}
                        onChange={(eventChange) => setTripVehicleAssignmentId(eventChange.target.value)}
                        className="h-9 w-full rounded-lg border border-input bg-card-alt px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                      >
                        <option value="">{t("Choose vehicle assignment")}</option>
                        {vehicleAssignments.map((vehicleAssignment: VehicleAssignment) => (
                          <option key={vehicleAssignment.id} value={vehicleAssignment.id}>
                            {vehicleAssignment.plate_number} - {vehicleAssignment.driver_name || t("Driver")}
                          </option>
                        ))}
                      </select>
                      <Input value={tripDestination} onChange={(eventChange) => setTripDestination(eventChange.target.value)} placeholder={t("Destination")} />
                      <Input type="number" min="0" value={tripDistance} onChange={(eventChange) => setTripDistance(eventChange.target.value)} placeholder={t("Distance (km)")} />
                      <Input type="number" min="0" value={fuelPrice} onChange={(eventChange) => setFuelPrice(eventChange.target.value)} placeholder={t("Fuel Price")} />
                      <div className="rounded-lg border border-border bg-card-alt/50 p-3 text-xs font-semibold text-muted">
                        {t("Fuel cost preview")}: <span className="text-foreground">{formatCurrency(fuelCostPreview)}</span>
                      </div>
                      <Button
                        type="button"
                        className="w-full"
                        disabled={createTripMutation.isPending}
                        onClick={() => {
                          if (!tripVehicleAssignmentId || !tripDestination.trim() || Number(tripDistance) <= 0 || Number(fuelPrice) <= 0) {
                            toast.error(t("Required"));
                            return;
                          }
                          createTripMutation.mutate();
                        }}
                      >
                        <HiPlus className="h-4 w-4" />
                        {t("Log Trip")}
                      </Button>
                    </div>
                  </section>
                </div>

                <div className="space-y-4">
                  <section className="rounded-lg border border-border bg-card">
                    {expenses.length === 0 ? (
                      <div className="p-8 text-center text-sm text-muted">{t("No expenses yet. Log event costs as they happen.")}</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {expenses.map((expense: EventExpense) => (
                          <div key={expense.id} className="p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="font-semibold text-foreground">{t(expense.category)}</div>
                                <div className="mt-1 text-xs text-muted">{expense.description}</div>
                              </div>
                              <div className="text-left sm:text-right">
                                <div className="text-sm font-bold text-foreground">{formatCurrency(expense.amount)}</div>
                                <div className="mt-1 text-xs font-semibold text-muted">{t(expense.status)}</div>
                              </div>
                            </div>
                            {expense.rejected_reason && <div className="mt-2 text-xs text-danger">{expense.rejected_reason}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="rounded-lg border border-border bg-card">
                    {trips.length === 0 ? (
                      <div className="p-8 text-center text-sm text-muted">{t("No trips yet. Drivers can log distance after vehicle assignment.")}</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {trips.map((trip: EventTripLog) => (
                          <div key={trip.id} className="p-4">
                            <div className="font-semibold text-foreground">{trip.destination}</div>
                            <div className="mt-1 text-xs text-muted">
                              {trip.plate_number || "-"} | {trip.distance_km} km | {trip.fuel_liters_used} L | {formatCurrency(trip.fuel_cost_etb)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            )}

            {activeTab === "profit" && hasProfitAccess && (
              <EventProfitPanel eventId={eventId} profitQuery={profitQuery} t={t} />
            )}
          </>
        )}
      </div>
    </AuthLayout>
  );
}
