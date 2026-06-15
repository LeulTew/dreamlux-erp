"use client";

import Link from "next/link";
import { format } from "date-fns";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HiOutlineArrowUturnLeft, HiPrinter, HiExclamationTriangle, HiTrash, HiTableCells, HiDocumentArrowDown } from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import { getPayrollRun, exportPayrollExcel, exportPayrollCSV, updatePayrollRunStatus } from "@/lib/api";
import { useState, useMemo } from "react";
import PrintOptionsModal from "@/components/PrintOptionsModal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import PaginationControls from "@/components/PaginationControls";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/hooks/use-language";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Loading payroll data...": "Loading payroll data...",
    "Error loading payroll data": "Error loading payroll data",
    "Payroll Run Detail": "Payroll Run Detail",
    "Print PDF": "Print PDF",
    "Excel": "Excel",
    "CSV": "CSV",
    "Finalize Payout": "Finalize Payout",
    "Payroll Report": "Payroll Report",
    "Generate a detailed PDF summary of this payroll period.": "Generate a detailed PDF summary of this payroll period.",
    "Move to Trash": "Move to Trash",
    "Are you sure you want to archive this payroll run? It will be moved to history trash.": "Are you sure you want to archive this payroll run? It will be moved to history trash.",
    "Flag as Incorrect": "Flag as Incorrect",
    "Mark this run as containing errors? This will help auditors identify discrepancies.": "Mark this run as containing errors? This will help auditors identify discrepancies.",
    "Finalize Payroll": "Finalize Payroll",
    "Confirm Finalization": "Confirm Finalization",
    "Lock this payroll run and mark it as active? This will finalize all payout totals for this period.": "Lock this payroll run and mark it as active? This will finalize all payout totals for this period.",
    "Total Paid": "Total Paid",
    "Employees": "Employees",
    "Average Paid": "Average Paid",
    "Base": "Base",
    "Events Total": "Events Total",
    "Payout": "Payout",
    "Event": "Event",
    "Qty": "Qty",
    "Unit": "Unit",
    "Line Total": "Line Total",
    "Payroll run moved to trash": "Payroll run moved to trash",
    "Status updated to": "Status updated to",
    "Failed to update status": "Failed to update status",
    "FINALIZED": "FINALIZED",
    "DRAFT": "DRAFT",
    "FLAGGED_WRONG": "FLAGGED WRONG",
    "unknown": "unknown",
    "Period not available": "Period not available",
    "1st-15th": "1st-15th",
    "16th-End": "16th-End"
  },
  am: {
    "Loading payroll data...": "የክፍያ መረጃ በመጫን ላይ...",
    "Error loading payroll data": "የክፍያ መረጃን በመጫን ላይ ስህተት ተፈጥሯል",
    "Payroll Run Detail": "የክፍያ ሩጫ ዝርዝር",
    "Print PDF": "ፒዲኤፍ አትም",
    "Excel": "ኤክሴል",
    "CSV": "ሲኤስቪ",
    "Finalize Payout": "ክፍያውን አጠናቅ",
    "Payroll Report": "የክፍያ ሪፖርት",
    "Generate a detailed PDF summary of this payroll period.": "ለዚህ የክፍያ ጊዜ ዝርዝር የፒዲኤፍ ማጠቃለያ ያመንጩ።",
    "Move to Trash": "ወደ መጣያ ውሰድ",
    "Are you sure you want to archive this payroll run? It will be moved to history trash.": "ይህን የክፍያ ሩጫ በእርግጠኝነት ወደ ማህደር ማስገባት ይፈልጋሉ? ወደ ታሪክ መጣያ ይዛወራል።",
    "Flag as Incorrect": "ስህተት መሆኑን ምልክት አድርግ",
    "Mark this run as containing errors? This will help auditors identify discrepancies.": "ይህ ሩጫ ስህተቶች እንዳሉበት ምልክት ይደረግበት? ይህ ኦዲተሮች ልዩነቶችን እንዲለዩ ይረዳል።",
    "Finalize Payroll": "የክፍያ መዝገብ አጠናቅ",
    "Confirm Finalization": "ማጠናቀቅን አረጋግጥ",
    "Lock this payroll run and mark it as active? This will finalize all payout totals for this period.": "ይህን የክፍያ ሩጫ ይቆልፉ እና ንቁ መሆኑን ምልክት ያድርጉ? ይህ የዚህን ጊዜ አጠቃላይ ክፍያዎች ያጠናቅቃል።",
    "Total Paid": "በጠቅላላ የተከፈለ",
    "Employees": "ሠራተኞች",
    "Average Paid": "አማካይ የተከፈለ",
    "Base": "መሠረታዊ",
    "Events Total": "የክስተቶች ድምር",
    "Payout": "የተከፈለ ክፍያ",
    "Event": "ክስተት",
    "Qty": "ብዛት",
    "Unit": "ነጠላ",
    "Line Total": "መስመር ድምር",
    "Payroll run moved to trash": "የክፍያ ሩጫ ወደ መጣያ ተወስዷል",
    "Status updated to": "ሁኔታው ተሻሽሏል ወደ",
    "Failed to update status": "ሁኔታውን ማሻሻል አልተቻለም",
    "FINALIZED": "የተጠናቀቀ",
    "DRAFT": "ረቂቅ",
    "FLAGGED_WRONG": "ስህተት የተገኘበት",
    "unknown": "ያልታወቀ",
    "Period not available": "የክፍያ ጊዜው አልተገኘም",
    "1st-15th": "ከ1ኛ-15ኛ",
    "16th-End": "ከ16ኛ-መጨረሻ"
  }
};

