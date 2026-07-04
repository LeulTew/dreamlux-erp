"use client";

import { useState, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  HiOutlineDocumentArrowUp,
  HiOutlineExclamationTriangle,
  HiOutlineCheckCircle,
  HiArrowPath,
  HiXMark,
  HiCheck,
} from "react-icons/hi2";
import AuthLayout from "@/components/AuthLayout";
import ForbiddenState from "@/components/ForbiddenState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Select from "@/components/ui/Select";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/useAuth";
import {
  getEvents,
  previewHisabImport,
  commitHisabImport,
} from "@/lib/api";
import {
  HisabImportCommitPayload,
  HisabImportCommitResult,
  HisabImportFormulaMismatch,
  HisabImportPreview,
  HisabImportResolution,
  HisabImportRow,
} from "@/lib/types";
import toast from "@/lib/toast";

type ImportEventLookup = {
  id: string;
  name: string;
  event_id_display?: string | null;
};

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const maybeResponse = err as { response?: { data?: { error?: unknown } }; message?: unknown };
    if (typeof maybeResponse.response?.data?.error === "string") return maybeResponse.response.data.error;
    if (typeof maybeResponse.message === "string") return maybeResponse.message;
  }
  return fallback;
}

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Hisab Workbook Import": "Hisab Workbook Import",
    "Upload a legacy Hisab Excel workbook (.xlsx) to parse, reconcile, and import weekly event expenses, overheads, operational expenses, and capital investments.":
      "Upload a legacy Hisab Excel workbook (.xlsx) to parse, reconcile, and import weekly event expenses, overheads, operational expenses, and capital investments.",
    "Select Workbook": "Select Workbook",
    "Drag and drop your .xlsx workbook here, or click to browse":
      "Drag and drop your .xlsx workbook here, or click to browse",
    "Only .xlsx Excel files are supported.": "Only .xlsx Excel files are supported.",
    "Previewing workbook...": "Previewing workbook...",
    "Import Preview Summary": "Import Preview Summary",
    "Duplicate Workbook Warning": "Duplicate Workbook Warning",
    "This workbook has already been committed and imported on":
      "This workbook has already been committed and imported on",
    "Formula Total Mismatches": "Formula Total Mismatches",
    "Expected Total": "Expected Total",
    "Actual Total": "Actual Total",
    "I have reviewed and accept these formula total mismatches":
      "I have reviewed and accept these formula total mismatches",
    "Blocking Errors": "Blocking Errors",
    "Warnings": "Warnings",
    "Resolve Unmatched Items": "Resolve Unmatched Items",
    "Choose Event": "Choose Event",
    "Choose Category": "Choose Category",
    "Parsed Rows": "Parsed Rows",
    "Commit Import": "Commit Import",
    "Commit successful!": "Commit successful!",
    "Successfully imported:": "Successfully imported:",
    "Event Expenses": "Event Expenses",
    "Operational Expenses": "Operational Expenses",
    "Overheads": "Overheads",
    "Capital Investments": "Capital Investments",
    "Total Rows": "Total Rows",
    "Total Amount": "Total Amount",
    "Workbook Hash": "Workbook Hash",
    "Sheet": "Sheet",
    "Row": "Row",
    "Date": "Date",
    "Description": "Description",
    "Amount": "Amount",
    "Resolved Event / Category": "Resolved Event / Category",
    "Type": "Type",
    "Clear": "Clear",
  },
  am: {
    "Hisab Workbook Import": "የሂሳብ ዎርክቡክ ማስገቢያ",
    "Upload a legacy Hisab Excel workbook (.xlsx) to parse, reconcile, and import weekly event expenses, overheads, operational expenses, and capital investments.":
      "ሳምንታዊ የዝግጅት ወጪዎችን፣ የትርፍ ወጪዎችን፣ የሥራ ማስኬጃ ወጪዎችን እና የካፒታል ኢንቨስትመንቶችን ለመተንተን፣ ለማስታረቅ እና ለማስገባት የቆየ የሂሳብ ኤክሴል ዎርክቡክ (.xlsx) ይጫኑ።",
    "Select Workbook": "ዎርክቡክ ይምረጡ",
    "Drag and drop your .xlsx workbook here, or click to browse":
      "የ .xlsx ዎርክቡክዎን እዚህ ይጎትቱ እና ይጣሉ፣ ወይም ለመፈለግ ጠቅ ያድርጉ",
    "Only .xlsx Excel files are supported.": "የ .xlsx ኤክሴል ፋይሎች ብቻ ይደገፋሉ።",
    "Previewing workbook...": "ዎርክቡክን በመገምገም ላይ...",
    "Import Preview Summary": "የማስገቢያ ቅድመ እይታ ማጠቃለያ",
    "Duplicate Workbook Warning": "የተደገመ ዎርክቡክ ማስጠንቀቂያ",
    "This workbook has already been committed and imported on":
      "ይህ ዎርክቡክ አስቀድሞ ገብቶ ተመዝግቧል ቀን፡",
    "Formula Total Mismatches": "የፎርሙላ ጠቅላላ አለመመጣጠን",
    "Expected Total": "የሚጠበቀው ድምር",
    "Actual Total": "ትክክለኛው ድምር",
    "I have reviewed and accept these formula total mismatches":
      "እነዚህን የፎርሙላ ጠቅላላ አለመመጣጠኖች ገምግሜያለሁ እና እቀበላለሁ",
    "Blocking Errors": "ገዳቢ ስህተቶች",
    "Warnings": "ማስጠንቀቂያዎች",
    "Resolve Unmatched Items": "ያልተዛመዱ ነገሮችን ይፍቱ",
    "Choose Event": "ዝግጅት ይምረጡ",
    "Choose Category": "ምድብ ይምረጡ",
    "Parsed Rows": "የተተነተኑ ረድፎች",
    "Commit Import": "ማስገቢያውን አጽድቅ",
    "Commit successful!": "በተሳካ ሁኔታ ገብቷል!",
    "Successfully imported:": "በተሳካ ሁኔታ የገቡት፡",
    "Event Expenses": "የዝግጅት ወጪዎች",
    "Operational Expenses": "የሥራ ማስኬጃ ወጪዎች",
    "Overheads": "የቋሚ ወጪዎች (Overheads)",
    "Capital Investments": "የካፒታል ኢንቨስትመንቶች",
    "Total Rows": "ጠቅላላ ረድፎች",
    "Total Amount": "ጠቅላላ መጠን",
    "Workbook Hash": "የዎርክቡክ ሃሽ",
    "Sheet": "ሺት (Sheet)",
    "Row": "ረድፍ",
    "Date": "ቀን",
    "Description": "መግለጫ",
    "Amount": "መጠን",
    "Resolved Event / Category": "የተፈታ ዝግጅት / ምድብ",
    "Type": "አይነት",
    "Clear": "አጽዳ",
  },
};

