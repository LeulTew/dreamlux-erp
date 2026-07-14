"use client";

import { useState } from "react";
import { HiXMark, HiDocumentArrowDown, HiCheck } from "react-icons/hi2";
import { generateReportPdf, type ReportSection } from "@/lib/pdf-report";

export interface PdfColumn {
  key: string;
  label: string;
  /** Included by default. */
  default?: boolean;
  /** Right-align numeric columns in the PDF. */
  align?: "left" | "right";
}

export interface PdfExportModalProps {
  open: boolean;
  onClose: () => void;
  /** Document title (fixed, shown in the PDF header). */
  title: string;
  subtitle?: string;
  /** Centered metadata lines under the title (generated date, filters, etc.). */
  meta?: string[];
  columns: PdfColumn[];
  /** Build the table rows for the chosen column keys, in the same order. */
  buildRows: (selectedKeys: string[]) => (string | number)[][];
  /** Optional footer/totals row for the chosen columns. */
  buildFoot?: (selectedKeys: string[]) => (string | number)[][];
  fileName: string;
  defaultOrientation?: "p" | "l";
  /** Translation helper (falls back to the key). */
  t?: (key: string) => string;
}

/**
 * Clutter-free PDF export dialog (issue #152 follow-up): pick which columns to
 * include and page orientation, then download a clean, neutral document.
 * Deliberately minimal — no decorative styling — usable by non-technical staff.
 */
export default function PdfExportModal({
  open,
  onClose,
  title,
  subtitle,
  meta,
  columns,
  buildRows,
  buildFoot,
  fileName,
  defaultOrientation = "p",
  t = (k) => k,
}: PdfExportModalProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.default !== false).map((c) => c.key)),
  );
  const [orientation, setOrientation] = useState<"p" | "l">(defaultOrientation);

  if (!open) return null;

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const orderedKeys = columns.filter((c) => selected.has(c.key)).map((c) => c.key);

  const handleExport = () => {
    if (orderedKeys.length === 0) return;
    const cols = columns.filter((c) => selected.has(c.key));
    const columnStyles: Record<number, Record<string, unknown>> = {};
    cols.forEach((c, i) => {
      if (c.align === "right") columnStyles[i] = { halign: "right" };
    });
    const section: ReportSection = {
      columns: cols.map((c) => c.label),
      rows: buildRows(orderedKeys),
      foot: buildFoot?.(orderedKeys),
      columnStyles,
    };
    generateReportPdf({ title, subtitle, meta, sections: [section], fileName, orientation });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("Export PDF")}
    >
      <div
        className="w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-foreground">{t("Export PDF")}</h2>
          <button type="button" onClick={onClose} aria-label={t("Close")} className="p-1.5 rounded-lg text-muted-foreground [@media(hover:hover)]:hover:bg-card-alt">
            <HiXMark className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs font-semibold text-muted-foreground mb-2">{t("Columns to include")}</p>
        <div className="flex flex-wrap gap-2 mb-5">
          {columns.map((c) => {
            const on = selected.has(c.key);
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggle(c.key)}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                  on
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-card-alt border-border text-muted-foreground [@media(hover:hover)]:hover:text-foreground"
                }`}
              >
                {on && <HiCheck className="w-3.5 h-3.5" />}
                {c.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs font-semibold text-muted-foreground mb-2">{t("Orientation")}</p>
        <div className="flex gap-2 mb-6">
          {(["p", "l"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOrientation(o)}
              className={`flex-1 h-10 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors ${
                orientation === o
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-card-alt border-border text-muted-foreground [@media(hover:hover)]:hover:text-foreground"
              }`}
            >
              {o === "p" ? t("Portrait") : t("Landscape")} · A4
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="h-11 px-4 rounded-xl text-sm font-semibold text-foreground bg-card-alt border border-border/60 [@media(hover:hover)]:hover:bg-border/40 transition-colors">
            {t("Cancel")}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={orderedKeys.length === 0}
            className="h-11 px-5 rounded-xl text-xs font-black uppercase tracking-wider bg-primary text-primary-foreground [&_svg]:text-primary-foreground [@media(hover:hover)]:hover:bg-primary-dark transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <HiDocumentArrowDown className="w-4 h-4" />
            {t("Download PDF")}
          </button>
        </div>
      </div>
    </div>
  );
}
