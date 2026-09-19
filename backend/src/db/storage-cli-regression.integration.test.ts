import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { storageHttpFixture, type FixtureObject } from "./testing/storage-http-fixture";

const httpTest = process.env.DREAMLUX_STORAGE_HTTP_TESTS === "1" ? test : test.skip;
const bucket = "inventory-images";
const backend = join(__dirname, "..", "..");

async function runOriginalOrCurrentCli(objects: FixtureObject[], failDownloadKey?: string) {
  const root = await mkdtemp(join(tmpdir(), "dreamlux-storage-cli-"));
  const fixture = storageHttpFixture(objects, [bucket]);
  fixture.behavior.failDownloadKey = failDownloadKey;
  try {
    for (const name of [
      "db/backup-storage.ts", "lib/env.ts", "db/storage-snapshot.ts",
      "db/storage-reader.ts", "db/storage-backup-credentials.ts",
    ]) {
      const destination = join(root, "backend", "src", ...name.split("/"));
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(backend, "src", ...name.split("/")), destination);
    }
    await symlink(join(backend, "node_modules"), join(root, "backend", "node_modules"), process.platform === "win32" ? "junction" : "dir");
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
      /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR|HOME|USERPROFILE)$/i.test(name)));
    const child = Bun.spawn([process.execPath, "--no-env-file", "src/db/backup-storage.ts"], {
      cwd: join(root, "backend"),
      env: { ...env, SUPABASE_URL: fixture.url, SUPABASE_SERVICE_ROLE_KEY: fixture.key },
      stdout: "pipe", stderr: "pipe", timeout: 20_000,
    });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    const outputEntries = await readdir(join(root, "backups", "storage"));
    return { stdout, stderr, code, calls: [...fixture.calls], outputEntries };
  } finally {
    await fixture.close();
    await rm(root, { recursive: true });
    expect(fixture.unexpected).toEqual([]);
  }
}

httpTest("actual Storage CLI downloads every root and nested page", async () => {
  const objects: FixtureObject[] = [
    ...Array.from({ length: 101 }, (_, i) => ({ bucket, key: `root-${i}.bin`, bytes: new Uint8Array([i]), contentType: "application/octet-stream" })),
    ...Array.from({ length: 201 }, (_, i) => ({ bucket, key: `000-nested/file-${i}.bin`, bytes: new Uint8Array([i]), contentType: "application/octet-stream" })),
  ];
  const result = await runOriginalOrCurrentCli(objects);
  expect(result.code, result.stderr).toBe(0);
  const downloaded = result.calls.filter((call) => call.operation === "download").map((call) => call.key).sort();
  expect(downloaded).toEqual(objects.map((object) => object.key).sort());
  expect(result.outputEntries).toHaveLength(1);
  expect(result.outputEntries[0]).toStartWith("storage-dreamlux-erp-");
}, 30_000);

httpTest("actual Storage CLI retains a normal single-object backup as a passing control", async () => {
  const result = await runOriginalOrCurrentCli([{ bucket, key: "single.bin", bytes: new Uint8Array([0, 255]), contentType: "application/octet-stream" }]);
  expect(result.code, result.stderr).toBe(0);
  expect(result.calls.filter((call) => call.operation === "download").map((call) => call.key)).toEqual(["single.bin"]);
  expect(result.outputEntries).toHaveLength(1);
});

httpTest("actual Storage CLI fails rather than reporting completion after a failed download", async () => {
  const objects: FixtureObject[] = ["a.bin", "b.bin"].map((key) => ({
    bucket, key, bytes: new Uint8Array([0, 255]), contentType: "application/octet-stream",
  }));
  const result = await runOriginalOrCurrentCli(objects, "b.bin");
  expect(result.code).not.toBe(0);
  expect(result.stdout).not.toContain("complete");
  expect(result.stdout).not.toContain("snapshot saved");
  expect(result.outputEntries).toEqual([]);
});
