import { isAbsolute, relative, resolve, sep } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { attestDreamluxNativeTarget } from "../../backend/src/db/testing/dreamlux-native-target";
import { payrollBrowserTestFiles, payrollSystemEnvironment } from "../../frontend/payroll-qa-environment";

export const POSTGREST_VERSION = "16.3";
export const POSTGREST_LINUX_ARCHIVE_URL = "https://github.com/PostgREST/postgrest/releases/download/v16.3/postgrest-v16.3-linux-static-x86-64.tar.xz";
export const POSTGREST_LINUX_ARCHIVE_SHA256 = "4eb414eb948c8800863cc8c9896a17b611b2dccf9ff581f4d57f42ec9ccee40d";
export const POSTGREST_LINUX_BINARY_SHA256 = "0cf367dc2ee47d5c648baa2952e25bdf299de4e1998d31e251bb00d129262d71";
export const NATIVE_TEST = "src/db/payroll-publication.integration.test.ts";
export const NATIVE_GUARD_BANNER = "[native DreamLux] Only the independent local PG/REST fixtures and test-owned HTTP servers are permitted.";
export const API_ORIGIN = "http://127.0.0.1:5326";
export const UI_ORIGIN = "http://127.0.0.1:3126";
export const RUNNER_TIMEOUT_MS = 225_000;
export const MINIMUM_NATIVE_TESTS = 56;

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function inside(parent: string, child: string): boolean {
  const path = relative(resolve(parent), resolve(child));
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export function safeRelative(path: string): string {
  if (!path || path.includes("\\") || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === ".." || part.includes(":"))) {
    throw new Error("Unsafe verification artifact path");
  }
  return path;
}

const SAFE_CONFIGS = new Set([
  "package.json", "bun.lock", "tsconfig.json", "next-env.d.ts",
  "postcss.config.mjs", "eslint.config.mjs", "vitest.config.ts",
  "payroll-qa-environment.ts", "next.payroll-native.config.ts", "playwright.payroll-native.config.ts",
]);

export function forbiddenFile(path: string): boolean {
  return path.split("/").some((part) => /^\.env(?:.*)$/i.test(part)
    || /^(?:env-pulled-prod\.local|\.vercel.*|vercel\.json|\.vscode|\.git|\.mcp.*|mcp\.json|project\.json)$/i.test(part));
}

export function selectedFrontendFile(path: string): boolean {
  safeRelative(path);
  if (!path.startsWith("frontend/")) return false;
  const file = path.slice("frontend/".length);
  const selected = SAFE_CONFIGS.has(file) || /^(?:src|public|e2e)\//.test(file);
  if (selected && forbiddenFile(file)) throw new Error("Refusing connection-bearing configuration in the QA snapshot");
  return selected;
}

export type NativePlan = {
  adminUrl: string;
  postgrest: string;
  postgrestSha256: string;
  artifact: string;
};

