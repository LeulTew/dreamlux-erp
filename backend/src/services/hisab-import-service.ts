import crypto from "crypto";
import ExcelJS from "exceljs";
import { PoolClient } from "pg";
import { insertFinanceAuditLog, roundMoney } from "../lib/finance-audit";
import {
  CAPITAL_INVESTMENT_CATEGORIES,
  CAPITAL_INVESTMENT_CLASSIFICATIONS,
  FINANCE_OPEX_CATEGORIES,
  FINANCE_OVERHEAD_CATEGORIES,
  FINANCE_OVERHEAD_PAYMENT_KINDS,
  FINANCE_OVERHEAD_SCOPES,
  HisabImportCommitInput,
} from "../lib/validation";

const KNOWN_SHEETS = [
  "HISAB WEEKLY MONTHLY",
  "MONTHLY WECHI",
  "INVESTMENT",
  "monthly total expense",
] as const;

const MONEY_TOLERANCE = 0.01;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const EVENT_EXPENSE_CATEGORIES = ["Fuel", "Labor", "Transportation", "Equipment Rental", "Consumables", "Other"] as const;

type KnownSheet = typeof KNOWN_SHEETS[number];
type ImportKind = "event_expense" | "operational_expense" | "overhead" | "investment";
type UnmatchedKind = "event" | "opex_category" | "overhead_category" | "investment_category";

export type ParsedHisabImportRow = {
  id: string;
  sheet: KnownSheet;
  rowNumber: number;
  kind: ImportKind;
  date: string;
  month: string;
  description: string;
  amount: number;
  category?: string;
  eventName?: string;
  payee?: string | null;
  vendor?: string | null;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  scope?: string;
  paymentKind?: string;
  capexClassification?: string;
  requiresResolution: Array<{ kind: UnmatchedKind; value: string }>;
};

export type HisabFormulaMismatch = {
  sheet: KnownSheet;
  rowNumber: number;
  label: string;
  expected: number;
  actual: number;
  delta: number;
};

export type HisabImportPreview = {
  workbookHash: string;
  sourceFilename: string | null;
  layoutVersion: "legacy-hisab-v1";
  knownSheets: KnownSheet[];
  missingSheets: KnownSheet[];
  rows: ParsedHisabImportRow[];
  unmatched: ParsedHisabImportRow["requiresResolution"];
  formulaMismatches: HisabFormulaMismatch[];
  blockingErrors: string[];
  warnings: string[];
  summary: {
    totalRows: number;
    eventExpenseRows: number;
    operationalExpenseRows: number;
    overheadRows: number;
    investmentRows: number;
    totalAmount: number;
  };
};

type CommitResolution = HisabImportCommitInput["resolutions"];

function textValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const cell = value as { text?: string; result?: unknown; formula?: string; richText?: Array<{ text?: string }> };
    if (typeof cell.text === "string") return cell.text.trim();
    if (cell.richText) return cell.richText.map((part) => part.text || "").join("").trim();
    if (cell.result != null) return textValue(cell.result);
  }
  return String(value).trim();
}

function numberValue(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object") {
    const cell = value as { result?: unknown };
    if (cell.result != null) return numberValue(cell.result);
  }
  const normalized = String(value).replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: unknown, fallbackMonth?: string): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = textValue(value);
  if (!text) return fallbackMonth ? `${fallbackMonth}-01` : null;
  if (MONTH_RE.test(text)) return `${text}-01`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return fallbackMonth ? `${fallbackMonth}-01` : null;
}

