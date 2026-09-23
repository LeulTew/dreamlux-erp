import { randomBytes } from "node:crypto";
import { lstat, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createDreamluxEquipmentFixture } from "../../backend/src/db/testing/dreamlux-equipment-fixture";
import { payrollSystemEnvironment, payrollUiEnvironment } from "../../frontend/payroll-qa-environment";
import { API_ORIGIN, nativePlan, POSTGREST_VERSION, UI_ORIGIN, verifyJunitReceipt, type NativePlan } from "../payroll/contracts";
import {
  boundedJson, createFrontendSnapshot, hash, installFrontendArtifact, ownedDirectory,
  removeOwnedDirectory, repositoryRoot,
} from "../payroll/files";
import { CleanupStack, ManagedProcess, redact, reservePayrollPorts, waitForHttp } from "../payroll/processes";
import {
  browserReceipt, browserRegistry, equipmentDescriptor, equipmentEnvironment,
  nativeArguments, nativeReceipt, RUNNER_TIMEOUT_MS, type EquipmentDescriptor,
} from "./contracts";

async function privateDescriptor(path: string, fixtureUrl: string, process: ManagedProcess, timeout: number): Promise<EquipmentDescriptor> {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    process.assertRunning();
    try {
      return equipmentDescriptor(await boundedJson(path), fixtureUrl);
    } catch (error) {
      const missing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
      if (!missing && !(error instanceof SyntaxError)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The owned equipment provider did not publish its readiness descriptor");
}

export async function verifyEquipment(plan: NativePlan, root = repositoryRoot) {
  const deadline = Date.now() + RUNNER_TIMEOUT_MS;
  const cleanup = new CleanupStack();
  const children: ManagedProcess[] = [];
  const secrets = [plan.adminUrl];
  let interrupted = false;
  let receipt: Record<string, unknown> | undefined;
  let failure: unknown;
  let work: string | undefined;
  const budget = (maximum: number) => {
    const remaining = deadline - Date.now();
    if (interrupted || remaining <= 0) throw new Error("Equipment QA was interrupted or exhausted its time budget");
    return Math.min(remaining, maximum);
  };
  const start = (label: string, command: string, args: string[], cwd: string, env: Record<string, string>) => {
    budget(1);
    const child = new ManagedProcess(label, command, args, { cwd, env, secrets });
    children.push(child);
    cleanup.defer(label, () => child.stop());
    return child;
  };
  const interrupt = () => {
    interrupted = true;
    for (const child of children) void child.stop().catch(() => {
      console.error("Owned equipment QA process cleanup failed; final cleanup will report it.");
    });
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    if (Object.entries(process.env).some(([name, value]) => value && /^DREAMLUX_EQUIPMENT_/i.test(name))) {
      throw new Error("Remove inherited equipment QA context; the runner creates its own resources");
    }
    nativePlan(["--allow-disposable-postgres", "--postgrest", plan.postgrest, "--postgrest-sha256", plan.postgrestSha256,
      "--frontend-build", plan.artifact], { ...process.env, DREAMLUX_NATIVE_TEST_ADMIN_URL: plan.adminUrl }, root);
    secrets.push(new URL(plan.adminUrl).password);
    const binary = await lstat(plan.postgrest);
    if (!binary.isFile() || binary.isSymbolicLink() || hash(await readFile(plan.postgrest)) !== plan.postgrestSha256) {
      throw new Error("Equipment QA PostgREST checksum verification failed");
    }
    const lockPath = join(root, ".qa-payroll-native.lock");
    const lock = await open(lockPath, "wx", 0o600);
    cleanup.defer("checkout lock", async () => { await lock.close(); await unlink(lockPath); });
    const ports = await reservePayrollPorts();
    cleanup.defer("port reservations", () => ports.close());
    work = await ownedDirectory(root, "equipment-run");
    const snapshot = await createFrontendSnapshot(root, join(work, "ui"));
    const build = await installFrontendArtifact(plan.artifact, snapshot);
    const version = start("equipment PostgREST version", plan.postgrest, ["--version"], root, payrollSystemEnvironment(process.env));
    const versionResult = await version.requireSuccess(budget(10_000));
    if (!new RegExp(`\\bPostgREST\\s+${POSTGREST_VERSION.replace(".", "\\.")}(?:\\s|$)`).test(versionResult.output)) {
      throw new Error("Equipment QA PostgREST version changed");
    }
    const fixture = await createDreamluxEquipmentFixture(plan.adminUrl);
    cleanup.defer("equipment database", () => fixture.dispose());
    const jwtSecret = randomBytes(32).toString("hex");
    const restSecret = randomBytes(32).toString("hex");
    secrets.push(fixture.url, jwtSecret, restSecret);
    const env = equipmentEnvironment(process.env, plan.adminUrl, fixture.url, jwtSecret, restSecret);
    await ports.release(54334);
    const rest = start("equipment PostgREST", plan.postgrest, [], work, {
      ...payrollSystemEnvironment(process.env), PGRST_DB_URI: fixture.url,
      PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "", PGRST_DB_POOL: "5",
      PGRST_JWT_SECRET: restSecret, PGRST_SERVER_HOST: "127.0.0.1", PGRST_SERVER_PORT: "54334",
    });
    await waitForHttp("http://127.0.0.1:54334", rest, budget(20_000));
    await ports.release(54335);
    const nativeReport = join(work, "equipment.native.private.junit.xml");
    const native = start("native equipment assertions", process.execPath, nativeArguments(nativeReport), join(root, "backend"), env);
    const nativeResult = await native.requireSuccess(budget(75_000));
    const nativeSummary = nativeReceipt(nativeResult.output, nativeResult.exitCode);
    verifyJunitReceipt(await readFile(nativeReport, "utf8"), nativeSummary);
    console.log(`Native equipment: ${nativeSummary.passed} passed, zero failed/skipped.`);

    const conditionReport = join(work, "conditions.native.private.junit.xml");
    const conditions = start("native condition assertions", process.execPath,
      nativeArguments(conditionReport, "conditions"), join(root, "backend"), env);
    const conditionResult = await conditions.requireSuccess(budget(60_000));
    const conditionSummary = nativeReceipt(conditionResult.output, conditionResult.exitCode, { suite: "conditions" });
    verifyJunitReceipt(await readFile(conditionReport, "utf8"), conditionSummary);
    console.log(`Native conditions: ${conditionSummary.passed} passed, zero failed/skipped.`);

    const returnReport = join(work, "returns.native.private.junit.xml");
    const returns = start("native return correction assertions", process.execPath,
      nativeArguments(returnReport, "returns"), join(root, "backend"), env);
    const returnResult = await returns.requireSuccess(budget(60_000));
    const returnSummary = nativeReceipt(returnResult.output, returnResult.exitCode, { suite: "returns" });
    verifyJunitReceipt(await readFile(returnReport, "utf8"), returnSummary);
    console.log(`Native return corrections: ${returnSummary.passed} passed, zero failed/skipped.`);

    await ports.release(5326);
    const descriptorPath = join(work, "equipment.browser.private.json");
    const providerReport = join(work, "equipment.provider.private.junit.xml");
    const provider = start("equipment browser provider", process.execPath, nativeArguments(providerReport), join(root, "backend"), {
      ...env, DREAMLUX_EQUIPMENT_BROWSER_SERVER: "1", DREAMLUX_EQUIPMENT_BROWSER_DESCRIPTOR: descriptorPath,
    });
    const descriptor = await privateDescriptor(descriptorPath, fixture.url, provider, budget(30_000));
    secrets.push(descriptor.shutdownKey, descriptor.writerCookie, descriptor.legacyCookie);
    let providerStopped = false;
    const stopProvider = async () => {
      if (providerStopped) return;
      const response = await fetch(`${API_ORIGIN}/__qa/shutdown`, {
        method: "POST", headers: { "x-dreamlux-fixture-key": descriptor.shutdownKey },
        redirect: "error", signal: AbortSignal.timeout(5_000),
      });
      if (response.status !== 204) throw new Error("Owned equipment provider rejected graceful shutdown");
      const result = await provider.requireSuccess(15_000);
      const summary = nativeReceipt(result.output, result.exitCode, { infrastructure: true });
      verifyJunitReceipt(await readFile(providerReport, "utf8"), summary);
      providerStopped = true;
      return summary;
    };
    cleanup.defer("graceful equipment provider", async () => {
      if (!providerStopped && !provider.exited) await stopProvider();
    });
    const browserReport = join(work, "equipment.browser.private.report.json");
    const browserEnv = {
      ...env, ...payrollUiEnvironment(process.env), NODE_ENV: "development",
      DREAMLUX_EQUIPMENT_BROWSER_DESCRIPTOR: descriptorPath,
      DREAMLUX_EQUIPMENT_CONTROL_SCRIPT: join(root, "backend", "src", "db", "testing", "equipment-browser-control.ts"),
      DREAMLUX_EQUIPMENT_RETURN_CONTROL_SCRIPT: join(root, "backend", "src", "db", "testing", "return-browser-control.ts"),
      DREAMLUX_EQUIPMENT_CONDITION_CONTROL_SCRIPT: join(root, "backend", "src", "db", "testing", "condition-browser-control.ts"),
      DREAMLUX_BUN_PATH: process.execPath, DREAMLUX_EQUIPMENT_BROWSER_REPORT: browserReport,
      DREAMLUX_EQUIPMENT_BROWSER_OUTPUT: join(work, "equipment.browser.private.results"),
    };
    const browserArgs = ["--no-env-file", "run", "test:e2e:equipment"];
    const discoveryReport = join(work, "equipment.registry.private.json");
    const discovery = start("equipment browser discovery", process.execPath, [...browserArgs, "--list"], snapshot.directory, {
      ...browserEnv, DREAMLUX_EQUIPMENT_BROWSER_REPORT: discoveryReport,
    });
    const discovered = await discovery.requireSuccess(budget(20_000));
    const registry = browserRegistry(await boundedJson(discoveryReport), discovered.exitCode);
    await ports.release(3126);
    const ui = start("equipment production UI", process.execPath,
      ["--no-env-file", "run", "start", "--hostname", "127.0.0.1", "--port", "3126"], snapshot.directory, {
        ...payrollUiEnvironment(process.env),
        NODE_OPTIONS: `--require ${JSON.stringify(join(root, "scripts", "payroll", "ui-server-guard.cjs"))}`,
      });
    await waitForHttp(UI_ORIGIN, ui, budget(30_000));
    const browser = start("equipment browsers", process.execPath, browserArgs, snapshot.directory, browserEnv);
    const browserResult = await browser.requireSuccess(budget(125_000));
    const browsers = browserReceipt(await boundedJson(browserReport), browserResult.exitCode, registry);
    ui.assertOutputSafe();
    budget(1);
    const infrastructure = await stopProvider();
    receipt = {
      schema: 1, purpose: "dreamlux-equipment-259", native: nativeSummary, conditions: conditionSummary, returns: returnSummary, browsers,
      browserRegistryDigest: hash(JSON.stringify(registry)), providerInfrastructureOnly: infrastructure,
      frontend: build, testSourceDigest: snapshot.testDigest,
    };
  } catch (error) {
    failure = error;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    try {
      await cleanup.close();
      if (work) await removeOwnedDirectory(root, work);
    } catch (error) {
      failure = new AggregateError(failure ? [failure, error] : [error], "Equipment QA or its owned cleanup failed");
    }
  }
  if (failure) {
    console.error(redact(failure instanceof Error ? failure.message : "Equipment verification failed", secrets));
    throw new Error("Equipment verification did not complete; no success receipt was issued");
  }
  if (!receipt || interrupted) throw new Error("Equipment verification has no complete receipt");
  if (Date.now() > deadline) throw new Error("Equipment verification exceeded its total budget, including cleanup");
  console.log(JSON.stringify({
    ...receipt, durationMs: Date.now() - (deadline - RUNNER_TIMEOUT_MS), cleanup: "complete",
  }, null, 2));
  return receipt;
}

if (import.meta.main) {
  const main = async () => verifyEquipment(nativePlan(process.argv.slice(2), process.env, repositoryRoot));
  void main().catch((error: unknown) => {
    console.error(redact(error instanceof Error ? error.message : "Equipment verification failed"));
    process.exitCode = 1;
  });
}
