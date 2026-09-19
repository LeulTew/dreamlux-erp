import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import { parseHisabWorkbook } from "../services/hisab-import-service";
import { fourSheetFormulaWorkbook as fourSheets, weeklyFormulaWorkbook as weekly } from "../db/testing/hisab-formula-workbook";

describe("formula-priced Hisab transactions", () => {
  test("literal controls exclude labelled and unlabelled SUM subtotals", async () => {
    const preview = await parseHisabWorkbook(await weekly("literal"), "literal-control.xlsx");
    expect(preview.summary.totalRows).toBe(2);
    expect(preview.summary.totalAmount).toBe(200);
    expect(preview.rows.map((row) => row.rowNumber)).toEqual([2, 3]);
    expect(preview.formulaMismatches).toEqual([]);
    expect(preview.blockingErrors).toEqual([]);
  });

  test("retains the cached formula transaction instead of silently importing half the workbook", async () => {
    const preview = await parseHisabWorkbook(await weekly("cached"), "calculated-price.xlsx");
    expect(preview.rows.map((row) => [row.rowNumber, row.amount])).toEqual([[2, 100], [3, 100]]);
    expect(preview.summary.totalRows).toBe(2);
    expect(preview.summary.totalAmount).toBe(200);
    expect(preview.unmatched).toEqual([]);
    expect(preview.formulaMismatches).toEqual([]);
    expect(preview.blockingErrors).toEqual([]);
  });

  test("preserves cached/literal equivalence across all four supported layouts", async () => {
    const literal = await parseHisabWorkbook(await fourSheets("literal"), "control.xlsx");
    const calculated = await parseHisabWorkbook(await fourSheets("cached"), "calculated.xlsx");
    expect(calculated.rows).toEqual(literal.rows);
    expect(calculated.summary).toEqual(literal.summary);
    expect(calculated.summary.totalAmount).toBe(650);
    expect(calculated.rows.find((row) => row.kind === "investment")).toMatchObject({ quantity: 2, unitCost: 100 });
    expect(calculated.blockingErrors).toEqual([]);
  });

  test("retains shared-formula cached transactions with their master", async () => {
    const preview = await parseHisabWorkbook(await weekly("cached", { shared: true }));
    expect(preview.rows.map((row) => [row.rowNumber, row.amount])).toEqual([[2, 100], [3, 100]]);
    expect(preview.summary.totalAmount).toBe(200);
  });

  test("preserves cached dates, descriptions, numeric strings and boolean metadata like literal cells", async () => {
    const previews = [];
    for (const calculated of [false, true]) {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("HISAB WEEKLY MONTHLY");
      const date = new Date("2026-05-04T00:00:00.000Z");
      sheet.addRow(["Date", "Description", "Amount ETB", "Reviewed"]);
      sheet.addRow([
        calculated ? { formula: "DATE(2026,5,4)", result: date } : date,
        calculated ? { formula: '"Office lunch"', result: "Office lunch" } : "Office lunch",
        calculated ? { formula: '"1,234.50"', result: "1,234.50" } : "1,234.50",
        calculated ? { formula: "1=1", result: true } : true,
      ]);
      sheet.getCell("A2").numFmt = "yyyy-mm-dd";
      previews.push(await parseHisabWorkbook(Buffer.from(await workbook.xlsx.writeBuffer())));
    }
    expect(previews[1].rows).toEqual(previews[0].rows);
    expect(previews[1].rows[0]).toMatchObject({ date: "2026-05-04", amount: 1234.5, category: "Lunch" });
    expect(previews[1].blockingErrors).toEqual([]);
  });

  test("retains headerless transaction parsing and formula-only summary exclusion", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("HISAB WEEKLY MONTHLY");
    sheet.addRow(["2026-05-04", "Office lunch", { formula: "40+60", result: 100 }]);
    sheet.addRow(["", "", { formula: "SUM(C1:C1)", result: 100 }]);
    const preview = await parseHisabWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(preview.rows.map((row) => [row.rowNumber, row.amount])).toEqual([[1, 100]]);
    expect(preview.blockingErrors).toEqual([]);
  });

  test.each(["missing", "error", "text"] as const)("blocks a %s transaction result without guessing or dropping it silently", async (mode) => {
    const preview = await parseHisabWorkbook(await weekly(mode));
    expect(preview.blockingErrors.some((error) => error.includes("HISAB WEEKLY MONTHLY") && error.includes("C3"))).toBe(true);
    expect(preview.rows.map((row) => row.rowNumber)).toEqual([2]);
  });

  test("preserves cached subtotal mismatch evidence separately from transaction rows", async () => {
    const preview = await parseHisabWorkbook(await weekly("cached", { mismatch: true }));
    expect(preview.summary.totalAmount).toBe(200);
    expect(preview.formulaMismatches).toEqual([expect.objectContaining({ rowNumber: 4, expected: 200, actual: 190, delta: -10 })]);
  });

  test("does not turn an uncalculated formula-only subtotal into a transaction blocker", async () => {
    const preview = await parseHisabWorkbook(await weekly("cached", { missingSubtotal: true }));
    expect(preview.summary.totalRows).toBe(2);
    expect(preview.blockingErrors).toEqual([]);
  });

  test("a cached zero follows the existing positive-amount import rule rather than being a missing cache", async () => {
    const literal = await parseHisabWorkbook(await weekly("literal", { zero: true }));
    const calculated = await parseHisabWorkbook(await weekly("cached", { zero: true }));
    expect(calculated.rows).toEqual(literal.rows);
    expect(calculated.blockingErrors).toEqual([]);
    expect(calculated.summary.totalAmount).toBe(100);
  });

  test("retains an undated vertical SUM summary even when its label matches an expense category", async () => {
    const preview = await parseHisabWorkbook(await weekly("cached", { namedSubtotal: true }));
    expect(preview.rows.map((row) => row.rowNumber)).toEqual([2, 3]);
    expect(preview.summary.totalAmount).toBe(200);
  });

  test("uses the explicit Amount header rather than trailing numeric calculation inputs", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("HISAB WEEKLY MONTHLY");
    sheet.addRow(["Date", "Description", "Amount", "Part A", "Part B"]);
    sheet.addRow(["2026-05-04", "Office lunch", { formula: "SUM(D2:E2)", result: 100 }, 40, 60]);
    const preview = await parseHisabWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(preview.summary.totalAmount).toBe(100);
    expect(preview.rows).toHaveLength(1);
    expect(preview.blockingErrors).toEqual([]);
  });

  test("does not discard an explicitly dated SUM-priced transaction as an undated summary", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("HISAB WEEKLY MONTHLY");
    sheet.addRow(["Date", "Description", "Amount"]);
    sheet.addRow(["2026-05-04", "Office lunch", 40]);
    sheet.addRow(["2026-05-05", "Office lunch", 60]);
    sheet.addRow(["2026-05-06", "Office lunch", { formula: "SUM(C2:C3)", result: 100 }]);
    sheet.addRow(["Total", "", { formula: "SUM(C2:C4)", result: 200 }]);
    const preview = await parseHisabWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(preview.rows.map((row) => row.rowNumber)).toEqual([2, 3, 4]);
    expect(preview.summary.totalAmount).toBe(200);
    expect(preview.formulaMismatches).toEqual([]);
  });

  test("retains every calculated transaction at the 5000-row commit limit without importing its total", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("HISAB WEEKLY MONTHLY");
    sheet.addRow(["Date", "Description", "Amount"]);
    for (let index = 0; index < 5000; index += 1) {
      sheet.addRow(["2026-05-04", "Office lunch", { formula: "20/2", result: 10 }]);
    }
    sheet.addRow(["Total", "", { formula: "SUM(C2:C5001)", result: 50000 }]);
    const preview = await parseHisabWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(preview.summary).toMatchObject({ totalRows: 5000, totalAmount: 50000 });
    expect(preview.rows[4999].rowNumber).toBe(5001);
    expect(preview.formulaMismatches).toEqual([]);
    expect(preview.blockingErrors).toEqual([]);
  });
});
