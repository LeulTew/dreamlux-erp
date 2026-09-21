import { describe, expect, test } from "bun:test";
import { equipmentFixtureDdl } from "./dreamlux-equipment-fixture";
import { createDreamluxNativeFixture, reviewedSchemaTables } from "./dreamlux-native-fixture";
import { payrollFixtureDdl } from "./dreamlux-payroll-fixture";

describe("reviewed DreamLux equipment fixture boundaries", () => {
  test("extends the existing core DDL without importing bootstrap identities or data", async () => {
    const ddl = await equipmentFixtureDdl();
    expect(ddl.startsWith(await payrollFixtureDdl())).toBe(true);
    expect([...ddl.matchAll(/^CREATE TABLE IF NOT EXISTS /gm)]).toHaveLength(34);
    expect(ddl).not.toMatch(/^\s*(?:INSERT INTO|UPDATE \w+ SET|DELETE FROM|COPY )/im);
    expect(ddl).not.toMatch(/(?:postgres(?:ql)?:\/\/|\.supabase\.co|auth\.users)/i);
    expect(ddl).not.toContain("quantity_dispatched");
    expect(ddl).not.toContain("cancelled_at");
    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS event_logs");
    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS event_checklist");
    expect(ddl).toContain("entity_id UUID NOT NULL");
  });

  test("preserves the native item reference and immutable ledger constraints", async () => {
    const ddl = await equipmentFixtureDdl();
    expect([...ddl.matchAll(/REFERENCES items\(id\) ON DELETE CASCADE/g)]).toHaveLength(1);
    expect([...ddl.matchAll(/REFERENCES items\(id\) ON DELETE SET NULL/g)]).toHaveLength(2);
    expect([...ddl.matchAll(/REFERENCES items\(id\) ON DELETE RESTRICT/g)]).toHaveLength(4);
    expect(ddl).toContain("CREATE TRIGGER trg_inventory_movements_append_only");
    expect(ddl).toContain("CREATE TRIGGER trg_event_return_receipts_immutable");
    expect(ddl).toContain("CREATE TRIGGER trg_event_return_corrections_immutable");
    expect(ddl).toContain("CREATE TRIGGER trg_condition_resolutions_immutable");
  });

  test("fails closed on absent, duplicate or unsafe table selections", () => {
    const table = "CREATE TABLE IF NOT EXISTS items (\n  id UUID PRIMARY KEY\n);";
    expect(reviewedSchemaTables(table, ["items"])).toEqual([table]);
    expect(() => reviewedSchemaTables(table, ["users"])).toThrow("Expected one reviewed");
    expect(() => reviewedSchemaTables(`${table}\n${table}`, ["items"])).toThrow("Expected one reviewed");
    expect(() => reviewedSchemaTables(table, ["items;select"])).toThrow("Invalid reviewed");
  });

  test("rejects an invalid database or purpose before creating any client", async () => {
    await expect(createDreamluxNativeFixture("", "equipment_259", "")).rejects.toThrow("explicit local PostgreSQL target");
    const admin = `postgresql://dreamlux_parity:${"a".repeat(64)}@127.0.0.1:55434/postgres`;
    await expect(createDreamluxNativeFixture(admin, 'items";drop database postgres;--', "")).rejects.toThrow("Refusing a target");
  });
});
