import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { getEnv } from "../lib/env.ts";

async function backupStorage() {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucketName = getEnv("SUPABASE_BUCKET", "inventory-images");
  const backupDir = path.join(process.cwd(), "..", "backups", "storage");

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`📦 Starting recursive backup for bucket: ${bucketName}...`);
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const downloadRecursive = async (prefix = ""): Promise<void> => {
    const listed = await supabase.storage.from(bucketName).list(prefix, {
      limit: 100,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });

    if (listed.error) {
      throw listed.error;
    }

    const items = listed.data || [];
    if (items.length === 0) {
      return;
    }

    for (const item of items) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;

      // Supabase marks folders with null id/metadata when listing.
      if (!item.id || !item.metadata) {
        console.log(`📁 Entering folder: ${fullPath}`);
        await downloadRecursive(fullPath);
        continue;
      }

      console.log(`  -> Downloading: ${fullPath}`);
      const download = await supabase.storage.from(bucketName).download(fullPath);

      if (download.error) {
        console.error(`  ❌ Failed to download ${fullPath}: ${download.error.message}`);
        continue;
      }

      const localPath = path.join(backupDir, fullPath);
      const localDir = path.dirname(localPath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }

      const buffer = Buffer.from(await download.data.arrayBuffer());
      fs.writeFileSync(localPath, buffer);
    }
  };

  try {
    await downloadRecursive("");
    console.log(`✅ Recursive storage backup complete! Files saved to: ${backupDir}`);
  } catch (err) {
    console.error("❌ Storage backup failed:", err);
    process.exit(1);
  }
}

backupStorage();