export function nativePlan(args: readonly string[], env: Record<string, string | undefined>, root: string, platform = process.platform, arch = process.arch): NativePlan {
  if (args.filter((arg) => arg === "--allow-disposable-postgres").length !== 1) throw new Error("Explicit --allow-disposable-postgres attestation is required once");
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (name === "--allow-disposable-postgres") continue;
    if (!["--postgrest", "--postgrest-sha256", "--frontend-build"].includes(name)
        || options.has(name) || !args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error("Unknown, duplicate, or incomplete payroll runner option");
    }
    options.set(name, args[++index]);
  }
  if (env.DREAMLUX_NATIVE_USE_BASELINE || env.DREAMLUX_E2E_BASELINE || env.DREAMLUX_NATIVE_BROWSER_SERVER || env.DREAMLUX_NATIVE_BROWSER_DESCRIPTOR) {
    throw new Error("Refusing an inherited baseline or browser fixture");
  }
  for (const name of ["DATABASE_URL", "DATABASE_BACKUP_URL", "DATABASE_DIRECT_URL", "DIRECT_DATABASE_URL", "JWT_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DREAMLUX_TEST_REST_JWT_SECRET"]) {
    if (env[name]) throw new Error(`Remove inherited ${name}; the runner creates its own fixture environment`);
  }
  if (Object.entries(env).some(([name, value]) => value && /^(?:PG|POSTGRES)/i.test(name))) {
    throw new Error("Remove inherited PostgreSQL/PostgREST overrides before native QA");
  }
  const adminUrl = attestDreamluxNativeTarget(env.DREAMLUX_NATIVE_TEST_ADMIN_URL ?? "", "admin").href;
  const binary = options.get("--postgrest");
  const artifact = options.get("--frontend-build");
  if (!binary || !artifact) throw new Error("Explicit --postgrest and --frontend-build paths are required");
  if (!["linux", "win32"].includes(platform) || arch !== "x64") throw new Error("Payroll QA supports Linux x64 and Windows x64");
  const checksum = options.get("--postgrest-sha256") ?? (platform === "linux" ? POSTGREST_LINUX_BINARY_SHA256 : "");
  if (!/^[a-f0-9]{64}$/.test(checksum)
      || (platform === "linux" && checksum !== POSTGREST_LINUX_BINARY_SHA256)) {
    throw new Error("A verified PostgREST 16.3 binary checksum is required");
  }
  return { adminUrl, postgrest: resolve(root, binary), postgrestSha256: checksum, artifact: resolve(root, artifact) };
}

export function nativeEnvironment(
  ambient: Record<string, string | undefined>, adminUrl: string, fixtureUrl: string, jwtSecret: string, restSecret: string,
): Record<string, string> {
  const admin = attestDreamluxNativeTarget(adminUrl, "admin");
  const fixture = attestDreamluxNativeTarget(fixtureUrl, "fixture");
  if (!/^\/dreamlux_ephemeral_payroll_239_[a-f0-9]{12}$/.test(fixture.pathname)
      || fixture.username !== admin.username || fixture.password !== admin.password || fixture.search !== admin.search
      || !/^[a-f0-9]{64}$/.test(jwtSecret) || !/^[a-f0-9]{64}$/.test(restSecret)
      || jwtSecret === restSecret || jwtSecret === admin.password || restSecret === admin.password) {
    throw new Error("The runner requires a fresh fixture and independent application/REST secrets");
  }
  return {
    ...payrollSystemEnvironment(ambient),
    NODE_ENV: "development",
    DATABASE_URL: fixture.href,
    DATABASE_BACKUP_URL: "",
    DATABASE_DIRECT_URL: "",
    DIRECT_DATABASE_URL: "",
    DREAMLUX_NATIVE_TEST_ADMIN_URL: admin.href,
    JWT_SECRET: jwtSecret,
    DREAMLUX_TEST_REST_JWT_SECRET: restSecret,
    SUPABASE_URL: "http://127.0.0.1:54335",
  };
}

export function nativeArguments(report: string): string[] {
  return ["--no-env-file", "test", `--config=.${sep}bunfig.native.toml`, "--timeout=30000",
    "--reporter=junit", `--reporter-outfile=${report}`, NATIVE_TEST.split("/").join(sep)];
}

export type BunReceipt = { passed: number; failed: number; skipped: number; tests: number; files: number };
export function bunReceipt(output: string, exitCode: number, purpose: "native" | "provider"): BunReceipt {
  const plain = stripVTControlCharacters(output);
  const count = (kind: string) => [...plain.matchAll(new RegExp(`^\\s*(\\d+) ${kind}\\s*$`, "gm"))].at(-1)?.[1];
  const passed = Number(count("pass"));
  const failed = Number(count("fail"));
  const skipped = Number(count("skip") ?? 0);
  const run = [...plain.matchAll(/Ran (\d+) tests? across (\d+) files?/g)].at(-1);
  const tests = Number(run?.[1]);
  const files = Number(run?.[2]);
  const minimum = purpose === "provider" ? 1 : MINIMUM_NATIVE_TESTS;
  if (exitCode !== 0 || !plain.includes(NATIVE_GUARD_BANNER)
      || !plain.replace(/\\/g, "/").includes(NATIVE_TEST)
      || !Number.isInteger(passed) || passed < minimum || failed !== 0 || skipped !== 0
      || tests !== passed || files !== 1 || (purpose === "provider" && passed !== 1)) {
    throw new Error(`The ${purpose} process did not provide a complete non-skipped native test receipt`);
  }
  return { passed, failed, skipped, tests, files };
}