const OPEX_CATEGORIES = [
  "Transport",
  "Rental",
  "Labour",
  "Office Lunch",
  "Lunch",
  "Utilities",
  "Supplies",
  "Maintenance",
  "Other",
];

const OVERHEAD_CATEGORIES = [
  "Salary",
  "Fuel",
  "Car Rental",
  "Office Rent",
  "Store Rent",
  "Wifi",
  "Water & Electric",
  "Marketing/Boost",
  "Sticker",
  "Seasonal/Ekub",
  "Food",
  "House Expense",
  "Supplies",
  "Other",
];

const CAPEX_CATEGORIES = [
  "Equipment",
  "Fabric",
  "Fixtures",
  "Hardware",
  "Vehicle",
  "Store Buildout",
  "Office Equipment",
  "Other",
];

export default function HisabImportPage() {
  const { lang } = useLanguage();
  const t = (key: string): string => {
    const currentLang = lang === "am" || lang === "en" ? lang : "en";
    return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS.en?.[key] || key;
  };

  const { hasPermission, isLoading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<HisabImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [acceptMismatches, setAcceptMismatches] = useState(false);

  // Resolution maps: keyed by row.id
  const [eventResolutions, setEventResolutions] = useState<Record<string, { eventId: string; eventName: string }>>({});
  const [categoryResolutions, setCategoryResolutions] = useState<Record<string, string>>({});
  const [isCommitPending, setIsCommitPending] = useState(false);
  const [commitResult, setCommitResult] = useState<HisabImportCommitResult | null>(null);

  // Fetch active events for lookup dropdown
  const { data: eventsData } = useQuery({
    queryKey: ["import-events-lookup"],
    queryFn: () => getEvents(1, 100),
    staleTime: 60000,
  });

  const activeEvents = (eventsData?.events || []) as ImportEventLookup[];
  const eventSelectOptions = activeEvents.map((evt) => ({
    id: evt.id,
    label: `${evt.name} (${evt.event_id_display || evt.id.slice(0, 8)})`,
  }));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    await processFile(selected);
  };

  const processFile = async (selected: File) => {
    setFile(selected);
    setPreviewData(null);
    setCommitResult(null);
    setEventResolutions({});
    setCategoryResolutions({});
    setAcceptMismatches(false);
    setPreviewLoading(true);

    try {
      const data = await previewHisabImport(selected);
      setPreviewData(data);
      toast.success("Workbook parsed successfully");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to parse workbook"));
      setFile(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const selected = e.dataTransfer.files?.[0];
    if (selected) {
      if (!/\.xlsx$/i.test(selected.name)) {
        toast.error("Only .xlsx Excel files are supported");
        return;
      }
      await processFile(selected);
    }
  };

  const handleCommit = async () => {
    if (!previewData) return;
    setIsCommitPending(true);

    const payload: HisabImportCommitPayload = {
      workbookHash: previewData.workbookHash,
      sourceFilename: file?.name || null,
      acceptFormulaMismatches: acceptMismatches,
      preview: {
        workbookHash: previewData.workbookHash,
        sourceFilename: previewData.sourceFilename || null,
        layoutVersion: previewData.layoutVersion,
        knownSheets: previewData.knownSheets,
        missingSheets: previewData.missingSheets,
        rows: previewData.rows,
        unmatched: previewData.unmatched,
        formulaMismatches: previewData.formulaMismatches,
        blockingErrors: previewData.blockingErrors,
        warnings: previewData.warnings,
        summary: previewData.summary,
      },
      resolutions: {
        events: eventResolutions,
        categories: categoryResolutions,
      },
    };

    try {
      const res = await commitHisabImport(payload);
      setCommitResult(res);
      toast.success(t("Commit successful!"));
      setFile(null);
      setPreviewData(null);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to commit import"));
    } finally {
      setIsCommitPending(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setPreviewData(null);
    setCommitResult(null);
    setEventResolutions({});
    setCategoryResolutions({});
    setAcceptMismatches(false);
  };

  // Auth Guards
  if (authLoading) {
    return (
      <AuthLayout>
        <div className="max-w-6xl mx-auto p-8 space-y-6">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </AuthLayout>
    );
  }

  if (!hasPermission("finance:imports:write")) {
    return (
      <AuthLayout>
        <ForbiddenState
          title="Forbidden"
          description="You do not have the finance:imports:write permission required to import Hisab workbooks."
        />
      </AuthLayout>
    );
  }

  // Calculate resolution completion
  const unmatchedRows = previewData?.rows.filter((r) => r.requiresResolution && r.requiresResolution.length > 0) || [];
  const unresolvedCount = unmatchedRows.filter((row) => {
    return row.requiresResolution.some((item) => {
      if (item.kind === "event") return !eventResolutions[row.id]?.eventId;
      if (item.kind.endsWith("category")) return !categoryResolutions[row.id];
      return true;
    });
  }).length;

  const hasBlockingErrors = previewData?.blockingErrors && previewData.blockingErrors.length > 0;
  const hasFormulaMismatches = previewData?.formulaMismatches && previewData.formulaMismatches.length > 0;
  const commitDisabled =
    hasBlockingErrors ||
    unresolvedCount > 0 ||
    (hasFormulaMismatches && !acceptMismatches) ||
    isCommitPending;

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6 p-8 max-w-7xl mx-auto w-full no-print">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight text-foreground select-none">
              {t("Hisab Workbook Import")}
            </h1>
            <p className="text-sm text-neutral-400 font-medium">
              {t("Upload a legacy Hisab Excel workbook (.xlsx) to parse, reconcile, and import weekly event expenses, overheads, operational expenses, and capital investments.")}
            </p>
          </div>
          {previewData && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="dl-radius-md hover:bg-card-alt select-none border-border/80 text-foreground"
            >
              <HiXMark className="w-4 h-4 mr-2" />
              {t("Clear")}
            </Button>
          )}
        </div>

        {/* Upload State & Success results */}
        {!file && !previewData && !commitResult && (
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center border-2 border-dashed border-border/60 hover:border-primary/50 bg-card rounded-3xl p-16 text-center cursor-pointer transition-all duration-300 group shadow-sm select-none"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx"
              className="hidden"
            />
            <div className="p-4 rounded-2xl bg-primary-light/10 text-primary mb-4 group-hover:scale-110 transition-transform duration-300">
              <HiOutlineDocumentArrowUp className="w-10 h-10" />
            </div>
            <p className="text-sm font-bold text-foreground mb-1">
              {t("Select Workbook")}
            </p>
            <p className="text-xs text-neutral-400">
              {t("Drag and drop your .xlsx workbook here, or click to browse")}
            </p>
            <p className="text-[10px] text-neutral-500 font-medium mt-3">
              {t("Only .xlsx Excel files are supported.")}
            </p>
          </div>
        )}

        {previewLoading && (
          <div className="flex flex-col items-center justify-center p-20 bg-card border border-border/60 rounded-3xl space-y-4">
            <HiArrowPath className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm font-semibold text-neutral-400">{t("Previewing workbook...")}</p>
          </div>
        )}

        {/* Success Commit Banner */}
        {commitResult && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-8 flex flex-col md:flex-row gap-6 items-start shadow-sm">
            <div className="p-3 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl">
              <HiOutlineCheckCircle className="w-8 h-8" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">{t("Commit successful!")}</h3>
                <p className="text-sm text-neutral-400 font-medium">
                  {t("Successfully imported:")}
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-card border border-border/50 rounded-2xl p-4">
                  <p className="text-2xl font-extrabold font-mono text-primary">
                    {commitResult.inserted?.eventExpenses || 0}
                  </p>
                  <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider mt-1">{t("Event Expenses")}</p>
                </div>
                <div className="bg-card border border-border/50 rounded-2xl p-4">
                  <p className="text-2xl font-extrabold font-mono text-primary">
                    {commitResult.inserted?.operationalExpenses || 0}
                  </p>
                  <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider mt-1">{t("Operational Expenses")}</p>
                </div>
                <div className="bg-card border border-border/50 rounded-2xl p-4">
                  <p className="text-2xl font-extrabold font-mono text-primary">
                    {commitResult.inserted?.overheads || 0}
                  </p>
                  <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider mt-1">{t("Overheads")}</p>
                </div>
                <div className="bg-card border border-border/50 rounded-2xl p-4">
                  <p className="text-2xl font-extrabold font-mono text-primary">
                    {commitResult.inserted?.investments || 0}
                  </p>
                  <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider mt-1">{t("Capital Investments")}</p>
                </div>
              </div>
              <div>
                <Button
                  onClick={handleClear}
                  className="bg-primary hover:bg-primary-dark text-white font-bold h-10 px-6 rounded-2xl"
                >
                  Import Another
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Preview Workspace */}
        {previewData && (
          <div className="space-y-6">
            {/* KPI statistics & workbook detail */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-sm">
                <p className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase select-none">{t("Total Rows")}</p>
                <p className="text-3xl font-extrabold text-foreground font-mono mt-2">{previewData.summary?.totalRows || 0}</p>
              </div>
              <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-sm">
                <p className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase select-none">{t("Total Amount")}</p>
                <p className="text-3xl font-extrabold text-foreground font-mono mt-2">
                  {previewData.summary?.totalAmount?.toLocaleString() || 0} <span className="text-sm font-bold">ETB</span>
                </p>
              </div>
              <div className="col-span-1 md:col-span-2 bg-card border border-border/60 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase select-none">{t("Workbook Hash")}</p>
                  <p className="text-xs font-mono font-bold text-neutral-400 mt-2 truncate select-all">{previewData.workbookHash}</p>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {previewData.knownSheets?.map((sheet: string) => (
                    <span key={sheet} className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase tracking-wider">
                      {sheet}
                    </span>
                  ))}
                  {previewData.missingSheets?.map((sheet: string) => (
                    <span key={sheet} className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-red-500/10 text-red-600 border border-red-500/20 uppercase tracking-wider">
                      Missing: {sheet}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Duplicate batch warning */}
            {previewData.duplicate && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 flex gap-4 items-start shadow-sm">
                <HiOutlineExclamationTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-amber-800 dark:text-amber-400 select-none">
                    {t("Duplicate Workbook Warning")}
                  </h4>
                  <p className="text-xs text-amber-600 dark:text-amber-300 font-medium mt-1">
                    {t("This workbook has already been committed and imported on")} {new Date(previewData.duplicate.committedAt).toLocaleString()}.
                    Committing again will cause conflicts or duplicate records.
                  </p>
                </div>
              </div>
            )}

            {/* Blocking Errors */}
            {hasBlockingErrors && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-6 shadow-sm space-y-3">
                <div className="flex gap-3 items-center">
                  <HiOutlineExclamationTriangle className="w-5 h-5 text-red-500" />
                  <h4 className="text-sm font-bold text-red-600 select-none">{t("Blocking Errors")}</h4>
                </div>
                <ul className="list-disc list-inside text-xs text-red-500 font-medium space-y-1 pl-1">
                  {previewData.blockingErrors.map((err: string, i: number) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {previewData.warnings && previewData.warnings.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 shadow-sm space-y-3">
                <div className="flex gap-3 items-center">
                  <HiOutlineExclamationTriangle className="w-5 h-5 text-amber-500" />
                  <h4 className="text-sm font-bold text-amber-800 dark:text-amber-400 select-none">{t("Warnings")}</h4>
                </div>
                <ul className="list-disc list-inside text-xs text-amber-600 dark:text-amber-300 font-medium space-y-1 pl-1">
                  {previewData.warnings.map((warn: string, i: number) => (
                    <li key={i}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Formula Total Mismatches Section */}
            {hasFormulaMismatches && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex gap-3 items-center">
                  <HiOutlineExclamationTriangle className="w-5 h-5 text-amber-500 animate-pulse" />
                  <h4 className="text-sm font-bold text-amber-800 dark:text-amber-400 select-none">{t("Formula Total Mismatches")}</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-medium text-amber-800 dark:text-amber-300">
                    <thead>
                      <tr className="border-b border-amber-500/20">
                        <th className="py-2 pr-4">{t("Sheet")}</th>
                        <th className="py-2 pr-4">{t("Row")}</th>
                        <th className="py-2 pr-4">Formula Section</th>
                        <th className="py-2 pr-4 text-right">{t("Expected Total")}</th>
                        <th className="py-2 pr-4 text-right">{t("Actual Total")}</th>
                        <th className="py-2 text-right">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.formulaMismatches.map((mismatch: HisabImportFormulaMismatch, idx: number) => (
                        <tr key={idx} className="border-b border-amber-500/10 last:border-0 font-mono">
                          <td className="py-2 pr-4">{mismatch.sheet}</td>
                          <td className="py-2 pr-4">{mismatch.rowNumber}</td>
                          <td className="py-2 pr-4">{mismatch.label}</td>
                          <td className="py-2 pr-4 text-right">{mismatch.expected.toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right">{mismatch.actual.toLocaleString()}</td>
                          <td className="py-2 text-right text-red-500">{mismatch.delta.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="flex items-center gap-3 cursor-pointer group select-none mt-2">
                  <input
                    type="checkbox"
                    checked={acceptMismatches}
                    onChange={(e) => setAcceptMismatches(e.target.checked)}
                    className="w-4.5 h-4.5 accent-amber-500 rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-400 group-hover:text-amber-900 transition-colors">
                    {t("I have reviewed and accept these formula total mismatches")}
                  </span>
                </label>
              </div>
            )}

            {/* Unmatched Items Resolutions Section */}
            {unmatchedRows.length > 0 && (
              <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-sm space-y-6">
                <h3 className="text-lg font-bold text-foreground select-none">
                  {t("Resolve Unmatched Items")} ({unresolvedCount} remaining)
                </h3>
                <div className="space-y-4">
                  {unmatchedRows.map((row: HisabImportRow) => (
                    <div key={row.id} className="border border-border/60 rounded-2xl p-4 bg-card-alt flex flex-col md:flex-row gap-6 md:items-center justify-between">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-neutral-200 dark:bg-neutral-800 text-foreground rounded">
                            {row.kind}
                          </span>
                          <span className="text-[10px] font-mono text-neutral-400">{row.sheet} #L{row.rowNumber}</span>
                        </div>
                        <p className="text-sm font-bold text-foreground">{row.description}</p>
                        <p className="text-xs font-bold text-primary font-mono">{row.amount.toLocaleString()} ETB</p>
                      </div>

                      <div className="w-full md:w-80 space-y-3 shrink-0">
                        {row.requiresResolution.map((item: HisabImportResolution, idx: number) => {
                          if (item.kind === "event") {
                            const val = eventResolutions[row.id]?.eventId || "";
                            return (
                              <div key={idx} className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase">
                                  Unmatched Event: &quot;{item.value}&quot;
                                </label>
                                <Select
                                  options={eventSelectOptions}
                                  value={val}
                                  onChange={(newVal) => {
                                    const found = activeEvents.find((e) => e.id === newVal);
                                    setEventResolutions((prev) => ({
                                      ...prev,
                                      [row.id]: { eventId: newVal, eventName: found?.name || "" },
                                    }));
                                  }}
                                  placeholder={t("Choose Event")}
                                  className="w-full border-border/80 font-medium"
                                />
                              </div>
                            );
                          }

                          if (item.kind.endsWith("category")) {
                            const val = categoryResolutions[row.id] || "";
                            let categoryOptions: string[] = [];
                            if (item.kind === "opex_category") categoryOptions = OPEX_CATEGORIES;
                            if (item.kind === "overhead_category") categoryOptions = OVERHEAD_CATEGORIES;
                            if (item.kind === "investment_category") categoryOptions = CAPEX_CATEGORIES;

                            const mappedOptions = categoryOptions.map((c) => ({ id: c, label: c }));

                            return (
                              <div key={idx} className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase">
                                  Unmatched Category: &quot;{item.value}&quot;
                                </label>
                                <Select
                                  options={mappedOptions}
                                  value={val}
                                  onChange={(newVal) => {
                                    setCategoryResolutions((prev) => ({
                                      ...prev,
                                      [row.id]: newVal,
                                    }));
                                  }}
                                  placeholder={t("Choose Category")}
                                  className="w-full border-border/80 font-medium"
                                />
                              </div>
                            );
                          }

                          return null;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Commit bar controls */}
            <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between select-none">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-foreground">Import Readiness</h4>
                <p className="text-xs text-neutral-400 font-medium">
                  {hasBlockingErrors
                    ? "Workbook has blocking errors and cannot be imported."
                    : unresolvedCount > 0
                    ? `Resolve the remaining ${unresolvedCount} unmatched elements to unlock commit.`
                    : hasFormulaMismatches && !acceptMismatches
                    ? "Review and accept formula mismatches to unlock commit."
                    : "Workbook is fully resolved and ready to commit."}
                </p>
              </div>
              <div>
                <Button
                  onClick={handleCommit}
                  disabled={commitDisabled}
                  className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-bold h-11 px-8 rounded-2xl text-xs uppercase tracking-widest transition-all active:scale-[0.98]"
                >
                  {isCommitPending ? (
                    <HiArrowPath className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <HiCheck className="w-4 h-4 mr-2" />
                  )}
                  {t("Commit Import")}
                </Button>
              </div>
            </div>

            {/* Parsed Rows Register List */}
            <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-foreground select-none">{t("Parsed Rows")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-card-alt/65 text-neutral-400 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">{t("Sheet")}</th>
                      <th className="px-4 py-3">{t("Type")}</th>
                      <th className="px-4 py-3">{t("Date")}</th>
                      <th className="px-4 py-3">{t("Description")}</th>
                      <th className="px-4 py-3 text-right">{t("Amount")}</th>
                      <th className="px-4 py-3">{t("Resolved Event / Category")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-medium">
                    {previewData.rows?.map((row: HisabImportRow) => {
                      const hasResolution = row.requiresResolution && row.requiresResolution.length > 0;
                      let resolvedVal: ReactNode = row.category || row.eventName || "—";
                      if (hasResolution) {
                        const eventRes = eventResolutions[row.id]?.eventName;
                        const catRes = categoryResolutions[row.id];
                        resolvedVal = eventRes || catRes || (
                          <span className="text-red-500 font-bold">Unresolved</span>
                        );
                      }
                      return (
                        <tr key={row.id} className="hover:bg-card-alt/30 transition-colors">
                          <td className="px-4 py-3 font-semibold text-neutral-400">{row.sheet}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-bold uppercase">
                              {row.kind}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono">{row.date}</td>
                          <td className="px-4 py-3 max-w-xs truncate">{row.description}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-foreground">{row.amount.toLocaleString()}</td>
                          <td className="px-4 py-3 font-semibold text-neutral-450">{resolvedVal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
