"use client";
import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getEventProposals } from "@/lib/api";
import { EventProposal } from "@/lib/types";
import AuthLayout from "@/components/AuthLayout";
import ForbiddenState from "@/components/ForbiddenState";
import {
  HiInboxStack,
  HiPlus,
  HiMagnifyingGlass,
  HiEye,
  HiArrowPath,
  HiCheckCircle,
  HiCurrencyDollar
} from "react-icons/hi2";
import Select from "@/components/ui/Select";
import PaginationControls from "@/components/PaginationControls";
import Link from "next/link";
import { useLanguage } from "@/hooks/use-language";
import { SortableHeader } from "@/components/ui/SortableHeader";
import AdvancedFilterBuilder, { FilterRule } from "@/components/AdvancedFilterBuilder";
import type { EventProposalFilter } from "@/lib/api";
import StatusBadge from "@/components/ui/StatusBadge";
import { useAuth } from "@/hooks/useAuth";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Event Proposals": "Event Proposals",
    "Proposal Pipeline": "Proposal Pipeline",
    "Add Proposal": "New Proposal",
    "Search Proposals": "Search proposals...",
    "All Statuses": "All Statuses",
    "Draft": "Draft",
    "Submitted": "Submitted",
    "Approved": "Approved",
    "Rejected": "Rejected",
    "Converted": "Converted",
    "Canceled": "Canceled",
    "Proposal Name": "Proposal Name",
    "Client": "Client",
    "Budget": "Budget",
    "Estimated Profit": "Estimated Profit",
    "Margin %": "Margin %",
    "Status": "Status",
    "Actions": "Actions",
    "No proposals found": "No proposals found",
    "Loading Proposals...": "Loading Proposals...",
    "Total Proposals": "Total Proposals",
    "Active Intake": "Active Intake",
    "Conversion Rate": "Conversion Rate",
    "Avg Margin": "Avg Margin",
    "Date": "Requested Date",
    "Clear": "Clear"
  },
  am: {
    "Event Proposals": "የዝግጅት ፕሮፖዛሎች",
    "Proposal Pipeline": "የፕሮፖዛል መከታተያ",
    "Add Proposal": "አዲስ ፕሮፖዛል",
    "Search Proposals": "ፕሮፖዛል ፈልግ...",
    "All Statuses": "ሁሉንም ሁኔታዎች",
    "Draft": "ረቂቅ",
    "Submitted": "የቀረበ",
    "Approved": "የጸደቀ",
    "Rejected": "ውድቅ የተደረገ",
    "Converted": "የተቀየረ",
    "Canceled": "የተሰረዘ",
    "Proposal Name": "የፕሮፖዛል ስም",
    "Client": "ደንበኛ",
    "Budget": "በጀት",
    "Estimated Profit": "የተገመተ ትርፍ",
    "Margin %": "ህዳግ %",
    "Status": "ሁኔታ",
    "Actions": "ክንውኖች",
    "No proposals found": "ምንም ፕሮፖዛል አልተገኘም",
    "Loading Proposals...": "ፕሮፖዛል በመጫን ላይ...",
    "Total Proposals": "ጠቅላላ ፕሮፖዛሎች",
    "Active Intake": "በሂደት ላይ",
    "Conversion Rate": "የመለወጥ መጠን",
    "Avg Margin": "አማካይ ህዳግ",
    "Date": "የተጠየቀ ቀን",
    "Clear": "አጽዳ"
  }
};

