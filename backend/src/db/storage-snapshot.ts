import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { StorageReader } from "./storage-reader";

export type { StorageReader } from "./storage-reader";
const PAGE_SIZE = 100;
const MAX_DURATION_MS = 300_000;
const safeSize = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const bucketName = z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const identitySchema = z.object({
  productId: z.string().regex(/^[a-z][a-z0-9-]{2,70}$/),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
const listingSchema = z.array(z.object({
  name: z.string().min(1),
  id: z.string().min(1).nullable(),
  updated_at: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
}).passthrough()).max(PAGE_SIZE);
const inventorySchema = z.object({
  bucket: bucketName,
  key: z.string().min(1),
  id: z.string().min(1),
  updatedAt: z.string().min(1),
  contentType: z.string().nullable(),
  expectedSize: safeSize.nullable(),
  etag: z.string().nullable(),
});
const objectSchema = inventorySchema.extend({
  file: z.string().regex(/^[a-f0-9]{64}\.bin$/),
  size: safeSize,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const manifestSchema = identitySchema.extend({
  format: z.literal("erp-storage-snapshot"),
  version: z.literal(1),
  createdAt: z.string().datetime(),
  buckets: z.array(bucketName).nonempty(),
  objects: z.array(objectSchema),
}).strict();

type InventoryObject = z.infer<typeof inventorySchema>;
export type StorageSnapshotManifest = z.infer<typeof manifestSchema>;

function fileName(bucket: string, key: string) {
  return `${createHash("sha256").update(`${bucket}\0${key}`).digest("hex")}.bin`;
}

function validateSegment(name: string) {
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\0")) {
    throw new Error("Storage listing contains an invalid object-key segment");
  }
}

function compareObjects(a: InventoryObject, b: InventoryObject) {
  const left = `${a.bucket}\0${a.key}`;
  const right = `${b.bucket}\0${b.key}`;
  return left < right ? -1 : left > right ? 1 : 0;
}

function requestSignal(signal: AbortSignal) {
  return AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
}

async function verifyBuckets(storage: StorageReader, buckets: string[], signal: AbortSignal) {
  for (const bucket of buckets) {
    signal.throwIfAborted();
    const response = await storage.getBucket(bucket, requestSignal(signal));
    if (response.error) throw new Error(`Storage bucket lookup failed for ${bucket}: ${response.error.message}`);
    if (!response.data || response.data.id !== bucket) throw new Error(`Storage bucket identity is invalid for ${bucket}`);
  }
}

async function inventory(storage: StorageReader, buckets: string[], signal: AbortSignal): Promise<InventoryObject[]> {
  const objects: InventoryObject[] = [];
  for (const bucket of buckets) {
    const api = storage.from(bucket);
    const prefixes = [""];
    const seen = new Set<string>();
    for (let nextPrefix = 0; nextPrefix < prefixes.length; nextPrefix += 1) {
      const prefix = prefixes[nextPrefix];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        signal.throwIfAborted();
        const response = await api.list(prefix, { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } }, { signal: requestSignal(signal) });
        if (response.error) throw new Error(`Storage listing failed for ${bucket}: ${response.error.message}`);
        const parsed = listingSchema.safeParse(response.data);
        if (!parsed.success) throw new Error(`Storage listing returned an invalid page for ${bucket}`);
        for (const item of parsed.data) {
          validateSegment(item.name);
          const key = prefix ? `${prefix}/${item.name}` : item.name;
          const marker = `${item.id === null ? "folder" : "file"}\0${key}`;
          if (seen.has(marker)) throw new Error(`Storage listing repeated an entry for ${bucket}`);
          seen.add(marker);
          if (item.id === null) {
            if (item.metadata !== null || item.updated_at !== null) throw new Error(`Storage folder metadata is inconsistent for ${bucket}`);
            prefixes.push(key);
            continue;
          }
          if (!item.metadata || !item.updated_at) throw new Error(`Storage object metadata is incomplete for ${bucket}`);
          const rawSize = item.metadata.size ?? item.metadata.contentLength ?? null;
          const size = safeSize.nullable().safeParse(rawSize);
          if (!size.success) throw new Error(`Storage object size is invalid for ${bucket}`);
          const contentType = item.metadata.mimetype ?? null;
          const etag = item.metadata.eTag ?? null;
          if ((contentType !== null && typeof contentType !== "string") || (etag !== null && typeof etag !== "string")) {
            throw new Error(`Storage object metadata is invalid for ${bucket}`);
          }
          objects.push({ bucket, key, id: item.id, updatedAt: item.updated_at, contentType, expectedSize: size.data, etag });
        }
        if (parsed.data.length < PAGE_SIZE) break;
      }
    }
  }
  return objects.sort(compareObjects);
}

export async function verifyStorageSnapshot(snapshotPath: string, expectedProductId: string, signal?: AbortSignal): Promise<StorageSnapshotManifest> {
  signal?.throwIfAborted();
  const directory = resolve(snapshotPath);
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error("Storage snapshot must be a regular directory");
  const rootFiles = (await readdir(directory)).sort();
  if (rootFiles.length !== 2 || rootFiles[0] !== "manifest.json" || rootFiles[1] !== "objects") {
    throw new Error("Storage snapshot has missing or unlisted top-level files");
  }
  const manifestPath = join(directory, "manifest.json");
  const manifestStat = await lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > 16 * 1024 * 1024) {
    throw new Error("Storage snapshot manifest is not a supported regular file");
  }
  const parsedManifest = manifestSchema.safeParse(JSON.parse(await readFile(manifestPath, "utf8")));
  if (!parsedManifest.success) throw new Error("Storage snapshot manifest has an invalid shape");
  const manifest = parsedManifest.data;
  if (manifest.productId !== expectedProductId) throw new Error("Storage snapshot belongs to a different product");
  if (new Set(manifest.buckets).size !== manifest.buckets.length) throw new Error("Storage snapshot repeats a bucket");
  const objectDirectory = join(directory, "objects");
  const objectDirectoryStat = await lstat(objectDirectory);
  if (!objectDirectoryStat.isDirectory() || objectDirectoryStat.isSymbolicLink()) throw new Error("Storage object directory is invalid");
  const expectedFiles = new Set<string>();
  for (const object of manifest.objects) {
    signal?.throwIfAborted();
    object.key.split("/").forEach(validateSegment);
    if (!manifest.buckets.includes(object.bucket) || object.file !== fileName(object.bucket, object.key) || expectedFiles.has(object.file)) {
      throw new Error("Storage snapshot contains an invalid or duplicate object mapping");
    }
    expectedFiles.add(object.file);
    const path = join(objectDirectory, object.file);
    const file = await lstat(path);
    if (!file.isFile() || file.isSymbolicLink() || file.size !== object.size
      || (object.expectedSize !== null && object.expectedSize !== object.size)) {
      throw new Error("Storage snapshot object size or file type is invalid");
    }
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path, { signal })) hash.update(chunk);
    if (hash.digest("hex") !== object.sha256) throw new Error("Storage snapshot object checksum does not match");
  }
  const actualFiles = await readdir(objectDirectory);
  if (actualFiles.length !== expectedFiles.size || actualFiles.some((file) => !expectedFiles.has(file))) {
    throw new Error("Storage snapshot contains unlisted object files");
  }
  return manifest;
}

