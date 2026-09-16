import { randomBytes } from "node:crypto";
import { lstat, open, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { payrollSystemEnvironment, payrollUiEnvironment } from "../../frontend/payroll-qa-environment";
import {
  API_ORIGIN, browserArguments, browserDescriptor, browserReceipt, browserRegistry, bunReceipt, nativeArguments, nativeEnvironment,
  nativePlan, POSTGREST_VERSION, RUNNER_TIMEOUT_MS, UI_ORIGIN, type BrowserDescriptor, type NativePlan,
  verifyJunitReceipt, type BunReceipt,
} from "./contracts";
import {
  boundedJson, createFrontendSnapshot, hash, installFrontendArtifact, ownedDirectory, portableRelative,
  removeOwnedDirectory, repositoryRoot,
} from "./files";
import { CleanupStack, ManagedProcess, redact, reservePayrollPorts, waitForHttp } from "./processes";

async function privateDescriptor(path: string, fixtureUrl: string, provider: ManagedProcess, timeoutMs: number): Promise<BrowserDescriptor> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    provider.assertRunning();
    try {
      const value = await boundedJson(path);
      return browserDescriptor(value, fixtureUrl);
    } catch (error) {
      const missing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
      if (!missing && !(error instanceof SyntaxError)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The owned native provider did not produce its private readiness descriptor");
}

async function junitExists(path: string, expected: BunReceipt) {
  const value = await boundedJsonOrXml(path);
  verifyJunitReceipt(value, expected);
}

async function boundedJsonOrXml(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024) throw new Error("Invalid native report file");
  return (await readFile(path, "utf8")).trim();
}

export async function verifyPayroll(plan: NativePlan, root = repositoryRoot) {
  const deadline = Date.now() + RUNNER_TIMEOUT_MS;
  let interrupted = false;
  const children: ManagedProcess[] = [];
  const resources = new CleanupStack();
  const secrets = [plan.adminUrl, new URL(plan.adminUrl).password];
  let work: string | undefined;
  let receipt: Record<string, unknown> | undefined;
  let failure: unknown;
  const budget = (limit: number) => {
    if (interrupted) throw new Error("Payroll QA was interrupted");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Payroll QA exceeded its total time budget");
    return Math.min(limit, remaining);
  };
  const start = (label: string, command: string, args: string[], cwd: string, env: Record<string, string>) => {
    budget(1);
    const child = new ManagedProcess(label, command, args, { cwd, env, secrets });
    children.push(child);
    resources.defer(label, () => child.stop());
    return child;
  };
  const interrupt = () => {
    interrupted = true;
    for (const child of children) {
      void child.stop().catch(() => { console.error("Owned QA child termination failed; final cleanup will report failure."); });
    }
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    // A second validation also protects callers importing this function instead of the CLI.
    nativePlan(["--allow-disposable-postgres", "--postgrest", plan.postgrest, "--postgrest-sha256", plan.postgrestSha256,
      "--frontend-build", plan.artifact], { ...process.env, DREAMLUX_NATIVE_TEST_ADMIN_URL: plan.adminUrl }, root);
    const binaryInfo = await lstat(plan.postgrest);
    if (!binaryInfo.isFile() || binaryInfo.isSymbolicLink() || hash(await readFile(plan.postgrest)) !== plan.postgrestSha256) {
      throw new Error("PostgREST binary checksum verification failed; it will not be executed");
    }
    const lockPath = join(root, ".qa-payroll-native.lock");
    const lock = await open(lockPath, "wx", 0o600);
    resources.defer("checkout lock", async () => { await lock.close(); await unlink(lockPath); });
    const ports = await reservePayrollPorts();
    resources.defer("port reservations", () => ports.close());
    work = await ownedDirectory(root, "run");
    const snapshot = await createFrontendSnapshot(root, join(work, "ui"));
    const build = await installFrontendArtifact(plan.artifact, snapshot);
    const version = start("PostgREST version check", plan.postgrest, ["--version"], root, payrollSystemEnvironment(process.env));
    const versionResult = await version.requireSuccess(budget(10_000));
    if (!new RegExp(`\\bPostgREST\\s+${POSTGREST_VERSION.replace(".", "\\.")}(?:\\s|$)`).test(versionResult.output)) {
      throw new Error("The checked PostgREST binary is not the pinned version");
    }

    const { createDreamluxPayrollFixture } = await import("../../backend/src/db/testing/dreamlux-payroll-fixture");
    const fixture = await createDreamluxPayrollFixture(plan.adminUrl);
    resources.defer("fixture database", () => fixture.dispose());
    const jwtSecret = randomBytes(32).toString("hex");
    const restSecret = randomBytes(32).toString("hex");
    secrets.push(fixture.url, jwtSecret, restSecret);
    const env = nativeEnvironment(process.env, plan.adminUrl, fixture.url, jwtSecret, restSecret);
    await writeFile(join(work, "ownership.json"), JSON.stringify({
      purpose: "dreamlux-payroll-239", database: new URL(fixture.url).pathname.slice(1),
    }), { mode: 0o600 });
    await ports.release(54334);
    const rest = start("owned PostgREST", plan.postgrest, [], work, {
      ...payrollSystemEnvironment(process.env),
      PGRST_DB_URI: fixture.url,
      PGRST_DB_SCHEMAS: "public",
      PGRST_DB_ANON_ROLE: "",
      PGRST_DB_POOL: "5",
      PGRST_JWT_SECRET: restSecret,
      PGRST_SERVER_HOST: "127.0.0.1",
      PGRST_SERVER_PORT: "54334",
    });
    await waitForHttp("http://127.0.0.1:54334", rest, budget(20_000));

    await ports.release(54335);
    const nativeReport = join(work, "native.junit.xml");
    const native = start("native payroll assertions", process.execPath, nativeArguments(nativeReport), join(root, "backend"), env);
    const nativeResult = await native.requireSuccess(budget(75_000));
    const nativeSummary = bunReceipt(nativeResult.output, nativeResult.exitCode, "native");
    await junitExists(nativeReport, nativeSummary);
    console.log(`Native payroll: ${nativeSummary.passed} passed, zero failed/skipped.`);

    await ports.release(5326);
    const descriptorPath = join(work, "browser.private.json");
    const providerReport = join(work, "provider.junit.xml");
    const provider = start("native browser provider", process.execPath, nativeArguments(providerReport), join(root, "backend"), {
      ...env,
      DREAMLUX_NATIVE_BROWSER_SERVER: "1",
      DREAMLUX_NATIVE_BROWSER_DESCRIPTOR: descriptorPath,
    });
    const descriptor = await privateDescriptor(descriptorPath, fixture.url, provider, budget(30_000));
    secrets.push(descriptor.shutdownKey, descriptor.writerCookie, descriptor.readerCookie);
    let providerStopped = false;
    const stopProvider = async () => {
      if (providerStopped) return;
      provider.assertRunning();
      const stopped = await fetch(`${API_ORIGIN}/__qa/shutdown`, {
        method: "POST", headers: { "x-dreamlux-fixture-key": descriptor.shutdownKey },
        redirect: "error", signal: AbortSignal.timeout(5_000),
      });
      if (stopped.status !== 204) throw new Error("The owned browser provider refused graceful shutdown");
      const result = await provider.requireSuccess(15_000);
      const summary = bunReceipt(result.output, result.exitCode, "provider");
      await junitExists(providerReport, summary);
      providerStopped = true;
      return summary;
    };
    resources.defer("graceful browser provider", async () => {
      if (!providerStopped && !provider.exited) await stopProvider();
    });

    const browserReport = join(work, "browser.private.report.json");
    const browserEnv = {
      ...env,
      DREAMLUX_NATIVE_BROWSER_DESCRIPTOR: descriptorPath,
      DREAMLUX_PAYROLL_CONTROL_SCRIPT: join(root, "backend", "src", "db", "testing", "payroll-browser-control.ts"),
      DREAMLUX_BUN_PATH: process.execPath,
      DREAMLUX_PAYROLL_BROWSER_REPORT: browserReport,
      DREAMLUX_PAYROLL_BROWSER_OUTPUT: join(work, "browser.private.results"),
    };
    const discoveryReport = join(work, "browser.private.registry.json");
    const discovery = start("payroll browser discovery", process.execPath, browserArguments(true), snapshot.directory, {
      ...browserEnv, DREAMLUX_PAYROLL_BROWSER_REPORT: discoveryReport,
    });
    const discovered = await discovery.requireSuccess(budget(20_000));
    const requested = browserRegistry(await boundedJson(discoveryReport), discovered.exitCode);
    console.log(`Discovered ${requested.tests.length} required payroll browser tests across desktop/mobile.`);

    await ports.release(3126);
    const ui = start("isolated production UI", process.execPath,
      ["--no-env-file", "run", "start", "--hostname", "127.0.0.1", "--port", "3126"],
      snapshot.directory, {
        ...payrollUiEnvironment(process.env),
        NODE_OPTIONS: `--require ${JSON.stringify(join(root, "scripts", "payroll", "ui-server-guard.cjs"))}`,
      });
    await waitForHttp(UI_ORIGIN, ui, budget(30_000));

    const browser = start("native payroll browsers", process.execPath, browserArguments(), snapshot.directory, browserEnv);
    const browserResult = await browser.requireSuccess(budget(130_000));
    const browsers = browserReceipt(await boundedJson(browserReport), browserResult.exitCode, requested);
    ui.assertOutputSafe();
    budget(1);
    const infrastructure = await stopProvider();
    receipt = {
      schema: 1, purpose: "dreamlux-payroll-239", native: nativeSummary, browsers,
      browserRegistryDigest: hash(JSON.stringify(requested)),
      providerInfrastructureOnly: infrastructure,
      frontend: build, testSourceDigest: snapshot.testDigest,
    };
  } catch (error) {
    failure = error;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    try {
      await resources.close();
      if (work) await removeOwnedDirectory(root, work);
    } catch (cleanupError) {
      if (work) console.error(`Private QA recovery material retained at ${portableRelative(root, work)}; do not publish it.`);
      failure = new AggregateError(failure ? [failure, cleanupError] : [cleanupError], "Payroll QA or its owned cleanup failed");
    }
  }
  if (failure) {
    console.error(redact(failure instanceof Error ? failure.message : "Payroll verification failed", secrets));
    throw new Error("Payroll verification did not complete; no success receipt was issued");
  }
  if (!receipt || interrupted) throw new Error("Payroll verification has no complete receipt");
  console.log(JSON.stringify({ ...receipt, cleanup: "complete" }, null, 2));
  return receipt;
}

if (import.meta.main) {
  void (async () => {
    const plan = nativePlan(process.argv.slice(2), process.env, repositoryRoot);
    await verifyPayroll(plan);
  })().catch((error: unknown) => {
    console.error(redact(error instanceof Error ? error.message : "Payroll verification failed"));
    process.exitCode = 1;
  });
}