function monthFromDate(date: string): string {
  return date.slice(0, 7);
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function categoryMatch(value: string, allowed: readonly string[]): string | undefined {
  const normalized = normalizeKey(value);
  return allowed.find((category) => normalizeKey(category) === normalized);
}

function allowedMatch(value: string, allowed: readonly string[]): boolean {
  return Boolean(categoryMatch(value, allowed));
}

function inferOpexCategory(text: string): string | undefined {
  const normalized = normalizeKey(text);
  if (normalized.includes("transport") || normalized.includes("nedaj") || normalized.includes("fuel")) return "Transport";
  if (normalized.includes("rent") || normalized.includes("rental")) return "Rental";
  if (normalized.includes("labour") || normalized.includes("labor")) return "Labour";
  if (normalized.includes("lunch")) return "Lunch";
  if (normalized.includes("utility") || normalized.includes("wifi") || normalized.includes("water") || normalized.includes("electric")) return "Utilities";
  return categoryMatch(text, FINANCE_OPEX_CATEGORIES);
}

function inferEventExpenseCategory(text: string): string {
  const normalized = normalizeKey(text);
  if (normalized.includes("fuel") || normalized.includes("nedaj")) return "Fuel";
  if (normalized.includes("labor") || normalized.includes("labour") || normalized.includes("crew")) return "Labor";
  if (normalized.includes("transport")) return "Transportation";
  if (normalized.includes("rental") || normalized.includes("rent")) return "Equipment Rental";
  if (normalized.includes("consumable") || normalized.includes("supply")) return "Consumables";
  return "Other";
}

function inferOverheadCategory(text: string): string | undefined {
  const normalized = normalizeKey(text);
  if (normalized.includes("demoz") || normalized.includes("salary")) return "Salary";
  if (normalized.includes("nedaj") || normalized.includes("fuel")) return "Fuel";
  if (normalized.includes("car rental")) return "Car Rental";
  if (normalized.includes("wifi")) return "Wifi";
  if (normalized.includes("water") || normalized.includes("electric") || normalized.includes("utility")) return "Water & Electric";
  if (normalized.includes("boost") || normalized.includes("marketing")) return "Marketing/Boost";
  if (normalized.includes("sticker")) return "Sticker";
  if (normalized.includes("ekub") || normalized.includes("seasonal")) return "Seasonal/Ekub";
  if (normalized.includes("store")) return "Store Rent";
  if (normalized.includes("office")) return "Office Rent";
  if (normalized.includes("bet") || normalized.includes("house")) return "House Expense";
  return categoryMatch(text, FINANCE_OVERHEAD_CATEGORIES);
}

function inferInvestmentCategory(text: string): string | undefined {
  const normalized = normalizeKey(text);
  if (normalized.includes("washing") || normalized.includes("machine")) return "Equipment";
  if (normalized.includes("fabric") || normalized.includes("twill") || normalized.includes("cherek")) return "Fabric";
  if (normalized.includes("fixture")) return "Fixtures";
  if (normalized.includes("hardware")) return "Hardware";
  return categoryMatch(text, CAPITAL_INVESTMENT_CATEGORIES);
}

function rowCells(row: ExcelJS.Row): unknown[] {
  const cells: unknown[] = [];
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cells[colNumber - 1] = cell.value;
  });
  return cells;
}

function buildRowId(sheet: KnownSheet, rowNumber: number, kind: ImportKind): string {
  return `${sheet}:${rowNumber}:${kind}`.replace(/\s+/g, "_");
}

function collectFormulaMismatches(sheet: ExcelJS.Worksheet, sheetName: KnownSheet): HisabFormulaMismatch[] {
  const mismatches: HisabFormulaMismatch[] = [];
  sheet.eachRow((row) => {
    row.eachCell((cell, _colNumber) => {
      const value = cell.value as { formula?: string; result?: unknown } | null;
      if (!value || typeof value !== "object" || !value.formula) return;
      const formula = value.formula.toUpperCase().replace(/\s+/g, "");
      const sumMatch = formula.match(/^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/);
      if (!sumMatch) return;
      const [, startCol, startRowText, endCol, endRowText] = sumMatch;
      if (startCol !== endCol) return;
      const startRow = Number(startRowText);
      const endRow = Number(endRowText);
      const col = sheet.getColumn(startCol).number;
      let expected = 0;
      for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
        expected += numberValue(sheet.getRow(rowNumber).getCell(col).value) || 0;
      }
      const actual = numberValue(value.result);
      if (actual == null) return;
      const delta = roundMoney(actual - expected);
      if (Math.abs(delta) > MONEY_TOLERANCE) {
        mismatches.push({
          sheet: sheetName,
          rowNumber: row.number,
          label: textValue(row.getCell(1).value) || `Formula ${cell.address}`,
          expected: roundMoney(expected),
          actual: roundMoney(actual),
          delta,
        });
      }
    });
  });
  return mismatches;
}

