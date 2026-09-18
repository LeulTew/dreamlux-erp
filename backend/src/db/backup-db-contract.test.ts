import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const backend = join(__dirname, "..", "..");
const source = readFileSync(join(__dirname, "backup-db.ts"), "utf8");
const scripts: unknown = JSON.parse(readFileSync(join(backend, "..", "package.json"), "utf8"));

describe("database backup source and invocation contract", () => {
  test("retains the root backup CLI and plain SQL artifact contract", () => {
    expect(scripts).toMatchObject({ scripts: { "backup:db": "bun run --cwd backend src/db/backup-db.ts" } });
    expect(source).toContain('getEnv("DATABASE_BACKUP_URL") || getEnv("DATABASE_URL")');
    expect(source).toContain("database-dump-");
    expect(source).toContain(".sql");
  });

  test("never forwards the credential-bearing URL in native argv", () => {
    expect(source).not.toContain('[pgDumpPath, "--dbname", databaseUrl');
  });

  test("writes the plain SQL artifact directly rather than buffering it in stdout", () => {
    expect(source).toContain("--format=plain");
    expect(source).toContain("--file");
    expect(source).not.toContain("new Response(proc.stdout).bytes()");
  });

  test("does not execute a backup on import or recommend the transaction pooler", () => {
    expect(source).toContain("require.main === module");
    expect(source).not.toContain("port 6543");
  });
});
