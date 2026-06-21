"use client";
import React, { useState } from "react";
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
    "Step 2: Preview & Validate": "Step 2: Preview & Validate",
    "Step 3: Commit Import": "Step 3: Commit Import",
    "Download Template": "Download Template (CSV)",
    "Upload Mode": "Upload Mode",
    "Insert (New Events)": "Insert (New Events)",
    "Update (Edit Existing)": "Update (Edit Existing)",
    "Drop CSV file here": "Drop CSV file here or click to browse",
    "Only CSV files are supported": "Only CSV files are supported",
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
    "invalid_phone": "Invalid Ethiopian phone number. Use +251... or 09.../07..."
  },
  am: {
    "Import Events": "ዝግጅቶችን አስገባ",
    "Close": "ዝጋ",
    "Step 1: Upload File": "ደረጃ 1፡ ፋይል ስቀል",
    "Step 2: Preview & Validate": "ደረጃ 2፡ ቅድመ-ዕይታ እና ማረጋገጫ",
    "Step 3: Commit Import": "ደረጃ 3፡ አስገባ",
    "Download Template": "ቅጽ አውርድ (CSV)",
    "Upload Mode": "የመስቀያ ሁኔታ",
    "Insert (New Events)": "አዲስ መዝግብ (አስገባ)",
    "Update (Edit Existing)": "ነባር አሻሽል (አዘምን)",
    "Drop CSV file here": "የCSV ፋይል እዚህ ይጣሉ ወይም ለመምረጥ ጠቅ ያድርጉ",
    "Only CSV files are supported": "የCSV ፋይሎች ብቻ ናቸው የሚደገፉት",
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
    "invalid_phone": "ትክክለኛ የኢትዮጵያ ስልክ ቁጥር አይደለም። በ +251... ወይም 09.../07... ይጠቀሙ"
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

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"insert" | "update">("insert");
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

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

      const splitCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result.map(s => s.replace(/^"|"$/g, "").trim());
      };

      const rawHeaders = splitCSVLine(lines[0]);
      const mappedHeaders = rawHeaders.map(h => HEADER_MAP[h] || h);

      const rows: Record<string, string>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = splitCSVLine(lines[i]);
        if (values.length < rawHeaders.length) continue;
        const row: Record<string, string> = {};
        mappedHeaders.forEach((header, index) => {
          row[header] = values[index] || "";
        });
        rows.push(row);
      }

      setParsedRows(rows);
    };
    reader.readAsText(fileToParse);
  };

  const handleValidate = async () => {
    if (parsedRows.length === 0) return;
    setIsLoading(true);
    setErrorMsg("");
    try {
      const res = await previewEventsImport({ mode, rows: parsedRows });
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

  const handleDownloadTemplate = () => {
    const token = localStorage.getItem("auth_token");
    const baseUrl = api.defaults.baseURL || "";
    window.open(`${baseUrl}/events/export/template?format=csv&token=${token || ""}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet Container */}
      <div className="relative w-full max-w-4xl bg-card border border-border rounded-lg shadow-massive overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card-alt">
          <h2 className="text-base font-black text-foreground uppercase tracking-wider">
            {t("Import Events")}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg bg-card hover:bg-border text-muted hover:text-foreground transition-all">
            <HiXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Status */}
        <div className="grid grid-cols-3 border-b border-border/50 text-center text-xs font-bold uppercase tracking-wider bg-card">
          <div className={`py-3.5 border-r border-border/50 ${step === 1 ? "bg-primary/10 text-primary border-b-2 border-b-primary" : "text-muted"}`}>
            {t("Step 1: Upload File")}
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
                      className={`px-4 py-2 text-xs font-black transition-all ${mode === "insert" ? "bg-primary text-on-primary" : "bg-card-alt text-muted hover:bg-border"}`}
                    >
                      {t("Insert (New Events)")}
                    </button>
                    <button
                      onClick={() => setMode("update")}
                      className={`px-4 py-2 text-xs font-black transition-all ${mode === "update" ? "bg-primary text-on-primary" : "bg-card-alt text-muted hover:bg-border"}`}
                    >
                      {t("Update (Edit Existing)")}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center justify-center gap-2 h-[44px] px-5 rounded-lg text-xs font-black border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-all self-end"
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
                className="border-2 border-dashed border-border/60 hover:border-primary/50 bg-card-alt/50 hover:bg-primary-light/5 rounded-xl py-12 px-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[220px]"
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
                  <h3 className="text-xs font-bold text-muted uppercase tracking-wider">Errors ({validationResult.errors.length})</h3>
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
                          <tr key={idx} className="border-b border-border/30 hover:bg-card-alt/50">
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
                        <th className="px-4 py-2 w-12">#</th>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Client</th>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Venue</th>
                        <th className="px-4 py-2">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row, idx) => {
                        const rowErrors = validationResult.errors?.filter((e: ValidationError) => e.row === idx + 1) || [];
                        const isRowErroneous = rowErrors.length > 0;
                        return (
                          <tr key={idx} className={`border-b border-border/30 hover:bg-card-alt/50 ${isRowErroneous ? "bg-danger/5" : ""}`}>
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
                className="h-[44px] px-6 rounded-lg text-xs font-black uppercase tracking-wider bg-card hover:bg-border text-muted hover:text-foreground transition-all border border-border"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={handleValidate}
                disabled={parsedRows.length === 0 || isLoading}
                className="flex items-center gap-1.5 h-[44px] px-6 rounded-lg text-xs font-black uppercase tracking-wider bg-primary text-on-primary hover:opacity-90 disabled:opacity-50 disabled:scale-100 transition-all border border-primary/20"
              >
                {isLoading ? t("Validating") : t("Validate & Preview")}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 h-[44px] px-6 rounded-lg text-xs font-black uppercase tracking-wider bg-card hover:bg-border text-muted hover:text-foreground transition-all border border-border"
              >
                {t("Back")}
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={!validationResult?.valid || isCommitting}
                className="h-[44px] px-6 rounded-lg text-xs font-black uppercase tracking-wider bg-primary text-on-primary hover:opacity-90 disabled:opacity-50 disabled:scale-100 transition-all border border-primary/20"
              >
                {isCommitting ? t("Importing") : t("Confirm Commit")}
              </button>
            </>
          )}

          {step === 3 && (
            <button
              type="button"
              onClick={onClose}
              className="w-full h-[44px] rounded-lg text-xs font-black uppercase tracking-wider bg-primary text-on-primary hover:opacity-90 transition-all border border-primary/20"
            >
              {t("Finish")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