function parseSheetRows(sheet: ExcelJS.Worksheet, sheetName: KnownSheet, fallbackMonth?: string): ParsedHisabImportRow[] {
  const rows: ParsedHisabImportRow[] = [];

  sheet.eachRow((row) => {
    const values = rowCells(row);
    if (values.some((value) => value && typeof value === "object" && "formula" in (value as Record<string, unknown>))) return;
    const joined = values.map(textValue).filter(Boolean).join(" ");
    if (!joined || /total|grand total/i.test(joined)) return;
    const amount = values.map(numberValue).filter((value): value is number => value != null && value > 0).at(-1);
    if (amount == null) return;

    const firstDate = values.map((value) => dateValue(value, undefined)).find(Boolean);
    const date = firstDate || (fallbackMonth ? `${fallbackMonth}-01` : "2026-01-01");
    const month = monthFromDate(date);
    const textCells = values.map(textValue).filter(Boolean);
    const description = textCells.join(" | ").slice(0, 1000);

    if (sheetName === "INVESTMENT") {
      const category = inferInvestmentCategory(description);
      const quantity = values.map(numberValue).filter((value): value is number => value != null && value > 0)[0] || 1;
      const unitCost = roundMoney(amount / quantity);
      const requiresResolution = category ? [] : [{ kind: "investment_category" as const, value: description.slice(0, 120) }];
      rows.push({
        id: buildRowId(sheetName, row.number, "investment"),
        sheet: sheetName,
        rowNumber: row.number,
        kind: "investment",
        date,
        month,
        description,
        amount: roundMoney(amount),
        category,
        vendor: textCells[2] || null,
        quantity,
        unit: "pcs",
        unitCost,
        capexClassification: category === "Fabric" ? "Inventory Asset" : "Capital Asset",
        requiresResolution,
      });
      return;
    }

    if (sheetName === "MONTHLY WECHI" || sheetName === "monthly total expense") {
      const category = inferOverheadCategory(description);
      const scope = /store/i.test(description) ? "Store" : /office/i.test(description) ? "Office" : /koti|shared/i.test(description) ? "Shared" : "General";
      const paymentKind = /salary|demoz/i.test(description) ? "staff_payment" : "overhead";
      const requiresResolution = category ? [] : [{ kind: "overhead_category" as const, value: description.slice(0, 120) }];
      rows.push({
        id: buildRowId(sheetName, row.number, "overhead"),
        sheet: sheetName,
        rowNumber: row.number,
        kind: "overhead",
        date,
        month,
        description,
        amount: roundMoney(amount),
        category,
        payee: textCells[1] || null,
        scope,
        paymentKind,
        requiresResolution,
      });
      return;
    }

    const maybeEvent = textCells.find((cell) => /event|wedding|proposal|graduation|birthday/i.test(cell));
    if (maybeEvent) {
      const category = inferEventExpenseCategory(description);
      rows.push({
        id: buildRowId(sheetName, row.number, "event_expense"),
        sheet: sheetName,
        rowNumber: row.number,
        kind: "event_expense",
        date,
        month,
        description,
        amount: roundMoney(amount),
        category,
        eventName: maybeEvent,
        requiresResolution: [{ kind: "event", value: maybeEvent }],
      });
      return;
    }

    const category = inferOpexCategory(description);
    rows.push({
      id: buildRowId(sheetName, row.number, "operational_expense"),
      sheet: sheetName,
      rowNumber: row.number,
      kind: "operational_expense",
      date,
      month,
      description,
      amount: roundMoney(amount),
      category,
      requiresResolution: category ? [] : [{ kind: "opex_category", value: description.slice(0, 120) }],
    });
  });

  return rows;
}

export async function parseHisabWorkbook(buffer: Buffer | Uint8Array, sourceFilename?: string | null): Promise<HisabImportPreview> {
  const workbookHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const knownSheets = KNOWN_SHEETS.filter((sheetName) => Boolean(workbook.getWorksheet(sheetName)));
  const missingSheets = KNOWN_SHEETS.filter((sheetName) => !workbook.getWorksheet(sheetName));
  const rows: ParsedHisabImportRow[] = [];
  const formulaMismatches: HisabFormulaMismatch[] = [];

  for (const sheetName of knownSheets) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;
    rows.push(...parseSheetRows(sheet, sheetName));
    formulaMismatches.push(...collectFormulaMismatches(sheet, sheetName));
  }

  const unmatched = rows.flatMap((row) => row.requiresResolution);
  const blockingErrors = [
    ...(knownSheets.length === 0 ? ["Workbook does not contain any known Hisab sheets"] : []),
    ...(rows.length === 0 ? ["Workbook did not contain importable finance rows"] : []),
  ];

  return {
    workbookHash,
    sourceFilename: sourceFilename || null,
    layoutVersion: "legacy-hisab-v1",
    knownSheets,
    missingSheets,
    rows,
    unmatched,
    formulaMismatches,
    blockingErrors,
    warnings: missingSheets.map((sheet) => `Known sheet not found: ${sheet}`),
    summary: {
      totalRows: rows.length,
      eventExpenseRows: rows.filter((row) => row.kind === "event_expense").length,
      operationalExpenseRows: rows.filter((row) => row.kind === "operational_expense").length,
      overheadRows: rows.filter((row) => row.kind === "overhead").length,
      investmentRows: rows.filter((row) => row.kind === "investment").length,
      totalAmount: roundMoney(rows.reduce((sum, row) => sum + row.amount, 0)),
    },
  };
}

