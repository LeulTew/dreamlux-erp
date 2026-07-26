import { Client } from "pg";
import {
  runDryRun,
  applySeed,
  verifySeed,
  cleanupSeed,
  DEMO_SEED_KEY
} from "../lib/seed-demo-additive-core";
import { getEnv } from "../lib/env";

const rawUrl = getEnv("DATABASE_BACKUP_URL", getEnv("DATABASE_URL"));
if (!rawUrl) {
  console.error("❌ Error: Neither DATABASE_URL nor DATABASE_BACKUP_URL is set in environment variables.");
  process.exit(1);
}

function normalizeConnectionString(raw: string): string {
  if (!raw) return raw;
  const hasSslMode = /(^|[?&])sslmode=/.test(raw);
  const hasCompat = /(^|[?&])uselibpqcompat=/.test(raw);
  if (hasSslMode && !hasCompat) {
    return `${raw}${raw.includes("?") ? "&" : "?"}uselibpqcompat=true`;
  }
  return raw;
}

const args = process.argv.slice(2);
const isApply = args.includes("--apply");
const isVerify = args.includes("--verify");
const isCleanup = args.includes("--cleanup");
const confirmTarget = args.find((arg) => arg.startsWith("--confirm-target="))?.slice("--confirm-target=".length);

async function main() {
  const client = new Client({
    connectionString: normalizeConnectionString(rawUrl),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    if (isCleanup) {
      if (!isApply) {
        console.log("================================================================================");
        console.log("       DREAMLUX ERP — ADDITIVE DEMO SEED CLEANUP (DRY-RUN)");
        console.log("================================================================================");
        console.log(`Seed Key Target: ${DEMO_SEED_KEY}`);
        console.log("Notice: --apply flag was NOT passed. Zero mutations made.");
        console.log("To execute targeted cleanup of owned records, run:");
        console.log("  bun run seed:demo:additive -- --cleanup --apply");
        console.log("================================================================================");
        return;
      }

      const target = await runDryRun(client);
      const expectedTarget = `${target.targetDatabase}@${target.serverHost}`;
      if (confirmTarget !== expectedTarget) {
        throw new Error(`Cleanup requires --confirm-target=${expectedTarget}`);
      }

      console.log(`Executing targeted cleanup for seed key: ${DEMO_SEED_KEY}...`);
      const result = await cleanupSeed(client);
      console.log(`✓ Cleanup complete! Deleted ${result.deletedCount} demo records cleanly.`);
      return;
    }

    if (isVerify) {
      console.log("Running integrity & idempotency verification suite...");
      const verification = await verifySeed(client);
      console.log("\n--- VERIFICATION RESULTS ---");
      for (const line of verification.details) {
        console.log(line);
      }
      if (!verification.success) {
        console.error("\n❌ Verification failed!");
        process.exit(1);
      }
      console.log("\n✅ Verification passed 100%!");
      return;
    }

    if (!isApply) {
      const report = await runDryRun(client);
      console.log("================================================================================");
      console.log("       DREAMLUX ERP — ADDITIVE DEMO SEED (DRY-RUN DEFAULT)");
      console.log("================================================================================");
      console.log(`Target Database Host : ${report.serverHost}`);
      console.log(`Target Database Name : ${report.targetDatabase}`);
      console.log(`Target Database User : ${report.targetUser}`);
      console.log(`Seed Namespace Key   : ${DEMO_SEED_KEY}`);
      console.log("--------------------------------------------------------------------------------");
      console.log("CURRENT TABLE ROW COUNTS:");
      for (const [table, count] of Object.entries(report.tableCounts)) {
        if (count >= 0) {
          console.log(`  - ${table.padEnd(30)} : ${count}`);
        }
      }
      console.log("--------------------------------------------------------------------------------");
      console.log("SEED MANIFEST (expected / present / missing):");
      for (const [entity, counts] of Object.entries(report.manifest)) {
        console.log(`  - ${entity.padEnd(22)} : ${counts.expected} / ${counts.present} / ${counts.missing}`);
      }
      console.log("--------------------------------------------------------------------------------");
      console.log("SAFETY NOTICE:");
      console.log("  ✓ ZERO database mutations were performed (Dry-run mode).");
      console.log(`  ✓ To apply, rerun with --apply --confirm-target=${report.targetDatabase}@${report.serverHost}`);
      console.log("================================================================================");
      return;
    }

    // Apply mode
    const target = await runDryRun(client);
    const expectedTarget = `${target.targetDatabase}@${target.serverHost}`;
    if (confirmTarget !== expectedTarget) {
      throw new Error(`Apply requires --confirm-target=${expectedTarget}`);
    }
    console.log("================================================================================");
    console.log("       DREAMLUX ERP — APPLYING ADDITIVE DEMO SEED");
    console.log("================================================================================");
    console.log(`Seed Key: ${DEMO_SEED_KEY}`);
    const applyRes = await applySeed(client);
    console.log(`✓ Seed applied successfully! Inserted/Updated ${applyRes.insertedCount} records in 1 transaction.`);

    // Run verification automatically post-apply
    console.log("\nRunning post-apply verification...");
    const verification = await verifySeed(client);
    for (const line of verification.details) {
      console.log(line);
    }
    if (verification.success) {
      console.log("\n✅ Seed applied and verified 100%!");
    } else {
      console.error("\n❌ Post-apply verification failed!");
      process.exit(1);
    }

  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌ Execution error:", err);
  process.exit(1);
});
