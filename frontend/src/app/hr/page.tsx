"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AuthLayout from "@/components/AuthLayout";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/use-language";
import ForbiddenState from "@/components/ForbiddenState";
import EditEmployeeSheet from "@/components/EditEmployeeSheet";
import { getEmployees } from "@/lib/api";
import { Employee } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  FileCheck2,
  Banknote,
  Eye,
  EyeOff,
  AlertTriangle,
  ChevronRight,
  UserX,
  CreditCard,
  FileWarning,
  Award,
  Layers,
} from "lucide-react";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "HR Dashboard": "HR Dashboard",
    "Workforce & Staffing Diagnostics": "Workforce & Staffing Diagnostics",
    "Loading Workforce Metrics...": "Loading Workforce Metrics...",
    "Total Workforce": "Total Workforce",
    "Active Staff": "Active Staff",
    "Staffing Readiness": "Staffing Readiness",
    "Fully Documented Crew": "Fully Documented Crew",
    "Monthly Payroll Base": "Monthly Payroll Base",
    "Basic Payroll Liability": "Basic Payroll Liability",
    "Documentation Gaps": "Documentation Gaps",
    "Profiles Missing ID/Scans": "Profiles Missing ID/Scans",
    "Redact Sensitive Data": "Redact Sensitive Data",
    "Show Sensitive Data": "Show Sensitive Data",
    "Staffing Index Details": "Active staff with fully verified identity credentials and front/back ID card scans.",
    "Exception Center": "Exception Center",
    "Missing Bank Info": "Missing Bank Info",
    "Missing IDs": "Missing IDs",
    "Contract Warnings": "Contract Warnings",
    "Employee": "Employee",
    "ID": "ID",
    "Position": "Position",
    "Department": "Department",
    "Status": "Status",
    "Action Required": "Action Required",
    "Upload Bank Details": "Upload Bank Details",
    "Upload ID Scans": "Upload ID Scans",
    "Renew Contract": "Renew Contract / Set Hire Date",
    "No exceptions found": "No exceptions found in this category",
    "All workforce records are healthy and compliant.": "All workforce records are healthy and compliant.",
    "Basic Salary": "Basic Salary",
    "Bank Name": "Bank Name",
    "Account Number": "Account Number",
    "Employment Type": "Employment Type",
    "Missing hire date": "Missing hire date",
    "Contract expired": "Contract expired",
    "Contract suspended": "Contract suspended",
    "Workforce Allocation Readiness": "Workforce Allocation Readiness",
    "Department Readiness Breakdown": "Department Readiness Breakdown",
    "documented": "documented",
    "No employees found": "No employees found",
    "register employees": "Please register employees in the database to generate staffing and payroll insights.",
  },
  am: {
    "HR Dashboard": "የሰው ኃይል ዳሽቦርድ",
    "Workforce & Staffing Diagnostics": "የሰራተኞች እና የደመወዝ ምርመራ",
    "Loading Workforce Metrics...": "የሰራተኛ መረጃዎች በመጫን ላይ...",
    "Total Workforce": "ጠቅላላ የሰው ኃይል",
    "Active Staff": "ገባሪ ሰራተኞች",
    "Staffing Readiness": "የሰራተኞች ዝግጁነት",
    "Fully Documented Crew": "ሙሉ ማስረጃ ያላቸው",
    "Monthly Payroll Base": "የወር መነሻ ደመወዝ",
    "Basic Payroll Liability": "የመሰረታዊ ክፍያ ግዴታ",
    "Documentation Gaps": "የማስረጃ ጉድለቶች",
    "Profiles Missing ID/Scans": "መታወቂያ/ፎቶ የሚጎድላቸው",
    "Redact Sensitive Data": "የክፍያ መረጃ ደብቅ",
    "Show Sensitive Data": "የክፍያ መረጃ አሳይ",
    "Staffing Index Details": "ሙሉ በሙሉ የተረጋገጠ መታወቂያ እና የፊት/ጀርባ ቅኝት ያላቸው ገባሪ ሰራተኞች።",
    "Exception Center": "ልዩ ሁኔታዎች ማእከል",
    "Missing Bank Info": "የባንክ መረጃ የሌላቸው",
    "Missing IDs": "መታወቂያ የሌላቸው",
    "Contract Warnings": "የውል ማስጠንቀቂያዎች",
    "Employee": "ሰራተኛ",
    "ID": "መታወቂያ",
    "Position": "የስራ መደብ",
    "Department": "የስራ ክፍል",
    "Status": "ሁኔታ",
    "Action Required": "የሚያስፈልግ ተግባር",
    "Upload Bank Details": "የባንክ መረጃ መዝግብ",
    "Upload ID Scans": "መታወቂያ ቅኝቶችን ስቀል",
    "Renew Contract": "ኮንትራት አድስ / የቅጥር ቀን አስገባ",
    "No exceptions found": "በዚህ ምድብ ምንም የጎደለ መረጃ አልተገኘም",
    "All workforce records are healthy and compliant.": "ሁሉም የሰራተኞች መዛግብት የተሟሉ እና የተስተካከሉ ናቸው።",
    "Basic Salary": "መሰረታዊ ደመወዝ",
    "Bank Name": "የባንክ ስም",
    "Account Number": "የሂሳብ ቁጥር",
    "Employment Type": "የቅጥር ሁኔታ",
    "Missing hire date": "የቅጥር ቀን አልተመዘገበም",
    "Contract expired": "ውሉ ጊዜው አልፏል",
    "Contract suspended": "ውሉ ለጊዜው የታገደ",
    "Workforce Allocation Readiness": "የሠራተኞች ድልድል ዝግጁነት",
    "Department Readiness Breakdown": "የክፍሎች ዝግጁነት ዝርዝር",
    "documented": "ማስረጃ የተሟላላቸው",
    "No employees found": "ምንም ሰራተኛ አልተገኘም",
    "register employees": "ሰራተኞችን ወደ ስርዓቱ ያስገቡ።",
  },
};