function applyResolutions(rows: ParsedHisabImportRow[], resolutions: CommitResolution): ParsedHisabImportRow[] {
  return rows.map((row) => {
    const categoryResolution = resolutions.categories?.[row.id];
    const eventResolution = resolutions.events?.[row.id];
    const next = { ...row, requiresResolution: [...row.requiresResolution] };
    if (categoryResolution) next.category = categoryResolution;
    if (eventResolution) next.eventName = eventResolution.eventName;
    next.requiresResolution = next.requiresResolution.filter((item) => {
      if (item.kind === "event") return !eventResolution?.eventId;
      if (item.kind.endsWith("category")) return !categoryResolution;
      return true;
    });
    return next;
  });
}

function assertCommitRows(rows: ParsedHisabImportRow[], acceptedFormulaMismatches: boolean) {
  const unresolved = rows.flatMap((row) => row.requiresResolution);
  if (unresolved.length) {
    throw Object.assign(new Error("Resolve all unmatched workbook rows before committing"), { statusCode: 400 });
  }
  if (!acceptedFormulaMismatches) {
    throw Object.assign(new Error("Formula total mismatches must be reviewed and accepted before committing"), { statusCode: 400 });
  }
  for (const row of rows) {
    if (row.kind === "operational_expense" && !categoryMatch(row.category || "", FINANCE_OPEX_CATEGORIES)) {
      throw Object.assign(new Error(`Invalid operational expense category for ${row.id}`), { statusCode: 400 });
    }
    if (row.kind === "event_expense" && !allowedMatch(row.category || "", EVENT_EXPENSE_CATEGORIES)) {
      throw Object.assign(new Error(`Invalid event expense category for ${row.id}`), { statusCode: 400 });
    }
    if (row.kind === "overhead") {
      if (!allowedMatch(row.category || "", FINANCE_OVERHEAD_CATEGORIES)) throw Object.assign(new Error(`Invalid overhead category for ${row.id}`), { statusCode: 400 });
      if (!allowedMatch(row.scope || "", FINANCE_OVERHEAD_SCOPES)) throw Object.assign(new Error(`Invalid overhead scope for ${row.id}`), { statusCode: 400 });
      if (!allowedMatch(row.paymentKind || "", FINANCE_OVERHEAD_PAYMENT_KINDS)) throw Object.assign(new Error(`Invalid overhead payment kind for ${row.id}`), { statusCode: 400 });
    }
    if (row.kind === "investment") {
      if (!allowedMatch(row.category || "", CAPITAL_INVESTMENT_CATEGORIES)) throw Object.assign(new Error(`Invalid investment category for ${row.id}`), { statusCode: 400 });
      if (!allowedMatch(row.capexClassification || "", CAPITAL_INVESTMENT_CLASSIFICATIONS)) throw Object.assign(new Error(`Invalid investment classification for ${row.id}`), { statusCode: 400 });
    }
  }
}

