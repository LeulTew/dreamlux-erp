import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { payrollBrowserTestFiles, payrollPublicEnvironment, payrollSystemEnvironment } from "../../frontend/payroll-qa-environment";
import { forbiddenFile, inside, record, safeRelative, selectedFrontendFile } from "./contracts";
import { ManagedProcess } from "./processes";

export const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
export const repositoryRoot = resolve(import.meta.dir, "..", "..");

export async function ownedDirectory(root: string, purpose: string): Promise<string> {
  if (!/^[a-z-]+$/.test(purpose)) throw new Error("Invalid private QA directory purpose");
  const directory = await mkdtemp(join(root, `.qa-payroll-${purpose}-`));
  return directory;
}

export async function removeOwnedDirectory(root: string, directory: string) {
  if (!inside(root, directory) || dirname(resolve(directory)) !== resolve(root)
      || !basename(directory).startsWith(".qa-payroll-")) {
    throw new Error("Refusing cleanup outside an owned payroll QA directory");
  }
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("The owned QA directory identity changed");
  async function detachLinks(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isSymbolicLink()) await unlink(child);
      else if (entry.isDirectory()) await detachLinks(child);
    }
  }
  await detachLinks(directory);
  await rm(directory, { recursive: true });
}

async function regularSource(root: string, path: string) {
  safeRelative(path);
  if ((await lstat(root)).isSymbolicLink()) throw new Error("Refusing a linked QA source/artifact root");
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error("Refusing a symlink in QA source/artifacts");
  }
  if (!(await lstat(current)).isFile()) throw new Error("Expected a regular QA source file");
  return current;
}

