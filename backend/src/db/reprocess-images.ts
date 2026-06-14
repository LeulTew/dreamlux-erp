/**
 * One-off migration: re-process all existing images
 * - Auto-rotate via EXIF orientation
 * - Convert to WebP for smaller file sizes
 * - Update the image_key in the DB from .jpg → .webp
 *
 * Run: bun run src/db/reprocess-images.ts
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = process.env.SUPABASE_BUCKET || "unified-erp-assets";

async function reprocessImages() {
  // Fetch all items that have an image
  const { data: items, error } = await supabase
    .from("items")
    .select("id, image_key, store_id")
    .not("image_key", "is", null);

  if (error) {
    console.error("❌ Failed to fetch items:", error.message);
    return;
  }

  if (!items || items.length === 0) {
    console.log("No images to process.");
    return;
  }

  console.log(`Found ${items.length} images to re-process.\n`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    const oldKey = item.image_key;
    const newKey = oldKey.replace(/\.(jpg|jpeg|png)$/i, ".webp");

    try {
      // 1. Download the original
      const { data: blob, error: dlError } = await supabase.storage
        .from(BUCKET)
        .download(oldKey);

      if (dlError || !blob) {
        console.log(`⚠️  ${item.id}: download failed (${dlError?.message}) — skipping`);
        skipped++;
        continue;
      }

      const arrayBuffer = await blob.arrayBuffer();
      const originalBuffer = Buffer.from(arrayBuffer);

      // 2. Re-process: auto-rotate EXIF + convert to WebP
      const reprocessed = await sharp(originalBuffer)
        .rotate()
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      const savedBytes = originalBuffer.length - reprocessed.length;
      const savedPct = ((savedBytes / originalBuffer.length) * 100).toFixed(0);

      // 3. Upload the new WebP file
      const { error: upError } = await supabase.storage
        .from(BUCKET)
        .upload(newKey, reprocessed, {
          contentType: "image/webp",
          upsert: true,
        });

      if (upError) {
        console.log(`❌ ${item.id}: upload failed — ${upError.message}`);
        failed++;
        continue;
      }

      // 4. Update the DB record to point to the new key
      if (newKey !== oldKey) {
        const { error: dbError } = await supabase
          .from("items")
          .update({ image_key: newKey })
          .eq("id", item.id);

        if (dbError) {
          console.log(`❌ ${item.id}: DB update failed — ${dbError.message}`);
          failed++;
          continue;
        }

        // 5. Delete the old file (best-effort)
        await supabase.storage.from(BUCKET).remove([oldKey]);
      }

      console.log(`✅ ${item.id}: ${oldKey} → ${newKey} (saved ${savedPct}%)`);
      success++;
    } catch (err: unknown) {
      console.log(`❌ ${item.id}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(
    `\nDone! ✅ ${success} re-processed | ⚠️ ${skipped} skipped | ❌ ${failed} failed`
  );
}

reprocessImages();
