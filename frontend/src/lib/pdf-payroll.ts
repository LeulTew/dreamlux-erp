import jsPDF from "jspdf";
import "jspdf-autotable";

// Add type for jspdf-autotable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: Record<string, unknown>) => jsPDF;
  }
}

interface PayrollRun {
  id: string;
  month: number;
  year: number;
  period_start: string;
  period_end: string;
  status: string;
  total_payroll_value: number;
  employee_lines: Array<{
    employee_name_snapshot: string;
    snapshot_base_salary: number;
    total_events_value: number;
    total_line_pay: number;
  }>;
}

export const generatePayrollPDF = async (run: PayrollRun) => {
  const doc = new jsPDF();
  const isH1 = run.period_start?.endsWith("-01") && run.period_end?.endsWith("-15");
  const isH2 = run.period_start?.endsWith("-16");
  const suffix = isH1 ? " (1st-15th)" : isH2 ? " (16th-End)" : "";
  const period = `${new Date(run.year, run.month - 1).toLocaleString("default", { month: "long" })} ${run.year}${suffix}`;

  // Header
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("EL ERP - PAYROLL REPORT", 105, 20, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Period: ${period}`, 105, 28, { align: "center" });
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 33, { align: "center" });
  doc.text(`Status: ${run.status}`, 105, 38, { align: "center" });

  // Summary Table
  const tableData = run.employee_lines.map((line) => [
    line.employee_name_snapshot,
    `ETB ${Number(line.snapshot_base_salary).toLocaleString()}`,
    `ETB ${Number(line.total_events_value).toLocaleString()}`,
    `ETB ${Number(line.total_line_pay).toLocaleString()}`,
  ]);

  doc.autoTable({
    startY: 50,
    head: [["Employee", "Base Salary", "Events Total", "Total Payout"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [79, 70, 229] }, // primary color
    styles: { fontSize: 9, cellPadding: 4 },
    foot: [[
      "Grand Total",
      "",
      "",
      `ETB ${Number(run.total_payroll_value).toLocaleString()}`
    ]],
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
  });

  // Footer
  const pageCount = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount} - EL ERP Payroll System`,
      105,
      doc.internal.pageSize.height - 10,
      { align: "center" }
    );
  }

  doc.save(`payroll-${run.year}-${run.month}.pdf`);
};