export async function frontendSourceFiles(root: string): Promise<string[]> {
  const git = new ManagedProcess("source inventory", "git",
    ["--no-pager", "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "frontend"],
    { cwd: root, env: payrollSystemEnvironment(process.env) });
  const result = await git.requireSuccess(10_000);
  const files = [...new Set(result.output.split("\0").filter(Boolean))].filter(selectedFrontendFile).sort();
  for (const required of [
    "frontend/package.json", "frontend/bun.lock", "frontend/tsconfig.json",
    "frontend/next.payroll-native.config.ts", "frontend/playwright.payroll-native.config.ts",
    "frontend/payroll-qa-environment.ts", "frontend/src/app/hr/payments/page.tsx",
    "frontend/src/app/hr/payments/run/page.tsx", "frontend/src/app/hr/payments/[id]/page.tsx",
    ...payrollBrowserTestFiles.map((file) => `frontend/e2e/${file}`), "frontend/e2e/payroll-native-fixture.ts",
  ]) {
    if (!files.includes(required)) throw new Error(`Missing required QA source: ${required}`);
  }
  return files;
}

export function productionInput(file: string) {
  return !file.startsWith("e2e/") && !/\.(?:test|spec|vitest)\.[cm]?[jt]sx?$/.test(file)
    && !/^playwright\.[a-z-]+\.config\.ts$/.test(file) && file !== "vitest.config.ts";
}

export async function createFrontendSnapshot(root: string, destination: string, listed?: string[]) {
  await mkdir(destination, { mode: 0o700 });
  const files = listed ?? await frontendSourceFiles(root);
  const digests: Record<string, string> = {};
  for (const source of files) {
    if (!selectedFrontendFile(source)) throw new Error("An unapproved file was supplied to the snapshot");
    const input = await regularSource(root, source);
    const name = source.slice("frontend/".length);
    const output = name === "next.payroll-native.config.ts" ? "next.config.ts" : name;
    const bytes = await readFile(input);
    const path = join(destination, ...output.split("/"));
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, bytes);
    digests[output] = hash(bytes);
  }
  const manifest: unknown = JSON.parse(await readFile(join(destination, "package.json"), "utf8"));
  if (!record(manifest) || !record(manifest.scripts)
      || manifest.scripts.build !== "next build --webpack" || manifest.scripts.start !== "next start"
      || manifest.scripts["test:e2e:payroll"] !== "node node_modules/playwright/cli.js test --config=playwright.payroll-native.config.ts") {
    throw new Error("The copied frontend runtime commands need explicit review");
  }
  const modules = await realpath(join(root, "frontend", "node_modules"));
  await symlink(modules, join(destination, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const production = Object.fromEntries(Object.entries(digests).filter(([name]) => productionInput(name)).sort(([a], [b]) => a.localeCompare(b)));
  return { directory: destination, productionDigest: hash(JSON.stringify(production)), testDigest: hash(JSON.stringify(digests)) };
}

async function artifactFiles(root: string, at = ""): Promise<string[]> {
  if ((await lstat(join(root, at))).isSymbolicLink()) throw new Error("Refusing a linked artifact directory");
  const files: string[] = [];
  for (const entry of await readdir(join(root, at), { withFileTypes: true })) {
    const name = at ? `${at}/${entry.name}` : entry.name;
    if (name === "cache" || name.startsWith("cache/")) continue;
    if (forbiddenFile(name) || entry.isSymbolicLink()) throw new Error("Refusing linked/configuration-bearing build artifacts");
    if (entry.isDirectory()) files.push(...await artifactFiles(root, name));
    else if (entry.isFile()) files.push(safeRelative(name));
    else throw new Error("Unexpected non-file build artifact");
  }
  return files.sort();
}

async function nextFiles(root: string) {
  const result: Record<string, string> = {};
  for (const file of await artifactFiles(root)) result[file] = hash(await readFile(await regularSource(root, file)));
  for (const file of ["BUILD_ID", "routes-manifest.json", "server/app-paths-manifest.json", "required-server-files.json"]) {
    if (!result[file]) throw new Error("A successful Next build must produce its required runtime manifests");
  }
  return result;
}

async function verifyNextManifests(directory: string) {
  const id = (await readFile(join(directory, "BUILD_ID"), "utf8")).trim();
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error("Next BUILD_ID is missing or malformed");
  const routes: unknown = JSON.parse(await readFile(join(directory, "routes-manifest.json"), "utf8"));
  if (!record(routes) || !record(routes.rewrites)) throw new Error("Missing native UI rewrite manifest");
  const rewrites = ["beforeFiles", "afterFiles", "fallback"].flatMap((kind) => {
    const rows = routes.rewrites;
    if (!record(rows) || !Array.isArray(rows[kind])) throw new Error("Malformed native UI rewrite manifest");
    return rows[kind];
  });
  if (rewrites.length !== 1 || !record(rewrites[0]) || rewrites[0].source !== "/api/:path*"
      || rewrites[0].destination !== "http://127.0.0.1:5326/:path*") {
    throw new Error("The Next artifact does not target the owned native API");
  }
  const pages: unknown = JSON.parse(await readFile(join(directory, "server", "app-paths-manifest.json"), "utf8"));
  if (!record(pages)) throw new Error("Missing payroll application route manifest");
  for (const route of ["/hr/payments/page", "/hr/payments/run/page", "/hr/payments/[id]/page"]) {
    const page = pages[route];
    if (typeof page !== "string") throw new Error("The build artifact lacks a required payroll page");
    await regularSource(join(directory, "server"), safeRelative(page));
  }
  return id;
}

export async function publishFrontendArtifact(
  root: string, snapshot: Awaited<ReturnType<typeof createFrontendSnapshot>>, output: string,
) {
  output = resolve(root, output);
  if (!inside(root, output) || dirname(output) !== resolve(root) || !basename(output).startsWith(".qa-payroll-")) {
    throw new Error("Build output must be a new .qa-payroll-* directory directly inside the checkout");
  }
  await mkdir(output, { mode: 0o700 });
  try {
    const source = join(snapshot.directory, ".next");
    const files = await nextFiles(source);
    const buildId = await verifyNextManifests(source);
    for (const file of Object.keys(files)) {
      const target = join(output, ".next", ...file.split("/"));
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await copyFile(join(source, ...file.split("/")), target);
    }
    await writeFile(join(output, "payroll-build.json"), JSON.stringify({
      schema: 1, purpose: "dreamlux-payroll-239", platform: process.platform, arch: process.arch,
      productionDigest: snapshot.productionDigest, buildId,
      publicEnvironment: payrollPublicEnvironment, files,
    }, null, 2), { mode: 0o600 });
  } catch (error) {
    await removeOwnedDirectory(root, output);
    throw error;
  }
}

export async function assertNewBuildOutput(root: string, output: string) {
  const target = resolve(root, output);
  if (!inside(root, target) || dirname(target) !== resolve(root) || !basename(target).startsWith(".qa-payroll-")) {
    throw new Error("Build output must be a new .qa-payroll-* directory directly inside the checkout");
  }
  try {
    await lstat(target);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return target;
    throw error;
  }
  throw new Error("Refusing to overwrite another run's existing frontend artifact");
}

export async function installFrontendArtifact(
  artifact: string, snapshot: Awaited<ReturnType<typeof createFrontendSnapshot>>,
) {
  const receipt: unknown = JSON.parse(await readFile(await regularSource(artifact, "payroll-build.json"), "utf8"));
  if (!record(receipt) || receipt.schema !== 1 || receipt.purpose !== "dreamlux-payroll-239"
      || receipt.platform !== process.platform || receipt.arch !== process.arch
      || receipt.productionDigest !== snapshot.productionDigest
      || JSON.stringify(receipt.publicEnvironment) !== JSON.stringify(payrollPublicEnvironment)
      || !record(receipt.files)) throw new Error("The frontend artifact is not the current credential-free build");
  const source = join(artifact, ".next");
  const actual = await nextFiles(source);
  if (JSON.stringify(actual) !== JSON.stringify(receipt.files)) throw new Error("Frontend build artifact hashes do not match the receipt");
  if (await verifyNextManifests(source) !== receipt.buildId) throw new Error("Frontend build ID does not match its receipt");
  const destination = join(snapshot.directory, ".next");
  await mkdir(destination, { mode: 0o700 });
  for (const file of Object.keys(actual)) {
    const target = join(destination, ...file.split("/"));
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await copyFile(await regularSource(source, file), target);
  }
  if (JSON.stringify(await nextFiles(destination)) !== JSON.stringify(actual)) throw new Error("The copied build artifact changed during verification");
  return { buildId: receipt.buildId, productionDigest: snapshot.productionDigest };
}

export async function boundedJson(path: string): Promise<unknown> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024) throw new Error("Unsafe or oversized QA receipt");
  return JSON.parse(await readFile(path, "utf8"));
}

export function portableRelative(root: string, file: string) {
  return relative(root, file).split(sep).join("/");
}