export async function commitHisabImport(
  client: PoolClient,
  input: HisabImportCommitInput,
  userId: string,
): Promise<{ importId: string; inserted: Record<string, number> }> {
  const rows = applyResolutions(input.preview.rows, input.resolutions || {});
  assertCommitRows(rows, input.acceptFormulaMismatches || input.preview.formulaMismatches.length === 0);

  await client.query("BEGIN");
  try {
    const duplicate = await client.query(
      "SELECT id FROM finance_import_batches WHERE workbook_hash = $1 AND status = 'Committed' LIMIT 1",
      [input.workbookHash],
    );
    if ((duplicate.rowCount ?? 0) > 0) {
      throw Object.assign(new Error("This workbook has already been committed"), { statusCode: 409 });
    }

    const batchResult = await client.query(
      `INSERT INTO finance_import_batches
        (workbook_hash, source_filename, layout_version, status, row_counts, mismatch_count, unmatched_count, created_by, committed_at)
       VALUES ($1, $2, $3, 'Committed', $4::jsonb, $5, 0, $6, NOW())
       RETURNING id`,
      [
        input.workbookHash,
        input.sourceFilename || input.preview.sourceFilename || null,
        input.preview.layoutVersion,
        JSON.stringify(input.preview.summary),
        input.preview.formulaMismatches.length,
        userId,
      ],
    );
    const importId = batchResult.rows[0].id as string;

    const operationalRows = rows.filter((row) => row.kind === "operational_expense");
    const overheadRows = rows.filter((row) => row.kind === "overhead");
    const investmentRows = rows.filter((row) => row.kind === "investment");
    const eventRows = rows.filter((row) => row.kind === "event_expense");

    if (operationalRows.length) {
      await client.query(
        `INSERT INTO finance_operational_expenses
          (expense_date, category, amount, description, status, created_by, source_import_id)
         SELECT x.expense_date::date, x.category, x.amount::numeric, x.description, 'Pending', $2, $3::uuid
         FROM jsonb_to_recordset($1::jsonb) AS x(expense_date text, category text, amount numeric, description text)`,
        [JSON.stringify(operationalRows.map((row) => ({ expense_date: row.date, category: row.category, amount: row.amount, description: row.description }))), userId, importId],
      );
    }

    if (overheadRows.length) {
      await client.query(
        `INSERT INTO finance_overhead_expenses
          (expense_month, category, amount, payee, scope, shared_with, payment_kind, employee_id, is_recurring, due_date, notes, status, created_by, source_import_id)
         SELECT x.expense_month::date, x.category, x.amount::numeric, x.payee, x.scope, x.shared_with, x.payment_kind, NULL, false, NULL, x.notes, 'Pending', $2, $3::uuid
         FROM jsonb_to_recordset($1::jsonb) AS x(expense_month text, category text, amount numeric, payee text, scope text, shared_with text, payment_kind text, notes text)`,
        [JSON.stringify(overheadRows.map((row) => ({
          expense_month: `${row.month}-01`,
          category: row.category,
          amount: row.amount,
          payee: row.payee || null,
          scope: row.scope,
          shared_with: row.scope === "Shared" ? row.payee || "Imported workbook shared expense" : null,
          payment_kind: row.paymentKind,
          notes: row.description,
        }))), userId, importId],
      );
    }

    if (investmentRows.length) {
      await client.query(
        `INSERT INTO capital_investments
          (purchase_date, item_name, category, quantity, unit, unit_cost, vendor, notes, capex_classification, asset_id, creates_inventory_stock, status, created_by, source_import_id)
         SELECT x.purchase_date::date, x.item_name, x.category, x.quantity::numeric, x.unit, x.unit_cost::numeric, x.vendor, x.notes,
                x.capex_classification, NULL, false, 'Pending', $2, $3::uuid
         FROM jsonb_to_recordset($1::jsonb) AS x(purchase_date text, item_name text, category text, quantity numeric, unit text, unit_cost numeric, vendor text, notes text, capex_classification text)`,
        [JSON.stringify(investmentRows.map((row) => ({
          purchase_date: row.date,
          item_name: row.description.slice(0, 300),
          category: row.category,
          quantity: row.quantity || 1,
          unit: row.unit || "pcs",
          unit_cost: row.unitCost || row.amount,
          vendor: row.vendor || null,
          notes: row.description,
          capex_classification: row.capexClassification,
        }))), userId, importId],
      );
    }

    if (eventRows.length) {
      const eventResolutionRows = eventRows.map((row) => ({
        event_id: input.resolutions.events?.[row.id]?.eventId,
        category: row.category || "Other",
        amount: row.amount,
        description: row.description,
      }));
      await client.query(
        `INSERT INTO expenses (event_id, category, amount, description, status, created_by, source_import_id)
         SELECT x.event_id::uuid, x.category, x.amount::numeric, x.description, 'Pending', $2, $3::uuid
         FROM jsonb_to_recordset($1::jsonb) AS x(event_id text, category text, amount numeric, description text)`,
        [JSON.stringify(eventResolutionRows), userId, importId],
      );
    }

    await insertFinanceAuditLog(client, {
      entityType: "finance_import_batch",
      entityId: importId,
      userId,
      action: "commit",
      newValue: `layout=${input.preview.layoutVersion}; rows=${rows.length}; hash=${input.workbookHash.slice(0, 12)}`,
    });

    await client.query("COMMIT");
    return {
      importId,
      inserted: {
        eventExpenses: eventRows.length,
        operationalExpenses: operationalRows.length,
        overheads: overheadRows.length,
        investments: investmentRows.length,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      throw Object.assign(new Error("This workbook has already been committed"), { statusCode: 409 });
    }
    throw error;
  }
}
