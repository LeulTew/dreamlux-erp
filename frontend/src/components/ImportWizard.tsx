"use client";
import React, { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/hooks/use-language";
import { previewEventsImport, commitEventsImport, api } from "@/lib/api";
import { HiXMark, HiArrowUpTray, HiArrowDownTray, HiCheckCircle, HiExclamationTriangle } from "react-icons/hi2";

interface ImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "Import Events": "Import Events",
    "Close": "Close",
    "Step 1: Upload File": "Step 1: Upload File",
    "Step 1.5: Match Columns": "Step 2: Match Columns",
    "Step 2: Preview & Validate": "Step 3: Preview & Validate",
    "Step 3: Commit Import": "Step 4: Commit Import",
    "Download Template": "Download Template (CSV)",
    "Upload Mode": "Upload Mode",
    "Insert (New Events)": "Insert (New Events)",
    "Update (Edit Existing)": "Update (Edit Existing)",
    "Drop CSV file here": "Drop CSV file here or click to browse",
    "Only CSV files are supported": "Only CSV files are supported",
    "csv hint": ".csv (max 500 rows)",
    "Back": "Back",
    "Next": "Next",
    "Validate & Preview": "Validate & Preview",
    "Row": "Row",
    "Field": "Field",
    "Message": "Message",
    "Status": "Status",
    "Validating": "Validating...",
    "Import Validation Failed": "Import Validation Failed",
    "Validation errors found. Please correct your CSV file and try again.": "Validation errors found. Please correct your CSV file and try again.",
    "Row Preview": "Row Preview",
    "No errors found. Ready to commit.": "No errors found. Ready to commit.",
    "Importing": "Importing...",
    "Commit Success": "Import Committed Successfully!",
    "events successfully imported.": "events successfully imported.",
    "Finish": "Finish",
    "Cancel": "Cancel",
    "Confirm Commit": "Confirm Commit",
    "You are importing": "You are about to import",
    "records. This action is irreversible.": "records. This action is irreversible.",
    "invalid_phone": "Invalid Ethiopian phone number. Use +251... or 09.../07...",
    "Errors": "Errors",
    "Row #": "#",
    "Name": "Name",
    "Client": "Client",
    "Date": "Date",
    "Venue": "Venue",
    "Price": "Price",
    "Database Field": "Database Field",
    "CSV Column": "CSV Column",
    "Select CSV Column": "Select CSV Column...",
    "Skip Column": "-- Skip Column --",
    "Please map all required fields": "Please map all required fields: Event Name, Client Name, Start Date, End Date, Venue, Contract Price",
    "First Row Preview": "First Row Data Preview",
    "Required": "Required",
    "Optional": "Optional",
    "name": "Event Name",
    "client_name": "Client Name",
    "client_phone": "Client Phone",
    "event_type_name": "Event Type",
    "start_date": "Start Date",
    "end_date": "End Date",
    "start_time": "Start Time",
    "end_time": "End Time",
    "venue_location": "Venue / Location",
    "contract_price": "Contract Price",
    "status": "Status",
    "package_design_notes": "Package Design Notes",
    "estimated_design_cost": "Estimated Design Cost"
  },
  am: {
    "Import Events": "ዝግጅቶችን አስገባ",
    "Close": "ዝጋ",
    "Step 1: Upload File": "ደረጃ 1፡ ፋይል ስቀል",
    "Step 1.5: Match Columns": "ደረጃ 2፡ አምዶችን አዛምድ",
    "Step 2: Preview & Validate": "ደረጃ 3፡ ቅድመ-ዕይታ እና ማረጋገጫ",
    "Step 3: Commit Import": "ደረጃ 4፡ አስገባ",
    "Download Template": "ቅጽ አውርድ (CSV)",
    "Upload Mode": "የመስቀያ ሁኔታ",
    "Insert (New Events)": "አዲስ መዝግብ (አስገባ)",
    "Update (Edit Existing)": "ነባር አሻሽል (አዘምን)",
    "Drop CSV file here": "የCSV ፋይል እዚህ ይጣሉ ወይም ለመምረጥ ጠቅ ያድርጉ",
    "Only CSV files are supported": "የCSV ፋይሎች ብቻ ናቸው የሚደገፉት",
    "csv hint": ".csv (ከፍተኛ 500 ረድፎች)",
    "Back": "ተመለስ",
    "Next": "ቀጥል",
    "Validate & Preview": "አረጋግጥ እና አሳይ",
    "Row": "ረድፍ",
    "Field": "ክፍል",
    "Message": "መልዕክት",
    "Status": "ሁኔታ",
    "Validating": "በማረጋገጥ ላይ...",
    "Import Validation Failed": "ማረጋገጫው አልተሳካም",
    "Validation errors found. Please correct your CSV file and try again.": "የማረጋገጫ ስህተቶች ተገኝተዋል። እባክዎን የCSV ፋይልዎን አስተካክለው እንደገና ይሞክሩ።",
    "Row Preview": "የረድፍ ቅድመ-ዕይታ",
    "No errors found. Ready to commit.": "ምንም ስህተት አልተገኘም። ለማስገባት ዝግጁ ነው።",
    "Importing": "በማስገባት ላይ...",
    "Commit Success": "ማስገባት በተሳካ ሁኔታ ተጠናቋል!",
    "events successfully imported.": "ዝግጅቶች በተሳካ ሁኔታ ገብተዋል።",
    "Finish": "ጨርስ",
    "Cancel": "ሰርዝ",
    "Confirm Commit": "ማስገባት አረጋግጥ",
    "You are importing": "ለማስገባት እያዘጋጁ ነው፡",
    "records. This action is irreversible.": "መዝገቦች። ይህ ተግባር ሊመለስ የማይችል ነው።",
    "invalid_phone": "ትክክለኛ የኢትዮጵያ ስልክ ቁጥር አይደለም። በ +251... ወይም 09.../07... ይጠቀሙ",
    "Errors": "ስህተቶች",
    "Row #": "#",
    "Name": "ስም",
    "Client": "ደንበኛ",
    "Date": "ቀን",
    "Venue": "ቦታ",
    "Price": "ዋጋ",
    "Database Field": "የስርአቱ መረጃ ክፍል",
    "CSV Column": "የCSV ፋይል አምድ",
    "Select CSV Column": "የCSV አምድ ይምረጡ...",
    "Skip Column": "-- አትጠቀምበት --",
    "Please map all required fields": "እባክዎን ሁሉንም አስፈላጊ ክፍሎች ያዛምዱ፡ የዝግጅት ስም፣ የደንበኛ ስም፣ መጀመሪያ ቀን፣ መጨረሻ ቀን፣ ቦታ፣ የውል ዋጋ",
    "First Row Preview": "የመጀመሪያው ረድፍ መረጃ ቅድመ-ዕይታ",
    "Required": "አስፈላጊ",
    "Optional": "አማራጭ",
    "name": "የዝግጅት ስም",
    "client_name": "የደንበኛ ስም",
    "client_phone": "የደንበኛ ስልክ",
    "event_type_name": "የዝግጅት አይነት",
    "start_date": "መጀመሪያ ቀን",
    "end_date": "መጨረሻ ቀን",
    "start_time": "መጀመሪያ ሰዓት",
    "end_time": "መጨረሻ ሰዓት",
    "venue_location": "ቦታ",
    "contract_price": "የውል ዋጋ",
    "status": "ሁኔታ",
    "package_design_notes": "የጥቅል ዲዛይን ማስታወሻዎች",
    "estimated_design_cost": "ግምታዊ የዲዛይን ወጪ"
  }
};