export default function ProposalsPage() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const { hasAnyPermission, isAuthenticated, isLoading: authLoading } = useAuth();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [advancedFilters, setAdvancedFilters] = useState<FilterRule[]>([]);
  const [filterLogic, setFilterLogic] = useState<"and" | "or">("and");
  const limit = 10;
  const canReadProposals = hasAnyPermission(["events:proposals:write", "events:write", "events:proposals:approve"]);
  const canCreateProposals = hasAnyPermission(["events:proposals:write", "events:write"]);

  const serverFilters = useMemo<EventProposalFilter[]>(() => {
    return advancedFilters.map((rule) => {
      if (rule.operator === "between") {
        const parts = rule.value.split("|").map((part) => part.trim()).filter(Boolean);
        return {
          field: rule.field as EventProposalFilter["field"],
          operator: rule.operator,
          value: parts.slice(0, 2),
        };
      }
      const numericFields = new Set([
        "requested_budget",
        "estimated_net_profit",
        "estimated_margin_percentage",
      ]);
      const isNumericField = numericFields.has(rule.field);
      return {
        field: rule.field as EventProposalFilter["field"],
        operator: rule.operator,
        value: isNumericField && rule.value.trim() !== "" ? Number(rule.value) : rule.value,
      };
    });
  }, [advancedFilters]);

  const { data, isLoading } = useQuery<{
    proposals: EventProposal[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>({
    queryKey: ["event-proposals", page, search, status, sortBy, sortOrder, filterLogic, serverFilters],
    queryFn: () => getEventProposals({
      page,
      limit,
      search: search || undefined,
      status: status === "all" ? undefined : status,
      filterLogic,
      sortBy,
      sortOrder,
      filters: serverFilters.length > 0 ? serverFilters : undefined,
    }),
    enabled: isAuthenticated && canReadProposals,
  });

  const proposals = useMemo(() => data?.proposals || [], [data?.proposals]);
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  // Compute local KPI stats safely from available data (active page or default)
  const stats = useMemo(() => {
    if (proposals.length === 0) {
      return { totalCount: 0, activeIntake: 0, conversionRate: 0, avgMargin: 0 };
    }
    const totalCount = total;
    const activeIntake = proposals.filter(p => p.status === "Submitted" || p.status === "Draft").length;
    const convertedCount = proposals.filter(p => p.status === "Converted").length;
    const conversionRate = totalCount > 0 ? Math.round((convertedCount / totalCount) * 100) : 0;
    const margins = proposals.map(p => Number(p.estimated_margin_percentage || 0));
    const avgMargin = margins.length > 0 ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length) : 0;
    return { totalCount, activeIntake, conversionRate, avgMargin };
  }, [proposals, total]);

  return (
    <AuthLayout>
      {authLoading ? (
        <div className="page-container pt-4 md:py-8 px-4 sm:px-6 md:px-8">
          <div className="h-48 animate-pulse rounded-lg border border-border bg-card" />
        </div>
      ) : !isAuthenticated || !canReadProposals ? (
        <ForbiddenState
          description="You need event proposal access permissions to view this content."
        />
      ) : (
        <div className="page-container pt-4 md:py-8 px-4 sm:px-6 md:px-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
              <HiInboxStack className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">
                {t("Event Proposals")}
              </h1>
              <p className="text-xs md:text-sm text-muted font-medium">
                {t("Proposal Pipeline")} ({total})
              </p>
            </div>
          </div>

          {canCreateProposals && (
            <Link
              href="/events/proposals/new"
              className="flex items-center justify-center gap-1.5 px-4 h-[44px] rounded-2xl text-xs font-black bg-indigo-600 text-white [@media(hover:hover)]:hover:bg-indigo-700 dark:bg-indigo-500 dark:[@media(hover:hover)]:hover:bg-indigo-600 shadow-md shadow-indigo-600/10 transition-all border border-indigo-600/20 active:scale-[0.98]"
            >
              <HiPlus className="w-4 h-4" />
              {t("Add Proposal")}
            </Link>
          )}
        </header>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Card 1: Total Proposals */}
          <div className="group relative bg-card border border-border/60 rounded-2xl p-5 overflow-hidden shadow-sm hover:shadow-md hover:border-indigo-500/30 transition-all duration-300 flex flex-col justify-between h-[110px]">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-full blur-xl group-hover:scale-110 transition-transform duration-500 pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted uppercase tracking-wider font-extrabold">{t("Total Proposals")}</span>
              <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-500 border border-indigo-500/20 group-hover:scale-105 transition-transform duration-300">
                <HiInboxStack className="w-4 h-4" />
              </div>
            </div>
            <span className="text-2xl font-black text-foreground tracking-tight tabular-nums mt-2">
              {stats.totalCount}
            </span>
          </div>

          {/* Card 2: Active Intake */}
          <div className="group relative bg-card border border-border/60 rounded-2xl p-5 overflow-hidden shadow-sm hover:shadow-md hover:border-amber-500/30 transition-all duration-300 flex flex-col justify-between h-[110px]">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-full blur-xl group-hover:scale-110 transition-transform duration-500 pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted uppercase tracking-wider font-extrabold">{t("Active Intake")}</span>
              <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-500 border border-amber-500/20 group-hover:scale-105 transition-transform duration-300">
                <HiArrowPath className="w-4 h-4" />
              </div>
            </div>
            <span className="text-2xl font-black text-foreground tracking-tight tabular-nums mt-2">
              {stats.activeIntake}
            </span>
          </div>

          {/* Card 3: Conversion Rate */}
          <div className="group relative bg-card border border-border/60 rounded-2xl p-5 overflow-hidden shadow-sm hover:shadow-md hover:border-emerald-500/30 transition-all duration-300 flex flex-col justify-between h-[110px]">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-full blur-xl group-hover:scale-110 transition-transform duration-500 pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted uppercase tracking-wider font-extrabold">{t("Conversion Rate")}</span>
              <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-500 border border-emerald-500/20 group-hover:scale-105 transition-transform duration-300">
                <HiCheckCircle className="w-4 h-4" />
              </div>
            </div>
            <span className="text-2xl font-black text-foreground tracking-tight tabular-nums mt-2">
              {stats.conversionRate}%
            </span>
          </div>

          {/* Card 4: Avg Margin */}
          <div className="group relative bg-card border border-border/60 rounded-2xl p-5 overflow-hidden shadow-sm hover:shadow-md hover:border-violet-500/30 transition-all duration-300 flex flex-col justify-between h-[110px]">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-violet-500/10 to-transparent rounded-full blur-xl group-hover:scale-110 transition-transform duration-500 pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted uppercase tracking-wider font-extrabold">{t("Avg Margin")}</span>
              <div className="p-1.5 bg-violet-500/10 rounded-lg text-violet-500 border border-violet-500/20 group-hover:scale-105 transition-transform duration-300">
                <HiCurrencyDollar className="w-4 h-4" />
              </div>
            </div>
            <span className="text-2xl font-black text-foreground tracking-tight tabular-nums mt-2">
              {stats.avgMargin}%
            </span>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="bg-card border border-border rounded-2xl 2xl:rounded-4xl p-3.5 mb-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px] md:max-w-xs">
              <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                placeholder={t("Search Proposals")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 h-[44px] rounded-xl bg-card-alt text-sm focus:ring-1 focus:ring-primary/30 outline-none border border-border transition-all"
              />
            </div>

            <div className="flex items-center gap-2">
              <Select
                options={[
                  { id: "all", label: t("All Statuses") },
                  { id: "Draft", label: t("Draft") },
                  { id: "Submitted", label: t("Submitted") },
                  { id: "Approved", label: t("Approved") },
                  { id: "Rejected", label: t("Rejected") },
                  { id: "Converted", label: t("Converted") },
                  { id: "Canceled", label: t("Canceled") }
                ]}
                value={status}
                onChange={(val) => {
                  setStatus(val);
                  setPage(1);
                }}
                className="min-w-[150px] rounded-xl border-border"
              />
              <AdvancedFilterBuilder
                pageKey="proposals"
                fields={[
                  { key: "name", label: t("Proposal Name"), type: "string" },
                  { key: "client_name", label: t("Client"), type: "string" },
                  { key: "requested_budget", label: t("Budget"), type: "number" },
                  { key: "estimated_margin_percentage", label: t("Margin %"), type: "number" },
                  { key: "venue_location", label: t("Venue"), type: "string" },
                  {
                    key: "status",
                    label: t("Status"),
                    type: "select",
                    options: [
                      { id: "Draft", label: "Draft" },
                      { id: "Submitted", label: "Submitted" },
                      { id: "Approved", label: "Approved" },
                      { id: "Rejected", label: "Rejected" },
                      { id: "Converted", label: "Converted" },
                    ],
                  },
                ]}
                rules={advancedFilters}
                logic={filterLogic}
                onChange={(rules, logic) => {
                  setAdvancedFilters(rules);
                  setFilterLogic(logic);
                  setPage(1);
                }}
                data={data?.proposals || []}
              />
              {advancedFilters.length > 0 && (
                <button
                  onClick={() => {
                    setAdvancedFilters([]);
                    setPage(1);
                  }}
                  className="h-10 px-4 text-xs font-semibold uppercase tracking-wider bg-card-alt border border-border text-foreground hover:bg-border rounded-xl transition-all"
                >
                  {t("Clear")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* List content */}
        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-card-alt rounded-2xl border border-border" />
            ))}
          </div>
        ) : proposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl border border-dashed border-border text-center px-4">
            <HiInboxStack className="w-16 h-16 text-muted mb-4 opacity-10" />
            <h3 className="text-lg font-bold text-foreground opacity-50">
              {t("No proposals found")}
            </h3>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-hidden bg-card border border-border rounded-2xl 2xl:rounded-4xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-card-alt/30 border-b border-border text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                    <th className="px-6 py-4">#</th>
                    <th className="px-6 py-4">
                      <SortableHeader
                        label={t("Proposal Name")}
                        sortKey="name"
                        currentSortBy={sortBy}
                        currentSortOrder={sortOrder}
                        onSort={(key, order) => {
                          setSortBy(key);
                          setSortOrder(order);
                          setPage(1);
                        }}
                      />
                    </th>
                    <th className="px-6 py-4">
                      <SortableHeader
                        label={t("Client")}
                        sortKey="client_name"
                        currentSortBy={sortBy}
                        currentSortOrder={sortOrder}
                        onSort={(key, order) => {
                          setSortBy(key);
                          setSortOrder(order);
                          setPage(1);
                        }}
                      />
                    </th>
                    <th className="px-6 py-4">
                      <SortableHeader
                        label={t("Date")}
                        sortKey="requested_start_date"
                        currentSortBy={sortBy}
                        currentSortOrder={sortOrder}
                        onSort={(key, order) => {
                          setSortBy(key);
                          setSortOrder(order);
                          setPage(1);
                        }}
                      />
                    </th>
                    <th className="px-6 py-4 text-right">
                      <SortableHeader
                        label={t("Budget")}
                        sortKey="requested_budget"
                        currentSortBy={sortBy}
                        currentSortOrder={sortOrder}
                        align="right"
                        onSort={(key, order) => {
                          setSortBy(key);
                          setSortOrder(order);
                          setPage(1);
                        }}
                      />
                    </th>
                    <th className="px-6 py-4 text-right">
                      <SortableHeader
                        label={t("Margin %")}
                        sortKey="estimated_margin_percentage"
                        currentSortBy={sortBy}
                        currentSortOrder={sortOrder}
                        align="right"
                        onSort={(key, order) => {
                          setSortBy(key);
                          setSortOrder(order);
                          setPage(1);
                        }}
                      />
                    </th>
                    <th className="px-6 py-4 text-center">
                      <SortableHeader
                        label={t("Status")}
                        sortKey="status"
                        currentSortBy={sortBy}
                        currentSortOrder={sortOrder}
                        onSort={(key, order) => {
                          setSortBy(key);
                          setSortOrder(order);
                          setPage(1);
                        }}
                        align="center"
                      />
                    </th>
                    <th className="px-6 py-4 text-right">{t("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((proposal, idx) => (
                    <tr key={proposal.id} className="border-b border-border/50 [@media(hover:hover)]:hover:bg-primary-light/5 transition-all text-sm">
                      <td className="px-6 py-4 font-mono text-muted text-xs">{(page - 1) * limit + idx + 1}</td>
                      <td className="px-6 py-4 font-bold text-foreground">
                        <Link href={`/events/proposals/${proposal.id}`} className="[@media(hover:hover)]:hover:text-primary [@media(hover:hover)]:hover:underline">
                          {proposal.name}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-semibold text-foreground">{proposal.client_name}</div>
                          {proposal.client_phone && <div className="text-xs font-mono text-muted">{proposal.client_phone}</div>}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-muted text-xs">
                        {proposal.requested_start_date ? proposal.requested_start_date.split("T")[0] : "-"}
                      </td>
                      <td className="px-6 py-4 font-bold text-foreground text-right font-mono">
                        ETB {Number(proposal.requested_budget).toLocaleString()}
                      </td>
                      <td className={`px-6 py-4 font-black text-right font-mono ${proposal.estimated_margin_percentage < 25 ? "text-warning" : "text-success"}`}>
                        {proposal.estimated_margin_percentage}%
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex justify-center w-full">
                          <StatusBadge status={proposal.status} />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/events/proposals/${proposal.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-card-alt border border-border text-muted [@media(hover:hover)]:hover:text-foreground rounded"
                        >
                          <HiEye className="w-3.5 h-3.5" />
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="md:hidden space-y-3">
              {proposals.map((proposal) => (
                <Link
                  key={proposal.id}
                  href={`/events/proposals/${proposal.id}`}
                  className="block p-4 bg-card border border-border rounded-2xl space-y-3 active:scale-[0.98] [@media(hover:hover)]:hover:border-primary/45 [@media(hover:hover)]:hover:bg-primary-light/5 active:bg-primary-light/10 active:border-primary/30 transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-foreground text-base leading-snug">{proposal.name}</h4>
                      <p className="text-xs text-muted font-medium mt-0.5">{proposal.client_name}</p>
                    </div>
                    <StatusBadge status={proposal.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-border/50 pt-2.5">
                    <div>
                      <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">Budget</span>
                      <span className="font-mono text-foreground font-bold">
                        ETB {Number(proposal.requested_budget).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block uppercase tracking-wider font-bold">Margin</span>
                      <span className={`font-mono font-bold ${proposal.estimated_margin_percentage < 25 ? "text-warning" : "text-success"}`}>
                        {proposal.estimated_margin_percentage}%
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <PaginationControls
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </>
        )}
        </div>
      )}
    </AuthLayout>
  );
}
