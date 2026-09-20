import { describe, expect, spyOn, test } from "bun:test";
import ExcelJS from "exceljs";
import { parseHisabWorkbook } from "../services/hisab-import-service";

type RowVisitor = (row: ExcelJS.Row, number: number) => void;

async function workbookBytes(formula: string, result: number | null = 100) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("HISAB WEEKLY MONTHLY");
  sheet.addRow(["Date", "Description", "Amount"]);
  sheet.addRow(["2026-05-04", "Office lunch", 100]);
  sheet.addRow(["Total", "", null, result === null ? { formula } : { formula, result }]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function observedParse(bytes: Buffer) {
  const reference = new ExcelJS.Workbook().addWorksheet("Prototype reference");
  const methods = Object.getPrototypeOf(reference) as Pick<ExcelJS.Worksheet, "eachRow" | "getRow">;
  const originalEachRow = methods.eachRow;
  const originalGetRow = methods.getRow;
  const observed = new Set<ExcelJS.Worksheet>();
  let rowAllocatingReads = 0;
  const visit = spyOn(methods, "eachRow").mockImplementation(function (
    this: ExcelJS.Worksheet,
    options: RowVisitor | { includeEmpty: boolean },
    iterator?: RowVisitor,
  ) {
    observed.add(this);
    Reflect.apply(originalEachRow, this, iterator ? [options, iterator] : [options]);
  });
  const rows = spyOn(methods, "getRow").mockImplementation(function (this: ExcelJS.Worksheet, index: number) {
    rowAllocatingReads += 1;
    // Reversing the fix must fail safely instead of allocating a million empty rows.
    if (rowAllocatingReads > 20_000) throw new Error("SUM allocation regression exceeded the bounded test safety ceiling");
    return Reflect.apply(originalGetRow, this, [index]);
  });
  let preview: Awaited<ReturnType<typeof parseHisabWorkbook>>;
  try {
    preview = await parseHisabWorkbook(bytes, "synthetic-sparse-range.xlsx");
  } finally {
    rows.mockRestore();
    visit.mockRestore();
  }
  const worksheets = [...observed].map((sheet) => {
    const cells: Array<{ row: number; width: number }> = [];
    sheet.eachRow((row) => cells.push({ row: row.number, width: row.cellCount }));
    return { rows: sheet.rowCount, populated: sheet.actualRowCount, cells };
  });
  return { preview, rowAllocatingReads, worksheets };
}

describe("bounded Hisab SUM verification", () => {
  test("preserves the ordinary literal transaction and matching cached subtotal", async () => {
    const { preview } = await observedParse(await workbookBytes("SUM(C2:C3)"));
    expect(preview.summary).toMatchObject({ totalRows: 1, totalAmount: 100 });
    expect(preview.formulaMismatches).toEqual([]);
    expect(preview.blockingErrors).toEqual([]);
  });

  test("does not materialize ten thousand rows from a three-row workbook", async () => {
    const result = await observedParse(await workbookBytes("SUM(C2:C10000)"));
    expect(result.preview.summary).toMatchObject({ totalRows: 1, totalAmount: 100 });
    expect(result.preview.formulaMismatches).toEqual([]);
    expect(result.worksheets).toEqual([{
      rows: 3, populated: 3, cells: [{ row: 1, width: 3 }, { row: 2, width: 3 }, { row: 3, width: 4 }],
    }]);
    expect(result.rowAllocatingReads).toBe(0);
  });

  test("does not create absent cells while checking a different existing column", async () => {
    const result = await observedParse(await workbookBytes("SUM(Z2:Z3)", 0));
    expect(result.preview.formulaMismatches).toEqual([]);
    expect(result.worksheets[0].cells).toEqual([{ row: 1, width: 3 }, { row: 2, width: 3 }, { row: 3, width: 4 }]);
    expect(result.rowAllocatingReads).toBe(0);
  });

  test("handles the valid Excel last row without range-sized allocation", async () => {
    const result = await observedParse(await workbookBytes("SUM(C2:C1048576)"));
    expect(result.preview.summary.totalAmount).toBe(100);
    expect(result.preview.formulaMismatches).toEqual([]);
    expect(result.worksheets[0].rows).toBe(3);
    expect(result.rowAllocatingReads).toBe(0);
  });

  test("retains exact mismatch evidence for a sparse, wide subtotal", async () => {
    const result = await observedParse(await workbookBytes(" SUM( C2 : C10000 ) ", 105));
    expect(result.preview.formulaMismatches).toEqual([{
      sheet: "HISAB WEEKLY MONTHLY", rowNumber: 3, label: "Total",
      expected: 100, actual: 105, delta: 5,
    }]);
    expect(result.worksheets[0].rows).toBe(3);
    expect(result.rowAllocatingReads).toBe(0);
  });

  test("does not expand a range merely because its subtotal cache is absent", async () => {
    const result = await observedParse(await workbookBytes("SUM(C2:C10000)", null));
    expect(result.preview.summary.totalAmount).toBe(100);
    expect(result.preview.formulaMismatches).toEqual([]);
    expect(result.worksheets[0].rows).toBe(3);
    expect(result.rowAllocatingReads).toBe(0);
  });

  test("preserves sparse inclusive boundaries, cached numbers and numeric strings", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("HISAB WEEKLY MONTHLY");
    sheet.addRow(["Date", "Description", "Amount"]);
    sheet.getCell("A2").value = "2026-05-04";
    sheet.getCell("B2").value = "Office lunch";
    sheet.getCell("C2").value = 100;
    sheet.getCell("C3").value = { formula: "6.5/2", result: 3.25 };
    sheet.getCell("C9").value = "4.75";
    sheet.getCell("C10").value = 1000;
    sheet.getCell("A11").value = "Total";
    sheet.getCell("D11").value = { formula: "SUM(C3:C9)", result: 8 };
    const result = await observedParse(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(result.preview.formulaMismatches).toEqual([]);
    expect(result.rowAllocatingReads).toBe(0);
  });

  test("does not include out-of-range magnitude in decimal rounding", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("HISAB WEEKLY MONTHLY");
    sheet.addRow(["Date", "Description", "Amount"]);
    sheet.addRow(["2026-05-04", "Office lunch", 100]);
    sheet.getCell("C3").value = 0.11;
    sheet.getCell("C5").value = 0.22;
    sheet.getCell("A6").value = "Total";
    sheet.getCell("D6").value = { formula: "SUM(C3:C5)", result: 0.33 };
    const result = await observedParse(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(result.preview.formulaMismatches).toEqual([]);
    expect(result.rowAllocatingReads).toBe(0);
  });

  test.each([
    { formula: "SUM(C2:D3)", result: 999 },
    { formula: "SUM($C$2:$C$3)", result: 999 },
    { formula: "SUM(C2,C3)", result: 999 },
    { formula: "SUBTOTAL(9,C2:C3)", result: 999 },
    { formula: "SUM(C3:C2)", result: 0 },
    { formula: "SUM(C0:C3)", result: 100 },
  ])("preserves the existing checker scope for $formula", async ({ formula, result }) => {
    const parsed = await observedParse(await workbookBytes(formula, result));
    expect(parsed.preview.summary.totalAmount).toBe(100);
    expect(parsed.preview.formulaMismatches).toEqual([]);
    expect(parsed.worksheets[0].rows).toBe(3);
  });
});
