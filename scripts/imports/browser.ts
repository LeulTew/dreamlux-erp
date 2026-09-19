import { basename, join, resolve } from "node:path";
import { payrollSystemEnvironment, payrollUiEnvironment } from "../../frontend/payroll-qa-environment";
import { record } from "../payroll/contracts";
import { boundedJson, createFrontendSnapshot, installFrontendArtifact, ownedDirectory, removeOwnedDirectory, repositoryRoot } from "../payroll/files";
import { ManagedProcess, redact, reserveLocalPorts, waitForHttp } from "../payroll/processes";

export function assertImportBrowserReceipt(value: unknown) {
  if (!record(value) || !record(value.stats) || value.stats.expected !== 14
      || value.stats.unexpected !== 0 || value.stats.flaky !== 0 || value.stats.skipped !== 0
      || !Array.isArray(value.errors) || value.errors.length !== 0
      || !Array.isArray(value.suites) || value.suites.length !== 2
      || !record(value.config) || !Array.isArray(value.config.projects)) {
    throw new Error("Expected all 14 import browser cases to pass without skips, retries or global errors");
  }
  const files = value.suites.map((suite) => {
    if (!record(suite) || typeof suite.file !== "string") throw new Error("Missing browser source file identity");
    return basename(suite.file);
  }).sort();
  const projects = value.config.projects.map((project) => {
    if (!record(project) || typeof project.name !== "string") throw new Error("Missing browser project identity");
    return project.name;
  }).sort();
  if (JSON.stringify(files) !== JSON.stringify(["issue113-imports.spec.ts", "issue261-formula-imports.spec.ts"])
      || JSON.stringify(projects) !== JSON.stringify(["chromium", "mobile-chromium"])) {
    throw new Error("Import browser verification used the wrong files or viewports");
  }
}

function browserFailureMessages(value: unknown): string[] {
  const messages: string[] = [];
  const visit = (entry: unknown) => {
    if (messages.length >= 10) return;
    if (Array.isArray(entry)) entry.forEach(visit);
    else if (record(entry)) {
      if (typeof entry.message === "string") messages.push(entry.message.slice(0, 3000));
      Object.values(entry).forEach(visit);
    }
  };
  visit(value);
  return [...new Set(messages)];
}

export async function verifyImportBrowser(args: readonly string[]) {
  if (args.length !== 2 || args[0] !== "--frontend-build" || !args[1] || args[1].startsWith("--")) {
    throw new Error("Usage: browser.ts --frontend-build .qa-payroll-build");
  }
  let work: string | undefined;
  let ports: Awaited<ReturnType<typeof reserveLocalPorts>> | undefined;
  const children: ManagedProcess[] = [];
  let failure: unknown;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    for (const child of children) void child.stop().catch(() => { console.error("Owned import browser child cleanup failed."); });
  };
  const checkInterrupted = () => { if (interrupted) throw new Error("Import browser verification was interrupted"); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    ports = await reserveLocalPorts([3261]);
    work = await ownedDirectory(repositoryRoot, "import-browser");
    const snapshot = await createFrontendSnapshot(repositoryRoot, join(work, "ui"));
    await installFrontendArtifact(resolve(repositoryRoot, args[1]), snapshot);
    const manifest = await boundedJson(join(snapshot.directory, "package.json"));
    if (!record(manifest) || !record(manifest.scripts)
        || manifest.scripts["test:e2e"] !== "node node_modules/playwright/cli.js test") {
      throw new Error("The import browser package command needs explicit review");
    }
    checkInterrupted();
    await ports.release(3261);
    const ui = new ManagedProcess("owned import UI", process.execPath,
      ["--no-env-file", "run", "start", "--hostname", "127.0.0.1", "--port", "3261"], {
        cwd: snapshot.directory,
        env: { ...payrollUiEnvironment(process.env), NODE_OPTIONS: `--require ${JSON.stringify(join(repositoryRoot, "scripts", "imports", "ui-server-guard.cjs"))}` },
      });
    children.push(ui);
    await waitForHttp("http://127.0.0.1:3261", ui, 30_000);
    checkInterrupted();
    const report = join(work, "imports.private.json");
    const browser = new ManagedProcess("import browser callers", process.execPath,
      ["--no-env-file", "run", "test:e2e", "--", "--config", join("e2e", "imports-browser.config.ts")], {
        cwd: snapshot.directory,
        env: { ...payrollSystemEnvironment(process.env), DREAMLUX_IMPORT_BROWSER_REPORT: report, DREAMLUX_IMPORT_BROWSER_OUTPUT: join(work, "browser.private.results") },
      });
    children.push(browser);
    const result = await browser.wait(70_000);
    if (result.exitCode !== 0) console.error(redact(result.output).slice(-6000));
    const receipt = await boundedJson(report);
    if (result.exitCode !== 0) {
      console.error(redact(browserFailureMessages(receipt).join("\n")
        || "Browser failed without structured error details; inspect the child output."));
      throw new Error(`Import browser callers failed (exit ${result.exitCode})`);
    }
    assertImportBrowserReceipt(receipt);
    ui.assertOutputSafe();
    checkInterrupted();
  } catch (error) {
    failure = error;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    const cleanup = await Promise.allSettled(children.map((child) => child.stop()));
    const errors = cleanup.filter((result) => result.status === "rejected").map((result) => result.reason);
    try {
      await ports?.close();
      if (work && errors.length === 0) await removeOwnedDirectory(repositoryRoot, work);
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) failure = new AggregateError(failure ? [failure, ...errors] : errors, "Import browser verification cleanup failed");
  }
  if (failure) throw failure;
  console.log("DreamLux import browser callers: 14 passed, no skips or retries; owned UI and private snapshot removed.");
}

if (import.meta.main) {
  void verifyImportBrowser(process.argv.slice(2)).catch((error: unknown) => {
    console.error(redact(error instanceof Error ? error.message : "Import browser verification failed"));
    process.exitCode = 1;
  });
}
