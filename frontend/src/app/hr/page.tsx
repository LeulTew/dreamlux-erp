"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import AuthLayout from "@/components/AuthLayout";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/use-language";
import ForbiddenState from "@/components/ForbiddenState";
import { getEmployees } from "@/lib/api";
import { Employee } from "@/lib/types";
import { 
  Users, 
  FileCheck2, 
  Banknote, 
  Eye, 
  EyeOff, 
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  UserX,
  CreditCard,
  FileWarning
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
    "Amharic Localization Test": "Amharic Localization Test"
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
    "Employment Type": "የየቅጥር ሁኔታ",
    "Missing hire date": "የቅጥር ቀን አልተመዘገበም",
    "Contract expired": "ውሉ ጊዜው አልፏል",
    "Contract suspended": "ውሉ ለጊዜው የታገደ",
    "Amharic Localization Test": "የአማርኛ የትርጉም ሙከራ"
  }
};

export default function HRDashboardPage() {
  const { hasPermission, isLoading: authLoading } = useAuth();
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  // Active tab inside Exception Center
  const [activeTab, setActiveTab] = useState<"bank" | "documents" | "contracts">("bank");
  // Manual redaction toggle (controlled by user override)
  const [manualRedaction, setManualRedaction] = useState<boolean>(true);

  // Gated permissions
  const canReadHR = hasPermission("hr:read") || hasPermission("hr:write");
  const canReadPayroll = hasPermission("payroll:read") || hasPermission("payroll:write");

  // Fetch employee database records (using a high limit to compute metrics)
  const { data: employeesData, isLoading: queryLoading } = useQuery<{ employees: Employee[] }>({
    queryKey: ["employees", 1, 1000],
    queryFn: () => getEmployees(1, 1000),
    enabled: canReadHR || canReadPayroll,
  });

  const employees = employeesData?.employees || [];

  // Computed workforce metrics
  const stats = useMemo(() => {
    const activeList = employees.filter(emp => emp.contract_status === "Active");
    const totalCount = employees.length;
    const activeCount = activeList.length;

    // Documentation readiness logic: Active crew members with profile photo + front ID + back ID
    const documentedCount = activeList.filter(emp => 
      (emp.profile_photo_url || emp.profile_photo_url === "") && 
      emp.id_card_front_url && 
      emp.id_card_back_url
    ).length;

    const readinessIndex = activeCount > 0 ? Math.round((documentedCount / activeCount) * 100) : 0;

    // Monthly basic payroll costs
    const monthlyPayrollCommitment = activeList.reduce((acc, curr) => acc + (Number(curr.base_salary) || 0), 0);

    // Profile documentation gaps count
    const documentationGapsCount = employees.filter(emp => 
      !emp.id_card_front_url || !emp.id_card_back_url
    ).length;

    return {
      totalCount,
      activeCount,
      readinessIndex,
      documentedCount,
      monthlyPayrollCommitment,
      documentationGapsCount
    };
  }, [employees]);

  // Exception list grouping
  const exceptions = useMemo(() => {
    const missingBank = employees.filter(emp => 
      emp.contract_status === "Active" && (!emp.bank_name || !emp.bank_account)
    );

    const missingDocs = employees.filter(emp => 
      !emp.id_card_front_url || !emp.id_card_back_url
    );

    const contractWarnings = employees.filter(emp => 
      emp.contract_status !== "Active" || !emp.hire_date
    );

    return {
      missingBank,
      missingDocs,
      contractWarnings
    };
  }, [employees]);

  // Enforce automatic redaction if user lacks payroll:read permission
  const isRedacted = !canReadPayroll || manualRedaction;

  if (authLoading) {
    return (
      <AuthLayout>
        <div className="flex h-96 items-center justify-center">
          <p className="text-muted text-sm">{t("Loading Workforce Metrics...")}</p>
        </div>
      </AuthLayout>
    );
  }

  // Permission boundary gate
  if (!canReadHR && !canReadPayroll) {
    return <ForbiddenState />;
  }

  return (
    <AuthLayout>
      <div className="space-y-8 bg-black p-6 min-h-screen text-neutral-100">
        
        {/* Header Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-900 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{t("HR Dashboard")}</h1>
            <p className="text-xs text-neutral-400 mt-1">{t("Workforce & Staffing Diagnostics")}</p>
          </div>
          
          {/* Privacy Redaction Toggle (Shown only if user has payroll credentials) */}
          {canReadPayroll && (
            <button
              onClick={() => setManualRedaction(!manualRedaction)}
              className="flex items-center gap-2 border border-neutral-800 bg-neutral-950 px-4 py-2 text-xs font-semibold rounded-2xl hover:border-gold/30 hover:bg-neutral-900 transition-all text-neutral-300"
            >
              {manualRedaction ? (
                <>
                  <Eye className="w-4 h-4 text-primary" />
                  <span>{t("Show Sensitive Data")}</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4 text-neutral-400" />
                  <span>{t("Redact Sensitive Data")}</span>
                </>
              )}
            </button>
          )}
        </div>

        {queryLoading ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-muted text-sm">{t("Loading Workforce Metrics...")}</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-neutral-800 rounded-xl bg-neutral-950/40 text-center">
            <Users className="w-12 h-12 text-neutral-600 mb-4" />
            <h3 className="text-base font-semibold text-neutral-300">{t("No employees found")}</h3>
            <p className="text-xs text-neutral-500 mt-1 max-w-sm">
              Please register employees in the database to generate staffing and payroll insights.
            </p>
          </div>
        ) : (
          <>
            {/* Workforce Key Metrics Grid */}
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
              
              {/* Card 1: Total Workforce */}
              <div className="border border-neutral-800 bg-neutral-950 p-6 rounded-xl flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-400">{t("Total Workforce")}</span>
                  <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center">
                    <Users className="w-4 h-4 text-neutral-300" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-bold tracking-tight text-white font-mono tabular-nums">
                    {stats.totalCount}
                  </h3>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    {stats.activeCount} {t("Active Staff")}
                  </p>
                </div>
              </div>

              {/* Card 2: Staffing Readiness */}
              <div className="border border-neutral-800 bg-neutral-950 p-6 rounded-xl flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-400">{t("Staffing Readiness")}</span>
                  <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center">
                    <FileCheck2 className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-bold tracking-tight text-white font-mono tabular-nums">
                    {stats.readinessIndex}%
                  </h3>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    {stats.documentedCount} {t("Fully Documented Crew")}
                  </p>
                </div>
              </div>

              {/* Card 3: Monthly Payroll Base */}
              <div className="border border-neutral-800 bg-neutral-950 p-6 rounded-xl flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-400">{t("Monthly Payroll Base")}</span>
                  <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center">
                    <Banknote className="w-4 h-4 text-neutral-300" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-bold tracking-tight text-white font-mono tabular-nums">
                    {isRedacted ? "••••••" : `${stats.monthlyPayrollCommitment.toLocaleString()} ETB`}
                  </h3>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    {t("Basic Payroll Liability")}
                  </p>
                </div>
              </div>

              {/* Card 4: Documentation Gaps */}
              <div className="border border-neutral-800 bg-neutral-950 p-6 rounded-xl flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-400">{t("Documentation Gaps")}</span>
                  <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-bold tracking-tight text-white font-mono tabular-nums">
                    {stats.documentationGapsCount}
                  </h3>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    {t("Profiles Missing ID/Scans")}
                  </p>
                </div>
              </div>

            </div>

            {/* Documentation Readiness Alert Banner */}
            <div className="border border-neutral-800 bg-neutral-950 p-4 rounded-xl flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-primary shrink-0" />
              <p className="text-xs text-neutral-400">
                <span className="font-semibold text-white">{t("Staffing Readiness")}: </span>
                {t("Staffing Index Details")}
              </p>
            </div>

            {/* Exception Management Center */}
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-white tracking-tight">{t("Exception Center")}</h2>
              
              {/* Tab Selection Cards */}
              <div className="grid grid-cols-3 gap-4 border-b border-neutral-900 pb-1">
                
                {/* Tab 1: Missing Bank Info */}
                <button
                  onClick={() => setActiveTab("bank")}
                  className={`flex flex-col items-start gap-1 p-3 border-b-2 text-left transition-all ${
                    activeTab === "bank" 
                      ? "border-primary text-primary bg-neutral-950/20" 
                      : "border-transparent text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    {t("Missing Bank Info")}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono tabular-nums">
                    {exceptions.missingBank.length} records
                  </span>
                </button>

                {/* Tab 2: Missing IDs */}
                <button
                  onClick={() => setActiveTab("documents")}
                  className={`flex flex-col items-start gap-1 p-3 border-b-2 text-left transition-all ${
                    activeTab === "documents" 
                      ? "border-primary text-primary bg-neutral-950/20" 
                      : "border-transparent text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <UserX className="w-3.5 h-3.5" />
                    {t("Missing IDs")}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono tabular-nums">
                    {exceptions.missingDocs.length} records
                  </span>
                </button>

                {/* Tab 3: Contract Warnings */}
                <button
                  onClick={() => setActiveTab("contracts")}
                  className={`flex flex-col items-start gap-1 p-3 border-b-2 text-left transition-all ${
                    activeTab === "contracts" 
                      ? "border-primary text-primary bg-neutral-950/20" 
                      : "border-transparent text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <FileWarning className="w-3.5 h-3.5" />
                    {t("Contract Warnings")}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono tabular-nums">
                    {exceptions.contractWarnings.length} records
                  </span>
                </button>

              </div>

              {/* Exception Details Table */}
              <div className="border border-neutral-800 bg-neutral-950 rounded-xl overflow-hidden">
                
                {/* Active Tab: Missing Bank Info */}
                {activeTab === "bank" && (
                  exceptions.missingBank.length === 0 ? (
                    <div className="p-12 text-center text-neutral-500">
                      <p className="text-xs font-semibold text-neutral-400">{t("No exceptions found")}</p>
                      <p className="text-[11px] text-neutral-600 mt-1">{t("All workforce records are healthy and compliant.")}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-neutral-900 bg-neutral-900/30 text-neutral-400">
                            <th className="p-4">{t("Employee")}</th>
                            <th className="p-4">{t("ID")}</th>
                            <th className="p-4">{t("Department")}</th>
                            <th className="p-4">{t("Employment Type")}</th>
                            <th className="p-4 text-right">{t("Basic Salary")}</th>
                            <th className="p-4 text-right">{t("Action Required")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exceptions.missingBank.map((emp) => (
                            <tr key={emp.id} className="border-b border-neutral-900 hover:bg-neutral-900/10">
                              <td className="p-4 font-semibold text-white">{emp.full_name}</td>
                              <td className="p-4 font-mono text-neutral-400">{emp.employee_id}</td>
                              <td className="p-4 text-neutral-400">{emp.department || "—"}</td>
                              <td className="p-4 text-neutral-400">{emp.employment_type || "—"}</td>
                              <td className="p-4 text-right font-mono tabular-nums text-white">
                                {isRedacted ? "••••••" : `${(Number(emp.base_salary) || 0).toLocaleString()} ETB`}
                              </td>
                              <td className="p-4 text-right">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500">
                                  {t("Upload Bank Details")}
                                  <ChevronRight className="w-3 h-3" />
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {/* Active Tab: Missing IDs */}
                {activeTab === "documents" && (
                  exceptions.missingDocs.length === 0 ? (
                    <div className="p-12 text-center text-neutral-500">
                      <p className="text-xs font-semibold text-neutral-400">{t("No exceptions found")}</p>
                      <p className="text-[11px] text-neutral-600 mt-1">{t("All workforce records are healthy and compliant.")}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-neutral-900 bg-neutral-900/30 text-neutral-400">
                            <th className="p-4">{t("Employee")}</th>
                            <th className="p-4">{t("ID")}</th>
                            <th className="p-4">{t("Position")}</th>
                            <th className="p-4">{t("Status")}</th>
                            <th className="p-4 text-right">{t("Action Required")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exceptions.missingDocs.map((emp) => (
                            <tr key={emp.id} className="border-b border-neutral-900 hover:bg-neutral-900/10">
                              <td className="p-4 font-semibold text-white">{emp.full_name}</td>
                              <td className="p-4 font-mono text-neutral-400">{emp.employee_id}</td>
                              <td className="p-4 text-neutral-400">{emp.position || "—"}</td>
                              <td className="p-4">
                                <span className="inline-flex items-center gap-1 rounded bg-red-950/50 border border-red-900 px-2 py-0.5 text-[10px] font-medium text-red-400">
                                  Missing ID Scans
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500">
                                  {t("Upload ID Scans")}
                                  <ChevronRight className="w-3 h-3" />
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {/* Active Tab: Contract Warnings */}
                {activeTab === "contracts" && (
                  exceptions.contractWarnings.length === 0 ? (
                    <div className="p-12 text-center text-neutral-500">
                      <p className="text-xs font-semibold text-neutral-400">{t("No exceptions found")}</p>
                      <p className="text-[11px] text-neutral-600 mt-1">{t("All workforce records are healthy and compliant.")}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-neutral-900 bg-neutral-900/30 text-neutral-400">
                            <th className="p-4">{t("Employee")}</th>
                            <th className="p-4">{t("ID")}</th>
                            <th className="p-4">{t("Status")}</th>
                            <th className="p-4 text-right">{t("Action Required")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exceptions.contractWarnings.map((emp) => (
                            <tr key={emp.id} className="border-b border-neutral-900 hover:bg-neutral-900/10">
                              <td className="p-4 font-semibold text-white">{emp.full_name}</td>
                              <td className="p-4 font-mono text-neutral-400">{emp.employee_id}</td>
                              <td className="p-4">
                                <span className="inline-flex items-center gap-1 rounded bg-red-950/50 border border-red-900 px-2 py-0.5 text-[10px] font-medium text-red-400">
                                  {!emp.hire_date ? t("Missing hire date") : (emp.contract_status === "Expired" ? t("Contract expired") : t("Contract suspended"))}
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500">
                                  {t("Renew Contract")}
                                  <ChevronRight className="w-3 h-3" />
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

              </div>
            </div>
          </>
        )}

      </div>
    </AuthLayout>
  );
}
