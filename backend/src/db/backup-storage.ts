import { createHash } from "node:crypto";
import { join } from "node:path";
import { getEnv } from "../lib/env";
import { assertStorageServiceCredential } from "./storage-backup-credentials";
import { createStorageReader, type StorageReader } from "./storage-reader";
import { createStorageSnapshot } from "./storage-snapshot";

export async function backupStorage(
  configuration: { supabaseUrl: string; serviceKey: string; bucket: string },
  directory: string,
  factory: (url: string, key: string) => StorageReader = createStorageReader,
) {
  let url: URL;
  try { url = new URL(configuration.supabaseUrl.trim()); }
  catch { throw new Error("Storage backup requires a valid SUPABASE_URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || (url.protocol === "http:" && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) {
    throw new Error("Storage backup requires an approved HTTPS origin or an owned local test service");
  }
  const key = configuration.serviceKey.trim();
  const projectRef = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
  assertStorageServiceCredential(key, projectRef);
  return createStorageSnapshot({
    storage: factory(url.href, key), buckets: [configuration.bucket], directory,
    productId: "dreamlux-erp",
    sourceFingerprint: createHash("sha256").update(`dreamlux-erp|${url.href}|${configuration.bucket}`).digest("hex"),
  });
}

async function main() {
  if (process.argv.length > 3) throw new Error("Usage: backup-storage.ts [backup-directory]");
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const result = await backupStorage({
    supabaseUrl, serviceKey, bucket: getEnv("SUPABASE_BUCKET", "inventory-images"),
  }, process.argv[2]?.trim() || join(process.cwd(), "..", "backups", "storage"));
  console.log(`Storage snapshot saved to: ${result.path} (${result.objects} objects, ${result.bytes} bytes)`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    console.error(key ? message.split(key).join("[redacted]") : message);
    process.exitCode = 1;
  });
}
