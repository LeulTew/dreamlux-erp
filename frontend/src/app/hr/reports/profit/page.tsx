"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HiLockClosed, HiPrinter, HiCalendarDays, HiArrowTrendingUp, HiChartBar } from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getProfitReport } from "@/lib/api";
import { useLanguage } from "@/hooks/use-language";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Financial Dashboard & Reports": "Financial Dashboard & Reports",
    "Start Date": "Start Date",
    "End Date": "End Date",
    "Print Report": "Print Report",
    "Total Revenue": "Total Revenue",
    "Total Approved Expenses": "Total Approved Expenses",
    "Net Profit": "Net Profit",
    "Profit Margin": "Profit Margin",
    "Profit Trend": "Profit Trend",
    "Revenue vs. Profit": "Revenue vs. Profit",
    "Month/Year": "Month/Year",
    "Event Count": "Event Count",
    "Revenue": "Revenue",
    "Approved Expenses": "Approved Expenses",
    "Margin": "Margin",
    "No data found for the selected date range.": "No data found for the selected date range.",
    "Dream Lux Event Profitability Report": "Dream Lux Event Profitability Report",
    "Date Range": "Date Range",
    "Generated on": "Generated on",
    "Forbidden: Insufficient privileges": "Forbidden: Insufficient privileges",
    "Only Owners, Accountants, and Administrators can access financial reports.": "Only Owners, Accountants, and Administrators can access financial reports.",
    "Category Breakdown": "Category Breakdown",
    "Category": "Category",
    "Amount": "Amount",
    Fuel: "Fuel",
    Labor: "Labor",
    Transportation: "Transportation",
    "Equipment Rental": "Equipment Rental",
    Consumables: "Consumables",
    Other: "Other",
    "Aggregated profitability tracking, monthly category breakdowns, and print exports.": "Aggregated profitability tracking, monthly category breakdowns, and print exports.",
    "Workspace unavailable": "Workspace unavailable",
  },
  am: {
    "Financial Dashboard & Reports": "የፋይናንስ ዳሽቦርድ እና ሪፖርቶች",
    "Start Date": "የመጀመሪያ ቀን",
    "End Date": "የማብቂያ ቀን",
    "Print Report": "ሪፖርት አትም",
    "Total Revenue": "አጠቃላይ ገቢ",
    "Total Approved Expenses": "አጠቃላይ የጸደቁ ወጪዎች",
    "Net Profit": "የተጣራ ትርፍ",
    "Profit Margin": "የትርፍ ህዳግ",
    "Profit Trend": "የትርፍ አዝማሚያ",
    "Revenue vs. Profit": "ገቢ እና የተጣራ ትርፍ",
    "Month/Year": "ወር/ዓመት",
    "Event Count": "የዝግጅት ብዛት",
    "Revenue": "ገቢ",
    "Approved Expenses": "የጸደቀ ወጪ",
    "Margin": "ህዳግ",
    "No data found for the selected date range.": "ከተመረጠው የቀን ገደብ ምንም መረጃ አልተገኘም።",
    "Dream Lux Event Profitability Report": "የድሪም ላክስ የዝግጅት ትርፋማነት ሪፖርት",
    "Date Range": "የቀን ገደብ",
    "Generated on": "የተዘጋጀበት ቀን",
    "Forbidden: Insufficient privileges": "ክልክል ነው: በቂ ፈቃድ የለዎትም",
    "Only Owners, Accountants, and Administrators can access financial reports.": "የፋይናንስ ሪፖርቶችን ማግኘት የሚችሉት ባለቤቶች፣ የሂሳብ ባለሙያዎች እና አስተዳዳሪዎች ብቻ ናቸው።",
    "Category Breakdown": "የወጪ ዝርዝር በምድብ",
    "Category": "ምድብ",
    "Amount": "መጠን",
    Fuel: "ነዳጅ",
    Labor: "ሰራተኛ",
    Transportation: "ትራንስፖርት",
    "Equipment Rental": "የመሳሪያ ኪራይ",
    Consumables: "የሚጠቀሙ እቃዎች",
    Other: "ሌላ",
    "Aggregated profitability tracking, monthly category breakdowns, and print exports.": "የተጠቃለለ የትርፋማነት ክትትል፣ ወርሃዊ የወጪ ዝርዝር በምድብ እና የህትመት ውጤቶች።",
    "Workspace unavailable": "የስራ ቦታ አልተገኘም",
  },
};

