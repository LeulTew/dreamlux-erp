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
        toast.success("Payroll run moved to trash");
        router.push("/hr/payments");
      } else {
        toast.success(`Status updated to ${data.status}`);
      }
    },
    onError: () => {
      toast.error("Failed to update status");
    }
  });

  if (isLoading) {
    return (
      <AuthLayout>
        <div className="p-8 font-black uppercase tracking-widest text-muted-foreground animate-pulse text-center">
          Loading payroll data...
        </div>
      </AuthLayout>
    );
  }

  if (error || !run) {
    return (
      <AuthLayout>
        <div className="p-8 text-destructive font-black uppercase tracking-widest text-center">
          Error loading payroll data
        </div>
      </AuthLayout>
    );
  }

   const isH1 = run.period_start?.endsWith("-01") && run.period_end?.endsWith("-15");
  const isH2 = run.period_start?.endsWith("-16");
  const suffix = isH1 ? " (1st-15th)" : isH2 ? " (16th-End)" : "";

  const periodLabel = run.period_start && run.period_end
    ? `${format(new Date(run.period_start), "MMM yyyy")}${suffix}`
    : run.month && run.year
      ? `${format(new Date(run.year, run.month - 1), "MMMM yyyy")}${suffix}`
      : "Period not available";

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
              <h1 className="text-2xl font-black uppercase tracking-tight">Payroll Run Detail</h1>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{periodLabel}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest border ${statusColors[run.status ?? ""] ?? "bg-muted text-muted-foreground border-border"}`}>
              {run.status ?? "unknown"}
            </span>

            <div className="h-8 w-px bg-border/50 mx-2 hidden sm:block" />

            <button 
              onClick={() => setIsPrintModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 bg-primary text-on-primary rounded-2xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20"
            >
              <HiPrinter className="w-4 h-4" />
              Print PDF
            </button>

            <button 
              onClick={() => exportPayrollExcel(id)}
              className="inline-flex items-center gap-2 px-5 py-3 bg-card border border-border text-foreground rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-muted transition-all active:scale-95 shadow-sm"
            >
              <HiTableCells className="w-4 h-4 text-emerald-500" />
              Excel
            </button>

            <button 
              onClick={() => exportPayrollCSV(id)}
              className="inline-flex items-center gap-2 px-5 py-3 bg-card border border-border text-foreground rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-muted transition-all active:scale-95 shadow-sm"
            >
              <HiDocumentArrowDown className="w-4 h-4 text-amber-500" />
              CSV
            </button>

             {run.status === "FINALIZED" && (
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsFlagModalOpen(true)}
                  className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl hover:bg-amber-500/20 transition-all active:scale-90"
                  title="Flag as Wrong"
                >
                  <HiExclamationTriangle className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="p-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-xl hover:bg-rose-500/20 transition-all active:scale-90"
                  title="Move to Trash"
                >
                  <HiTrash className="w-5 h-5" />
                </button>
              </div>
            )}

            {run.status === "DRAFT" && (
              <button 
                onClick={() => setIsFinalizeModalOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
              >
                Finalize Payout
              </button>
            )}
          </div>
        </div>

        <PrintOptionsModal 
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          onPrint={(options) => router.push(`/hr/payments/${id}/report?includeImages=${options.includeImages}`)}
          title="Payroll Report"
          description="Generate a detailed PDF summary of this payroll period."
        />

        <DeleteConfirmModal 
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={() => statusMutation.mutate("TRASH")}
          title="Move to Trash"
          message="Are you sure you want to archive this payroll run? It will be moved to history trash."
          itemName={`${run?.month}/${run?.year} Run`}
          isDeleting={statusMutation.isPending}
        />

         <DeleteConfirmModal 
          isOpen={isFlagModalOpen}
          onClose={() => setIsFlagModalOpen(false)}
          onConfirm={() => statusMutation.mutate("FLAGGED_WRONG")}
          title="Flag as Incorrect"
          message="Mark this run as containing errors? This will help auditors identify discrepancies."
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
          confirmLabel="Confirm Finalization"
          title="Finalize Payroll"
          message="Lock this payroll run and mark it as active? This will finalize all payout totals for this period."
          itemName={periodLabel}
          isDeleting={statusMutation.isPending}
        />

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Paid</p>
            <p className="text-xl font-black mt-1">ETB {totalPaid.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Employees</p>
            <p className="text-xl font-black mt-1">{employeeCount}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Average Paid</p>
            <p className="text-xl font-black mt-1">ETB {avgPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="grid gap-4">
          {paginatedEmployeeLines.map((line: RunEmployeeLine) => (
            <div key={line.id} className="p-4 bg-card rounded-xl border border-border/50">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-bold tracking-wide">{line.employee_name_snapshot}</p>
                  <p className="text-xs text-muted-foreground">Base ETB {Number(line.snapshot_base_salary).toLocaleString()} • Events ETB {Number(line.total_events_value).toLocaleString()}</p>
                </div>
                <p className="font-black text-lg">ETB {Number(line.total_line_pay).toLocaleString()}</p>
              </div>

              {(line.events ?? []).length > 0 && (
                <div className="mt-3 rounded-lg border border-border/50 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest">Event</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest">Qty</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest">Unit</th>
                        <th className="text-right px-3 py-2 text-[10px] uppercase tracking-widest">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {line.events.map((eventLine: RunEventLine) => (
                        <tr key={eventLine.id} className="border-t border-border/40">
                          <td className="px-3 py-2">{eventLine.event_name ?? "Event"}</td>
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
