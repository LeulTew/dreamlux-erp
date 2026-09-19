import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import { createDreamluxPayrollFixture } from "./dreamlux-payroll-fixture";
import { attestDreamluxNativeTarget } from "./dreamlux-native-target";

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
  const tables = TABLES.map((table) => {
    const matches = [...schema.matchAll(new RegExp(`^CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?^\\);`, "gm"))];
    if (matches.length !== 1) throw new Error(`Expected one reviewed DreamLux DDL definition for ${table}`);
    return matches[0][0];
  });
  const migrations = await Promise.all(MIGRATIONS.map((file) =>
    readFile(join(__dirname, "..", "migrations", file), "utf8")));
  return [...tables, ...migrations].join("\n");
}

export async function createDreamluxImportFixture(adminUrl: string) {
  attestDreamluxNativeTarget(adminUrl, "admin");
  const ddl = await importFixtureDdl();
  const fixture = await createDreamluxPayrollFixture(adminUrl);
  try {
    const target = attestDreamluxNativeTarget(fixture.url, "fixture");
    const client = new Client({ connectionString: target.href, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      await client.query(ddl);
    } finally {
      await client.end();
    }
  } catch (error) {
    try {
      await fixture.dispose();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "DreamLux import fixture setup and cleanup both failed", { cause: cleanupError });
    }
    throw error;
  }
  return fixture;
}
