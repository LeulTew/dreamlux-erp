import { describe, expect, test } from "bun:test";
import { importFixtureDdl } from "./dreamlux-import-fixture";

describe("independent DreamLux import fixture", () => {
  test("uses reviewed finance constraints and provenance without copying users or stock", async () => {
    const ddl = await importFixtureDdl();
    for (const table of [
      "categories", "items", "finance_import_batches", "expenses",
      "finance_operational_expenses", "finance_overhead_expenses",
      "finance_overhead_month_closures", "capital_investments",
    ]) {
      expect(ddl).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
    }
    expect(ddl).toContain("source_import_id UUID REFERENCES finance_import_batches(id)");
    expect(ddl).toContain("GENERATED ALWAYS AS (ROUND((quantity * unit_cost)::numeric, 2)) STORED");
    expect(ddl).toContain("CHECK (status IN ('Pending', 'Approved', 'Rejected'))");
    expect(ddl).toContain("ALTER TABLE public.finance_import_batches ENABLE ROW LEVEL SECURITY");
    expect(ddl).not.toMatch(/(?:INSERT\s+INTO|COPY)\s+(?:public\.)?(?:users|roles|items)\b/i);
  });
});
