import { describe, expect, test } from "bun:test";
import { lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupStorage } from "./backup-storage";
import { createStorageSnapshot, verifyStorageSnapshot } from "./storage-snapshot";
import { storageHttpFixture, type FixtureObject } from "./testing/storage-http-fixture";

const httpTest = process.env.DREAMLUX_STORAGE_HTTP_TESTS === "1" ? test : test.skip;
const bucket = "inventory-images";
const kitchen = "secondary-photos";

function object(key: string, selectedBucket = bucket): FixtureObject {
  return { bucket: selectedBucket, key, bytes: new Uint8Array([0, 128, 255, ...new TextEncoder().encode(key)]), contentType: "application/octet-stream" };
}

async function withFixture(
  objects: FixtureObject[],
  run: (fixture: ReturnType<typeof storageHttpFixture>, directory: string) => Promise<void>,
  buckets: string[] = [bucket],
) {
  const directory = await mkdtemp(join(tmpdir(), "dreamlux-storage-http-"));
  const fixture = storageHttpFixture(objects, buckets);
  try { await run(fixture, directory); }
  finally {
    await fixture.close();
    await rm(directory, { recursive: true });
    expect(fixture.unexpected).toEqual([]);
  }
}

function snapshot(fixture: ReturnType<typeof storageHttpFixture>, directory: string, buckets = [bucket], durationMs?: number) {
  return createStorageSnapshot({
    storage: fixture.reader, buckets, directory,
    productId: "dreamlux-erp", sourceFingerprint: "a".repeat(64), durationMs,
  });
}

