"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/hooks/use-language";
import { previewPayrollRun } from "@/lib/api";
import { extractPayrollHttpError } from "@/lib/payroll-error";
import { InvalidPayrollPreviewError, parsePayrollPreview, type PayrollPreview, type PayrollPreviewPeriodKind, type PayrollPreviewRequest } from "@/lib/payroll-preview";

const amharic: Record<string, string> = {
  "Payroll preview": "የክፍያ ቅድመ እይታ",
  "Read-only server calculation. Preview does not save or finalize payroll.": "ይህ የአገልጋዩ ስሌት ቅድመ እይታ ብቻ ነው። ቅድመ እይታ ክፍያን አያስቀምጥም ወይም አያጠናቅቅም።",
  "Requested period": "የተጠየቀው የጊዜ ክልል",
  "Calculated period": "የተሰላው የጊዜ ክልል",
  "Weekly": "ሳምንታዊ",
  "Half month": "የግማሽ ወር",
  "Full month": "ሙሉ ወር",
  "Custom range": "የተመረጠ የጊዜ ክልል",
  "The server used a different period from the setup. Review the dates before saving.": "አገልጋዩ ከዝግጅቱ የተለየ የጊዜ ክልል ተጠቅሟል። ከማስቀመጥዎ በፊት ቀኖቹን ያረጋግጡ።",
  "Calculated total": "የተሰላ ጠቅላላ ክፍያ",
  "Base salaries": "መሠረታዊ ደመወዞች",
  "Verified commissions": "የተረጋገጡ ኮሚሽኖች",
  "Employees returned by the server": "ከአገልጋዩ የተመለሱ ሰራተኞች",
  "Employee": "ሰራተኛ",
  "Employee amounts": "የሰራተኞች ክፍያ መጠኖች",
  "Employee pages": "የሰራተኞች ገጾች",
  "Record ID": "የመዝገብ መለያ",
  "Payroll read permission is required to view this preview.": "ይህን ቅድመ እይታ ለማየት የክፍያ ንባብ ፈቃድ ያስፈልጋል።",
  "Base": "መሠረታዊ",
  "Commission": "ኮሚሽን",
  "Total": "ጠቅላላ",
  "Commission only": "ኮሚሽን ብቻ",
  "Regular": "መደበኛ",
  "No employees were returned for this preview.": "ለዚህ ቅድመ እይታ ምንም ሰራተኞች አልተመለሱም።",
  "Calculating payroll preview...": "የክፍያ ቅድመ እይታ በመስላት ላይ...",
  "Unable to load payroll preview. Your setup is unchanged.": "የክፍያ ቅድመ እይታን መጫን አልተቻለም። ዝግጅትዎ አልተለወጠም።",
  "The preview response could not be verified. Try again.": "የቅድመ እይታውን ምላሽ ማረጋገጥ አልተቻለም። እንደገና ይሞክሩ።",
  "Retry preview": "ቅድመ እይታን እንደገና ሞክር",
  "Refresh preview": "ቅድመ እይታን አድስ",
  "Close preview": "ቅድመ እይታን ዝጋ",
  "Previous employees": "ያለፉት ሰራተኞች",
  "Next employees": "ቀጣይ ሰራተኞች",
  "Page": "ገጽ",
  "Saving or finalizing recalculates current data. This preview is not an approval or a saved payroll run.": "ሲያስቀምጡ ወይም ሲያጠናቅቁ የአሁኑ መረጃ እንደገና ይሰላል። ይህ ቅድመ እይታ ማጽደቅ ወይም የተቀመጠ ክፍያ አይደለም።",
};

const periodLabels: Record<PayrollPreviewPeriodKind, string> = {
  weekly: "Weekly", half_month: "Half month", month: "Full month", range: "Custom range",
};
const buttonClass = "inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-border bg-card-alt px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