export function verifyJunitReceipt(text: string, expected: BunReceipt) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Unsupported native report declarations");
  const opening = text.trim().match(/^(?:<\?xml[^>]*>\s*)?<testsuites\b([^>]*)>/)?.[1];
  if (!opening || !text.trim().endsWith("</testsuites>")) throw new Error("Missing or incomplete native JUnit receipt");
  const attribute = (name: string) => Number(opening.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1]);
  const content = text.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g, "");
  if (attribute("tests") !== expected.tests || attribute("failures") !== 0 || attribute("skipped") !== 0
      || [...content.matchAll(/<testcase\b/g)].length !== expected.tests) {
    throw new Error("Native JUnit and process receipts disagree");
  }
}

export type BrowserDescriptor = {
  apiOrigin: string; writerCookie: string; readerCookie: string; shutdownKey: string; database: string;
};
export function browserDescriptor(value: unknown, fixtureUrl: string): BrowserDescriptor {
  const fixture = attestDreamluxNativeTarget(fixtureUrl, "fixture");
  if (!record(value) || value.apiOrigin !== API_ORIGIN || value.database !== fixture.pathname.slice(1)
      || typeof value.writerCookie !== "string" || !value.writerCookie || /[\r\n]/.test(value.writerCookie)
      || typeof value.readerCookie !== "string" || !value.readerCookie || /[\r\n]/.test(value.readerCookie)
      || typeof value.shutdownKey !== "string" || !/^[a-f0-9]{48}$/.test(value.shutdownKey)) {
    throw new Error("The private browser descriptor does not identify this owned fixture");
  }
  return {
    apiOrigin: API_ORIGIN, database: value.database, shutdownKey: value.shutdownKey,
    writerCookie: value.writerCookie, readerCookie: value.readerCookie,
  };
}

type BrowserProject = "desktop" | "mobile";
type BrowserIdentity = { key: string; project: BrowserProject };
export type BrowserRegistry = { tests: readonly BrowserIdentity[] };

export function browserArguments(discover = false): string[] {
  return ["--no-env-file", "run", "test:e2e:payroll", ...(discover ? ["--list"] : [])];
}

