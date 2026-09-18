import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyStorageSnapshot, type StorageSnapshotManifest } from "./storage-snapshot";

const owned: string[] = [];
afterAll(async () => {
  await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true })));
});

async function fixture(empty = false) {
  const directory = await mkdtemp(join(tmpdir(), "dreamlux-storage-manifest-"));
  owned.push(directory);
  await mkdir(join(directory, "objects"));
  const bytes = Buffer.from([0, 128, 255, 13, 10, 65]);
  const bucket = "inventory-images";
  const key = "folder/CON";
  const file = `${createHash("sha256").update(`${bucket}\0${key}`).digest("hex")}.bin`;
  const manifest: StorageSnapshotManifest = {
    format: "erp-storage-snapshot", version: 1, productId: "dreamlux-erp",
    sourceFingerprint: "a".repeat(64), createdAt: "2026-09-18T00:00:00.000Z",
    buckets: [bucket],
    objects: empty ? [] : [{
      bucket, key, id: "synthetic-object", updatedAt: "2026-09-18T00:00:00.000Z",
      contentType: "application/octet-stream", expectedSize: bytes.length, etag: null,
      file, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
    }],
  };
  if (!empty) await writeFile(join(directory, "objects", file), bytes);
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  return { directory, manifest, file };
}

describe("offline Storage snapshot verification", () => {
  test("verifies binary bytes and keeps original keys independent of local filenames", async () => {
    const { directory, manifest } = await fixture();
    expect(await verifyStorageSnapshot(directory, "dreamlux-erp")).toEqual(manifest);
  });

  test("accepts an explicitly enumerated empty bucket", async () => {
    const { directory } = await fixture(true);
    expect((await verifyStorageSnapshot(directory, "dreamlux-erp")).objects).toEqual([]);
  });

  test("rejects same-size corruption instead of relying only on byte counts", async () => {
    const { directory, file } = await fixture();
    await writeFile(join(directory, "objects", file), Buffer.from([0, 128, 254, 13, 10, 65]));
    await expect(verifyStorageSnapshot(directory, "dreamlux-erp")).rejects.toThrow("checksum");
  });

  test("rejects missing and unexpected objects", async () => {
    const { directory, file } = await fixture();
    const path = join(directory, "objects", file);
    const data = await readFile(path);
    await rm(path);
    await expect(verifyStorageSnapshot(directory, "dreamlux-erp")).rejects.toThrow("ENOENT");
    await writeFile(path, data);
    await writeFile(join(directory, "objects", "unlisted.bin"), "unexpected");
    await expect(verifyStorageSnapshot(directory, "dreamlux-erp")).rejects.toThrow("unlisted");
  });

  test("rejects unexpected top-level files rather than certifying an unlisted payload", async () => {
    const { directory } = await fixture();
    await writeFile(join(directory, "unlisted.txt"), "not part of this snapshot");
    await expect(verifyStorageSnapshot(directory, "dreamlux-erp")).rejects.toThrow("unlisted");
  });

  test("rejects a linked object directory", async () => {
    const { directory } = await fixture();
    const target = await mkdtemp(join(tmpdir(), "dreamlux-storage-linked-"));
    owned.push(target);
    await rename(join(directory, "objects"), join(target, "objects"));
    await symlink(join(target, "objects"), join(directory, "objects"), "junction");
    await expect(verifyStorageSnapshot(directory, "dreamlux-erp")).rejects.toThrow("object directory");
  });

  (process.platform === "win32" ? test.skip : test)("rejects a linked object file even when its bytes match", async () => {
    const { directory, file } = await fixture();
    const source = join(directory, "objects", file);
    const target = await mkdtemp(join(tmpdir(), "dreamlux-storage-linked-"));
    owned.push(target);
    const destination = join(target, "linked-target.bin");
    await rename(source, destination);
    await symlink(destination, source);
    await expect(verifyStorageSnapshot(directory, "dreamlux-erp")).rejects.toThrow("file type");
  });

  test.each(["wrong-product", "traversal", "duplicate", "empty-segment", "wrong-size", "wrong-key-mapping"])(
    "rejects invalid manifest case %s", async (kind) => {
      const { directory, manifest } = await fixture();
      if (kind === "wrong-product") manifest.productId = "another-product";
      if (kind === "traversal") manifest.objects[0].file = "../outside.bin";
      if (kind === "duplicate") manifest.objects.push({ ...manifest.objects[0] });
      if (kind === "empty-segment") manifest.objects[0].key = "/folder/CON";
      if (kind === "wrong-size") manifest.objects[0].size += 1;
      if (kind === "wrong-key-mapping") manifest.objects[0].key = "different-key";
      await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
      await expect(verifyStorageSnapshot(directory, "dreamlux-erp")).rejects.toThrow();
    },
  );

  test("honors an already-aborted verification budget", async () => {
    const { directory } = await fixture();
    const signal = AbortSignal.abort(new Error("Synthetic verification timeout"));
    await expect(verifyStorageSnapshot(directory, "dreamlux-erp", signal)).rejects.toThrow("Synthetic verification timeout");
  });
});
