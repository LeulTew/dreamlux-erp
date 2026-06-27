"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HiPrinter, HiArrowTrendingUp, HiCalendarDays, HiChartBar, HiArrowDownTray, HiMagnifyingGlass, HiArrowPath } from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import ForbiddenState from "@/components/ForbiddenState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getProfitReport, getEventTypes, getProfitReportExportUrl, api } from "@/lib/api";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import PaginationControls from "@/components/PaginationControls";
import { useLanguage } from "@/hooks/use-language";
import { EventType, ProfitReportSummary } from "@/lib/types";
import { createPermissionMatcher } from "@/lib/permission-matcher";

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
    "Fuel": "Fuel",
    "Labor": "Labor",
    "Other": "Other",
    "Aggregated profitability tracking, monthly category breakdowns, and print exports.": "Aggregated profitability tracking, monthly category breakdowns, and print exports.",
    "Workspace unavailable": "Workspace unavailable",
    "Pending Expense Exposure": "Pending Expense Exposure",
    "Event Type Performance": "Event Type Performance",
    "Average Margin": "Average Margin",
    "Proposal Variance": "Proposal Variance",
    "Estimated Profit": "Estimated Profit",
    "Actual Profit": "Actual Profit",
    "Variance": "Variance",
    "Event Name": "Event Name",
    "Proposal ID": "Proposal ID",
    "Export Report": "Export Report",
    "Export CSV": "Export CSV",
    "Export XLSX": "Export XLSX",
    "All Statuses": "All Statuses",
    "Planned": "Planned",
    "Ongoing": "Ongoing",
    "Completed": "Completed",
    "Select Type": "Select Type",
    "Select Status": "Select Status",
    "Filters": "Filters",
    "Reset": "Reset",
    "Overview": "Overview",
    "Monthly View": "Monthly View",
    "Event Type View": "Event Type View",
    "Category View": "Category View",
    "Proposal Variance View": "Proposal Variance View",
    "Search events...": "Search events...",
    "Key Performance Indicators": "Key Performance Indicators",
    "Most Profitable Type": "Most Profitable Type",
    "Highest Margin Type": "Highest Margin Type",
    "Proposal Conversion": "Proposal Conversion Rate",
    "Avg Variance (Est vs Act)": "Avg Variance (Est vs Act)",
    "Premium Event Logistics & Rentals": "Premium Event Logistics & Rentals"
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
    "Fuel": "ነዳጅ",
    "Labor": "ሰራተኛ",
    "Other": "ሌላ",
    "Aggregated profitability tracking, monthly category breakdowns, and print exports.": "የተጠቃለለ የትርፋማነት ክትትል፣ ወርሃዊ የወጪ ዝርዝር በምድብ እና የህትመት ውጤቶች።",
    "Workspace unavailable": "የስራ ቦታ አልተገኘም",
    "Pending Expense Exposure": "በጥበቃ ላይ ያለ ወጪ ስጋት",
    "Event Type Performance": "የዝግጅት አይነት አፈፃፀም",
    "Average Margin": "አማካይ ህዳግ",
    "Proposal Variance": "የፕሮፖዛል ልዩነት",
    "Estimated Profit": "የተገመተ ትርፍ",
    "Actual Profit": "ትክክለኛ ትርፍ",
    "Variance": "ልዩነት",
    "Event Name": "የዝግጅት ስም",
    "Proposal ID": "የፕሮፖዛል መለያ",
    "Export Report": "ሪፖርት አውጣ",
    "Export CSV": "በCSV አውጣ",
    "Export XLSX": "በXLSX አውጣ",
    "All Statuses": "ሁሉንም ሁኔታዎች",
    "Planned": "ቀጠሮ የተያዘ",
    "Ongoing": "በሂደት ላይ",
    "Completed": "የተጠናቀቀ",
    "Select Type": "አይነት ምረጥ",
    "Select Status": "ሁኔታ ምረጥ",
    "Filters": "ማጣሪያዎች",
    "Reset": "ዳግም ጀምር",
    "Overview": "አጠቃላይ እይታ",
    "Monthly View": "ወርሃዊ እይታ",
    "Event Type View": "የዝግጅት አይነት እይታ",
    "Category View": "የምድብ እይታ",
    "Proposal Variance View": "የፕሮፖዛል ልዩነት እይታ",
    "Search events...": "ዝግጅቶችን አስፈልግ...",
    "Key Performance Indicators": "ቁልፍ የአፈጻጸም አመልካቾች",
    "Most Profitable Type": "በጣም ትርፋማ አይነት",
    "Highest Margin Type": "ከፍተኛ ህዳግ ያለው አይነት",
    "Proposal Conversion": "የፕሮፖዛል ልወጣ መጠን",
    "Avg Variance (Est vs Act)": "አማካይ ልዩነት (ተገመተ እና ትክክለኛ)",
    "Premium Event Logistics & Rentals": "ፕሪሚየም የዝግጅት ሎጂስቲክስ እና ኪራይ"
  }
};

