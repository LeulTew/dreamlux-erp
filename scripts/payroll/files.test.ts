import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { access, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  createFrontendSnapshot, installFrontendArtifact, ownedDirectory, publishFrontendArtifact,
  removeOwnedDirectory, repositoryRoot,
} from "./files";

let root: string;
const selected = ["frontend/package.json", "frontend/src/synthetic.ts", "frontend/next.payroll-native.config.ts", "frontend/e2e/synthetic.test.ts"];
async function put(path: string, data: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}
beforeEach(async () => {
  root = await ownedDirectory(repositoryRoot, "unit");
  await mkdir(join(root, "frontend", "node_modules"), { recursive: true });
  await put(join(root, "frontend", "package.json"), JSON.stringify({ scripts: {
    build: "next build --webpack", start: "next start",
    "test:e2e:payroll": "node node_modules/playwright/cli.js test --config=playwright.payroll-native.config.ts",
  } }));
  await put(join(root, "frontend", "src", "synthetic.ts"), "export const synthetic = true;\n");
  await put(join(root, "frontend", "next.payroll-native.config.ts"), "export default { syntheticOnly: true };\n");
  await put(join(root, "frontend", "e2e", "synthetic.test.ts"), "// Synthetic boundary input, never executed.\n");
});
afterEach(async () => { await removeOwnedDirectory(repositoryRoot, root); });

async function fakeBuild(directory: string) {
  await put(join(directory, ".next", "BUILD_ID"), "synthetic-build-id");
  await put(join(directory, ".next", "routes-manifest.json"), JSON.stringify({
    rewrites: { beforeFiles: [], afterFiles: [{ source: "/api/:path*", destination: "http://127.0.0.1:5326/:path*" }], fallback: [] },
  }));
  const pages = {
    "/hr/payments/page": "app/hr/payments/page.js",
    "/hr/payments/run/page": "app/hr/payments/run/page.js",
    "/hr/payments/[id]/page": "app/hr/payments/[id]/page.js",
  };
  await put(join(directory, ".next", "server", "app-paths-manifest.json"), JSON.stringify(pages));
  for (const page of Object.values(pages)) await put(join(directory, ".next", "server", ...page.split("/")), "// synthetic non-executable manifest fixture\n");
  await put(join(directory, ".next", "required-server-files.json"), "{}");
}

describe("source and artifact boundaries without application runtime", () => {
  test("copies selected source and substitutes only the reviewed QA Next config", async () => {
    const snapshot = await createFrontendSnapshot(root, join(root, "ui"), selected);
    expect(await readFile(join(snapshot.directory, "src", "synthetic.ts"), "utf8")).toContain("synthetic");
    expect(await readFile(join(snapshot.directory, "next.config.ts"), "utf8")).toContain("syntheticOnly");
    expect(snapshot.productionDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.testDigest).toMatch(/^[a-f0-9]{64}$/);
  });
  test("rejects provider files before reading them and refuses ancestor symlinks", async () => {
    await expect(createFrontendSnapshot(root, join(root, "refused"), [...selected, "frontend/src/.env.private"])).rejects.toThrow("connection-bearing");
    const external = join(root, "outside-source");
    await put(join(external, "synthetic.ts"), "must not be copied");
    await symlink(external, join(root, "frontend", "src", "linked"), process.platform === "win32" ? "junction" : "dir");
    await expect(createFrontendSnapshot(root, join(root, "refused-link"), [...selected, "frontend/src/linked/synthetic.ts"])).rejects.toThrow("symlink");
  });
  test("reuses a verified build without unverified cache material or a second build", async () => {
    const source = await createFrontendSnapshot(root, join(root, "ui"), selected);
    await fakeBuild(source.directory);
    const artifact = join(root, ".qa-payroll-artifact");
    await publishFrontendArtifact(root, source, artifact);
    await put(join(artifact, ".next", "cache", "private.txt"), "unverified cache must not enter the runtime snapshot");
    const runtime = await createFrontendSnapshot(root, join(root, "runtime"), selected);
    expect(await installFrontendArtifact(artifact, runtime)).toMatchObject({ buildId: "synthetic-build-id" });
    await expect(access(join(runtime.directory, ".next", "cache"))).rejects.toThrow();
  });
  test("rejects missing, wrong-target, stale and modified build receipts", async () => {
    const source = await createFrontendSnapshot(root, join(root, "ui"), selected);
    await fakeBuild(source.directory);
    const artifact = join(root, ".qa-payroll-artifact");
    await publishFrontendArtifact(root, source, artifact);
    const runtime = await createFrontendSnapshot(root, join(root, "runtime"), selected);
    await put(join(artifact, ".next", "BUILD_ID"), "modified-build-id");
    await expect(installFrontendArtifact(artifact, runtime)).rejects.toThrow("hashes");
    await put(join(root, "frontend", "src", "synthetic.ts"), "export const synthetic = 'changed';");
    const changed = await createFrontendSnapshot(root, join(root, "changed"), selected);
    await expect(installFrontendArtifact(artifact, changed)).rejects.toThrow("current credential-free build");
    await expect(installFrontendArtifact(join(root, "missing"), runtime)).rejects.toThrow();
  });
  test("does not delete or replace another run's existing artifact", async () => {
    const source = await createFrontendSnapshot(root, join(root, "ui"), selected);
    await fakeBuild(source.directory);
    const artifact = join(root, ".qa-payroll-artifact");
    await mkdir(artifact);
    await put(join(artifact, "keep.txt"), "existing owner");
    await expect(publishFrontendArtifact(root, source, artifact)).rejects.toThrow();
    expect(await readFile(join(artifact, "keep.txt"), "utf8")).toBe("existing owner");
  });
  test("cleanup unlinks dependency junctions without following them", async () => {
    await put(join(root, "frontend", "node_modules", "keep.txt"), "shared dependency");
    const work = await ownedDirectory(root, "snapshot");
    await createFrontendSnapshot(root, join(work, "ui"), selected);
    await removeOwnedDirectory(root, work);
    expect(await readFile(join(root, "frontend", "node_modules", "keep.txt"), "utf8")).toBe("shared dependency");
    await expect(removeOwnedDirectory(root, root)).rejects.toThrow("outside an owned");
  });
});
