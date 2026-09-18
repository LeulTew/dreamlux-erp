import { verifyStorageSnapshot } from "./storage-snapshot";

async function main() {
  const directory = process.argv[2]?.trim();
  if (!directory || process.argv.length !== 3) throw new Error("Usage: verify-storage-snapshot.ts <snapshot-directory>");
  const manifest = await verifyStorageSnapshot(directory, "dreamlux-erp", AbortSignal.timeout(180_000));
  console.log(`Storage snapshot verified: ${manifest.buckets.length} buckets, ${manifest.objects.length} objects.`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
