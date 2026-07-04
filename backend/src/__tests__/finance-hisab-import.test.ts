import "./setup";
import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import ExcelJS from "exceljs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { parseHisabWorkbook } from "../services/hisab-import-service";

const executedSql: string[] = [];
type MockQueryResult = { rows: any[]; rowCount: number };
const mockQuery = mock((sql: string, _params?: unknown[]): Promise<MockQueryResult> => {
  executedSql.push(String(sql));
  if (String(sql).includes("SELECT id, committed_at FROM finance_import_batches")) {
    return Promise.resolve({ rows: [], rowCount: 0 });
  }
  return Promise.resolve({ rows: [], rowCount: 0 });
});
const mockRelease = mock(() => {});
const mockConnect = mock(() =>
  Promise.resolve({
    query: mockQuery,
    release: mockRelease,
  }),
);

mock.module("../db/pool", () => ({
  pool: {
    query: mockQuery,
    connect: mockConnect,
  },
}));

let app: import("express").Application;

beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

function token(role = "ACCOUNTANT", permission_slugs?: string[]): string {
  return jwt.sign({ id: "user-1", role, username: "finance-user", permission_slugs }, "test-secret", { expiresIn: "1h" });
}

async function workbookBuffer(options: { mismatch?: boolean; includeUnknown?: boolean } = {}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const weekly = workbook.addWorksheet("HISAB WEEKLY MONTHLY");
  weekly.addRow(["Date", "Description", "Amount"]);
  weekly.addRow(["2026-05-04", "Wedding event transport", 1200]);
  weekly.addRow(["2026-05-05", options.includeUnknown ? "legacy handwritten misc" : "Office lunch", 900]);
  weekly.getCell("C4").value = { formula: "SUM(C2:C3)", result: options.mismatch ? 999 : 2100 };

  const monthly = workbook.addWorksheet("MONTHLY WECHI");
  monthly.addRow(["Month", "Payee", "Category", "Amount"]);
  monthly.addRow(["2026-05", "Koti", "Shared wifi", 1690]);

  const investments = workbook.addWorksheet("INVESTMENT");
  investments.addRow(["Date", "Item", "Vendor", "Amount"]);
  investments.addRow(["2026-05-10", "washing machine", "Merkato", 36500]);

  const total = workbook.addWorksheet("monthly total expense");
  total.addRow(["Month", "Payee", "Category", "Amount"]);
  total.addRow(["2026-05", "Dream Lux Office", "office rent", 25000]);

  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

beforeEach(() => {
  executedSql.length = 0;
  mockQuery.mockReset();
  mockQuery.mockImplementation((sql: string, _params?: unknown[]): Promise<MockQueryResult> => {
    executedSql.push(String(sql));
    if (String(sql).includes("INSERT INTO finance_import_batches")) {
      return Promise.resolve({ rows: [{ id: "11111111-1111-4111-8111-111111111111" }], rowCount: 1 } satisfies MockQueryResult);
    }
    return Promise.resolve({ rows: [], rowCount: 0 } satisfies MockQueryResult);
  });
  mockConnect.mockClear();
  mockRelease.mockClear();
});

describe("legacy Hisab workbook parser", () => {
  test("parses the four known workbook layouts without committing workbook cell data", async () => {
    const preview = await parseHisabWorkbook(await workbookBuffer(), "legacy-hisab.xlsx");

    expect([...preview.knownSheets].sort()).toEqual(([
      "HISAB WEEKLY MONTHLY",
      "INVESTMENT",
      "MONTHLY WECHI",
      "monthly total expense",
    ] as typeof preview.knownSheets).sort());
    expect(preview.summary.totalRows).toBeGreaterThanOrEqual(5);
    expect(preview.summary.operationalExpenseRows).toBeGreaterThanOrEqual(1);
    expect(preview.summary.overheadRows).toBe(2);
    expect(preview.summary.investmentRows).toBe(1);
    expect(preview.formulaMismatches).toHaveLength(0);
    expect(preview.workbookHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("detects formula total mismatches from cached Excel formula results", async () => {
    const preview = await parseHisabWorkbook(await workbookBuffer({ mismatch: true }), "bad-total.xlsx");

    expect(preview.formulaMismatches).toHaveLength(1);
    expect(preview.formulaMismatches[0].expected).toBe(2100);
    expect(preview.formulaMismatches[0].actual).toBe(999);
  });

  test("marks unknown categories as reconciliation blockers instead of guessing", async () => {
    const preview = await parseHisabWorkbook(await workbookBuffer({ includeUnknown: true }), "unknown.xlsx");

    expect(preview.unmatched.some((item) => item.kind === "opex_category")).toBe(true);
  });
});

describe("legacy Hisab import API", () => {
  test("preview requires finance import permission and accepts xlsx upload", async () => {
    const denied = await request(app)
      .post("/finance/imports/hisab/preview")
      .set("Authorization", `Bearer ${token("DRIVER")}`)
      .attach("workbook", await workbookBuffer(), "legacy-hisab.xlsx");
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .post("/finance/imports/hisab/preview")
      .set("Authorization", `Bearer ${token("ACCOUNTANT", ["finance:imports:write"])}`)
      .attach("workbook", await workbookBuffer(), "legacy-hisab.xlsx");
    expect(allowed.status).toBe(200);
    expect(allowed.body.workbookHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(allowed.body)).not.toContain("test-secret");
  });

  test("commit inserts pending rows with source_import_id in one transaction", async () => {
    const preview = await parseHisabWorkbook(await workbookBuffer(), "legacy-hisab.xlsx");
    const eventRow = preview.rows.find((row) => row.kind === "event_expense");
    expect(eventRow).toBeTruthy();

    const res = await request(app)
      .post("/finance/imports/hisab/commit")
      .set("Authorization", `Bearer ${token("ACCOUNTANT", ["finance:imports:write"])}`)
      .send({
        workbookHash: preview.workbookHash,
        sourceFilename: "legacy-hisab.xlsx",
        acceptFormulaMismatches: false,
        preview,
        resolutions: {
          events: {
            [eventRow!.id]: {
              eventId: "22222222-2222-4222-8222-222222222222",
            },
          },
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.inserted.operationalExpenses).toBeGreaterThanOrEqual(1);
    expect(executedSql[0]).toBe("BEGIN");
    expect(executedSql.some((sql) => sql.includes("INSERT INTO finance_operational_expenses") && sql.includes("source_import_id"))).toBe(true);
    expect(executedSql.some((sql) => sql.includes("INSERT INTO finance_overhead_expenses") && sql.includes("source_import_id"))).toBe(true);
    expect(executedSql.some((sql) => sql.includes("INSERT INTO capital_investments") && sql.includes("source_import_id"))).toBe(true);
    expect(executedSql.some((sql) => sql.includes("INSERT INTO expenses") && sql.includes("source_import_id"))).toBe(true);
    expect(executedSql.at(-1)).toBe("COMMIT");
  });

  test("commit blocks duplicate workbook fingerprints", async () => {
    const preview = await parseHisabWorkbook(await workbookBuffer(), "legacy-hisab.xlsx");
    const eventRow = preview.rows.find((row) => row.kind === "event_expense");
    mockQuery.mockImplementation((sql: string, _params?: unknown[]): Promise<MockQueryResult> => {
      executedSql.push(String(sql));
      if (String(sql).includes("SELECT id FROM finance_import_batches")) {
        return Promise.resolve({ rows: [{ id: "existing-import" }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const res = await request(app)
      .post("/finance/imports/hisab/commit")
      .set("Authorization", `Bearer ${token("ACCOUNTANT", ["finance:imports:write"])}`)
      .send({
        workbookHash: preview.workbookHash,
        preview,
        acceptFormulaMismatches: true,
        resolutions: {
          events: {
            [eventRow!.id]: { eventId: "22222222-2222-4222-8222-222222222222" },
          },
        },
      });

    expect(res.status).toBe(409);
    expect(executedSql).toContain("ROLLBACK");
  });

  test("commit rolls back when a target insert fails", async () => {
    const preview = await parseHisabWorkbook(await workbookBuffer(), "legacy-hisab.xlsx");
    const eventRow = preview.rows.find((row) => row.kind === "event_expense");
    mockQuery.mockImplementation((sql: string, _params?: unknown[]): Promise<MockQueryResult> => {
      executedSql.push(String(sql));
      if (String(sql).includes("INSERT INTO finance_import_batches")) {
        return Promise.resolve({ rows: [{ id: "11111111-1111-4111-8111-111111111111" }], rowCount: 1 });
      }
      if (String(sql).includes("INSERT INTO finance_overhead_expenses")) {
        return Promise.reject(new Error("constraint violation"));
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const res = await request(app)
      .post("/finance/imports/hisab/commit")
      .set("Authorization", `Bearer ${token("ACCOUNTANT", ["finance:imports:write"])}`)
      .send({
        workbookHash: preview.workbookHash,
        preview,
        acceptFormulaMismatches: true,
        resolutions: {
          events: {
            [eventRow!.id]: { eventId: "22222222-2222-4222-8222-222222222222" },
          },
        },
      });

    expect(res.status).toBe(500);
    expect(executedSql).toContain("ROLLBACK");
    expect(executedSql).not.toContain("COMMIT");
  });

  test("commit refuses unresolved workbook rows before opening a transaction", async () => {
    const preview = await parseHisabWorkbook(await workbookBuffer({ includeUnknown: true }), "unknown.xlsx");

    const res = await request(app)
      .post("/finance/imports/hisab/commit")
      .set("Authorization", `Bearer ${token("ACCOUNTANT", ["finance:imports:write"])}`)
      .send({ workbookHash: preview.workbookHash, preview, acceptFormulaMismatches: true, resolutions: {} });

    expect(res.status).toBe(400);
    expect(executedSql).not.toContain("BEGIN");
  });
});
