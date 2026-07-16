import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(join(process.cwd(), "src/db/migrations/inventory_workflow_completion.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8");
const normalizedMigration = migration.replaceAll("public.", "");

describe("inventory workflow completion migration", () => {
  test("keeps executable migration and schema parity for correction history", () => {
    for (const fragment of [
      "CREATE TABLE IF NOT EXISTS event_return_corrections",
      "uq_event_return_corrections_idem",
      "trg_event_return_corrections_immutable",
      "ENABLE ROW LEVEL SECURITY",
      "idx_inventory_movements_source_id",
      "idx_event_allocations_open_returns",
      "idx_event_return_receipts_event_history",
    ]) {
      expect(normalizedMigration).toContain(fragment);
      expect(schema).toContain(fragment);
    }
  });

  test("migration is retry-safe and denies direct client table access", () => {
    expect(migration).toContain("DROP TRIGGER IF EXISTS trg_event_return_corrections_immutable");
    expect(migration).toContain("REVOKE ALL ON TABLE public.event_return_corrections");
    expect(migration).toContain("WHERE idempotency_key IS NOT NULL");
  });
});