export default function FinancialDashboardPage() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);

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

  const { data, isLoading, isError } = useQuery({
    queryKey: ["profit-report", startDate, endDate],
    queryFn: () => getProfitReport(startDate, endDate),
    enabled: hasProfitAccess,
  });

  const formatCurrency = (value: number) => {
    return `ETB ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handlePrint = () => {
    window.print();
  };

  if (userRole && !hasProfitAccess) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-danger/10 flex items-center justify-center text-danger mb-4">
            <HiLockClosed className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{t("Forbidden: Insufficient privileges")}</h2>
          <p className="mt-2 text-sm text-muted">{t("Only Owners, Accountants, and Administrators can access financial reports.")}</p>
        </div>
      </AuthLayout>
    );
  }

  // Generate SVG trend chart coordinates
  const monthlyData = data?.monthlyData || [];
  const maxVal = Math.max(...monthlyData.map((m) => Math.max(m.revenue, m.expenses)), 1000);
  const yMax = maxVal * 1.15;
  const paddingX = 50;
  const paddingY = 25;
  const chartWidth = 500;
  const chartHeight = 200;

  const pointsCount = monthlyData.length;
  const stepX = pointsCount > 1 ? (chartWidth - paddingX * 2) / (pointsCount - 1) : chartWidth - paddingX * 2;

  const getX = (idx: number) => paddingX + idx * stepX;
  const getY = (val: number) => chartHeight - paddingY - (val / yMax) * (chartHeight - paddingY * 2);

  const revenuePath = monthlyData
    .map((m, idx) => `${idx === 0 ? "M" : "L"} ${getX(idx)} ${getY(m.revenue)}`)
    .join(" ");

  const profitPath = monthlyData
    .map((m, idx) => `${idx === 0 ? "M" : "L"} ${getX(idx)} ${getY(m.profit)}`)
    .join(" ");

  const colors = {
    Fuel: "bg-amber-500",
    Labor: "bg-blue-500",
    Transportation: "bg-emerald-500",
    "Equipment Rental": "bg-indigo-500",
    Consumables: "bg-pink-500",
    Other: "bg-slate-500",
  };

  return (
    <AuthLayout>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .print-container {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          header, footer, nav, aside, .sidebar-container, [data-sidebar] {
            display: none !important;
          }
          main, .flex-1, .bg-card, .border {
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            border-radius: 0 !important;
          }
          .page-container-lg {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }
        }
      `}} />

      <div className="page-container-lg space-y-6 print-container">
        {/* Printable Header */}
        <div className="hidden print-only border-b-2 border-primary pb-4 mb-6">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">DREAM LUX</h1>
              <p className="text-[10px] text-primary uppercase font-bold tracking-widest">Premium Event Logistics & Rentals</p>
            </div>
            <div className="text-right text-xs text-muted">
              <div className="font-bold text-foreground">{t("Dream Lux Event Profitability Report")}</div>
              <div>{t("Date Range")}: {startDate} - {endDate}</div>
              <div>{t("Generated on")}: {new Date().toLocaleDateString(lang === "am" ? "am-ET" : "en-US")}</div>
            </div>
          </div>
        </div>

        {/* Screen Header */}
        <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between no-print">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary-light text-primary-dark">
                <HiArrowTrendingUp className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-black text-foreground">{t("Financial Dashboard & Reports")}</h1>
                <p className="mt-1 text-sm text-muted">{t("Aggregated profitability tracking, monthly category breakdowns, and print exports.")}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted">{t("Start Date")}</span>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40 bg-card animate-none" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted">{t("End Date")}</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40 bg-card animate-none" />
            </div>
            <Button onClick={handlePrint} variant="outline" className="flex items-center gap-2 font-bold cursor-pointer">
              <HiPrinter className="h-4 w-4" />
              {t("Print Report")}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : isError || !data ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-muted">
            {t("Workspace unavailable")}
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border bg-card p-4 animate-scale-in">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("Total Revenue")}</div>
                <div className="mt-2 text-xl font-black text-foreground">{formatCurrency(data.summary.totalRevenue)}</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 animate-scale-in">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("Total Approved Expenses")}</div>
                <div className="mt-2 text-xl font-black text-foreground">{formatCurrency(data.summary.totalExpenses)}</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 animate-scale-in">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("Net Profit")}</div>
                <div className={`mt-2 text-xl font-black ${data.summary.netProfit >= 0 ? "text-emerald-500" : "text-danger"}`}>
                  {formatCurrency(data.summary.netProfit)}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 animate-scale-in">
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t("Profit Margin")}</div>
                <div className={`mt-2 text-xl font-black ${data.summary.profitMargin >= 0 ? "text-emerald-500" : "text-danger"}`}>
                  {data.summary.profitMargin.toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              {/* Trend Chart */}
              <section className="rounded-lg border border-border bg-card p-4">
                <div className="mb-4 flex items-center gap-2">
                  <HiArrowTrendingUp className="h-5 w-5 text-primary-dark" />
                  <h2 className="text-base font-bold text-foreground">{t("Profit Trend")}</h2>
                </div>

                {monthlyData.length === 0 ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted">
                    {t("No data found for the selected date range.")}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative w-full aspect-[2.5/1] min-h-[220px]">
                      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full">
                        {/* Grid lines */}
                        <line x1={paddingX} y1={paddingY} x2={chartWidth - paddingX} y2={paddingY} stroke="currentColor" strokeOpacity="0.05" />
                        <line x1={paddingX} y1={(chartHeight - paddingY * 2) / 2 + paddingY} x2={chartWidth - paddingX} y2={(chartHeight - paddingY * 2) / 2 + paddingY} stroke="currentColor" strokeOpacity="0.05" />
                        <line x1={paddingX} y1={chartHeight - paddingY} x2={chartWidth - paddingX} y2={chartHeight - paddingY} stroke="currentColor" strokeOpacity="0.1" />

                        {/* Y-axis labels */}
                        <text x={paddingX - 10} y={paddingY + 4} textAnchor="end" className="fill-muted font-mono text-[9px] font-semibold">
                          {Math.round(yMax).toLocaleString()}
                        </text>
                        <text x={paddingX - 10} y={(chartHeight - paddingY * 2) / 2 + paddingY + 4} textAnchor="end" className="fill-muted font-mono text-[9px] font-semibold">
                          {Math.round(yMax / 2).toLocaleString()}
                        </text>
                        <text x={paddingX - 10} y={chartHeight - paddingY + 4} textAnchor="end" className="fill-muted font-mono text-[9px] font-semibold">
                          0
                        </text>

                        {/* Revenue line */}
                        <path d={revenuePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        {/* Profit line */}
                        <path d={profitPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                        {/* Data dots */}
                        {monthlyData.map((m, idx) => (
                          <g key={idx}>
                            <circle cx={getX(idx)} cy={getY(m.revenue)} r="3.5" className="fill-blue-500 stroke-card stroke-2" />
                            <circle cx={getX(idx)} cy={getY(m.profit)} r="3.5" className="fill-emerald-500 stroke-card stroke-2" />
                          </g>
                        ))}

                        {/* X-axis labels */}
                        {monthlyData.map((m, idx) => (
                          <text
                            key={idx}
                            x={getX(idx)}
                            y={chartHeight - 8}
                            textAnchor="middle"
                            className="fill-muted font-mono text-[8px] font-semibold"
                          >
                            {m.month.split("-")[1]}
                          </text>
                        ))}
                      </svg>
                    </div>

                    <div className="flex justify-center gap-4 text-xs font-semibold">
                      <div className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full bg-blue-500" />
                        <span>{t("Revenue")}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full bg-emerald-500" />
                        <span>{t("Net Profit")}</span>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Expense Category Breakdown */}
              <section className="rounded-lg border border-border bg-card p-4">
                <div className="mb-4 flex items-center gap-2">
                  <HiChartBar className="h-5 w-5 text-primary-dark" />
                  <h2 className="text-base font-bold text-foreground">{t("Category Breakdown")}</h2>
                </div>

                {data.summary.totalExpenses === 0 ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted">
                    {t("No data found for the selected date range.")}
                  </div>
                ) : (
                  <div className="space-y-6">
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
                          {data.categoryBreakdown.map((row) => {
                            const percentage = data.summary.totalExpenses > 0 ? (row.amount / data.summary.totalExpenses) * 100 : 0;
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
                  </div>
                )}
              </section>
            </div>

            {/* Monthly Profitability Table */}
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-4 flex items-center gap-2">
                <HiCalendarDays className="h-5 w-5 text-primary-dark" />
                <h2 className="text-base font-bold text-foreground">{t("Financial Dashboard & Reports")}</h2>
              </div>

              {monthlyData.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted">
                  {t("No data found for the selected date range.")}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted uppercase">
                        <th className="py-3 font-bold">{t("Month/Year")}</th>
                        <th className="py-3 text-center font-bold">{t("Event Count")}</th>
                        <th className="py-3 text-right font-bold">{t("Revenue")}</th>
                        <th className="py-3 text-right font-bold">{t("Approved Expenses")}</th>
                        <th className="py-3 text-right font-bold">{t("Net Profit")}</th>
                        <th className="py-3 text-right font-bold">{t("Margin")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {monthlyData.map((row) => (
                        <tr key={row.month} className="text-foreground">
                          <td className="py-3 font-mono font-semibold">{row.month}</td>
                          <td className="py-3 text-center font-bold">{row.eventCount}</td>
                          <td className="py-3 text-right font-mono">{formatCurrency(row.revenue)}</td>
                          <td className="py-3 text-right font-mono">{formatCurrency(row.expenses)}</td>
                          <td className={`py-3 text-right font-mono font-bold ${row.profit >= 0 ? "text-emerald-500" : "text-danger"}`}>
                            {formatCurrency(row.profit)}
                          </td>
                          <td className={`py-3 text-right font-mono font-bold ${row.margin >= 0 ? "text-emerald-500" : "text-danger"}`}>
                            {row.margin.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
