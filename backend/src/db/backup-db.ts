import fs from "fs";
import path from "path";
import dns from "node:dns/promises";
import { getEnv } from "../lib/env";

async function backupDatabase() {
  const databaseUrl = getEnv("DATABASE_BACKUP_URL") || getEnv("DATABASE_URL");
  const backupDir = path.join(process.cwd(), "..", "backups");
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const outputPath = path.join(backupDir, `database-dump-${timestamp}.sql`);

  if (!databaseUrl) {
    console.error("❌ Missing DATABASE_URL environment variable.");
    process.exit(1);
  }

  const dbHost = new URL(databaseUrl).hostname;
  try {
    await dns.resolve4(dbHost);
  } catch {
    console.warn(`⚠️ No IPv4 DNS record found for ${dbHost}.`);
    console.warn("⚠️ In WSL environments without IPv6, pg_dump may fail with network unreachable.");
    console.warn("👉 Set DATABASE_BACKUP_URL to a Supabase pooler connection string (IPv4) and rerun.");
  }

  const pgDumpPath = Bun.which("pg_dump");
  if (!pgDumpPath) {
    console.error("❌ pg_dump is not installed or not available in PATH.");
    process.exit(1);
  }

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log("📑 Running pg_dump...");

  const proc = Bun.spawn([pgDumpPath, "--dbname", databaseUrl, "--no-owner", "--no-privileges"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).bytes(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    console.error("❌ Database backup failed.");
    if (stderr.trim()) {
      console.error(stderr.trim());
    }
    console.error("💡 If you are in WSL and using Supabase direct DB host, use DATABASE_BACKUP_URL with pooler host and port 6543.");
    process.exit(exitCode || 1);
  }

  await Bun.write(outputPath, stdout);
  console.log(`✅ DB backup saved to: ${outputPath}`);
}

backupDatabase();