export async function createStorageSnapshot(options: {
  storage: StorageReader;
  buckets: readonly string[];
  directory: string;
  productId: string;
  sourceFingerprint: string;
  durationMs?: number;
}): Promise<{ path: string; objects: number; bytes: number }> {
  const identity = identitySchema.parse(options);
  const buckets = z.array(bucketName).nonempty().parse([...new Set(options.buckets)]).sort();
  const durationMs = options.durationMs ?? 180_000;
  if (!Number.isSafeInteger(durationMs) || durationMs < 1 || durationMs > MAX_DURATION_MS) {
    throw new Error("Storage backup duration must be within its five-minute maximum");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Storage backup exceeded its execution budget")), durationMs);
  timer.unref();
  const directory = resolve(options.directory);
  let staging: string | undefined;
  let failure: unknown;
  let result: { path: string; objects: number; bytes: number } | undefined;
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    staging = await mkdtemp(join(directory, ".storage-stage-"));
    await mkdir(join(staging, "objects"), { mode: 0o700 });
    await verifyBuckets(options.storage, buckets, controller.signal);
    const before = await inventory(options.storage, buckets, controller.signal);
    const objects: StorageSnapshotManifest["objects"] = [];
    let bytes = 0;
    for (const object of before) {
      controller.signal.throwIfAborted();
      const encodedKey = object.key.split("/").map(encodeURIComponent).join("/");
      const downloaded = await options.storage.from(object.bucket).download(encodedKey, {}, { signal: requestSignal(controller.signal) }).asStream();
      if (downloaded.error) throw new Error(`Storage download failed for ${object.bucket}: ${downloaded.error.message}`);
      if (!downloaded.data) throw new Error(`Storage download returned no body for ${object.bucket}`);
      const file = fileName(object.bucket, object.key);
      const output = await open(join(staging, "objects", file), "wx", 0o600);
      const hash = createHash("sha256");
      let size = 0;
      try {
        await downloaded.data.pipeTo(new WritableStream<Uint8Array>({
          async write(chunk) {
            size += chunk.byteLength;
            if (!Number.isSafeInteger(size)) throw new Error("Storage object exceeds supported byte accounting");
            hash.update(chunk);
            await output.writeFile(chunk);
          },
        }), { signal: controller.signal });
      } finally { await output.close(); }
      if (object.expectedSize !== null && object.expectedSize !== size) throw new Error(`Storage download size changed for ${object.bucket}`);
      bytes += size;
      if (!Number.isSafeInteger(bytes)) throw new Error("Storage snapshot exceeds supported byte accounting");
      objects.push({ ...object, file, size, sha256: hash.digest("hex") });
    }
    const after = await inventory(options.storage, buckets, controller.signal);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Storage inventory changed during backup; no snapshot was published");
    await verifyBuckets(options.storage, buckets, controller.signal);
    const manifest: StorageSnapshotManifest = {
      format: "erp-storage-snapshot", version: 1, ...identity,
      createdAt: new Date().toISOString(), buckets, objects,
    };
    await writeFile(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: "wx" });
    await verifyStorageSnapshot(staging, identity.productId, controller.signal);
    controller.signal.throwIfAborted();
    const destination = join(directory, `storage-${identity.productId}-${Date.now()}-${randomUUID().slice(0, 8)}`);
    await rename(staging, destination);
    staging = undefined;
    result = { path: destination, objects: objects.length, bytes };
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(timer);
    if (staging) {
      try { await rm(staging, { recursive: true }); } catch (error) {
        failure = new AggregateError(failure ? [failure, error] : [error], "Storage backup staging cleanup failed");
      }
    }
  }
  if (failure) throw failure;
  if (!result) throw new Error("Storage backup did not produce a verified snapshot");
  return result;
}