type RunEventLine = {
  id: string;
  employee_line_id: string;
  event_name: string;
  quantity: number;
  price_applied: number;
  total_price_for_type: number;
};

type RunEmployeeLine = {
  id: string;
  employee_id: string;
  employee_name_snapshot: string;
  snapshot_base_salary: number;
  total_events_value: number;
  total_line_pay: number;
  events: RunEventLine[];
};

export default function PaymentRunDetailPage() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const { id } = useParams() as { id: string };
  const queryClient = useQueryClient();
  const router = useRouter();
   const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [employeePage, setEmployeePage] = useState(1);

  const statusColors: Record<string, string> = useMemo(() => ({
    FINALIZED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    DRAFT: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    FLAGGED_WRONG: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  }), []);

  const { data: run, isLoading, error } = useQuery({
    queryKey: ["payroll-run", id],
    queryFn: () => getPayrollRun(id),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "FINALIZED" | "FLAGGED_WRONG" | "TRASH") => updatePayrollRunStatus(id, status),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-run", id] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      if (data.status === "TRASH") {
        toast.success(t("Payroll run moved to trash"));
        router.push("/hr/payments");
      } else {
        toast.success(`${t("Status updated to")} ${t(data.status)}`);
      }
    },
    onError: () => {
      toast.error(t("Failed to update status"));
    }
  });

  if (isLoading) {
    return (
      <AuthLayout>
        <div className="p-8 font-black uppercase tracking-widest text-muted-foreground animate-pulse text-center">
          {t("Loading payroll data...")}
        </div>
      </AuthLayout>
    );
  }

  if (error || !run) {
    return (
      <AuthLayout>
        <div className="p-8 text-destructive font-black uppercase tracking-widest text-center">
          {t("Error loading payroll data")}
        </div>
      </AuthLayout>
    );
  }

   const isH1 = run.period_start?.endsWith("-01") && run.period_end?.endsWith("-15");
  const isH2 = run.period_start?.endsWith("-16");
  const suffix = isH1 ? ` (${t("1st-15th")})` : isH2 ? ` (${t("16th-End")})` : "";

  const periodLabel = run.period_start && run.period_end
    ? `${format(new Date(run.period_start), "MMM yyyy")}${suffix}`
    : run.month && run.year
      ? `${format(new Date(run.year, run.month - 1), "MMMM yyyy")}${suffix}`
      : t("Period not available");

  const totalPaid = Number(run.total_payroll_value ?? 0);
  const employeeCount = run.employee_lines?.length ?? 0;
  const avgPaid = employeeCount > 0 ? totalPaid / employeeCount : 0;
  const employeePageSize = 8;
  const employeeLines = run.employee_lines ?? [];
  const totalEmployeePages = Math.max(1, Math.ceil(employeeLines.length / employeePageSize));
  const paginatedEmployeeLines = employeeLines.slice((employeePage - 1) * employeePageSize, employeePage * employeePageSize);

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/hr/payments" className="text-muted-foreground hover:text-foreground transition-colors">
              <HiOutlineArrowUturnLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold uppercase tracking-tight">{t("Payroll Run Detail")}</h1>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{periodLabel}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider border ${statusColors[run.status ?? ""] ?? "bg-muted text-muted-foreground border-border"}`}>
              {t(run.status ?? "unknown")}
            </span>

            <div className="h-8 w-px bg-border/50 mx-2 hidden sm:block" />

            <button 
              onClick={() => setIsPrintModalOpen(true)}
              className="inline-flex items-center gap-2 h-10 px-4 bg-primary text-on-primary rounded-lg text-xs font-semibold hover:opacity-90 transition-all active:scale-[0.98] shadow-sm"
            >
              <HiPrinter className="w-4 h-4" />
              {t("Print PDF")}
            </button>

            <button 
              onClick={() => exportPayrollExcel(id)}
              className="inline-flex items-center gap-2 h-10 px-4 bg-card border border-border text-foreground rounded-lg text-xs font-semibold hover:bg-muted transition-all active:scale-[0.98] shadow-sm"
            >
              <HiTableCells className="w-4 h-4 text-emerald-500" />
              {t("Excel")}
            </button>

            <button 
              onClick={() => exportPayrollCSV(id)}
              className="inline-flex items-center gap-2 h-10 px-4 bg-card border border-border text-foreground rounded-lg text-xs font-semibold hover:bg-muted transition-all active:scale-[0.98] shadow-sm"
            >
              <HiDocumentArrowDown className="w-4 h-4 text-amber-500" />
              {t("CSV")}
            </button>

             {run.status === "FINALIZED" && (
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsFlagModalOpen(true)}
                  className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-all active:scale-[0.98]"
                  title={t("Flag as Wrong")}
                >
                  <HiExclamationTriangle className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="p-2.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-lg hover:bg-rose-500/20 transition-all active:scale-[0.98]"
                  title={t("Move to Trash")}
                >
                  <HiTrash className="w-5 h-5" />
                </button>
              </div>
            )}

            {run.status === "DRAFT" && (
              <button 
                onClick={() => setIsFinalizeModalOpen(true)}
                className="inline-flex items-center gap-2 h-10 px-4 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-all active:scale-[0.98] shadow-sm"
              >
                {t("Finalize Payout")}
              </button>
            )}
          </div>
        </div>

        <PrintOptionsModal 
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          onPrint={(options) => router.push(`/hr/payments/${id}/report?includeImages=${options.includeImages}`)}
          title={t("Payroll Report")}
          description={t("Generate a detailed PDF summary of this payroll period.")}
        />

        <DeleteConfirmModal 
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={() => statusMutation.mutate("TRASH")}
          title={t("Move to Trash")}
          message={t("Are you sure you want to archive this payroll run? It will be moved to history trash.")}
          itemName={`${run?.month}/${run?.year} Run`}
          isDeleting={statusMutation.isPending}
        />

         <DeleteConfirmModal 
          isOpen={isFlagModalOpen}
          onClose={() => setIsFlagModalOpen(false)}
          onConfirm={() => statusMutation.mutate("FLAGGED_WRONG")}
          title={t("Flag as Incorrect")}
          message={t("Mark this run as containing errors? This will help auditors identify discrepancies.")}
          itemName={periodLabel}
          isDeleting={statusMutation.isPending}
        />

        <DeleteConfirmModal 
          isOpen={isFinalizeModalOpen}
          onClose={() => setIsFinalizeModalOpen(false)}
          onConfirm={() => {
            statusMutation.mutate("FINALIZED");
            setIsFinalizeModalOpen(false);
          }}
          variant="primary"
          confirmLabel={t("Confirm Finalization")}
          title={t("Finalize Payroll")}
          message={t("Lock this payroll run and mark it as active? This will finalize all payout totals for this period.")}
          itemName={periodLabel}
          isDeleting={statusMutation.isPending}
        />

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("Total Paid")}</p>
            <p className="text-xl font-bold mt-1">ETB {totalPaid.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("Employees")}</p>
            <p className="text-xl font-bold mt-1">{employeeCount}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("Average Paid")}</p>
            <p className="text-xl font-bold mt-1">ETB {avgPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="grid gap-4">
          {paginatedEmployeeLines.map((line: RunEmployeeLine) => (
            <div key={line.id} className="p-4 bg-card rounded-xl border border-border/50">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-bold tracking-wide">{line.employee_name_snapshot}</p>
                  <p className="text-xs text-muted-foreground">{t("Base")} ETB {Number(line.snapshot_base_salary).toLocaleString()} • {t("Events Total")} ETB {Number(line.total_events_value).toLocaleString()}</p>
                </div>
                <p className="font-bold text-lg">ETB {Number(line.total_line_pay).toLocaleString()}</p>
              </div>

              {(line.events ?? []).length > 0 && (
                <div className="mt-3 rounded-lg border border-border/50 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest">{t("Event")}</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest">{t("Qty")}</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest">{t("Unit")}</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest">{t("Line Total")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {line.events.map((eventLine: RunEventLine) => (
                        <tr key={eventLine.id} className="border-t border-border/40">
                          <td className="px-3 py-2">{eventLine.event_name ?? t("Event")}</td>
                          <td className="px-3 py-2 text-right">{eventLine.quantity}</td>
                          <td className="px-3 py-2 text-right">ETB {Number(eventLine.price_applied).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-bold">ETB {Number(eventLine.total_price_for_type).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>

        {employeeLines.length > employeePageSize && (
          <div className="flex justify-center pt-2">
            <PaginationControls page={employeePage} totalPages={totalEmployeePages} onPageChange={setEmployeePage} />
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
