import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ReportSection {
  /** Optional heading rendered above the table. */
  title?: string;
  columns: string[];
  rows: (string | number)[][];
  /** Optional footer row(s), e.g. totals. */
  foot?: (string | number)[][];
  /** Per-column autoTable style overrides (e.g. right-align amounts). */
  columnStyles?: Record<number, Record<string, unknown>>;
}

export interface ReportPdfOptions {
  title: string;
  subtitle?: string;
  /** Extra centered header lines (e.g. filters applied, generated date). */
  meta?: string[];
  sections: ReportSection[];
  fileName: string;
  orientation?: "p" | "l";
  /**
   * "save" downloads the file (default). "print" opens the finished document in
   * the browser print dialog — a real print of the clean document, never a
   * screenshot of the app screen (issue #189).
   */
  output?: "save" | "print";
}

/**
 * Generate a clean, neutral, document-styled PDF (issue #152).
 *
 * The output is a plain black-on-white document — title, metadata header,
 * tabular body, and page numbers — deliberately independent of the app's
 * light/dark theme. It is NOT a screenshot of the UI.
 */
export function generateReportPdf(opts: ReportPdfOptions): void {
  const doc = new jsPDF({ orientation: opts.orientation ?? "p" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const centerX = pageWidth / 2;

  // Header — black on the default white page.
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(opts.title, centerX, 18, { align: "center" });

  let y = 25;
  if (opts.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60);
    doc.text(opts.subtitle, centerX, y, { align: "center" });
    y += 5;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  for (const line of opts.meta ?? []) {
    doc.text(line, centerX, y, { align: "center" });
    y += 4.5;
  }
  y += 4;

  for (const section of opts.sections) {
    if (section.title) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(20);
      doc.text(section.title, 14, y);
      y += 2;
    }
    autoTable(doc, {
      startY: y,
      head: [section.columns],
      body: section.rows.length > 0 ? section.rows : [["—"]],
      foot: section.foot,
      theme: "grid",
      headStyles: { fillColor: [33, 33, 33], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [25, 25, 25] },
      footStyles: { fillColor: [238, 238, 238], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [249, 249, 249] },
      columnStyles: section.columnStyles,
      margin: { left: 14, right: 14 },
    });
    const lastAutoTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (lastAutoTable?.finalY ?? y) + 8;
  }

  const pageCount = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount}`, centerX, pageHeight - 8, { align: "center" });
  }

  if (opts.output === "print") {
    // Print the generated document itself (not the app screen). autoPrint marks
    // the PDF to auto-open the print dialog; we load it into a hidden iframe so
    // no extra tab is left behind, with a windowed fallback for blocked iframes.
    doc.autoPrint();
    const blobUrl = doc.output("bloburl");
    if (typeof document !== "undefined") {
      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.src = String(blobUrl);
      document.body.appendChild(frame);
      // Leave the frame mounted long enough for the print dialog to read it.
      window.setTimeout(() => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } catch {
          window.open(String(blobUrl), "_blank");
        }
      }, 400);
    } else {
      window.open(String(blobUrl), "_blank");
    }
    return;
  }

  doc.save(opts.fileName);
}
