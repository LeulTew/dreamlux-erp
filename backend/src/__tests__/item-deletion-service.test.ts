import "./setup";
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { PoolClient, QueryResult } from "pg";
import { pool } from "../db/pool";
import { ActivityService } from "../services/activity-service";
import { permanentlyDeleteUnusedItem } from "../services/item-deletion-service";

const item = {
  id: "25900000-abcd-4259-8259-000000000001",
  name: "Synthetic unused equipment",
  quantity: 4,
  image_key: "synthetic/item.webp",
  deleted_at: new Date("2030-01-15T00:00:00Z"),
};
const actorId = "25900000-abcd-4259-8259-000000000002";
const result = (rows: Record<string, unknown>[] = [], rowCount: number | null = rows.length): QueryResult<Record<string, unknown>> =>
  ({ rows, rowCount, command: "SELECT", fields: [], oid: 0 });

let itemRows: Record<string, unknown>[];
let historyRows: Record<string, unknown>[];
let deletedCount: number | null;
let auditCount: number | null;
let failAt: string | null;
let failure: Error & { code?: string };
let rollbackFails: boolean;
let directAuditFails: boolean;
let restoreSpies = () => {};

const query = mock(async (text: string, _values?: unknown[]) => {
  const sql = text.toLowerCase();
  if (sql === "rollback" && rollbackFails) throw new Error("Synthetic rollback failure");
  if (failAt && sql.startsWith(failAt)) throw failure;
  if (sql.includes("from items") && sql.includes("for update")) return result(itemRows);
  if (sql.includes("as has_history")) return result(historyRows);
  if (sql.startsWith("delete from items")) return result([{ id: item.id }], deletedCount);
  if (sql.startsWith("insert into public.activity_logs")) return result([], auditCount);
  if (sql === "begin" || sql.startsWith("set local lock_timeout") || sql === "commit" || sql === "rollback") return result();
  throw new Error(`Unexpected mock transaction statement: ${text}`);
});
const release = mock((_discard?: boolean) => {});
const client = { query, release } as unknown as PoolClient;
const connectionTarget: { connect: () => Promise<PoolClient> } = pool;
const poolQueryTarget: { query: (text: string, values?: unknown[]) => Promise<QueryResult<Record<string, unknown>>> } = pool;

beforeEach(() => {
  itemRows = [{ ...item }];
  historyRows = [{ has_history: false }];
  deletedCount = 1;
  auditCount = 1;
  failAt = null;
  failure = new Error("Synthetic query failure");
  rollbackFails = false;
  directAuditFails = false;
  query.mockClear();
  release.mockClear();
  const connect = spyOn(connectionTarget, "connect").mockResolvedValue(client);
  const directQuery = spyOn(poolQueryTarget, "query").mockImplementation(async () => {
    if (directAuditFails) throw failure;
    return result([], 1);
  });
  connect.mockClear();
  directQuery.mockClear();
  const errors = spyOn(console, "error").mockImplementation(() => {});
  restoreSpies = () => {
    errors.mockRestore();
    directQuery.mockRestore();
    connect.mockRestore();
  };
});

afterEach(() => restoreSpies());

const statements = () => query.mock.calls.map(([sql]) => sql.toLowerCase());
const hasDeleted = () => statements().some((sql) => sql.startsWith("delete from items"));
const hasAudited = () => statements().some((sql) => sql.startsWith("insert into public.activity_logs"));

