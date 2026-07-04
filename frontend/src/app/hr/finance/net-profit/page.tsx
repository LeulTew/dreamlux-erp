"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  HiPrinter,
  HiArrowDownTray,
  HiArrowPath,
  HiExclamationCircle,
} from "react-icons/hi2";
import { HiCheck, HiXMark } from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import ForbiddenState from "@/components/ForbiddenState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Select from "@/components/ui/Select";
import { useLanguage } from "@/hooks/use-language";
import { createPermissionMatcher } from "@/lib/permission-matcher";
import {
  api,
  getMonthlyNetProfitStatement,
  downloadMonthlyNetProfitExport,
} from "@/lib/api";
import Link from "next/link";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Net Profit Statement": "Net Profit Statement",
    "Aggregated operating financials, overhead deductions, payroll adjustments, and below-the-line capital investments.": "Aggregated operating financials, overhead deductions, payroll adjustments, and below-the-line capital investments.",
    "Month / Year": "Month / Year",
    "Include Investments in Net Profit": "Include Investments in Net Profit",
    "Operating Performance": "Operating Performance",
    "Operating Revenue": "Operating Revenue",
    "Approved Event Expenses": "Approved Event Expenses",
    "Event Gross Profit": "Event Gross Profit",
    "Operational Expenses": "Operational Expenses",
    "Overhead Expenses": "Overhead Expenses",
    "Payroll Expenses": "Payroll Expenses",
    "Operating Profit": "Operating Profit",
    "Capital Investments (Capex)": "Capital Investments (Capex)",
    "Net Profit (After Investments)": "Net Profit (After Investments)",
    "Pending Exposure": "Pending Exposure",
    "Margin": "Margin",
    "Treatment & Lock Policy": "Treatment & Lock Policy",
    "Payroll Status": "Payroll Status",
    "Investments Treatment": "Investments Treatment",
    "Month Status": "Month Status",
    "Closed": "Closed",
    "Open": "Open",
    "Closed at": "Closed at",
    "Closed by": "Closed by",
    "Events": "Events",
    "Payroll Runs": "Payroll Runs",
    "Overheads & Opex": "Overheads & Opex",
    "Capital Investments": "Capital Investments",
    "No data found for the selected filter criteria.": "No data found for the selected filter criteria.",
    "Export CSV": "Export CSV",
    "Export XLSX": "Export XLSX",
    "Workbook Details": "Workbook Details",
    "Events Workbook": "Events Workbook",
    "Payroll Workbook": "Payroll Workbook",
    "Investments Workbook": "Investments Workbook",
    "Operational Expenses Workbook": "Operational Expenses Workbook",
    "Overheads Workbook": "Overheads Workbook",
    "Category": "Category",
    "Amount": "Amount",
    "Pending": "Pending",
    "Count": "Count",
    "Event Name": "Event Name",
    "Date": "Date",
    "Revenue": "Revenue",
    "Net Profit": "Net Profit",
    "Title": "Title",
    "Period": "Period",
    "Total": "Total",
    "Item Name": "Item Name",
    "Quantity": "Quantity",
    "Unit Cost": "Unit Cost",
    "Total Cost": "Total Cost",
    "Vendor": "Vendor",
    "Classification": "Classification",
    "Asset Link": "Asset Link",
    "Scope": "Scope",
    "Payment Kind": "Payment Kind",
    "Note on Payroll Treatment": "Note on Payroll Treatment",
    "Note on Investment Treatment": "Note on Investment Treatment",
    "Refresh": "Refresh",
    "Year": "Year",
    "Month": "Month",
    "Print": "Print",
  },
  am: {
    "Net Profit Statement": "የተጣራ ትርፍ መግለጫ",
    "Aggregated operating financials, overhead deductions, payroll adjustments, and below-the-line capital investments.": "የተሰበሰቡ የፋይናንስ የስራ ክንውኖች፣ የወጪ ቅናሾች፣ የደመወዝ ማስተካከያዎች እና ከትርፍ በታች ያሉ የካፒታል ኢንቨስትመንቶች።",
    "Month / Year": "ወር / ዓመት",
    "Include Investments in Net Profit": "የካፒታል ኢንቨስተመንቶችን በተጣራ ትርፍ ውስጥ አካትት",
    "Operating Performance": "የስራ ክንውን",
    "Operating Revenue": "የስራ ገቢ",
    "Approved Event Expenses": "የጸደቁ የዝግጅት ወጪዎች",
    "Event Gross Profit": "የዝግጅት ጠቅላላ ትርፍ",
    "Operational Expenses": "የስራ ማስኬጃ ወጪዎች",
    "Overhead Expenses": "የአስተዳደር ወጪዎች",
    "Payroll Expenses": "የደሞዝ ወጪዎች",
    "Operating Profit": "የስራ ትርፍ",
    "Capital Investments (Capex)": "የካፒታል ኢንቨስትመንቶች (ካፔክስ)",
    "Net Profit (After Investments)": "የተጣራ ትርፍ (ከኢንቨስትመንት በኋላ)",
    "Pending Exposure": "በጥበቃ ላይ ያለ መጠን",
    "Margin": "ትርፍ ህዳግ",
    "Treatment & Lock Policy": "የአያያዝ እና መቆለፊያ ፖሊሲ",
    "Payroll Status": "የደሞዝ ሁኔታ",
    "Investments Treatment": "የኢቨስትመንቶች አያያዝ",
    "Month Status": "የወር ሁኔታ",
    "Closed": "ተዘግቷል",
    "Open": "ክፍት",
    "Closed at": "የተዘጋበት ቀን",
    "Closed by": "የዘጋው ተጠቃሚ",
    "Events": "ዝግጅቶች",
    "Payroll Runs": "የደሞዝ ክፍያዎች",
    "Overheads & Opex": "አጠቃላይ ወጪዎች",
    "Capital Investments": "የካፒታል ኢንቨስትመንቶች",
    "No data found for the selected filter criteria.": "ለተመረጠው የፍለጋ መስፈርት ምንም መረጃ አልተገኘም።",
    "Export CSV": "በCSV አውርድ",
    "Export XLSX": "በXLSX አውርድ",
    "Workbook Details": "የስራ ደብተር ዝርዝሮች",
    "Events Workbook": "የዝግጅቶች የስራ ደብተር",
    "Payroll Workbook": "የደሞዝ የስራ ደብተር",
    "Investments Workbook": "የኢንቨስትመንት የስራ ደብተር",
    "Operational Expenses Workbook": "የስራ ማስኬጃ ወጪዎች የስራ ደብተር",
    "Overheads Workbook": "የአስተዳደር ወጪዎች የስራ ደብተር",
    "Category": "ዓይነት",
    "Amount": "መጠን",
    "Pending": "በጥበቃ ላይ",
    "Count": "ብዛት",
    "Event Name": "የዝግጅቱ ስም",
    "Date": "ቀን",
    "Revenue": "ገቢ",
    "Net Profit": "የተጣራ ትርፍ",
    "Title": "አርእስት",
    "Period": "የጊዜ ገደብ",
    "Total": "ድምር",
    "Item Name": "የእቃው ስም",
    "Quantity": "ብዛት",
    "Unit Cost": "የአንዱ ዋጋ",
    "Total Cost": "ጠቅላላ ዋጋ",
    "Vendor": "ሻጭ",
    "Classification": "ክፍልፍል",
    "Asset Link": "የእቃ ግንኙነት",
    "Scope": "ወሰን",
    "Payment Kind": "የክፍያ አይነት",
    "Note on Payroll Treatment": "ስለ ደሞዝ አያያዝ ማስታወሻ",
    "Note on Investment Treatment": "ስለ ካፒታል ኢንቨስትመንት አያያዝ ማስታወሻ",
    "Refresh": "አድስ",
    "Year": "ዓመት",
    "Month": "ወር",
    "Print": "አትም",
  }
};

