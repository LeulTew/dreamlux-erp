import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const schemaSql = readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8");
const srdParitySql = readFileSync(join(process.cwd(), "src/db/migrations/srd_parity.sql"), "utf8");

describe("event labor automation schema", () => {
  test("enforces one active auto-generated labor expense per event", () => {
    for (const sql of [schemaSql, srdParitySql]) {
      expect(sql).toContain("idx_expenses_auto_labor_once_per_event");
      expect(sql).toContain("description = 'Auto-generated labor cost from attended event assignments'");
      expect(sql).toContain("status != 'Rejected'");
    }
  });
});
