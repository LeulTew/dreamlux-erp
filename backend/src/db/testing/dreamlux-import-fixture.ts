import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { payrollFixtureDdl } from "./dreamlux-payroll-fixture";
import { createDreamluxNativeFixture, reviewedSchemaTables } from "./dreamlux-native-fixture";

const TABLES = [
  "categories", "items", "finance_import_batches", "expenses",
  "finance_operational_expenses", "finance_overhead_expenses",
  "finance_overhead_month_closures", "capital_investments",
];
const MIGRATIONS = [
  "finance_hisab.sql", "finance_overheads.sql", "capital_investments.sql", "finance_imports.sql",
];

export async function importFixtureDdl(): Promise<string> {
  const schema = await readFile(join(__dirname, "..", "schema.sql"), "utf8");
  const tables = reviewedSchemaTables(schema, TABLES);
  const migrations = await Promise.all(MIGRATIONS.map((file) =>
    readFile(join(__dirname, "..", "migrations", file), "utf8")));
  return [...tables, ...migrations].join("\n");
}

export async function createDreamluxImportFixture(adminUrl: string) {
  const ddl = await Promise.all([payrollFixtureDdl(), importFixtureDdl()]);
  return createDreamluxNativeFixture(adminUrl, "imports_261", ddl.join("\n"));
}