describe("permanent item deletion transaction", () => {
  test("locks trash, checks history, deletes and audits the stored UUID before committing", async () => {
    const deleted = await permanentlyDeleteUnusedItem(item.id.toUpperCase(), actorId);
    expect(deleted).toEqual(item);
    expect(query.mock.calls[0]?.[0]).toBe("begin");
    expect(query.mock.calls[1]?.[0]).toBe("set local lock_timeout = '10s'");
    expect(query.mock.calls[2]).toEqual([
      "select id, name, quantity, image_key, deleted_at from items where id=$1::uuid for update",
      [item.id.toUpperCase()],
    ]);
    expect(query.mock.calls[3]?.[1]).toEqual([item.id]);
    expect(query.mock.calls[4]).toEqual(["delete from items where id=$1::uuid returning id", [item.id]]);
    expect(query.mock.calls[5]?.[0]).toContain("INSERT INTO public.activity_logs");
    expect(query.mock.calls[5]?.[1]).toEqual([
      "asset", item.id, actorId, "permanent_delete", null,
      JSON.stringify({ name: item.name, quantity: item.quantity, deleted_at: item.deleted_at, image_key: item.image_key }),
      null, "Permanently deleted unused trashed item",
    ]);
    expect(query.mock.calls[6]?.[0]).toBe("commit");
    expect(query).toHaveBeenCalledTimes(7);
    expect(pool.query).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(false);
  });

  test("checks every current reference family without filtering retained or trashed parents", async () => {
    await permanentlyDeleteUnusedItem(item.id, actorId);
    const historySql = query.mock.calls[3]?.[0] ?? "";
    for (const table of [
      "event_allocations", "event_return_receipts", "event_return_corrections",
      "inventory_condition_resolutions", "inventory_movements", "inventory_reconciliation_items",
    ]) {
      expect(historySql).toContain(`exists(select 1 from ${table} where item_id=$1::uuid)`);
    }
    expect(historySql).toContain("exists(select 1 from capital_investments where asset_id=$1::uuid)");
    expect(historySql).not.toMatch(/deleted_at|status|join/i);
  });

  test("retains referenced equipment and does not write a deletion activity", async () => {
    historyRows = [{ has_history: true }];
    await expect(permanentlyDeleteUnusedItem(item.id, actorId)).rejects.toMatchObject({ status: 409, code: "ITEM_HAS_HISTORY" });
    expect(hasDeleted()).toBe(false);
    expect(hasAudited()).toBe(false);
    expect(statements().at(-1)).toBe("rollback");
    expect(release).toHaveBeenCalledWith(false);
  });

  test("returns not found without attempting destructive work", async () => {
    itemRows = [];
    await expect(permanentlyDeleteUnusedItem(item.id, actorId)).rejects.toMatchObject({ status: 404, code: "ITEM_NOT_FOUND" });
    expect(hasDeleted()).toBe(false);
    expect(hasAudited()).toBe(false);
    expect(statements().at(-1)).toBe("rollback");
  });

  test("requires already-trashed state even when the item is unused", async () => {
    itemRows = [{ ...item, deleted_at: null }];
    await expect(permanentlyDeleteUnusedItem(item.id, actorId)).rejects.toMatchObject({ status: 409, code: "ITEM_NOT_TRASHED" });
    expect(statements().some((sql) => sql.includes("as has_history"))).toBe(false);
    expect(hasDeleted()).toBe(false);
  });

  test.each([
    { rows: [] },
    { rows: [{ has_history: null }] },
    { rows: [{ has_history: "false" }] },
  ])("fails closed on an unverifiable history result: %j", async ({ rows }) => {
    historyRows = [...rows];
    await expect(permanentlyDeleteUnusedItem(item.id, actorId)).rejects.toThrow("Item history could not be verified");
    expect(hasDeleted()).toBe(false);
    expect(hasAudited()).toBe(false);
    expect(statements().at(-1)).toBe("rollback");
  });

  test.each([0, null, 2])("requires exactly one acknowledged deletion, not %s", async (rowCount) => {
    deletedCount = rowCount;
    await expect(permanentlyDeleteUnusedItem(item.id, actorId)).rejects.toThrow("Item deletion was not acknowledged");
    expect(hasAudited()).toBe(false);
    expect(statements()).not.toContain("commit");
    expect(statements().at(-1)).toBe("rollback");
  });

  test("does not fall back to unchecked deletion when a reference table query fails", async () => {
    failAt = "select (";
    failure = Object.assign(new Error("Synthetic missing reference relation"), { code: "42P01" });
    await expect(permanentlyDeleteUnusedItem(item.id, actorId)).rejects.toBe(failure);
    expect(hasDeleted()).toBe(false);
    expect(statements().at(-1)).toBe("rollback");
  });

  test.each([0, null, 2])("requires exactly one durable audit row, not %s", async (rowCount) => {
    auditCount = rowCount;
    await expect(permanentlyDeleteUnusedItem(item.id, actorId)).rejects.toThrow("Activity write was not acknowledged");
    expect(statements()).not.toContain("commit");
    expect(statements().at(-1)).toBe("rollback");
  });

  test("does not misclassify an audit foreign-key failure as item history", async () => {
    failAt = "insert into public.activity_logs";
    failure = Object.assign(new Error("Synthetic missing audit actor"), { code: "23503" });
    await expect(permanentlyDeleteUnusedItem(item.id, actorId)).rejects.toBe(failure);
    expect(statements()).not.toContain("commit");
    expect(statements().at(-1)).toBe("rollback");
  });

  test("rolls back instead of swallowing a required activity failure", async () => {
    failAt = "insert into public.activity_logs";
    await expect(permanentlyDeleteUnusedItem(item.id, actorId)).rejects.toBe(failure);
    expect(hasDeleted()).toBe(true);
    expect(hasAudited()).toBe(true);
    expect(statements()).not.toContain("commit");
    expect(statements().at(-1)).toBe("rollback");
    expect(pool.query).not.toHaveBeenCalled();
  });

  test.each([
    { databaseCode: "23503", expectedCode: "ITEM_HAS_HISTORY" },
    { databaseCode: "55P03", expectedCode: "ITEM_DELETE_BUSY" },
    { databaseCode: "40P01", expectedCode: "ITEM_DELETE_BUSY" },
  ])("returns a bounded conflict for PostgreSQL $databaseCode", async ({ databaseCode, expectedCode }) => {
    failAt = "delete from items";
    failure = Object.assign(new Error("Synthetic database conflict"), { code: databaseCode });
    await expect(permanentlyDeleteUnusedItem(item.id, actorId)).rejects.toMatchObject({ status: 409, code: expectedCode });
    expect(hasAudited()).toBe(false);
    expect(statements().at(-1)).toBe("rollback");
  });

  test("never reports success after lost commit acknowledgement and discards the connection", async () => {
    failAt = "commit";
    failure = Object.assign(new Error("Synthetic commit acknowledgement failure"), { code: "23503" });
    await expect(permanentlyDeleteUnusedItem(item.id, actorId)).rejects.toMatchObject({ status: 503, code: "ITEM_DELETE_UNCONFIRMED" });
    expect(statements().at(-1)).toBe("rollback");
    expect(release).toHaveBeenCalledWith(true);
  });

  test("preserves the original failure and discards a connection whose rollback fails", async () => {
    failAt = "insert into public.activity_logs";
    rollbackFails = true;
    await expect(permanentlyDeleteUnusedItem(item.id, actorId)).rejects.toBe(failure);
    expect(release).toHaveBeenCalledWith(true);
  });
});

describe("existing best-effort activity callers", () => {
  const activity = { entity_type: "asset", entity_id: item.id, user_id: actorId, action: "update" };

  test("still return true after a successful pooled activity write", async () => {
    await expect(ActivityService.logActivity(activity)).resolves.toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(connectionTarget.connect).not.toHaveBeenCalled();
  });

  test("still return false rather than throw after a pooled activity failure", async () => {
    directAuditFails = true;
    await expect(ActivityService.logActivity(activity)).resolves.toBe(false);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(connectionTarget.connect).not.toHaveBeenCalled();
  });
});