const HEADER_MAP: Record<string, string> = {
  "Event Name": "name",
  "Client Name": "client_name",
  "Client Phone": "client_phone",
  "Event Type Name": "event_type_name",
  "Start Date": "start_date",
  "End Date": "end_date",
  "Start Time": "start_time",
  "End Time": "end_time",
  "Venue / Location": "venue_location",
  "Contract Price": "contract_price",
  "Status": "status",
  "Package Design Notes": "package_design_notes",
  "Estimated Design Cost": "estimated_design_cost",
  "id": "id",
  "Event ID": "id"
};

const DB_FIELDS = [
  { key: "name", label: "Event Name", required: true },
  { key: "client_name", label: "Client Name", required: true },
  { key: "client_phone", label: "Client Phone", required: false },
  { key: "event_type_name", label: "Event Type", required: false },
  { key: "start_date", label: "Start Date", required: true },
  { key: "end_date", label: "End Date", required: true },
  { key: "start_time", label: "Start Time", required: false },
  { key: "end_time", label: "End Time", required: false },
  { key: "venue_location", label: "Venue / Location", required: true },
  { key: "contract_price", label: "Contract Price", required: true },
  { key: "status", label: "Status", required: false },
  { key: "package_design_notes", label: "Package Design Notes", required: false },
  { key: "estimated_design_cost", label: "Estimated Design Cost", required: false }
];

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export default function ImportWizard({ isOpen, onClose, onSuccess }: ImportWizardProps) {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const [step, setStep] = useState<number>(1);
  const [mode, setMode] = useState<"insert" | "update">("insert");
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Matching Mapper States
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [rawCsvRows, setRawCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus the first interactive element or close button
    const focusableElements = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements && focusableElements.length > 0) {
      (focusableElements[0] as HTMLElement).focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Tab") {
        if (!focusableElements || focusableElements.length === 0) return;
        const firstEl = focusableElements[0] as HTMLElement;
        const lastEl = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            lastEl.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastEl) {
            firstEl.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith(".csv")) {
      setFile(droppedFile);
      parseFile(droppedFile);
    } else {
      setErrorMsg(t("Only CSV files are supported"));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.name.endsWith(".csv")) {
        setFile(selectedFile);
        parseFile(selectedFile);
      } else {
        setErrorMsg(t("Only CSV files are supported"));
      }
    }
  };

  const parseFile = (fileToParse: File) => {
    setErrorMsg("");
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length === 0) return;

      // RFC 4180 compliant CSV parser: handles escaped double-quotes ("") inside quoted fields
      const splitCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              // Escaped double-quote inside quoted field: "" → literal "
              current += '"';
              i++; // skip next quote
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result.map(s => s.trim());
      };

      const rawHeaders = splitCSVLine(lines[0]);
      const rawRows: string[][] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = splitCSVLine(lines[i]);
        if (values.length > 0) {
          rawRows.push(values);
        }
      }

      setCsvHeaders(rawHeaders);
      setRawCsvRows(rawRows);

      // Auto-match headers to Database Fields
      const initialMapping: Record<string, string> = {};
      DB_FIELDS.forEach(field => {
        const match = rawHeaders.find(h => {
          const normalizedH = h.trim().toLowerCase();
          const targetKey = field.key.toLowerCase();
          return normalizedH === targetKey || 
                 HEADER_MAP[h] === field.key ||
                 normalizedH.replace(/[^a-z0-9]/g, '') === targetKey.replace(/[^a-z0-9]/g, '');
        });
        initialMapping[field.key] = match || "";
      });
      setMapping(initialMapping);
      setStep(1.5);
    };
    reader.readAsText(fileToParse);
  };

  const handleApplyMapping = async () => {
    setErrorMsg("");
    
    // Check if required fields are mapped
    const unmappedRequired = DB_FIELDS.filter(f => f.required && !mapping[f.key]);
    if (unmappedRequired.length > 0) {
      setErrorMsg(`${t("Please map all required fields")}`);
      return;
    }

    // Build parsedRows using the mapping
    const rows: Record<string, string>[] = [];
    rawCsvRows.forEach(csvRow => {
      const row: Record<string, string> = {};
      Object.entries(mapping).forEach(([dbKey, csvHeader]) => {
        if (csvHeader) {
          const csvHeaderIndex = csvHeaders.indexOf(csvHeader);
          if (csvHeaderIndex !== -1) {
            row[dbKey] = csvRow[csvHeaderIndex] || "";
          }
        }
      });
      rows.push(row);
    });

    setParsedRows(rows);

    // Call validation preview API
    setIsLoading(true);
    try {
      const res = await previewEventsImport({ mode, rows });
      setValidationResult(res as ValidationResult);
      setStep(2);
    } catch (err: unknown) {
      console.error(err);
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setErrorMsg(error.response?.data?.error || error.message || "Validation failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async () => {
    setIsCommitting(true);
    setErrorMsg("");
    try {
      await commitEventsImport({ mode, rows: parsedRows });
      setStep(3);
      onSuccess();
    } catch (err: unknown) {
      console.error(err);
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setErrorMsg(error.response?.data?.error || error.message || "Commit failed");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    const token = localStorage.getItem("token");
    const baseUrl = api.defaults.baseURL || "";
    try {
      // Security: never put bearer tokens in URL query strings (browser history, logs, referrer leaks).
      // Use Authorization header with fetch and create a temporary blob URL instead.
      const response = await fetch(`${baseUrl}/events/export/template?format=csv`, {
        headers: { Authorization: `Bearer ${token || ""}` }
      });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dreamlux_events_template.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Template download failed:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet Container */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
        className="relative w-full max-w-4xl bg-card border border-border rounded-lg shadow-massive overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card-alt">
          <h2 id="import-dialog-title" className="text-base font-black text-foreground uppercase tracking-wider">
            {t("Import Events")}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg bg-card [@media(hover:hover)]:hover:bg-border text-muted [@media(hover:hover)]:hover:text-foreground transition-all">
            <HiXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Status */}
        <div className="grid grid-cols-4 border-b border-border/50 text-center text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-card">
          <div className={`py-3.5 border-r border-border/50 ${step === 1 ? "bg-primary/10 text-primary border-b-2 border-b-primary" : "text-muted"}`}>
            {t("Step 1: Upload File")}
          </div>
          <div className={`py-3.5 border-r border-border/50 ${step === 1.5 ? "bg-primary/10 text-primary border-b-2 border-b-primary" : "text-muted"}`}>
            {t("Step 1.5: Match Columns")}
          </div>
          <div className={`py-3.5 border-r border-border/50 ${step === 2 ? "bg-primary/10 text-primary border-b-2 border-b-primary" : "text-muted"}`}>
            {t("Step 2: Preview & Validate")}
          </div>
          <div className={`py-3.5 ${step === 3 ? "bg-primary/10 text-primary border-b-2 border-b-primary" : "text-muted"}`}>
            {t("Step 3: Commit Import")}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {errorMsg && (
            <div className="mb-4 p-4 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm font-semibold flex items-center gap-2">
              <HiExclamationTriangle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-6">
              {/* Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">{t("Upload Mode")}</label>
                  <div className="flex rounded-lg border border-border overflow-hidden">
                    <button
                      onClick={() => setMode("insert")}
                      className={`px-4 py-2 text-xs font-black transition-all ${mode === "insert" ? "bg-primary text-on-primary" : "bg-card-alt text-muted [@media(hover:hover)]:hover:bg-border"}`}
                    >
                      {t("Insert (New Events)")}
                    </button>
                    <button
                      onClick={() => setMode("update")}
                      className={`px-4 py-2 text-xs font-black transition-all ${mode === "update" ? "bg-primary text-on-primary" : "bg-card-alt text-muted [@media(hover:hover)]:hover:bg-border"}`}
                    >
                      {t("Update (Edit Existing)")}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center justify-center gap-2 h-[44px] px-5 rounded-lg text-xs font-black border border-primary/20 bg-primary/5 text-primary [@media(hover:hover)]:hover:bg-primary/10 transition-all self-end"
                >
                  <HiArrowDownTray className="w-4 h-4" />
                  {t("Download Template")}
                </button>
              </div>

              {/* Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => document.getElementById("csv-file-input")?.click()}
                className="border-2 border-dashed border-border/60 [@media(hover:hover)]:hover:border-primary/50 bg-card-alt/50 [@media(hover:hover)]:hover:bg-primary-light/5 rounded-xl py-12 px-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[220px]"
              >
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="p-4 rounded-full bg-primary/10 text-primary mb-4 border border-primary/20">
                  <HiArrowUpTray className="w-8 h-8" />
                </div>
                {file ? (
                  <div>
                     <p className="text-sm font-bold text-foreground">{file.name}</p>
                     <p className="text-xs text-muted font-mono mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-black text-foreground">{t("Drop CSV file here")}</p>
                    <p className="text-xs text-muted font-medium mt-1">.csv (max 500 rows)</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 1.5 && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider">{t("First Row Preview")}</h3>
                <div className="border border-border/50 rounded-lg overflow-x-auto bg-card-alt/30">
                  <div className="p-4 flex gap-6 overflow-x-auto min-w-[500px]">
                    {csvHeaders.slice(0, 5).map((header, idx) => (
                      <div key={header} className="flex flex-col gap-1 shrink-0">
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{header}</span>
                        <span className="text-xs font-semibold text-foreground font-mono">{rawCsvRows[0]?.[idx] || "-"}</span>
                      </div>
                    ))}
                    {csvHeaders.length > 5 && (
                      <div className="flex flex-col justify-center shrink-0">
                        <span className="text-xs font-black text-muted">+{csvHeaders.length - 5} more</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider">{t("Step 1.5: Match Columns")}</h3>
                <div className="border border-border/50 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-card-alt text-muted font-bold border-b border-border/50">
                        <th className="px-4 py-3">{t("Database Field")}</th>
                        <th className="px-4 py-3">{t("CSV Column")}</th>
                        <th className="px-4 py-3">{t("First Row Preview")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DB_FIELDS.map((field) => {
                        const mappedHeader = mapping[field.key] || "";
                        const headerIndex = csvHeaders.indexOf(mappedHeader);
                        const previewVal = (mappedHeader && headerIndex !== -1) ? rawCsvRows[0]?.[headerIndex] : "";
                        return (
                          <tr key={field.key} className="border-b border-border/30 [@media(hover:hover)]:hover:bg-card-alt/50">
                            <td className="px-4 py-3 font-bold text-foreground">
                              <span className="flex items-center gap-2">
                                {t(field.key)}
                                {field.required ? (
                                  <span className="px-1.5 py-0.5 rounded bg-danger/10 text-danger text-[10px] uppercase font-black tracking-wider">
                                    {t("Required")}
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-muted/10 text-muted text-[10px] uppercase font-black tracking-wider">
                                    {t("Optional")}
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={mappedHeader}
                                onChange={(e) => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                                className="w-full h-[38px] px-3 rounded-lg border border-border bg-card text-foreground text-xs focus:border-primary focus:outline-none transition-all"
                              >
                                <option value="">{t("Skip Column")}</option>
                                {csvHeaders.map(header => (
                                  <option key={header} value={header}>{header}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-muted font-mono max-w-[200px] truncate">
                              {previewVal !== undefined && previewVal !== "" ? previewVal : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 2 && validationResult && (
            <div className="flex flex-col gap-6">
              {validationResult.valid ? (
                <div className="p-4 bg-success/10 border border-success/20 rounded-lg text-success text-sm font-semibold flex items-center gap-2">
                  <HiCheckCircle className="w-5 h-5 shrink-0" />
                  <span>{t("No errors found. Ready to commit.")}</span>
                </div>
              ) : (
                <div className="p-4 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm font-semibold flex flex-col gap-1">
                  <div className="flex items-center gap-2 font-bold">
                    <HiExclamationTriangle className="w-5 h-5 shrink-0" />
                    <span>{t("Import Validation Failed")}</span>
                  </div>
                  <p className="text-xs font-medium ml-7">
                    {t("Validation errors found. Please correct your CSV file and try again.")}
                  </p>
                </div>
              )}

              {/* Error Details */}
              {validationResult.errors && validationResult.errors.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-bold text-muted uppercase tracking-wider">{t("Errors")} ({validationResult.errors.length})</h3>
                  <div className="border border-border/50 rounded-lg overflow-hidden max-h-[160px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-card-alt text-muted font-bold border-b border-border/50">
                          <th className="px-4 py-2 w-16">{t("Row")}</th>
                          <th className="px-4 py-2 w-32">{t("Field")}</th>
                          <th className="px-4 py-2">{t("Message")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validationResult.errors.map((err: ValidationError, idx: number) => (
                          <tr key={idx} className="border-b border-border/30 [@media(hover:hover)]:hover:bg-card-alt/50">
                            <td className="px-4 py-2 font-mono font-bold">{err.row}</td>
                            <td className="px-4 py-2 font-bold text-foreground">{err.field}</td>
                            <td className="px-4 py-2 text-danger font-medium">{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Data Preview */}
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider">{t("Row Preview")} ({parsedRows.length})</h3>
                <div className="border border-border/50 rounded-lg overflow-hidden max-h-[240px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-card-alt text-muted font-bold border-b border-border/50">
                        <th className="px-4 py-2 w-12">{t("Row #")}</th>
                        <th className="px-4 py-2">{t("Name")}</th>
                        <th className="px-4 py-2">{t("Client")}</th>
                        <th className="px-4 py-2">{t("Date")}</th>
                        <th className="px-4 py-2">{t("Venue")}</th>
                        <th className="px-4 py-2">{t("Price")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row, idx) => {
                        const rowErrors = validationResult.errors?.filter((e: ValidationError) => e.row === idx + 1) || [];
                        const isRowErroneous = rowErrors.length > 0;
                        return (
                          <tr key={idx} className={`border-b border-border/30 [@media(hover:hover)]:hover:bg-card-alt/50 ${isRowErroneous ? "bg-danger/5" : ""}`}>
                            <td className="px-4 py-2 font-mono text-muted">{idx + 1}</td>
                            <td className={`px-4 py-2 font-bold ${rowErrors.some((e: ValidationError) => e.field === "name") ? "text-danger" : "text-foreground"}`}>{row.name || "-"}</td>
                            <td className={`px-4 py-2 ${rowErrors.some((e: ValidationError) => e.field === "client_name") ? "text-danger" : ""}`}>{row.client_name || "-"}</td>
                            <td className={`px-4 py-2 font-mono ${rowErrors.some((e: ValidationError) => e.field === "start_date" || e.field === "end_date") ? "text-danger" : ""}`}>{row.start_date || "-"}</td>
                            <td className={`px-4 py-2 ${rowErrors.some((e: ValidationError) => e.field === "venue_location") ? "text-danger" : ""}`}>{row.venue_location || "-"}</td>
                            <td className={`px-4 py-2 font-mono font-bold ${rowErrors.some((e: ValidationError) => e.field === "contract_price") ? "text-danger" : ""}`}>{row.contract_price || "0"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-16 h-16 rounded-full bg-success/10 text-success flex items-center justify-center border border-success/20 mb-4">
                <HiCheckCircle className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-black text-foreground uppercase tracking-wider">{t("Commit Success")}</h3>
              <p className="text-sm text-muted font-medium mt-2 max-w-sm">
                {parsedRows.length} {t("events successfully imported.")}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border/50 bg-card-alt shrink-0">
          {step === 1 && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="h-[44px] px-6 rounded-lg text-xs font-black uppercase tracking-wider bg-card [@media(hover:hover)]:hover:bg-border text-muted [@media(hover:hover)]:hover:text-foreground transition-all border border-border"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                disabled
                className="h-[44px] px-6 rounded-lg text-xs font-black uppercase tracking-wider bg-primary text-on-primary opacity-50 transition-all border border-primary/20"
              >
                {t("Next")}
              </button>
            </>
          )}

          {step === 1.5 && (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setFile(null);
                  setParsedRows([]);
                  setCsvHeaders([]);
                  setRawCsvRows([]);
                }}
                className="flex items-center gap-1.5 h-[44px] px-6 rounded-lg text-xs font-black uppercase tracking-wider bg-card [@media(hover:hover)]:hover:bg-border text-muted [@media(hover:hover)]:hover:text-foreground transition-all border border-border"
              >
                {t("Back")}
              </button>
              <button
                type="button"
                onClick={handleApplyMapping}
                disabled={isLoading}
                className="flex items-center gap-1.5 h-[44px] px-6 rounded-lg text-xs font-black uppercase tracking-wider bg-primary text-on-primary [@media(hover:hover)]:hover:opacity-90 disabled:opacity-50 disabled:scale-100 transition-all border border-primary/20"
              >
                {isLoading ? t("Validating") : t("Validate & Preview")}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => setStep(1.5)}
                className="flex items-center gap-1.5 h-[44px] px-6 rounded-lg text-xs font-black uppercase tracking-wider bg-card [@media(hover:hover)]:hover:bg-border text-muted [@media(hover:hover)]:hover:text-foreground transition-all border border-border"
              >
                {t("Back")}
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={!validationResult?.valid || isCommitting}
                className="h-[44px] px-6 rounded-lg text-xs font-black uppercase tracking-wider bg-primary text-on-primary [@media(hover:hover)]:hover:opacity-90 disabled:opacity-50 disabled:scale-100 transition-all border border-primary/20"
              >
                {isCommitting ? t("Importing") : t("Confirm Commit")}
              </button>
            </>
          )}

          {step === 3 && (
            <button
              type="button"
              onClick={onClose}
              className="w-full h-[44px] rounded-lg text-xs font-black uppercase tracking-wider bg-primary text-on-primary [@media(hover:hover)]:hover:opacity-90 transition-all border border-primary/20"
            >
              {t("Finish")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