function browserReportCases(value: unknown, exitCode: number, purpose: "discovery" | "execution"): BrowserIdentity[] {
  if (!record(value) || !Array.isArray(value.suites) || !Array.isArray(value.errors) || value.errors.length || exitCode !== 0) {
    throw new Error("Browser QA did not return a successful structured report");
  }
  const config = value.config;
  if (!record(config) || config.workers !== 1 || config.fullyParallel !== false || config.forbidOnly !== true
      || !Array.isArray(config.projects) || config.projects.length !== 2) {
    throw new Error("Browser QA requires the complete serial desktop/mobile configuration");
  }
  const projectIds = new Map<string, string>();
  for (const project of config.projects) {
    if (!record(project) || (project.name !== "desktop" && project.name !== "mobile")
        || typeof project.id !== "string" || !project.id || project.retries !== 0 || project.repeatEach !== 1
        || projectIds.has(project.name)) throw new Error("Unexpected or repeated browser project configuration");
    projectIds.set(project.name, project.id);
  }
  if (new Set(projectIds.values()).size !== projectIds.size) throw new Error("Duplicate configured browser project identity");
  const counts: Record<string, number> = { desktop: 0, mobile: 0 };
  const requiredFiles = new Set<string>(payrollBrowserTestFiles);
  const coveredFiles = new Set<string>();
  const cases: BrowserIdentity[] = [];
  const keys = new Set<string>();
  function visit(suites: unknown[], titles: string[]) {
    for (const suite of suites) {
      if (!record(suite) || typeof suite.title !== "string" || !Array.isArray(suite.specs)
          || (suite.suites !== undefined && !Array.isArray(suite.suites))) throw new Error("Malformed browser suite receipt");
      const titlePath = [...titles, suite.title];
      for (const spec of suite.specs) {
        if (!record(spec) || typeof spec.id !== "string" || !spec.id || typeof spec.title !== "string"
            || typeof spec.file !== "string" || !Number.isInteger(spec.line) || Number(spec.line) < 1
            || !Number.isInteger(spec.column) || Number(spec.column) < 1
            || !requiredFiles.has(spec.file.replace(/\\/g, "/").split("/").at(-1) ?? "")
            || !Array.isArray(spec.tests) || !spec.tests.length || (purpose === "execution" && spec.ok !== true)) {
          throw new Error("Unexpected or incomplete payroll browser specification");
        }
        for (const test of spec.tests) {
          if (!record(test) || (test.projectName !== "desktop" && test.projectName !== "mobile")
            || test.projectId !== projectIds.get(test.projectName)
            || test.expectedStatus !== "passed" || !Array.isArray(test.results)) {
            throw new Error("A requested browser test is missing, skipped, or belongs to an unexpected project");
          }
          if (purpose === "discovery" ? test.results.length !== 0
            : test.status !== "expected" || test.results.length !== 1
            || !record(test.results[0]) || test.results[0].status !== "passed" || test.results[0].retry !== 0) {
            throw new Error("Payroll browser QA requires every test to pass once, without retries or skips");
          }
          const key = JSON.stringify([test.projectName, test.projectId, spec.id, spec.file.replace(/\\/g, "/"),
            ...titlePath, spec.title, spec.line, spec.column]);
          if (keys.has(key)) throw new Error("Duplicate browser test identity in the receipt");
          keys.add(key);
          cases.push({ key, project: test.projectName });
          counts[test.projectName]++;
          coveredFiles.add(`${test.projectName}:${spec.file.replace(/\\/g, "/").split("/").at(-1)}`);
        }
      }
      if (Array.isArray(suite.suites)) visit(suite.suites, titlePath);
    }
  }
  visit(value.suites, []);
  if (Object.values(counts).some((count) => count === 0)) throw new Error("Missing nonzero desktop/mobile browser coverage");
  for (const project of ["desktop", "mobile"]) {
    if (payrollBrowserTestFiles.some((file) => !coveredFiles.has(`${project}:${file}`))) {
      throw new Error("Missing required browser file coverage for publication or preview");
    }
  }
  if (!record(value.stats) || value.stats.unexpected !== 0 || value.stats.flaky !== 0
      || (purpose === "execution" && (value.stats.expected !== cases.length || value.stats.skipped !== 0))) {
    throw new Error("Browser report totals disagree with the successful, non-retried test receipts");
  }
  return cases.sort((a, b) => a.key.localeCompare(b.key));
}

export function browserRegistry(value: unknown, exitCode: number): BrowserRegistry {
  return { tests: browserReportCases(value, exitCode, "discovery") };
}

export function browserReceipt(value: unknown, exitCode: number, requested: BrowserRegistry) {
  const cases = browserReportCases(value, exitCode, "execution");
  const expected = new Set(requested.tests.map((test) => test.key));
  if (!expected.size || expected.size !== requested.tests.length
      || cases.length !== expected.size || cases.some((test) => !expected.has(test.key))) {
    throw new Error("Browser execution did not exhaust exactly the discovered test registry");
  }
  const desktop = cases.filter((test) => test.project === "desktop").length;
  const mobile = cases.filter((test) => test.project === "mobile").length;
  return { desktop, mobile, requested: expected.size, passed: cases.length, retries: 0, skipped: 0 };
}