export default function HRDashboardPage() {
  const { hasPermission, isLoading: authLoading } = useAuth();
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"bank" | "documents" | "contracts">("bank");
  const [manualRedaction, setManualRedaction] = useState<boolean>(true);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const canReadHR = hasPermission("hr:read") || hasPermission("hr:write");
  const canReadPayroll = hasPermission("payroll:read") || hasPermission("payroll:write");

  const { data: employeesData, isLoading: queryLoading } = useQuery<{ employees: Employee[] }>({
    queryKey: ["employees", 1, 1000],
    queryFn: () => getEmployees(1, 1000),
    enabled: canReadHR || canReadPayroll,
  });

  const employees = employeesData?.employees || [];

  const stats = useMemo(() => {
    const activeList = employees.filter((emp) => emp.contract_status === "Active");
    const totalCount = employees.length;
    const activeCount = activeList.length;

    const documentedCount = activeList.filter(
      (emp) =>
        (emp.profile_photo_url || emp.profile_photo_url === "") &&
        emp.id_card_front_url &&
        emp.id_card_back_url,
    ).length;

    const readinessIndex = activeCount > 0 ? Math.round((documentedCount / activeCount) * 100) : 0;
    const monthlyPayrollCommitment = activeList.reduce(
      (acc, curr) => acc + (Number(curr.base_salary) || 0),
      0,
    );
    const documentationGapsCount = employees.filter(
      (emp) => !emp.id_card_front_url || !emp.id_card_back_url,
    ).length;

    return { totalCount, activeCount, readinessIndex, documentedCount, monthlyPayrollCommitment, documentationGapsCount };
  }, [employees]);

  const departmentStats = useMemo(() => {
    const map = new Map<string, { total: number; active: number; documented: number }>();

    employees.forEach((emp) => {
      const dept = emp.department || "Unassigned";
      const current = map.get(dept) || { total: 0, active: 0, documented: 0 };
      current.total += 1;
      if (emp.contract_status === "Active") {
        current.active += 1;
        const isDoc =
          (emp.profile_photo_url || emp.profile_photo_url === "") &&
          emp.id_card_front_url &&
          emp.id_card_back_url;
        if (isDoc) current.documented += 1;
      }
      map.set(dept, current);
    });

    return Array.from(map.entries())
      .map(([name, stat]) => {
        const percentage = stat.active > 0 ? Math.round((stat.documented / stat.active) * 100) : 0;
        return { name, ...stat, percentage };
      })
      .sort((a, b) => b.total - a.total);
  }, [employees]);

  const exceptions = useMemo(() => {
    const missingBank = employees.filter(
      (emp) => emp.contract_status === "Active" && (!emp.bank_name || !emp.bank_account),
    );
    const missingDocs = employees.filter(
      (emp) => !emp.id_card_front_url || !emp.id_card_back_url,
    );
    const contractWarnings = employees.filter(
      (emp) => emp.contract_status !== "Active" || !emp.hire_date,
    );
    return { missingBank, missingDocs, contractWarnings };
  }, [employees]);

  const isRedacted = !canReadPayroll || manualRedaction;

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.07 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 18 } },
  };

  if (authLoading) {
    return (
      <AuthLayout>
        <div className="flex h-96 items-center justify-center">
          <p className="text-muted text-sm">{t("Loading Workforce Metrics...")}</p>
        </div>
      </AuthLayout>
    );
  }

  if (!canReadHR && !canReadPayroll) {
    return <ForbiddenState />;
  }

  // ─── Shared table head style ─────────────────────────────────────────────────
  const thCls = "p-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted";
  const tdCls = "p-3 text-[12px]";

  const tabCls = (active: boolean) =>
    [
      "flex flex-col items-start gap-0.5 px-3 py-2.5 border-b-2 text-left transition-all rounded-t-md",
      active
        ? "border-primary text-primary bg-primary/5"
        : "border-transparent text-muted hover:text-foreground hover:bg-card-alt",
    ].join(" ");

  return (
    <AuthLayout>
      <motion.div
        initial="hidden"
        animate="show"
        variants={containerVariants}
        className="page-container pt-2 md:py-2 2xl:py-8 px-3 sm:px-4 2xl:px-8 space-y-6"
      >
        {/* ── Page Header ───────────────────────────────────────────────────── */}
        <motion.header
          variants={itemVariants}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg 2xl:text-2xl font-bold text-foreground tracking-tight leading-tight">
                {t("HR Dashboard")}
              </h1>
              <p className="text-[11px] text-muted font-medium leading-tight">
                {t("Workforce & Staffing Diagnostics")}
              </p>
            </div>
          </div>

          {/* Payroll visibility toggle */}
          {canReadPayroll && (
            <button
              onClick={() => setManualRedaction(!manualRedaction)}
              className="self-start sm:self-auto flex items-center gap-2 border border-border/40 bg-card px-3.5 py-2 text-xs font-semibold rounded-lg hover:border-primary/40 hover:bg-card-alt transition-all text-foreground"
            >
              {manualRedaction ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-primary" />
                  <span>{t("Show Sensitive Data")}</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-muted" />
                  <span>{t("Redact Sensitive Data")}</span>
                </>
              )}
            </button>
          )}
        </motion.header>

        {/* ── Loading / Empty states ─────────────────────────────────────────── */}
        {queryLoading ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-muted text-sm">{t("Loading Workforce Metrics...")}</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-xl bg-card-alt text-center">
            <Users className="w-10 h-10 text-muted mb-3" />
            <h3 className="text-sm font-semibold text-foreground">{t("No employees found")}</h3>
            <p className="text-xs text-muted mt-1 max-w-sm">{t("register employees")}</p>
          </div>
        ) : (
          <>
            {/* ── KPI Metric Cards ─────────────────────────────────────────── */}
            <motion.div
              variants={itemVariants}
              className="grid gap-3 grid-cols-2 lg:grid-cols-4"
            >
              {/* Card 1: Total Workforce */}
              <div className="border border-border/40 bg-card rounded-xl p-5 flex flex-col justify-between hover:border-primary/20 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted uppercase tracking-wide">
                    {t("Total Workforce")}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-card-alt flex items-center justify-center border border-border/40">
                    <Users className="w-3.5 h-3.5 text-muted" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3
                    className="text-3xl font-bold tracking-tight text-foreground font-mono tabular-nums"
                    data-testid="total-workforce-count"
                  >
                    {stats.totalCount}
                  </h3>
                  <p className="text-[11px] text-muted mt-1">
                    {`${stats.activeCount} ${t("Active Staff")}`}
                  </p>
                </div>
              </div>

              {/* Card 2: Staffing Readiness */}
              <div className="border border-border/40 bg-card rounded-xl p-5 flex flex-col justify-between hover:border-primary/20 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted uppercase tracking-wide">
                    {t("Staffing Readiness")}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                    <FileCheck2 className="w-3.5 h-3.5 text-primary" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3
                    className="text-3xl font-bold tracking-tight text-foreground font-mono tabular-nums"
                    data-testid="readiness-index"
                  >
                    {`${stats.readinessIndex}%`}
                  </h3>
                  <p className="text-[11px] text-muted mt-1">
                    {`${stats.documentedCount} ${t("Fully Documented Crew")}`}
                  </p>
                </div>
              </div>

              {/* Card 3: Monthly Payroll */}
              <div className="border border-border/40 bg-card rounded-xl p-5 flex flex-col justify-between hover:border-primary/20 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted uppercase tracking-wide">
                    {t("Monthly Payroll Base")}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-card-alt flex items-center justify-center border border-border/40">
                    <Banknote className="w-3.5 h-3.5 text-muted" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-bold tracking-tight text-foreground font-mono tabular-nums">
                    {isRedacted
                      ? "••••••"
                      : `${stats.monthlyPayrollCommitment.toLocaleString()} ETB`}
                  </h3>
                  <p className="text-[11px] text-muted mt-1">{t("Basic Payroll Liability")}</p>
                </div>
              </div>

              {/* Card 4: Documentation Gaps */}
              <div className="border border-border/40 bg-card rounded-xl p-5 flex flex-col justify-between hover:border-danger/20 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted uppercase tracking-wide">
                    {t("Documentation Gaps")}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-danger/10 flex items-center justify-center border border-danger/20">
                    <AlertTriangle className="w-3.5 h-3.5 text-danger" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-bold tracking-tight text-foreground font-mono tabular-nums">
                    {stats.documentationGapsCount}
                  </h3>
                  <p className="text-[11px] text-muted mt-1">{t("Profiles Missing ID/Scans")}</p>
                </div>
              </div>
            </motion.div>

            {/* ── Department Breakdown ──────────────────────────────────────── */}
            <motion.div variants={itemVariants} className="grid gap-4 grid-cols-1 lg:grid-cols-3">
              {/* Left: Department list */}
              <div className="lg:col-span-2 border border-border/40 bg-card rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    {t("Department Readiness Breakdown")}
                  </h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {departmentStats.map((dept) => (
                    <div
                      key={dept.name}
                      className="border border-border/30 bg-card-alt rounded-lg p-4 space-y-2.5"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-xs font-bold text-foreground">{dept.name}</h4>
                          <span className="text-[10px] text-muted font-mono tabular-nums">
                            {dept.active} active / {dept.total} total
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-primary tabular-nums">
                          {dept.percentage}%
                        </span>
                      </div>
                      <div className="w-full bg-border/40 h-1 rounded-full overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-500"
                          style={{ width: `${dept.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Info card */}
              <div className="border border-border/40 bg-card rounded-xl p-5 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Award className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">
                    {t("Workforce Allocation Readiness")}
                  </h3>
                  <p className="text-xs text-muted leading-relaxed">{t("Staffing Index Details")}</p>
                </div>
                <div className="border-t border-border/30 pt-4 mt-5">
                  <span className="text-[10px] text-muted block uppercase tracking-wider">
                    Total Documented Crew
                  </span>
                  <span className="text-xl font-bold text-foreground font-mono tabular-nums">
                    {stats.documentedCount}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* ── Exception Center ──────────────────────────────────────────── */}
            <motion.div variants={itemVariants} className="space-y-0">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-base font-bold text-foreground tracking-tight">
                  {t("Exception Center")}
                </h2>
              </div>

              {/* Tab strip */}
              <div className="flex gap-1 border-b border-border/30">
                <button onClick={() => setActiveTab("bank")} className={tabCls(activeTab === "bank")}>
                  <span className="text-[11px] font-semibold flex items-center gap-1.5">
                    <CreditCard className="w-3 h-3" />
                    {t("Missing Bank Info")}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums opacity-60">
                    {exceptions.missingBank.length} records
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab("documents")}
                  className={tabCls(activeTab === "documents")}
                >
                  <span className="text-[11px] font-semibold flex items-center gap-1.5">
                    <UserX className="w-3 h-3" />
                    {t("Missing IDs")}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums opacity-60">
                    {exceptions.missingDocs.length} records
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab("contracts")}
                  className={tabCls(activeTab === "contracts")}
                >
                  <span className="text-[11px] font-semibold flex items-center gap-1.5">
                    <FileWarning className="w-3 h-3" />
                    {t("Contract Warnings")}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums opacity-60">
                    {exceptions.contractWarnings.length} records
                  </span>
                </button>
              </div>

              {/* Table panel */}
              <div className="border border-t-0 border-border/30 bg-card rounded-b-xl overflow-hidden">
                {/* Tab: Missing Bank Info */}
                {activeTab === "bank" &&
                  (exceptions.missingBank.length === 0 ? (
                    <div className="p-10 text-center">
                      <p className="text-xs font-semibold text-foreground">
                        {t("No exceptions found")}
                      </p>
                      <p className="text-[11px] text-muted mt-1">
                        {t("All workforce records are healthy and compliant.")}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border/30 bg-card-alt">
                            <th className={thCls}>{t("Employee")}</th>
                            <th className={thCls}>{t("ID")}</th>
                            <th className={thCls}>{t("Department")}</th>
                            <th className={thCls}>{t("Employment Type")}</th>
                            <th className={`${thCls} text-right`}>{t("Basic Salary")}</th>
                            <th className={`${thCls} text-right`}>{t("Action Required")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exceptions.missingBank.map((emp) => (
                            <tr
                              key={emp.id}
                              onClick={() => setEditingEmployee(emp)}
                              className="border-b border-border/20 hover:bg-card-alt transition-colors cursor-pointer"
                            >
                              <td className={`${tdCls} font-semibold text-foreground`}>
                                {emp.full_name}
                              </td>
                              <td className={`${tdCls} font-mono text-muted`}>{emp.employee_id}</td>
                              <td className={`${tdCls} text-muted`}>{emp.department || "—"}</td>
                              <td className={`${tdCls} text-muted`}>{emp.employment_type || "—"}</td>
                              <td className={`${tdCls} text-right font-mono tabular-nums text-foreground`}>
                                {isRedacted
                                  ? "••••••"
                                  : `${(Number(emp.base_salary) || 0).toLocaleString()} ETB`}
                              </td>
                              <td className={`${tdCls} text-right`}>
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning">
                                  {t("Upload Bank Details")}
                                  <ChevronRight className="w-3 h-3" />
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                {/* Tab: Missing IDs */}
                {activeTab === "documents" &&
                  (exceptions.missingDocs.length === 0 ? (
                    <div className="p-10 text-center">
                      <p className="text-xs font-semibold text-foreground">
                        {t("No exceptions found")}
                      </p>
                      <p className="text-[11px] text-muted mt-1">
                        {t("All workforce records are healthy and compliant.")}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border/30 bg-card-alt">
                            <th className={thCls}>{t("Employee")}</th>
                            <th className={thCls}>{t("ID")}</th>
                            <th className={thCls}>{t("Position")}</th>
                            <th className={thCls}>{t("Status")}</th>
                            <th className={`${thCls} text-right`}>{t("Action Required")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exceptions.missingDocs.map((emp) => (
                            <tr
                              key={emp.id}
                              onClick={() => setEditingEmployee(emp)}
                              className="border-b border-border/20 hover:bg-card-alt transition-colors cursor-pointer"
                            >
                              <td className={`${tdCls} font-semibold text-foreground`}>
                                {emp.full_name}
                              </td>
                              <td className={`${tdCls} font-mono text-muted`}>{emp.employee_id}</td>
                              <td className={`${tdCls} text-muted`}>{emp.position || "—"}</td>
                              <td className={tdCls}>
                                <span className="inline-flex items-center gap-1 rounded-md bg-danger/10 border border-danger/20 px-2 py-0.5 text-[10px] font-medium text-danger">
                                  Missing ID Scans
                                </span>
                              </td>
                              <td className={`${tdCls} text-right`}>
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning">
                                  {t("Upload ID Scans")}
                                  <ChevronRight className="w-3 h-3" />
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                {/* Tab: Contract Warnings */}
                {activeTab === "contracts" &&
                  (exceptions.contractWarnings.length === 0 ? (
                    <div className="p-10 text-center">
                      <p className="text-xs font-semibold text-foreground">
                        {t("No exceptions found")}
                      </p>
                      <p className="text-[11px] text-muted mt-1">
                        {t("All workforce records are healthy and compliant.")}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border/30 bg-card-alt">
                            <th className={thCls}>{t("Employee")}</th>
                            <th className={thCls}>{t("ID")}</th>
                            <th className={thCls}>{t("Status")}</th>
                            <th className={`${thCls} text-right`}>{t("Action Required")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exceptions.contractWarnings.map((emp) => (
                            <tr
                              key={emp.id}
                              onClick={() => setEditingEmployee(emp)}
                              className="border-b border-border/20 hover:bg-card-alt transition-colors cursor-pointer"
                            >
                              <td className={`${tdCls} font-semibold text-foreground`}>
                                {emp.full_name}
                              </td>
                              <td className={`${tdCls} font-mono text-muted`}>{emp.employee_id}</td>
                              <td className={tdCls}>
                                <span className="inline-flex items-center gap-1 rounded-md bg-danger/10 border border-danger/20 px-2 py-0.5 text-[10px] font-medium text-danger">
                                  {!emp.hire_date
                                    ? t("Missing hire date")
                                    : emp.contract_status === "Expired"
                                      ? t("Contract expired")
                                      : t("Contract suspended")}
                                </span>
                              </td>
                              <td className={`${tdCls} text-right`}>
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning">
                                  {t("Renew Contract")}
                                  <ChevronRight className="w-3 h-3" />
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>
            </motion.div>
          </>
        )}

        {/* ── Edit Employee Drawer ──────────────────────────────────────────── */}
        <AnimatePresence>
          {editingEmployee && (
            <EditEmployeeSheet
              employee={editingEmployee}
              onClose={() => {
                setEditingEmployee(null);
                queryClient.invalidateQueries({ queryKey: ["employees"] });
              }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </AuthLayout>
  );
}
