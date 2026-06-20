import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

const concurrencyScript = readFileSync(join(process.cwd(), "src/db/verify-assignment-concurrency.ts"), "utf8");
const rlsScript = readFileSync(join(process.cwd(), "src/db/verify-supabase-rls.ts"), "utf8");

describe("Issue #31 final verification hooks", () => {
  test("exposes runnable Bun scripts for live DB and Supabase verification", () => {
    expect(packageJson.scripts["verify:db-concurrency"]).toBe("bun src/db/verify-assignment-concurrency.ts");
    expect(packageJson.scripts["verify:supabase-rls"]).toBe("bun src/db/verify-supabase-rls.ts");
  });

  test("live concurrency verifier uses real parallel Postgres clients and expects one overlap failure", () => {
    expect(concurrencyScript).toContain("Promise.allSettled");
    expect(concurrencyScript).toContain("createMigrationClient(databaseUrl)");
    expect(concurrencyScript).toContain("assignment_integrity.sql");
    expect(concurrencyScript).toContain("Expected exactly one insert success and one overlap failure");
    expect(concurrencyScript).toContain("DATABASE_BACKUP_URL");
    expect(concurrencyScript).toContain("DATABASE_URL");
  });

  test("live Supabase verifier checks protected tables through the REST Data API", () => {
    expect(rlsScript).toContain("/rest/v1/");
    expect(rlsScript).toContain("SUPABASE_URL");
    expect(rlsScript).toContain("SUPABASE_ANON_KEY");
    expect(rlsScript).toContain("employees");
    expect(rlsScript).toContain("event_allocations");
    expect(rlsScript).toContain("401 || status === 403 || status === 404");
  });
});