export default function FinancialDashboardPage() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [eventTypeId, setEventTypeId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "monthly" | "eventTypes" | "categories" | "variance">("overview");
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 10;

  // Retrieve permissions list from backend auth query
  const { data: authData, isLoading: authLoading } = useQuery({
    queryKey: ["auth-permissions"],
    queryFn: async () => {
      const res = await api.get("/auth/permissions");
      return res.data;
    }
  });

  const hasPermission = createPermissionMatcher(authData?.permission_slugs || [], !!authData?.is_superuser);
  const hasProfitAccess = hasPermission("reports:profit:read");

  // Retrieve event types list
  const { data: eventTypesData } = useQuery<EventType[]>({
    queryKey: ["event-types"],
    queryFn: getEventTypes,
    enabled: !!hasProfitAccess
  });

  const eventTypes = eventTypesData || [];

  // Query profit analytics report
  const { data, isLoading, isError } = useQuery<ProfitReportSummary>({
    queryKey: ["profit-report", startDate, endDate, eventTypeId, status, search],
    queryFn: () => getProfitReport(startDate, endDate, {
      event_type_id: eventTypeId || undefined,
      status: status || undefined,
      search: search || undefined
    }),
    enabled: !!hasProfitAccess
  });

  const formatCurrency = (value: number) => {
    return `ETB ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = (format: "csv" | "xlsx") => {
    setIsExportOpen(false);
    const exportUrl = getProfitReportExportUrl({
      start_date: startDate,
      end_date: endDate,
      event_type_id: eventTypeId || undefined,
      status: status || undefined,
      search: search || undefined,
      format
    });
    window.open(exportUrl, "_blank");
  };

  const handleResetFilters = () => {
    setStartDate(`${currentYear}-01-01`);
    setEndDate(`${currentYear}-12-31`);
    setEventTypeId("");
    setStatus("");
    setSearch("");
    setPage(1);
  };

  const handleTabChange = (tab: "overview" | "monthly" | "eventTypes" | "categories" | "variance") => {
    setActiveTab(tab);
    setPage(1);
  };

  // Immediate 403 authorization guard to avoid layout flashing
  if (authLoading) {
    return (
      <AuthLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  if (!authData || !hasProfitAccess) {
    return (
      <AuthLayout>
        <ForbiddenState
          title="Forbidden: Insufficient privileges"
          description="Only Owners, Accountants, and Administrators can access financial reports."
        />
      </AuthLayout>
    );
  }

  const monthlyData = data?.monthlyData || [];
  const monthlyTotalPages = Math.ceil(monthlyData.length / limit) || 1;
  const safeMonthlyPage = Math.min(page, monthlyTotalPages);
  const paginatedMonthlyData = monthlyData.slice((safeMonthlyPage - 1) * limit, safeMonthlyPage * limit);
  const eventTypePerformance = data?.eventTypePerformance || [];
  const eventTypeTotalPages = Math.ceil(eventTypePerformance.length / limit) || 1;
  const safeEventTypePage = Math.min(page, eventTypeTotalPages);
  const paginatedEventTypePerformance = eventTypePerformance.slice((safeEventTypePage - 1) * limit, safeEventTypePage * limit);
  const categoryBreakdown = data?.categoryBreakdown || [];
  const categoryTotalPages = Math.ceil(categoryBreakdown.length / limit) || 1;
  const safeCategoryPage = Math.min(page, categoryTotalPages);
  const paginatedCategoryBreakdown = categoryBreakdown.slice((safeCategoryPage - 1) * limit, safeCategoryPage * limit);
  const proposalVariance = data?.proposalVariance?.events || [];
  const proposalTotalPages = Math.ceil(proposalVariance.length / limit) || 1;
  const safeProposalPage = Math.min(page, proposalTotalPages);
  const paginatedProposalVariance = proposalVariance.slice((safeProposalPage - 1) * limit, safeProposalPage * limit);

  // Generate SVG trend chart coordinates
  const maxVal = Math.max(...monthlyData.map((m) => Math.max(m.revenue, m.expenses)), 1000);
  const yMax = maxVal * 1.15;
  const paddingX = 50;
  const paddingY = 25;
  const chartWidth = 500;
  const chartHeight = 220;

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
          header, footer, nav, aside, [data-sidebar], .toolbar-container, .tabs-container {
            display: none !important;
          }
          main, .page-container-lg {
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            background: transparent !important;
          }
        }
      `}} />

      <div className="page-container-lg space-y-6 px-4 sm:px-6 md:px-8 pt-4 md:py-8 print-container">
        {/* Printable Header */}
        <div className="hidden print-only border-b-2 border-primary pb-4 mb-6">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">DREAM LUX</h1>
              <p className="text-[10px] text-primary uppercase font-bold tracking-widest">{t("Premium Event Logistics & Rentals")}</p>
            </div>
            <div className="text-right text-xs text-muted">
              <div className="font-bold text-foreground">{t("Dream Lux Event Profitability Report")}</div>
              <div>{t("Date Range")}: {startDate} - {endDate}</div>
              <div>{t("Generated on")}: {new Date().toLocaleDateString(lang === "am" ? "am-ET" : "en-US")}</div>
            </div>
          </div>
        </div>

        {/* Screen Header */}
        <div className="flex flex-col gap-4 border-b border-border/50 pb-5 lg:flex-row lg:items-end lg:justify-between no-print">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary-light text-primary-dark">
                <HiArrowTrendingUp className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl md:text-2xl font-black text-foreground tracking-tight">{t("Financial Dashboard & Reports")}</h1>
                <p className="mt-1 text-xs md:text-sm text-muted font-medium">{t("Aggregated profitability tracking, monthly category breakdowns, and print exports.")}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handlePrint} variant="outline" className="flex items-center gap-2 font-bold cursor-pointer h-[44px]">
              <HiPrinter className="h-4 w-4" />
              {t("Print Report")}
            </Button>
          </div>
        </div>

        {/* Filters Toolbar Container */}
        <div className="toolbar-container bg-card border border-border rounded-2xl 2xl:rounded-4xl p-3.5 space-y-3.5 no-print">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1 max-w-xs">
                <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  placeholder={t("Search events...")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 h-[44px] rounded-xl bg-card-alt text-sm focus:ring-1 focus:ring-primary/30 outline-none border border-border transition-all"
                />
              </div>

              <Select
                options={[
                  { id: "", label: t("Select Type") },
                  ...eventTypes.map((type) => ({ id: type.id, label: type.event_name }))
                ]}
                value={eventTypeId}
                onChange={(val) => setEventTypeId(val)}
                className="min-w-[160px]"
              />

              <Select
                options={[
                  { id: "", label: t("Select Status") },
                  { id: "Planned", label: t("Planned") },
                  { id: "Ongoing", label: t("Ongoing") },
                  { id: "Completed", label: t("Completed") }
                ]}
                value={status}
                onChange={(val) => setStatus(val)}
                className="min-w-[150px]"
              />

              <button
                onClick={handleResetFilters}
                className="h-[44px] px-4 text-xs font-black uppercase tracking-wider rounded-xl bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-foreground transition-all active:scale-[0.98] flex items-center gap-1.5"
              >
                <HiArrowPath className="w-3.5 h-3.5" />
                {t("Reset")}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("Start Date")}</span>
                <DatePicker value={startDate} onChange={(val) => setStartDate(val)} className="w-36 h-[44px]" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("End Date")}</span>
                <DatePicker value={endDate} onChange={(val) => setEndDate(val)} className="w-36 h-[44px]" />
              </div>

              {/* Export Popover */}
              <div className="relative">
                <button
                  onClick={() => setIsExportOpen(!isExportOpen)}
                  className="flex items-center gap-1.5 px-3.5 h-[44px] text-xs font-black uppercase tracking-wider rounded-xl bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-foreground"
                >
                  <HiArrowDownTray className="w-4 h-4" />
                  {t("Export")}
                </button>
                {isExportOpen && (
                  <div className="absolute right-0 mt-1.5 w-40 bg-card border border-border rounded-xl shadow-massive z-10 py-1">
                    <button
                      onClick={() => handleExport("csv")}
                      className="w-full text-left px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground [@media(hover:hover)]:hover:bg-card-alt"
                    >
                      {t("Export CSV")}
                    </button>
                    <button
                      onClick={() => handleExport("xlsx")}
                      className="w-full text-left px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground [@media(hover:hover)]:hover:bg-card-alt"
                    >
                      {t("Export XLSX")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* View Tabs Switcher */}
        <div className="tabs-container border-b border-border/50 pb-px flex flex-wrap gap-2 no-print">
          {[
            { id: "overview", label: t("Overview") },
            { id: "monthly", label: t("Monthly View") },
            { id: "eventTypes", label: t("Event Type View") },
            { id: "categories", label: t("Category View") },
            { id: "variance", label: t("Proposal Variance View") }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as "overview" | "monthly" | "eventTypes" | "categories" | "variance")}
              className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted [@media(hover:hover)]:hover:text-foreground"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : isError || !data ? (
          <div className="rounded-2xl 2xl:rounded-4xl border border-border bg-card p-8 text-center text-muted">
            {t("Workspace unavailable")}
          </div>
        ) : (
          <div className="space-y-6">

            {/* KPI Cards Strip */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("Total Revenue")}</div>
                <div className="mt-2 text-xl font-black text-foreground font-mono tabular-nums">{formatCurrency(data.summary.totalRevenue)}</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("Total Approved Expenses")}</div>
                <div className="mt-2 text-xl font-black text-foreground font-mono tabular-nums">{formatCurrency(data.summary.totalExpenses)}</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("Net Profit")}</div>
                <div className={`mt-2 text-xl font-black font-mono tabular-nums ${data.summary.netProfit >= 0 ? "text-success" : "text-danger"}`}>
                  {formatCurrency(data.summary.netProfit)}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("Profit Margin")}</div>
                <div className={`mt-2 text-xl font-black font-mono ${data.summary.profitMargin >= 25 ? "text-success" : "text-warning"}`}>
                  {data.summary.profitMargin.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 col-span-2 lg:col-span-1">
                <div className="text-[10px] font-bold text-muted uppercase tracking-wider">{t("Pending Expense Exposure")}</div>
                <div className="mt-2 text-xl font-black text-foreground font-mono tabular-nums">
                  {formatCurrency(data.summary.pendingExpenseExposure)}
                </div>
              </div>
            </div>

            {/* Overview / Charts */}
            {activeTab === "overview" && (
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                {/* Trend Chart */}
                <section className="rounded-2xl 2xl:rounded-4xl border border-border bg-card p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <HiArrowTrendingUp className="h-5 w-5 text-primary-dark" />
                    <h2 className="text-xs font-black text-foreground uppercase tracking-wider">{t("Profit Trend")}</h2>
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
                          <path d={revenuePath} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          {/* Profit line */}
                          <path d={profitPath} fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                          {/* Data dots */}
                          {monthlyData.map((m, idx) => (
                            <g key={idx}>
                              <circle cx={getX(idx)} cy={getY(m.revenue)} r="3.5" style={{ fill: "var(--color-primary)" }} className="stroke-card stroke-2" />
                              <circle cx={getX(idx)} cy={getY(m.profit)} r="3.5" style={{ fill: "var(--color-success)" }} className="stroke-card stroke-2" />
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
                              {m.month}
                            </text>
                          ))}
                        </svg>
                      </div>

                      <div className="flex justify-center gap-4 text-xs font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span className="h-3 w-3 rounded-full bg-primary" />
                          <span>{t("Revenue")}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="h-3 w-3 rounded-full bg-success" />
                          <span>{t("Net Profit")}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                {/* KPI highlights lists */}
                <section className="rounded-2xl 2xl:rounded-4xl border border-border bg-card p-5 space-y-4">
                  <h3 className="text-xs font-black text-foreground uppercase tracking-wider border-b border-border/40 pb-2">
                    {t("Key Performance Indicators")}
                  </h3>
                  <div className="space-y-3.5 text-xs">
                    <div className="flex justify-between items-center py-2 border-b border-border/30">
                      <span className="text-muted font-bold uppercase tracking-wide">{t("Most Profitable Type")}</span>
                      <span className="font-bold text-foreground">{data.kpis.mostProfitableEventType?.eventType || "-"}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/30">
                      <span className="text-muted font-bold uppercase tracking-wide">{t("Highest Margin Type")}</span>
                      <span className="font-bold text-foreground">{data.kpis.highestMarginEventType?.eventType || "-"}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/30">
                      <span className="text-muted font-bold uppercase tracking-wide">{t("Proposal Conversion")}</span>
                      <span className="font-mono font-black text-foreground">{data.kpis.proposalConversionRate}%</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-muted font-bold uppercase tracking-wide">{t("Avg Variance (Est vs Act)")}</span>
                      <span className={`font-mono font-black ${data.proposalVariance.averageVariance < 0 ? "text-danger" : "text-success"}`}>
                        ETB {data.proposalVariance.averageVariance.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* Monthly View */}
            {(activeTab === "monthly" || !activeTab) && (
              <section className="rounded-2xl 2xl:rounded-4xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <HiCalendarDays className="h-5 w-5 text-primary-dark" />
                  <h2 className="text-xs font-black text-foreground uppercase tracking-wider">{t("Monthly View")}</h2>
                </div>

                {monthlyData.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted">
                    {t("No data found for the selected date range.")}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-card-alt/30 border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                            <th className="px-6 py-4">{t("Month/Year")}</th>
                            <th className="px-6 py-4 text-center">{t("Event Count")}</th>
                            <th className="px-6 py-4 text-right">{t("Revenue")}</th>
                            <th className="px-6 py-4 text-right">{t("Approved Expenses")}</th>
                            <th className="px-6 py-4 text-right">{t("Net Profit")}</th>
                            <th className="px-6 py-4 text-right">{t("Margin")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedMonthlyData.map((row) => (
                            <tr key={row.month} className="border-b border-border/50 [@media(hover:hover)]:hover:bg-card-alt/20 transition-all font-semibold text-foreground">
                              <td className="px-6 py-4 font-mono">{row.month}</td>
                              <td className="px-6 py-4 text-center font-bold">{row.eventCount}</td>
                              <td className="px-6 py-4 text-right font-mono">{formatCurrency(row.revenue)}</td>
                              <td className="px-6 py-4 text-right font-mono">{formatCurrency(row.expenses)}</td>
                              <td className={`px-6 py-4 text-right font-mono font-bold ${row.profit >= 0 ? "text-success" : "text-danger"}`}>
                                {formatCurrency(row.profit)}
                              </td>
                              <td className={`px-6 py-4 text-right font-mono font-bold ${row.margin >= 25 ? "text-success" : "text-warning"}`}>
                                {row.margin.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {monthlyData.length > limit && (
                      <PaginationControls page={safeMonthlyPage} totalPages={monthlyTotalPages} onPageChange={setPage} />
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Event Type Performance View */}
            {activeTab === "eventTypes" && (
              <section className="rounded-2xl 2xl:rounded-4xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <HiChartBar className="h-5 w-5 text-primary-dark" />
                  <h2 className="text-xs font-black text-foreground uppercase tracking-wider">{t("Event Type Performance")}</h2>
                </div>

                {eventTypePerformance.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted">
                    {t("No data found for the selected date range.")}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-card-alt/30 border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                            <th className="px-6 py-4">{t("Event Type")}</th>
                            <th className="px-6 py-4 text-center">{t("Event Count")}</th>
                            <th className="px-6 py-4 text-right">{t("Revenue")}</th>
                            <th className="px-6 py-4 text-right">{t("Approved Expenses")}</th>
                            <th className="px-6 py-4 text-right">{t("Net Profit")}</th>
                            <th className="px-6 py-4 text-right">{t("Average Margin")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedEventTypePerformance.map((row) => (
                            <tr key={row.eventType} className="border-b border-border/50 [@media(hover:hover)]:hover:bg-card-alt/20 transition-all font-semibold text-foreground">
                              <td className="px-6 py-4 font-bold">{row.eventType}</td>
                              <td className="px-6 py-4 text-center font-bold">{row.eventCount}</td>
                              <td className="px-6 py-4 text-right font-mono">{formatCurrency(row.revenue)}</td>
                              <td className="px-6 py-4 text-right font-mono">{formatCurrency(row.expenses)}</td>
                              <td className={`px-6 py-4 text-right font-mono font-bold ${row.netProfit >= 0 ? "text-success" : "text-danger"}`}>
                                {formatCurrency(row.netProfit)}
                              </td>
                              <td className={`px-6 py-4 text-right font-mono font-bold ${row.averageMargin >= 25 ? "text-success" : "text-warning"}`}>
                                {row.averageMargin.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {eventTypePerformance.length > limit && (
                      <PaginationControls page={safeEventTypePage} totalPages={eventTypeTotalPages} onPageChange={setPage} />
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Category Breakdown View */}
            {activeTab === "categories" && (
              <section className="rounded-2xl 2xl:rounded-4xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <HiChartBar className="h-5 w-5 text-primary-dark" />
                  <h2 className="text-xs font-black text-foreground uppercase tracking-wider">{t("Category Breakdown")}</h2>
                </div>

                {categoryBreakdown.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted">
                    {t("No data found for the selected date range.")}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-card-alt/30 border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                            <th className="px-6 py-4">{t("Category")}</th>
                            <th className="px-6 py-4 text-right">{t("Amount")}</th>
                            <th className="px-6 py-4 text-right">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedCategoryBreakdown.map((row) => {
                            const percentage = data.summary.totalExpenses > 0 ? (row.amount / data.summary.totalExpenses) * 100 : 0;
                            const colorClass = colors[row.category as keyof typeof colors] || "bg-slate-500";
                            return (
                              <tr key={row.category} className="border-b border-border/50 [@media(hover:hover)]:hover:bg-card-alt/20 transition-all font-semibold text-foreground">
                                <td className="px-6 py-4 flex items-center gap-2 font-bold">
                                  <span className={`h-2.5 w-2.5 rounded-full ${colorClass}`} />
                                  {t(row.category)}
                                </td>
                                <td className="px-6 py-4 text-right font-mono font-bold">{formatCurrency(row.amount)}</td>
                                <td className="px-6 py-4 text-right font-mono text-muted">{percentage.toFixed(1)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {categoryBreakdown.length > limit && (
                      <PaginationControls page={safeCategoryPage} totalPages={categoryTotalPages} onPageChange={setPage} />
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Proposal Variance View */}
            {activeTab === "variance" && (
              <section className="rounded-2xl 2xl:rounded-4xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <HiArrowTrendingUp className="h-5 w-5 text-primary-dark" />
                  <h2 className="text-xs font-black text-foreground uppercase tracking-wider">{t("Proposal Variance")}</h2>
                </div>

                {proposalVariance.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted">
                    {t("No data found for the selected date range.")}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-card-alt/30 border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                            <th className="px-6 py-4">{t("Event Name")}</th>
                            <th className="px-6 py-4">{t("Proposal ID")}</th>
                            <th className="px-6 py-4 text-right">{t("Estimated Profit")}</th>
                            <th className="px-6 py-4 text-right">{t("Actual Profit")}</th>
                            <th className="px-6 py-4 text-right">{t("Variance")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedProposalVariance.map((row) => (
                            <tr key={row.eventId} className="border-b border-border/50 [@media(hover:hover)]:hover:bg-card-alt/20 transition-all font-semibold text-foreground">
                              <td className="px-6 py-4 font-bold">{row.eventName}</td>
                              <td className="px-6 py-4 font-mono text-muted text-[10px]">{row.proposalId}</td>
                              <td className="px-6 py-4 text-right font-mono">{formatCurrency(row.estimatedNetProfit)}</td>
                              <td className="px-6 py-4 text-right font-mono">{formatCurrency(row.actualNetProfit)}</td>
                              <td className={`px-6 py-4 text-right font-mono font-bold ${(row.variance || 0) < 0 ? "text-danger" : "text-success"}`}>
                                {row.variance !== null ? formatCurrency(row.variance) : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {proposalVariance.length > limit && (
                      <PaginationControls page={safeProposalPage} totalPages={proposalTotalPages} onPageChange={setPage} />
                    )}
                  </div>
                )}
              </section>
            )}

          </div>
        )}
      </div>
    </AuthLayout>
  );
}
