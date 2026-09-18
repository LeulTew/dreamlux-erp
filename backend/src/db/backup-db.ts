import { link, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getEnv } from "../lib/env";
import { postgresToolConnection, redactPostgresOutput, runPostgresTool } from "./postgres-tool";

export async function backupDatabase(
  databaseUrl: string,
  backupDir = join(process.cwd(), "..", "backups"),
  now = new Date(),
) {
  postgresToolConnection(databaseUrl);
  const timestamp = now.toISOString().replace(/[.:]/g, "-");
  const outputPath = join(backupDir, `database-dump-${timestamp}.sql`);
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(backupDir, ".dreamlux-db-backup-"));
  let result: { path: string; sizeBytes: number } | undefined;
  let failure: unknown;
  try {
    const stagedPath = join(staging, "database.sql");
    await writeFile(stagedPath, "", { mode: 0o600, flag: "wx" });
    await runPostgresTool("pg_dump", [
      "--format=plain", "--no-owner", "--no-privileges", "--file", stagedPath,
    ], databaseUrl);
    const { size } = await stat(stagedPath);
    if (size === 0) throw new Error("pg_dump produced an empty file; no backup was published");
    // A same-filesystem link publishes atomically without overwriting a prior receipt.
    await link(stagedPath, outputPath);
    result = { path: outputPath, sizeBytes: size };
  } catch (error) {
    failure = error;
  } finally {
    try { await rm(staging, { recursive: true }); } catch (error) {
      failure = new AggregateError(failure ? [failure, error] : [error], "Database backup staging cleanup failed");
    }
  }
  if (failure) throw failure;
  if (!result) throw new Error("Database backup did not produce a verified result");
  return result;
}

async function main() {
  const databaseUrl = getEnv("DATABASE_BACKUP_URL") || getEnv("DATABASE_URL");
  if (!databaseUrl) throw new Error("DATABASE_BACKUP_URL or DATABASE_URL is required");
  console.log("Running pg_dump...");
  const result = await backupDatabase(databaseUrl);
  console.log(`DB backup saved to: ${result.path} (${result.sizeBytes} bytes)`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(redactPostgresOutput(error instanceof Error ? error.message : String(error), [
      getEnv("DATABASE_BACKUP_URL"), getEnv("DATABASE_URL"),
    ]));
    process.exitCode = 1;
  });
}
