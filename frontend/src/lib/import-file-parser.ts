import ExcelJS from "exceljs";

export type ImportTable = {
  headers: string[];
  rows: string[][];
};

export const isSupportedImportFile = (fileName: string) => /\.(csv|xlsx)$/i.test(fileName);

export const parseCsvText = (text: string): ImportTable => {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);

  return {
    headers: rows[0] || [],
    rows: rows.slice(1)
  };
};

const normalizeCell = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return normalizeCell(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }
  return String(value).trim();
};

export const parseXlsxBuffer = async (buffer: ArrayBuffer): Promise<ImportTable> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { headers: [], rows: [] };

  const sheetRows: string[][] = [];
  worksheet.eachRow((worksheetRow) => {
    const rowValues = Array.isArray(worksheetRow.values) ? worksheetRow.values.slice(1) : [];
    sheetRows.push(rowValues.map((cell) => normalizeCell(cell as ExcelJS.CellValue)));
  });

  const [headers = [], ...rows] = sheetRows;
  return {
    headers: headers.map((cell) => cell.trim()),
    rows: rows.filter((sheetRow) => sheetRow.some((cell) => cell.length > 0))
  };
};