const MONTHS = [
  { value: "01", label: { en: "January", am: "ጥር" } },
  { value: "02", label: { en: "February", am: "የካቲት" } },
  { value: "03", label: { en: "March", am: "መጋቢት" } },
  { value: "04", label: { en: "April", am: "ሚያዝያ" } },
  { value: "05", label: { en: "May", am: "ግንቦት" } },
  { value: "06", label: { en: "June", am: "ሰኔ" } },
  { value: "07", label: { en: "July", am: "ሐምሌ" } },
  { value: "08", label: { en: "August", am: "ነሐሴ" } },
  { value: "09", label: { en: "September", am: "መስከረም" } },
  { value: "10", label: { en: "October", am: "ጥቅምት" } },
  { value: "11", label: { en: "November", am: "ኅዳር" } },
  { value: "12", label: { en: "December", am: "ታኅሣሥ" } },
];

type NetProfitTab = "summary" | "events" | "payroll" | "opex" | "overheads" | "investments";

export default function NetProfitPage() {
  const { lang } = useLanguage();

  const t = (key: string): string => {
    const currentLang = (lang === "am" || lang === "en") ? lang : "en";
    return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS.en?.[key] || key;
  };

  const formatMonthName = (monthStr: string) => {
    if (!monthStr || monthStr.length < 7) return monthStr;
    const [year, mVal] = monthStr.split("-");
    const found = MONTHS.find((m) => m.value === mVal);
    const currentLang = (lang === "am" || lang === "en") ? lang : "en";
    const mName = found ? found.label[currentLang] || found.label.en : mVal;
    return `${mName} ${year}`;
  };

  const defaultMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);
  const [includeInvestments, setIncludeInvestments] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<NetProfitTab>("summary");

  const [yearVal, monthVal] = selectedMonth.split("-");
  const yearOptions = Array.from({ length: 6 }, (_, i) => {
    const y = 2024 + i;
    return { id: String(y), label: String(y) };
  });

  const monthOptions = MONTHS.map((m) => {
    const currentLang = (lang === "am" || lang === "en") ? lang : "en";
    return {
      id: m.value,
      label: m.label[currentLang] || m.label.en,
    };
  });

  const handleYearChange = (newYear: string) => {
    setSelectedMonth(`${newYear}-${monthVal}`);
  };

  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(`${yearVal}-${newMonth}`);
  };

  // Auth/Permissions check
  const { data: permissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ["auth-permissions"],
    queryFn: async () => {
      const res = await api.get("/auth/permissions");
      return res.data;
    },
  });

  const permissionList = permissions?.permission_slugs || [];
  const matches = createPermissionMatcher(permissionList);
  const canRead = matches("finance:hisab:read");

  // Fetch Report Data
  const {
    data: statement,
    isLoading: reportLoading,
    refetch,
    isRefetching,
    error: reportError,
  } = useQuery({
    queryKey: ["monthly-net-profit-statement", selectedMonth, includeInvestments],
    queryFn: () =>
      getMonthlyNetProfitStatement({
        month: selectedMonth,
        include_investments_in_net: includeInvestments,
      }),
    enabled: canRead,
  });

  const handleExport = async (format: "csv" | "xlsx") => {
    try {
      await downloadMonthlyNetProfitExport({
        month: selectedMonth,
        include_investments_in_net: includeInvestments,
        format,
        maxRows: 1000,
      });
    } catch (err: unknown) {
      console.error(err);
    }
  };

  const reportErrorMessage = reportError instanceof Error ? reportError.message : "Internal server error";

  if (permissionsLoading) {
    return (
      <AuthLayout>
        <div className="flex flex-col gap-5 p-8 max-w-7xl mx-auto w-full">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </AuthLayout>
    );
  }

  if (!canRead) {
    return (
      <AuthLayout>
        <ForbiddenState
          title={t("Forbidden: Insufficient privileges")}
          description={t("Only Owners, Accountants, and Administrators can access financial reports.")}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6 p-8 max-w-7xl mx-auto w-full no-print">
        {/* Header section */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight text-foreground select-none">
              {t("Net Profit Statement")}
            </h1>
            <p className="text-sm text-neutral-400 font-medium">
              {t(
                "Aggregated operating financials, overhead deductions, payroll adjustments, and below-the-line capital investments."
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={reportLoading || isRefetching}
              className="dl-radius-md hover:bg-card-alt select-none border-border/80 text-foreground"
            >
              <HiArrowPath className={`w-4 h-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
              {t("Refresh")}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("csv")}
              className="dl-radius-md hover:bg-card-alt select-none border-border/80 text-foreground"
            >
              <HiArrowDownTray className="w-4 h-4 mr-2" />
              {t("Export CSV")}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("xlsx")}
              className="dl-radius-md hover:bg-card-alt select-none border-border/80 text-foreground"
            >
              <HiArrowDownTray className="w-4 h-4 mr-2" />
              {t("Export XLSX")}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="dl-radius-md hover:bg-card-alt select-none border-border/80 text-foreground"
            >
              <HiPrinter className="w-4 h-4 mr-2" />
              {t("Print")}
            </Button>
          </div>
        </div>

        {/* Filter controls */}
        <div className="bg-card border border-border/60 rounded-3xl p-6 flex flex-col md:flex-row gap-6 md:items-center justify-between shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="year-select" className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase select-none">
                {t("Year")}
              </label>
              <Select
                options={yearOptions}
                value={yearVal}
                onChange={handleYearChange}
                className="w-32 border-border/80 font-medium"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="month-select" className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase select-none">
                {t("Month")}
              </label>
              <Select
                options={monthOptions}
                value={monthVal}
                onChange={handleMonthChange}
                className="w-44 border-border/80 font-medium"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="include-investments-toggle"
              onClick={() => setIncludeInvestments(!includeInvestments)}
              className="flex items-center gap-3 cursor-pointer group select-none text-left"
            >
              <div
                className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary ${
                  includeInvestments ? "bg-primary" : "bg-neutral-800"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    includeInvestments ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </div>
              <span className="text-sm font-semibold text-neutral-200 group-hover:text-foreground">
                {t("Include Investments in Net Profit")}
              </span>
            </button>
          </div>
        </div>

        {/* Error / Loading states */}
        {reportLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <Skeleton key={idx} className="h-28 rounded-3xl" />
            ))}
          </div>
        ) : reportError ? (
          <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-3xl p-6 flex items-center gap-4">
            <HiExclamationCircle className="w-8 h-8 text-red-400 shrink-0" />
            <div>
              <h3 className="font-bold text-lg">Error loading statement</h3>
              <p className="text-sm text-red-300">{reportErrorMessage}</p>
            </div>
          </div>
        ) : !statement ? (
          <div className="bg-card border border-border/60 rounded-3xl p-10 flex flex-col items-center justify-center text-center">
            <p className="text-neutral-400 font-semibold text-lg">{t("No data found for the selected filter criteria.")}</p>
          </div>
        ) : (
          <>
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Operating Revenue */}
              <div className="bg-card border border-border/60 rounded-3xl p-6 flex flex-col justify-between shadow-sm">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase select-none">
                  {t("Operating Revenue")}
                </span>
                <span className="text-3xl font-extrabold tracking-tight text-foreground font-mono tabular-nums mt-3">
                  {statement.totals.eventRevenue.toLocaleString()} <span className="text-sm text-primary font-bold">ETB</span>
                </span>
                <span className="text-[11px] text-neutral-500 mt-2">
                  {statement.counts.events} {t("Events")}
                </span>
              </div>

              {/* Card 2: Approved Event Expenses */}
              <div className="bg-card border border-border/60 rounded-3xl p-6 flex flex-col justify-between shadow-sm">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase select-none">
                  {t("Approved Event Expenses")}
                </span>
                <span className="text-3xl font-extrabold tracking-tight text-foreground font-mono tabular-nums mt-3">
                  {statement.totals.approvedEventExpenses.toLocaleString()} <span className="text-sm text-primary font-bold">ETB</span>
                </span>
                <span className="text-[11px] text-neutral-500 mt-2">
                  {t("Event Gross Profit")}: {statement.totals.eventGrossProfit.toLocaleString()} ETB
                </span>
              </div>

              {/* Card 3: Operational Expenses */}
              <div className="bg-card border border-border/60 rounded-3xl p-6 flex flex-col justify-between shadow-sm">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase select-none">
                  {t("Operational Expenses")}
                </span>
                <span className="text-3xl font-extrabold tracking-tight text-foreground font-mono tabular-nums mt-3">
                  {statement.totals.operationalExpenses.toLocaleString()} <span className="text-sm text-primary font-bold">ETB</span>
                </span>
                <span className="text-[11px] text-neutral-500 mt-2">
                  Non-event operations opex ledger
                </span>
              </div>

              {/* Card 4: Operating Profit */}
              <div className="bg-card border border-border/60 rounded-3xl p-6 flex flex-col justify-between shadow-sm bg-gradient-to-br from-card to-card-alt">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase select-none">
                  {t("Operating Profit")}
                </span>
                <span className="text-3xl font-extrabold tracking-tight text-primary font-mono tabular-nums mt-3">
                  {statement.totals.operatingProfit.toLocaleString()} <span className="text-sm font-bold">ETB</span>
                </span>
                <span className="text-[11px] text-neutral-300 font-semibold mt-2">
                  {t("Margin")}: {statement.totals.marginPercentage}%
                </span>
              </div>

              {/* Card 5: Overhead & Payroll */}
              <div className="bg-card border border-border/60 rounded-3xl p-6 flex flex-col justify-between shadow-sm">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase select-none">
                  {t("Overhead Expenses")}
                </span>
                <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums mt-3">
                  {statement.totals.overheadExpenses.toLocaleString()} <span className="text-xs text-primary font-bold">ETB</span>
                </span>
                <span className="text-[11px] text-neutral-500 mt-2">
                  Payroll Deductions: {statement.totals.payrollExpenses.toLocaleString()} ETB
                </span>
              </div>

              {/* Card 6: Capital Investments */}
              <div className="bg-card border border-border/60 rounded-3xl p-6 flex flex-col justify-between shadow-sm">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase select-none">
                  {t("Capital Investments (Capex)")}
                </span>
                <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums mt-3">
                  {statement.totals.approvedInvestments.toLocaleString()} <span className="text-xs text-primary font-bold">ETB</span>
                </span>
                <span className="text-[11px] text-neutral-500 mt-2">
                  {statement.counts.investmentRows} approved capex items
                </span>
              </div>

              {/* Card 7: Net Profit (After Investments) */}
              <div className="bg-card border border-border/60 rounded-3xl p-6 flex flex-col justify-between shadow-sm border-primary/40 bg-gradient-to-br from-card via-black/20 to-primary/5">
                <span className="text-[11px] font-semibold tracking-wider text-primary uppercase select-none">
                  {t("Net Profit (After Investments)")}
                </span>
                <span className="text-3xl font-extrabold tracking-tight text-primary font-mono tabular-nums mt-3">
                  {statement.totals.netAfterInvestments.toLocaleString()} <span className="text-sm font-bold">ETB</span>
                </span>
                <span className="text-[11px] text-neutral-400 mt-2">
                  {includeInvestments ? "Investments fully deducted" : "Investments excluded from net"}
                </span>
              </div>

              {/* Card 8: Pending Exposure */}
              <div className="bg-card border border-border/60 rounded-3xl p-6 flex flex-col justify-between shadow-sm">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase select-none">
                  {t("Pending Exposure")}
                </span>
                <span className="text-2xl font-bold tracking-tight text-amber-500 font-mono tabular-nums mt-3">
                  {statement.totals.pendingExposure.toLocaleString()} <span className="text-xs font-bold">ETB</span>
                </span>
                <span className="text-[11px] text-neutral-500 mt-2">
                  Aggregated unapproved transactions
                </span>
              </div>
            </div>

            {/* Treatment policy and closure status banner */}
            <div className="bg-card border border-border/60 rounded-3xl p-6 flex flex-col gap-4 shadow-sm">
              <h3 className="text-sm font-bold text-foreground tracking-wider uppercase select-none">
                {t("Treatment & Lock Policy")}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                    {t("Payroll Status")}
                  </span>
                  <p className="text-neutral-200 leading-relaxed text-xs">
                    {statement.breakdowns.payroll.finalizedRunCount > 0 ? (
                      <span className="text-green-400 font-medium">
                        Finalized Payroll Runs Found ({statement.breakdowns.payroll.finalizedRunCount}). Staff overhead excluded.
                      </span>
                    ) : (
                      <span className="text-amber-400 font-medium">
                        No Finalized Payroll Runs. Staff payment overhead included in deductions.
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                    {t("Investments Treatment")}
                  </span>
                  <p className="text-neutral-200 leading-relaxed text-xs">
                    {statement.treatment.investments === "deducted_below_operating_profit" ? (
                      <span className="text-primary font-medium">Deducted from operating profit (flag active)</span>
                    ) : (
                      <span className="text-neutral-400 font-medium">Reported below the operating profit line (default)</span>
                    )}
                  </p>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                    {t("Month Status")}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {statement.period.closed ? (
                      <span className="inline-flex items-center gap-1 text-green-400 font-semibold text-xs bg-green-500/10 px-2 py-0.5 rounded-full">
                        <HiCheck className="w-3.5 h-3.5" />
                        {t("Closed")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-500 font-semibold text-xs bg-amber-500/10 px-2 py-0.5 rounded-full">
                        <HiXMark className="w-3.5 h-3.5" />
                        {t("Open")}
                      </span>
                    )}
                    {statement.period.closure && (
                      <span className="text-[11px] text-neutral-500">
                        ({t("Closed by")}: {statement.period.closure.closed_by_username})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Drilldown Workbooks Tabs */}
            <div className="flex flex-col gap-4">
              <div className="flex border-b border-border/80 gap-6">
                {([
                  { id: "summary", label: t("Overview") },
                  { id: "events", label: `${t("Events")} (${statement.counts.events})` },
                  { id: "payroll", label: `${t("Payroll Runs")} (${statement.counts.payrollRuns})` },
                  { id: "opex", label: t("Operational Expenses") },
                  { id: "overheads", label: t("Overhead Expenses") },
                  { id: "investments", label: `${t("Capital Investments")} (${statement.counts.investmentRows})` },
                ] satisfies Array<{ id: NetProfitTab; label: string }>).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`pb-3 font-semibold text-sm transition-all focus:outline-none select-none relative ${
                      activeTab === tab.id ? "text-primary border-b-2 border-primary" : "text-neutral-400 hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab 1: Overview Summary breakdowns */}
              {activeTab === "summary" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Event expenses by category */}
                  <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-foreground tracking-wider uppercase mb-4">
                      Event Expenses by Category
                    </h3>
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border/80 text-neutral-400 font-semibold">
                          <th className="py-2">{t("Category")}</th>
                          <th className="py-2 text-right">{t("Count")}</th>
                          <th className="py-2 text-right">{t("Amount")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statement.breakdowns.eventExpensesByCategory.map((c, i) => (
                          <tr key={i} className="border-b border-border/30 hover:bg-card-alt/30">
                            <td className="py-2.5 font-medium">{c.category}</td>
                            <td className="py-2.5 text-right font-medium">{c.count}</td>
                            <td className="py-2.5 text-right font-semibold font-mono tabular-nums">
                              {c.amount.toLocaleString()} ETB
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Operational expenses by category */}
                  <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-foreground tracking-wider uppercase mb-4">
                      Operational Expenses by Category
                    </h3>
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border/80 text-neutral-400 font-semibold">
                          <th className="py-2">{t("Category")}</th>
                          <th className="py-2 text-right">{t("Approved")}</th>
                          <th className="py-2 text-right">{t("Pending")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statement.breakdowns.operationalExpensesByCategory.map((c, i) => (
                          <tr key={i} className="border-b border-border/30 hover:bg-card-alt/30">
                            <td className="py-2.5 font-medium">{c.category}</td>
                            <td className="py-2.5 text-right font-semibold font-mono tabular-nums text-foreground">
                              {c.amount.toLocaleString()} ETB
                            </td>
                            <td className="py-2.5 text-right font-semibold font-mono tabular-nums text-amber-500">
                              {c.pendingAmount.toLocaleString()} ETB
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 2: Events Drilldown */}
              {activeTab === "events" && (
                <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border/80 text-neutral-400 font-semibold">
                          <th className="py-2">{t("Event Name")}</th>
                          <th className="py-2">{t("Date")}</th>
                          <th className="py-2 text-right">{t("Revenue")}</th>
                          <th className="py-2 text-right">{t("Approved Expenses")}</th>
                          <th className="py-2 text-right">{t("Pending")}</th>
                          <th className="py-2 text-right">{t("Net Profit")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statement.drilldowns.events.map((e) => (
                          <tr key={e.id} className="border-b border-border/30 hover:bg-card-alt/30">
                            <td className="py-3 font-semibold text-primary">
                              <Link href={`/events/${e.id}`} className="hover:underline">
                                {e.name}
                              </Link>
                            </td>
                            <td className="py-3 text-neutral-300 font-medium">{e.start_date}</td>
                            <td className="py-3 text-right font-semibold font-mono tabular-nums">
                              {e.revenue.toLocaleString()} ETB
                            </td>
                            <td className="py-3 text-right font-semibold font-mono tabular-nums text-foreground">
                              {e.approvedExpenses.toLocaleString()} ETB
                            </td>
                            <td className="py-3 text-right font-semibold font-mono tabular-nums text-amber-500">
                              {e.pendingExpenses.toLocaleString()} ETB
                            </td>
                            <td className="py-3 text-right font-extrabold font-mono tabular-nums text-primary">
                              {e.netProfit.toLocaleString()} ETB
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 3: Payroll Runs Drilldown */}
              {activeTab === "payroll" && (
                <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border/80 text-neutral-400 font-semibold">
                          <th className="py-2">{t("Title")}</th>
                          <th className="py-2">{t("Period")}</th>
                          <th className="py-2 text-right">{t("Total")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statement.drilldowns.payrollRuns.map((p) => (
                          <tr key={p.id} className="border-b border-border/30 hover:bg-card-alt/30">
                            <td className="py-3 font-semibold text-primary">
                              <Link href="/hr/payments" className="hover:underline">
                                {p.title}
                              </Link>
                            </td>
                            <td className="py-3 text-neutral-300 font-medium">
                              {p.period_start} to {p.period_end}
                            </td>
                            <td className="py-3 text-right font-extrabold font-mono tabular-nums">
                              {p.total.toLocaleString()} ETB
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 4: Operational Expenses drilldown */}
              {activeTab === "opex" && (
                <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border/80 text-neutral-400 font-semibold">
                          <th className="py-2">{t("Category")}</th>
                          <th className="py-2 text-right">{t("Approved")}</th>
                          <th className="py-2 text-right">{t("Pending")}</th>
                          <th className="py-2 text-right">{t("Count")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statement.breakdowns.operationalExpensesByCategory.map((o, i) => (
                          <tr key={i} className="border-b border-border/30 hover:bg-card-alt/30">
                            <td className="py-3 font-semibold text-foreground">{o.category}</td>
                            <td className="py-3 text-right font-bold font-mono tabular-nums text-foreground">
                              {o.amount.toLocaleString()} ETB
                            </td>
                            <td className="py-3 text-right font-bold font-mono tabular-nums text-amber-500">
                              {o.pendingAmount.toLocaleString()} ETB
                            </td>
                            <td className="py-3 text-right font-semibold">{o.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 5: Overheads drilldown */}
              {activeTab === "overheads" && (
                <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border/80 text-neutral-400 font-semibold">
                          <th className="py-2">{t("Scope")}</th>
                          <th className="py-2">{t("Payment Kind")}</th>
                          <th className="py-2 text-right">{t("Amount")}</th>
                          <th className="py-2 text-right">{t("Pending")}</th>
                          <th className="py-2 text-right">{t("Count")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statement.breakdowns.overheadByScope.map((o, i) => (
                          <tr key={i} className="border-b border-border/30 hover:bg-card-alt/30">
                            <td className="py-3 font-semibold text-foreground uppercase">{o.scope}</td>
                            <td className="py-3 text-neutral-300 font-medium">{o.payment_kind}</td>
                            <td className="py-3 text-right font-bold font-mono tabular-nums text-foreground">
                              {o.amount.toLocaleString()} ETB
                            </td>
                            <td className="py-3 text-right font-bold font-mono tabular-nums text-amber-500">
                              {o.pendingAmount.toLocaleString()} ETB
                            </td>
                            <td className="py-3 text-right font-semibold">{o.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 6: Capital Investments drilldown */}
              {activeTab === "investments" && (
                <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border/80 text-neutral-400 font-semibold">
                          <th className="py-2">{t("Item Name")}</th>
                          <th className="py-2">{t("Category")}</th>
                          <th className="py-2">{t("Quantity")}</th>
                          <th className="py-2 text-right">{t("Unit Cost")}</th>
                          <th className="py-2 text-right">{t("Total Cost")}</th>
                          <th className="py-2">{t("Classification")}</th>
                          <th className="py-2">{t("Asset Link")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statement.drilldowns.investments.map((inv) => (
                          <tr key={inv.id} className="border-b border-border/30 hover:bg-card-alt/30">
                            <td className="py-3 font-semibold text-primary">
                              <Link href="/hr/finance/investments" className="hover:underline">
                                {inv.item_name}
                              </Link>
                            </td>
                            <td className="py-3 text-neutral-300 font-medium">{inv.category}</td>
                            <td className="py-3 font-medium">
                              {inv.quantity} {inv.unit}
                            </td>
                            <td className="py-3 text-right font-mono tabular-nums">
                              {inv.unit_cost.toLocaleString()} ETB
                            </td>
                            <td className="py-3 text-right font-bold font-mono tabular-nums text-foreground">
                              {inv.total_cost.toLocaleString()} ETB
                            </td>
                            <td className="py-3 font-semibold text-neutral-400 uppercase text-[10px]">
                              {inv.capex_classification}
                            </td>
                            <td className="py-3 font-medium text-xs">
                              {inv.asset_id ? (
                                <span className="text-green-400 font-semibold">Linked</span>
                              ) : (
                                <span className="text-neutral-500">Unlinked</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Print-only layout */}
      {statement && (
        <div className="hidden print:block p-8 bg-white text-black font-sans text-xs">
          <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-end">
            <div>
              <h1 className="text-2xl font-bold tracking-tight uppercase">Dream Lux Event Logistics & Rentals</h1>
              <p className="text-sm font-semibold">{t("Net Profit Statement")}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{t("Month / Year")}: {formatMonthName(selectedMonth)}</p>
              <p className="text-[10px] text-gray-500">Generated: {new Date().toISOString().slice(0, 10)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-6">
            <div>
              <h3 className="font-bold border-b border-black pb-1 mb-2 uppercase">{t("Operating Performance")}</h3>
              <div className="flex justify-between py-1">
                <span>{t("Operating Revenue")}:</span>
                <span className="font-bold font-mono">{statement.totals.eventRevenue.toLocaleString()} ETB</span>
              </div>
              <div className="flex justify-between py-1">
                <span>{t("Approved Event Expenses")}:</span>
                <span className="font-mono">{statement.totals.approvedEventExpenses.toLocaleString()} ETB</span>
              </div>
              <div className="flex justify-between py-1 font-bold border-t border-gray-300">
                <span>{t("Event Gross Profit")}:</span>
                <span className="font-mono">{statement.totals.eventGrossProfit.toLocaleString()} ETB</span>
              </div>
            </div>

            <div>
              <h3 className="font-bold border-b border-black pb-1 mb-2 uppercase">{t("Deductions & Profit")}</h3>
              <div className="flex justify-between py-1">
                <span>{t("Operational Expenses")}:</span>
                <span className="font-mono">{statement.totals.operationalExpenses.toLocaleString()} ETB</span>
              </div>
              <div className="flex justify-between py-1">
                <span>{t("Overhead Expenses")}:</span>
                <span className="font-mono">{statement.totals.overheadExpenses.toLocaleString()} ETB</span>
              </div>
              <div className="flex justify-between py-1">
                <span>{t("Payroll Expenses")}:</span>
                <span className="font-mono">{statement.totals.payrollExpenses.toLocaleString()} ETB</span>
              </div>
              <div className="flex justify-between py-1 font-bold border-t border-gray-300">
                <span>{t("Operating Profit")}:</span>
                <span className="font-mono">{statement.totals.operatingProfit.toLocaleString()} ETB</span>
              </div>
            </div>
          </div>

          <div className="border-t-2 border-black pt-4 flex justify-between items-center text-sm">
            <span className="font-bold uppercase">{t("Net Profit (After Investments)")}:</span>
            <span className="font-extrabold font-mono text-lg">{statement.totals.netAfterInvestments.toLocaleString()} ETB</span>
          </div>

          <div className="mt-8 text-[9px] text-gray-500">
            <p><strong>{t("Treatment & Lock Policy")}:</strong></p>
            <p>Payroll deduction: {statement.treatment.payroll}</p>
            <p>Investments treatment: {statement.treatment.investments}</p>
            <p>{statement.period.snapshot_policy}</p>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
