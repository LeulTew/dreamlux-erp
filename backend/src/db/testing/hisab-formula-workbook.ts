import ExcelJS from "exceljs";

export type FormulaPriceMode = "literal" | "cached" | "missing" | "error" | "text";

function price(value: number, mode: FormulaPriceMode): ExcelJS.CellValue {
  if (mode === "literal") return value;
  if (mode === "missing") return { formula: `${value}/2*2` };
  if (mode === "error") return { formula: "1/0", result: { error: "#DIV/0!" } };
  if (mode === "text") return { formula: '"pending"', result: "pending" };
  return { formula: `${value}/2*2`, result: value };
}

function workbook(tag: string) {
  const value = new ExcelJS.Workbook();
  value.created = new Date("2026-05-01T00:00:00.000Z");
  value.modified = value.created;
  value.title = `Synthetic formula verification: ${tag}`;
  return value;
}

export async function weeklyFormulaWorkbook(mode: FormulaPriceMode, options: {
  mismatch?: boolean; shared?: boolean; missingSubtotal?: boolean; zero?: boolean;
  tag?: string; unmatched?: boolean; namedSubtotal?: boolean; event?: boolean;
} = {}) {
  const value = workbook(options.tag ?? "weekly");
  const sheet = value.addWorksheet("HISAB WEEKLY MONTHLY");
  sheet.addRow(["Date", "Description", "Amount"]);
  sheet.addRow(["2026-05-04", "Office lunch", options.shared ? price(100, "cached") : 100]);
  sheet.addRow(["2026-05-05", options.event ? "Synthetic wedding transport"
    : options.unmatched ? "Synthetic unmapped journal item" : "Office lunch", price(options.zero ? 0 : 100, mode)]);
  if (options.shared) sheet.getCell("C3").value = { sharedFormula: "C2", result: 100 };
  const total = options.zero ? 100 : 200;
  sheet.getCell("C4").value = options.missingSubtotal
    ? { formula: "SUM(C2:C3)" }
    : { formula: "SUM(C2:C3)", result: options.mismatch ? total - 10 : total };
  if (options.namedSubtotal) sheet.getCell("B4").value = "Office lunch summary";
  sheet.addRow(["Grand total", "", { formula: "SUM(C2:C3)", result: total }]);
  return Buffer.from(await value.xlsx.writeBuffer());
}

export async function fourSheetFormulaWorkbook(mode: "literal" | "cached", tag = "four-sheet") {
  const value = workbook(tag);
  const weekly = value.addWorksheet("HISAB WEEKLY MONTHLY");
  weekly.addRow(["Date", "Description", "Amount"]);
  weekly.addRow(["2026-05-04", "Office lunch", price(100, mode)]);
  const monthly = value.addWorksheet("MONTHLY WECHI");
  monthly.addRow(["Month", "Payee", "Category", "Amount"]);
  monthly.addRow(["2026-05", "Synthetic supplier", "Shared wifi", price(200, mode)]);
  const investment = value.addWorksheet("INVESTMENT");
  investment.addRow(["Date", "Item", "Vendor", "Quantity", "Amount"]);
  investment.addRow(["2026-05-05", "washing machine", "Synthetic supplier", 2, price(200, mode)]);
  const total = value.addWorksheet("monthly total expense");
  total.addRow(["Month", "Payee", "Category", "Amount"]);
  total.addRow(["2026-05", "Synthetic supplier", "office rent", price(150, mode)]);
  return Buffer.from(await value.xlsx.writeBuffer());
}