describe("real SDK Storage snapshot workflow on owned HTTP fixtures", () => {
  httpTest("backs up every root and nested page with exact binary and special-character keys", async () => {
    const objects = [
      ...Array.from({ length: 101 }, (_, i) => object(`root-${String(i).padStart(3, "0")}.bin`)),
      ...Array.from({ length: 201 }, (_, i) => object(`nested/folder-${String(i).padStart(3, "0")}.bin`)),
      object("same-name"), object("same-name/child.bin"),
      object("CON"), object("con"), object("reserved ?#% name.bin"), object("literal%2e%2e"), object("back\\slash.bin"),
      object("international/\u12a0\u12f2\u1235.png"),
      { ...object("large.bin"), bytes: Uint8Array.from({ length: 131071 }, (_, i) => i % 256) },
      { ...object("empty.bin"), bytes: new Uint8Array() },
      object("root-000.bin", kitchen),
    ];
    await withFixture(objects, async (fixture, directory) => {
      const result = await snapshot(fixture, directory, [bucket, kitchen, bucket]);
      const manifest = await verifyStorageSnapshot(result.path, "dreamlux-erp");
      expect(result.objects).toBe(objects.length);
      expect(result.bytes).toBe(objects.reduce((sum, item) => sum + item.bytes.length, 0));
      expect(manifest.buckets).toEqual([bucket, kitchen]);
      if (process.platform !== "win32") {
        expect((await lstat(result.path)).mode & 0o777).toBe(0o700);
        expect((await lstat(join(result.path, "manifest.json"))).mode & 0o777).toBe(0o600);
        expect((await lstat(join(result.path, "objects", manifest.objects[0].file))).mode & 0o777).toBe(0o600);
      }
      const downloaded = new Map(manifest.objects.map((entry) => [`${entry.bucket}\0${entry.key}`, entry]));
      for (const expected of objects) {
        const entry = downloaded.get(`${expected.bucket}\0${expected.key}`);
        if (!entry) throw new Error("A synthetic source object was omitted");
        expect(new Uint8Array(await readFile(join(result.path, "objects", entry.file)))).toEqual(new Uint8Array(expected.bytes));
        expect(entry.contentType).toBe(expected.contentType);
      }
      const rootOffsets = fixture.calls.filter((call) => call.operation === "list" && call.bucket === bucket && call.prefix === "").map((call) => call.offset);
      const nestedOffsets = fixture.calls.filter((call) => call.operation === "list" && call.bucket === bucket && call.prefix === "nested").map((call) => call.offset);
      expect(rootOffsets).toEqual([0, 100, 0, 100]);
      expect(nestedOffsets).toEqual([0, 100, 200, 0, 100, 200]);
      expect(fixture.calls.filter((call) => call.operation === "download")).toHaveLength(objects.length);
      expect((await readdir(directory)).some((entry) => entry.startsWith(".storage-stage-"))).toBe(false);
    }, [bucket, kitchen]);
  }, 30_000);

  httpTest("backs up an empty bucket without inventing files", async () => {
    await withFixture([], async (fixture, directory) => {
      const result = await snapshot(fixture, directory);
      expect(result.objects).toBe(0);
      expect(result.bytes).toBe(0);
      expect((await verifyStorageSnapshot(result.path, "dreamlux-erp")).objects).toEqual([]);
    });
  });

  httpTest("does not confuse a nonexistent bucket's empty listing with a successful empty backup", async () => {
    await withFixture([], async (fixture, directory) => {
      fixture.behavior.missingBucket = true;
      await expect(snapshot(fixture, directory)).rejects.toThrow("bucket");
      expect(fixture.calls.filter((call) => call.operation === "list")).toEqual([]);
      expect(await readdir(directory)).toEqual([]);
    });
  });

  httpTest("uses DreamLux's configured bucket without silently switching to the default", async () => {
    await withFixture([object("inventory.bin"), object("kitchen.bin", kitchen)], async (fixture, directory) => {
      let constructed = 0;
      const result = await backupStorage({
        supabaseUrl: fixture.url, serviceKey: fixture.key, bucket: kitchen,
      }, directory, (url, key) => {
        constructed += 1;
        expect(new URL(url).origin).toBe(fixture.url);
        expect(key).toBe(fixture.key);
        return fixture.reader;
      });
      expect(constructed).toBe(1);
      expect(result.objects).toBe(1);
      expect((await verifyStorageSnapshot(result.path, "dreamlux-erp")).buckets).toEqual([kitchen]);
    }, [bucket, kitchen]);
  });

  httpTest("fails on a later listing page instead of truncating at one hundred", async () => {
    await withFixture(Array.from({ length: 101 }, (_, i) => object(`file-${i}.bin`)), async (fixture, directory) => {
      fixture.behavior.failListOffset = 100;
      await expect(snapshot(fixture, directory)).rejects.toThrow("Storage listing failed");
      expect(fixture.calls.filter((call) => call.operation === "list").map((call) => call.offset)).toEqual([0, 100]);
      expect(await readdir(directory)).toEqual([]);
    });
  });

  httpTest("download failure leaves a previous snapshot intact and publishes nothing new", async () => {
    await withFixture([object("a.bin"), object("b.bin")], async (fixture, directory) => {
      const previous = await snapshot(fixture, directory);
      const priorManifest = await readFile(join(previous.path, "manifest.json"), "utf8");
      fixture.behavior.failDownloadKey = "b.bin";
      await expect(snapshot(fixture, directory)).rejects.toThrow("Storage download failed");
      expect(await readdir(directory)).toHaveLength(1);
      expect(await readFile(join(previous.path, "manifest.json"), "utf8")).toBe(priorManifest);
      expect((await verifyStorageSnapshot(previous.path, "dreamlux-erp")).objects).toHaveLength(2);
    });
  });

  httpTest("rejects malformed pages, repeated pages and inconsistent object lengths", async () => {
    await withFixture(Array.from({ length: 101 }, (_, i) => object(`file-${i}.bin`)), async (fixture, directory) => {
      fixture.behavior.malformedPage = true;
      await expect(snapshot(fixture, directory)).rejects.toThrow("invalid page");
      fixture.behavior.malformedPage = false;
      fixture.behavior.repeatPage = true;
      await expect(snapshot(fixture, directory)).rejects.toThrow("repeated an entry");
      fixture.behavior.repeatPage = false;
      fixture.behavior.wrongSize = true;
      await expect(snapshot(fixture, directory)).rejects.toThrow("size changed");
      expect(await readdir(directory)).toEqual([]);
    });
  });

  httpTest("refuses key traversal and source changes without publishing partial results", async () => {
    await withFixture([object("normal.bin")], async (fixture, directory) => {
      fixture.behavior.unsafeName = "..";
      await expect(snapshot(fixture, directory)).rejects.toThrow("invalid object-key segment");
      expect(fixture.calls.filter((call) => call.operation === "download")).toEqual([]);
      fixture.behavior.unsafeName = undefined;
      fixture.behavior.changeAfterDownload = true;
      await expect(snapshot(fixture, directory)).rejects.toThrow("inventory changed");
      expect(await readdir(directory)).toEqual([]);
    });
  });

  httpTest("bounds a stalled operation and cleans its staging directory", async () => {
    await withFixture([object("normal.bin")], async (fixture, directory) => {
      fixture.behavior.delayMs = 200;
      const started = Date.now();
      await expect(snapshot(fixture, directory, [bucket], 30)).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(3000);
      expect(await readdir(directory)).toEqual([]);
    });
  });

  httpTest("the actual offline verifier CLI rejects corrupted data", async () => {
    await withFixture([object("binary.bin")], async (fixture, directory) => {
      const result = await snapshot(fixture, directory);
      const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
        /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR|HOME|USERPROFILE)$/i.test(name)));
      const run = async () => {
        const child = Bun.spawn([process.execPath, "--no-env-file", join(__dirname, "verify-storage-snapshot.ts"), result.path], {
          env, stdout: "pipe", stderr: "pipe", timeout: 10_000,
        });
        const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        return { stdout, stderr, code };
      };
      const valid = await run();
      expect(valid.code, valid.stderr).toBe(0);
      expect(valid.stdout).toContain("1 buckets, 1 objects");
      const manifest = await verifyStorageSnapshot(result.path, "dreamlux-erp");
      const path = join(result.path, "objects", manifest.objects[0].file);
      const bytes = await readFile(path);
      bytes[0] ^= 1;
      await writeFile(path, bytes);
      const invalid = await run();
      expect(invalid.code).toBe(1);
      expect(invalid.stderr).toContain("checksum");
    });
  });

  httpTest("the actual backup CLI sends configured SDK inputs and publishes a verifiable snapshot", async () => {
    await withFixture([object("cli.bin")], async (fixture, directory) => {
      const output = join(directory, "cli-snapshots");
      const receipt = join(directory, "requests.json");
      const preload = join(directory, "local-sdk.mjs");
      const expectedUrl = "https://abcdefghijklmnopqrst.supabase.co";
      await writeFile(preload, [
        'import dns from "node:dns";',
        'import { Socket } from "node:net";',
        'import { writeFileSync } from "node:fs";',
        'const deny = () => { throw new Error("Unowned Storage CLI network path refused"); };',
        'Socket.prototype.connect = deny;',
        'dns.lookup = new Proxy(dns.lookup, { apply: deny });',
        'dns.promises.lookup = new Proxy(dns.promises.lookup, { apply: deny });',
        'if (globalThis.WebSocket) globalThis.WebSocket = new Proxy(globalThis.WebSocket, { construct: deny });',
        'const originalFetch = globalThis.fetch;',
        'globalThis.fetch = Object.assign((input, init) => {',
        '  const url = new URL(input instanceof Request ? input.url : String(input));',
        `  if (url.origin !== ${JSON.stringify(expectedUrl)} || !url.pathname.startsWith("/storage/v1/")) return Promise.reject(new Error("Unexpected attested SDK origin"));`,
        '  const headers = new Headers(input instanceof Request ? input.headers : undefined);',
        '  new Headers(init?.headers).forEach((value, name) => headers.set(name, value));',
        `  if (headers.get("apikey") !== ${JSON.stringify(fixture.key)}) return Promise.reject(new Error("Unexpected SDK credential"));`,
        `  writeFileSync(${JSON.stringify(receipt)}, JSON.stringify({ attestedOrigin: true, credentialMatched: true }));`,
        `  const local = ${JSON.stringify(fixture.url)} + url.pathname + url.search;`,
        '  return originalFetch(input instanceof Request ? new Request(local, input) : local, init);',
        '}, { preconnect: deny });',
      ].join("\n"));
      const system = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
        /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR|HOME|USERPROFILE)$/i.test(name)));
      const child = Bun.spawn([process.execPath, "--no-env-file", "--preload", preload, join(__dirname, "backup-storage.ts"), output], {
        env: {
          ...system, SUPABASE_URL: expectedUrl, SUPABASE_SERVICE_ROLE_KEY: fixture.key, SUPABASE_BUCKET: bucket,
        },
        stdout: "pipe", stderr: "pipe", timeout: 15_000,
      });
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect(code, stderr).toBe(0);
      expect(stdout).toContain("Storage snapshot saved to:");
      expect(stdout + stderr).not.toContain(fixture.key);
      expect(JSON.parse(await readFile(receipt, "utf8"))).toEqual({ attestedOrigin: true, credentialMatched: true });
      const snapshots = await readdir(output);
      expect(snapshots).toHaveLength(1);
      const manifest = await verifyStorageSnapshot(join(output, snapshots[0]), "dreamlux-erp");
      expect(manifest.objects.map((entry) => entry.key)).toEqual(["cli.bin"]);
    });
  });
});
