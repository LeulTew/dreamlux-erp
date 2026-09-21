import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createDreamluxNativeFixture, reviewedSchemaTables } from "./dreamlux-native-fixture";
import { payrollFixtureDdl } from "./dreamlux-payroll-fixture";

const TABLES = [
  "event_logs", "event_checklist", "vehicles", "vehicle_assignments", "trips",
  "categories", "items", "inventory_reconciliation_runs", "inventory_reconciliation_items",
  "finance_import_batches", "event_allocations", "event_return_receipts",
  "inventory_condition_resolutions", "event_return_corrections", "capital_investments",
  "inventory_movements",
] as const;
const INDEXES = [
  "idx_event_logs_event_id", "idx_event_allocations_event",
  "idx_items_deleted_at", "idx_recon_items_item_id", "idx_event_allocations_item",
  "uq_event_return_receipts_idem", "idx_event_return_receipts_allocation",
  "uq_inventory_condition_resolution_idem", "idx_inventory_condition_resolutions_item",
  "uq_event_return_corrections_idem", "idx_event_return_corrections_allocation",
  "uq_inventory_movements_source", "idx_inventory_movements_item", "idx_capital_investments_asset",
] as const;

export async function equipmentFixtureDdl(): Promise<string> {
  const schema = await readFile(join(__dirname, "..", "schema.sql"), "utf8");
  const tables = reviewedSchemaTables(schema, TABLES);
  const indexes = INDEXES.map((name) => {
    const matches = [...schema.matchAll(new RegExp(`^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS ${name}\\s[\\s\\S]*?;`, "gm"))];
    if (matches.length !== 1) throw new Error(`Expected one reviewed DreamLux equipment index for ${name}`);
    return matches[0][0];
  });
  const functions = ["prevent_return_audit_mutation", "public.prevent_inventory_movement_mutation"].map((name) => {
    const matches = [...schema.matchAll(new RegExp(`^CREATE OR REPLACE FUNCTION ${name.replace(".", "\\.")}\\(\\)[\\s\\S]*?^\\$\\$;`, "gm"))];
    if (matches.length !== 1) throw new Error(`Expected one reviewed DreamLux immutable ledger function for ${name}`);
    return matches[0][0];
  });
  const triggers = [
    "trg_event_return_receipts_immutable", "trg_condition_resolutions_immutable",
    "trg_event_return_corrections_immutable", "trg_inventory_movements_append_only",
  ].map((name) => {
    const matches = [...schema.matchAll(new RegExp(`^CREATE TRIGGER ${name}\\s[\\s\\S]*?;`, "gm"))];
    if (matches.length !== 1) throw new Error(`Expected one reviewed DreamLux immutable ledger trigger for ${name}`);
    return matches[0][0];
  });
  const rls = TABLES.map((table) => `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
  return [
    await payrollFixtureDdl(), ...tables, ...indexes, ...functions, ...triggers, ...rls,
    "REVOKE ALL ON FUNCTION prevent_return_audit_mutation() FROM PUBLIC;",
    "REVOKE ALL ON FUNCTION public.prevent_inventory_movement_mutation() FROM PUBLIC;",
  ].join("\n");
}

export async function createDreamluxEquipmentFixture(adminUrl: string) {
  return createDreamluxNativeFixture(adminUrl, "equipment_259", await equipmentFixtureDdl());
}