function PreviewResult({ preview, t, lang, isMobile }: { preview: PayrollPreview; t: (text: string) => string; lang: string; isMobile: boolean }) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(preview.employee_lines.length / pageSize));
  const lines = preview.employee_lines.slice((page - 1) * pageSize, page * pageSize);
  const format = new Intl.NumberFormat(lang === "am" ? "am-ET" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amounts = [
    { label: "Calculated total", value: preview.total_payroll_value },
    { label: "Base salaries", value: preview.base_total },
    { label: "Verified commissions", value: preview.commission_total },
  ];
  return (
    <div className="min-w-0 space-y-5">
      <div className="grid gap-4 border-b border-border pb-4 sm:grid-cols-3">
        {amounts.map(({ label, value }) => (
          <div key={label} className="min-w-0">
            <p className="break-words text-3xl font-bold tracking-tight tabular-nums">{format.format(value)} <span className="text-sm">ETB</span></p>
            <p className="mt-0.5 text-xs font-medium leading-tight text-muted-foreground">{t(label)}</p>
          </div>
        ))}
      </div>
      <p className="text-sm">{t("Employees returned by the server")}: <strong className="tabular-nums">{preview.employee_lines.length}</strong></p>
      {preview.employee_lines.length === 0 ? (
        <p role="status" className="rounded-xl border border-border p-4 text-sm">{t("No employees were returned for this preview.")}</p>
      ) : (
        <>
          {isMobile ? (
            <ul aria-label={t("Employee amounts")} className="divide-y divide-border rounded-xl border border-border">
              {lines.map((line) => (
                <li key={line.employee_id} className="min-w-0 space-y-3 p-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold">{line.employee_name_snapshot}</p>
                    <p className="break-all font-mono text-xs">
                      {line.employee_code_snapshot ?? `${t("Record ID")}: ${line.employee_id}`}
                    </p>
                    <p className="text-xs text-muted-foreground">{t(line.compensation_mode_snapshot === "commission_only" ? "Commission only" : "Regular")}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Base", value: line.snapshot_base_salary },
                      { label: "Commission", value: line.total_events_value },
                      { label: "Total", value: line.total_line_pay },
                    ].map(({ label, value }) => (
                      <div key={label} className="min-w-0 text-right">
                        <p className="break-all text-sm font-semibold tabular-nums">{format.format(value)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t(label)} (ETB)</p>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border focus-visible:outline-2 focus-visible:outline-foreground" tabIndex={0} role="region" aria-label={t("Payroll preview")}>
              <table aria-label={t("Employee amounts")} className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead className="border-b border-border bg-card-alt">
                  <tr>
                    <th scope="col" className="px-3 py-3 font-semibold">{t("Employee")}</th>
                    {["Base", "Commission", "Total"].map((label) => (
                      <th scope="col" key={label} className="whitespace-nowrap px-3 py-3 text-right font-semibold">{t(label)} (ETB)</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.employee_id} className="border-b border-border last:border-0">
                      <th scope="row" className="max-w-[240px] px-3 py-3 font-medium">
                        <span className="block truncate" title={line.employee_name_snapshot}>{line.employee_name_snapshot}</span>
                        <span className="block truncate font-mono text-xs" title={line.employee_code_snapshot ?? line.employee_id}>
                          {line.employee_code_snapshot ?? `${t("Record ID")}: ${line.employee_id}`}
                        </span>
                        <span className="block text-xs text-muted-foreground">{t(line.compensation_mode_snapshot === "commission_only" ? "Commission only" : "Regular")}</span>
                      </th>
                      {[line.snapshot_base_salary, line.total_events_value, line.total_line_pay].map((amount, index) => (
                        <td key={index} className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{format.format(amount)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav aria-label={t("Employee pages")} className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className={buttonClass} onClick={() => setPage((value) => value - 1)} disabled={page <= 1}>{t("Previous employees")}</button>
            <span aria-live="polite" className="text-sm tabular-nums">{t("Page")} {page} / {pages}</span>
            <button type="button" className={buttonClass} onClick={() => setPage((value) => value + 1)} disabled={page >= pages}>{t("Next employees")}</button>
          </nav>
        </>
      )}
    </div>
  );
}

export default function PayrollPreviewSheet({ request, canRead, onClose, restoreFocus }: {
  request: PayrollPreviewRequest;
  canRead: boolean;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const { lang } = useLanguage();
  const t = (text: string) => lang === "am" ? amharic[text] ?? text : text;
  const isMobile = useIsMobile();
  const swipeStart = useRef<number | null>(null);
  const preview = useQuery({
    queryKey: ["payroll-preview", request.userId, request.sequence, request.contextKey, request.payload],
    queryFn: async ({ signal }) => {
      const response = await previewPayrollRun({ ...request.payload }, { signal, timeout: 30_000 });
      signal.throwIfAborted();
      return parsePayrollPreview(response);
    },
    enabled: canRead,
    retry: false,
    retryOnMount: false,
    gcTime: 0,
    networkMode: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
  useEffect(() => { if (!canRead) onClose(); }, [canRead, onClose]);
  const loading = preview.isPending || preview.isFetching;
  const result = canRead && !loading && !preview.isError ? preview.data : undefined;
  const httpError = extractPayrollHttpError(preview.error);
  const error = preview.error instanceof InvalidPayrollPreviewError
    ? t("The preview response could not be verified. Try again.")
    : httpError.status === 403
      ? t("Payroll read permission is required to view this preview.")
      : httpError.message ?? t("Unable to load payroll preview. Your setup is unchanged.");
  const requestedPeriod = `${request.periodStart} – ${request.periodEnd} (${t(periodLabels[request.periodKind])})`;

  return (
    <Sheet open={canRead} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        showCloseButton={false}
        onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}
        className="max-h-[90dvh] gap-0 bg-card text-foreground shadow-none data-[side=bottom]:h-[90dvh] data-[side=bottom]:rounded-t-xl data-[side=right]:h-dvh data-[side=right]:max-h-dvh data-[side=right]:w-full data-[side=right]:sm:max-w-3xl data-[state=open]:motion-reduce:animate-none data-[state=closed]:motion-reduce:animate-none motion-reduce:transition-none"
      >
        {isMobile && (
          <div data-slot="payroll-preview-handle" aria-hidden="true" className="flex h-12 shrink-0 touch-none items-center justify-center"
            onPointerDown={(event) => { swipeStart.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerUp={(event) => { if (swipeStart.current !== null && event.clientY - swipeStart.current > 64) onClose(); swipeStart.current = null; }}
            onPointerCancel={() => { swipeStart.current = null; }}>
            <span className="h-1 w-8 rounded-full bg-border" />
          </div>
        )}
        <SheetHeader className="shrink-0 border-b border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <SheetTitle className="text-xl font-semibold">{t("Payroll preview")}</SheetTitle>
              <SheetDescription>{t("Read-only server calculation. Preview does not save or finalize payroll.")}</SheetDescription>
            </div>
            <SheetClose asChild><button type="button" className={`${buttonClass} shrink-0 px-3`} aria-label={t("Close preview")}><X aria-hidden="true" className="size-5 text-foreground" /></button></SheetClose>
          </div>
          <p className="mt-2 text-sm tabular-nums">
            {t(result ? "Calculated period" : "Requested period")}:{" "}
            {result ? `${result.period_start} – ${result.period_end} (${t(periodLabels[result.period_kind])})` : requestedPeriod}
          </p>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {!canRead ? null : loading ? (
            <div className="min-h-48 space-y-4" role="status">
              <p className="text-sm">{t("Calculating payroll preview...")}</p>
              <div aria-hidden="true" className="h-24 rounded-xl bg-card-alt" />
            </div>
          ) : preview.isError ? (
            <div role="alert" className="space-y-3 rounded-xl border border-destructive/40 p-4 text-sm">
              <p>{error}</p>
              <button type="button" className={buttonClass} onClick={() => void preview.refetch()}>{t("Retry preview")}</button>
            </div>
          ) : result ? (
            <>
              {(result.period_start !== request.periodStart || result.period_end !== request.periodEnd || result.period_kind !== request.periodKind) && (
                <div role="status" className="space-y-1 rounded-xl border border-border bg-card-alt p-3 text-sm">
                  <p>{t("The server used a different period from the setup. Review the dates before saving.")}</p>
                  <p className="tabular-nums">{t("Requested period")}: {requestedPeriod}</p>
                </div>
              )}
              <PreviewResult preview={result} t={t} lang={lang} isMobile={isMobile} />
            </>
          ) : (
            <p role="alert" className="text-sm">{t("The preview response could not be verified. Try again.")}</p>
          )}
          <p className="text-sm text-muted-foreground">{t("Saving or finalizing recalculates current data. This preview is not an approval or a saved payroll run.")}</p>
        </div>
        <SheetFooter className="shrink-0 flex-row flex-wrap justify-end gap-2 border-t border-border bg-card p-4">
          {canRead && !preview.isError && <button type="button" className={buttonClass} disabled={loading} onClick={() => void preview.refetch()}>{t("Refresh preview")}</button>}
          <SheetClose asChild><button type="button" className={buttonClass}>{t("Close preview")}</button></SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
