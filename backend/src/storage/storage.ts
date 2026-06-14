import { supabase } from "../db/supabase";
import { getEnv } from "../lib/env";

const BUCKET = getEnv("SUPABASE_BUCKET", "inventory-images"); // Matches original inventory-pro bucket

export async function uploadImage(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}

export async function deleteImage(key: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([key]);

  if (error) {
    console.error(`Storage delete warning: ${error.message}`);
  }
}

export function getPublicUrl(key: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

export async function getSignedUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(key, expiresIn);

  if (error) {
    throw new Error(`Signed URL failed: ${error.message}`);
  }

  return data.signedUrl;
}

export async function downloadImage(key: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(key);

  if (error) {
    throw new Error(`Storage download failed: ${error.message}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export { BUCKET };
