import "./setup";
import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

type Result = { rows: Record<string, unknown>[]; rowCount: number | null };
let failOn: string | null = null;
let failure: unknown = new Error("Synthetic acknowledgement loss");
const executed: string[] = [];
const mockQuery = mock(async (sql: string): Promise<Result> => {
  executed.push(sql);
  if (failOn && sql === failOn) throw failure;
  return { rows: [], rowCount: 1 };
});
const mockRelease = mock((_discard?: boolean) => {});
const mockConnect = mock(async () => ({ query: mockQuery, release: mockRelease }));

mock.module("../db/pool", () => ({ pool: { query: mockQuery, connect: mockConnect } }));

type AuditModule = typeof import("../lib/finance-audit");
type TransactionModule = typeof import("../lib/finance-transaction");
let insertFinanceAuditLog: AuditModule["insertFinanceAuditLog"];
let FinanceMutationError: TransactionModule["FinanceMutationError"];
let acknowledgeRow: TransactionModule["acknowledgeRow"];
let acknowledgeRows: TransactionModule["acknowledgeRows"];
let runFinanceTransaction: TransactionModule["runFinanceTransaction"];
let sendFinanceMutationFailure: TransactionModule["sendFinanceMutationFailure"];

beforeAll(async () => {
  ({ insertFinanceAuditLog } = await import("../lib/finance-audit"));
  ({
    FinanceMutationError, acknowledgeRow, acknowledgeRows, runFinanceTransaction, sendFinanceMutationFailure,
  } = await import("../lib/finance-transaction"));
});

type Outcome = { ok?: true; status?: number; body?: unknown };

function response() {
  const captured: Outcome = {};
  const res = {
    status(code: number) { captured.status = code; return res; },
    json(body: unknown) { captured.body = body; return res; },
  };
  return { res: res as unknown as import("express").Response, captured };
}

async function outcome(operation: () => Promise<unknown>): Promise<Outcome> {
  try {
    await operation();
    return { ok: true };
  } catch (error) {
    const { res, captured } = response();
    sendFinanceMutationFailure(res, "finance-transaction-test", error, () => "redacted");
    return captured;
  }
}

beforeEach(() => {
  failOn = null;
  failure = new Error("Synthetic acknowledgement loss");
  executed.length = 0;
  mockQuery.mockClear();
  mockRelease.mockClear();
  mockConnect.mockClear();
});

describe("finance audit acknowledgement", () => {
  const input = { entityType: "finance_operational_expense", entityId: "expense-1", userId: null, action: "create" };

  test("accepts exactly one acknowledged audit row", async () => {
    const client = { query: mock(async () => ({ rows: [], rowCount: 1 })) };
    await expect(insertFinanceAuditLog(client as never, input)).resolves.toBeUndefined();
  });

  test.each([0, null, 2])("rejects an unacknowledged or ambiguous audit row count: %s", async (rowCount) => {
    const client = { query: mock(async () => ({ rows: [], rowCount })) };
    await expect(insertFinanceAuditLog(client as never, input)).rejects.toThrow("Finance audit write was not acknowledged");
  });

  test("requires the exact expected business row count", () => {
    expect(acknowledgeRows({ rows: [], rowCount: 3 } as never, 3, "Bulk insert")).toEqual([]);
    expect(() => acknowledgeRows({ rows: [], rowCount: 2 } as never, 3, "Bulk insert")).toThrow("Bulk insert was not acknowledged");
    expect(() => acknowledgeRow({ rows: [], rowCount: 1 } as never, "Returned row")).toThrow("Returned row was not acknowledged");
    expect(acknowledgeRow({ rows: [{ id: "a" }], rowCount: 1 } as never, "Returned row")).toEqual({ id: "a" });
  });
});

describe("finance transaction ownership", () => {
  test("commits once and returns a healthy connection", async () => {
    await expect(runFinanceTransaction({ subject: "Test change" }, async () => "saved")).resolves.toBe("saved");
    expect(executed).toEqual(["BEGIN", "COMMIT"]);
    expect(mockRelease.mock.calls).toEqual([[false]]);
  });

  test("rolls back an explicit rejection and keeps its response", async () => {
    const result = await outcome(() => runFinanceTransaction({ subject: "Test change" }, async () => {
      throw new FinanceMutationError(409, "Already reviewed");
    }));
    expect(result).toEqual({ status: 409, body: { error: "Already reviewed" } });
    expect(executed).toEqual(["BEGIN", "ROLLBACK"]);
    expect(mockRelease.mock.calls).toEqual([[false]]);
  });

  test("reports a failed COMMIT as uncertain, never replays it, and discards the connection", async () => {
    failOn = "COMMIT";
    const result = await outcome(() => runFinanceTransaction({ subject: "Test change" }, async () => "saved"));
    expect(result).toEqual({
      status: 503,
      body: { error: "Test change could not be confirmed. Reload before retrying.", code: "FINANCE_OUTCOME_UNCERTAIN", outcome_uncertain: true },
    });
    expect(executed.filter((sql) => sql === "COMMIT")).toHaveLength(1);
    expect(mockRelease.mock.calls).toEqual([[true]]);
  });

  test("keeps a known pre-commit failure known when ROLLBACK acknowledgement is lost", async () => {
    failOn = "ROLLBACK";
    const result = await outcome(() => runFinanceTransaction({ subject: "Test change" }, async () => {
      throw new Error("Finance audit write was not acknowledged");
    }));
    expect(result).toEqual({ status: 500, body: { error: "Finance audit write was not acknowledged", outcome_uncertain: false } });
    expect(executed).not.toContain("COMMIT");
    expect(mockRelease.mock.calls).toEqual([[true]]);
  });

  test("attempts ROLLBACK after a lost BEGIN acknowledgement and reuses the reset connection", async () => {
    failOn = "BEGIN";
    const result = await outcome(() => runFinanceTransaction({ subject: "Test change" }, async () => "saved"));
    expect(result).toEqual({ status: 500, body: { error: "Synthetic acknowledgement loss", outcome_uncertain: false } });
    expect(executed).toEqual(["BEGIN", "ROLLBACK"]);
    expect(mockRelease.mock.calls).toEqual([[false]]);
  });

  test("surfaces connection acquisition failure as a known failure", async () => {
    mockConnect.mockImplementationOnce(async () => { throw new Error("Synthetic pool outage"); });
    const result = await outcome(() => runFinanceTransaction({ subject: "Test change" }, async () => "saved"));
    expect(result).toEqual({ status: 500, body: { error: "Synthetic pool outage", outcome_uncertain: false } });
    expect(executed).toEqual([]);
  });

  test("applies caller classification only to pre-commit failures", async () => {
    const duplicate = Object.assign(new Error("duplicate key"), { code: "23505" });
    const classify = (error: unknown) => (error as { code?: string }).code === "23505"
      ? new FinanceMutationError(409, "Already committed") : null;
    expect(await outcome(() => runFinanceTransaction({ subject: "Import", classify }, async () => { throw duplicate; })))
      .toEqual({ status: 409, body: { error: "Already committed" } });
    failOn = "COMMIT";
    failure = duplicate;
    expect((await outcome(() => runFinanceTransaction({ subject: "Import", classify }, async () => "saved"))).status).toBe(503);
  });
});
