import { join, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { payrollUiEnvironment } from "../../frontend/payroll-qa-environment";
import { assertNewBuildOutput, createFrontendSnapshot, ownedDirectory, publishFrontendArtifact, removeOwnedDirectory, repositoryRoot } from "./files";
import { ManagedProcess, redact } from "./processes";

export async function buildPayrollUi(output: string, checks = false, root = repositoryRoot) {
  await assertNewBuildOutput(root, output);
  const work = await ownedDirectory(root, "build-source");
  const processes: ManagedProcess[] = [];
  let interrupted = false;
  let failure: unknown;
  const interrupt = () => {
    interrupted = true;
    for (const child of processes) void child.stop().catch(() => { console.error("Owned build process cleanup failed."); });
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    const snapshot = await createFrontendSnapshot(root, join(work, "ui"));
    const env = {
      ...payrollUiEnvironment(process.env),
      NODE_OPTIONS: `--require ${JSON.stringify(join(root, "scripts", "payroll", "ui-build-guard.cjs"))}`,
    };
    const run = async (label: string, args: string[], timeout: number, mode: "production" | "test" = "production") => {
      if (interrupted) throw new Error("The isolated frontend build was interrupted");
      const command = new ManagedProcess(label, process.execPath, ["--no-env-file", ...args], {
        cwd: snapshot.directory, env: { ...env, NODE_ENV: mode },
      });
      processes.push(command);
      const result = await command.requireSuccess(timeout);
      if (interrupted) throw new Error("The isolated frontend build was interrupted");
      return result;
    };
    if (checks) {
      await run("isolated frontend lint", ["run", "lint"], process.platform === "win32" ? 90_000 : 45_000);
      await run("isolated frontend types", [join("node_modules", "typescript", "bin", "tsc"), "--noEmit", "--incremental", "false"], 45_000);
      const tested = await run("isolated frontend unit tests", ["run", "test"], 90_000, "test");
      if (!/\bTests\s+[1-9]\d*\s+passed\b/.test(stripVTControlCharacters(tested.output))) {
        throw new Error("Frontend unit testing did not produce a nonzero passing receipt");
      }
    }
    await run("isolated frontend production build", ["run", "build"], 150_000);
    await publishFrontendArtifact(root, snapshot, resolve(root, output));
  } catch (error) {
    failure = error;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    const failures = await Promise.allSettled(processes.map((process) => process.stop()));
    if (failures.some((result) => result.status === "rejected")) {
      failure = new AggregateError([
        ...(failure ? [failure] : []),
        ...failures.filter((result) => result.status === "rejected").map((result) => result.reason),
      ], "Build process cleanup failed; the private QA directory was retained");
    } else {
      try {
        await removeOwnedDirectory(root, work);
      } catch (error) {
        failure = new AggregateError(failure ? [failure, error] : [error], "Build directory cleanup failed");
      }
    }
  }
  if (failure) throw failure;
  console.log("Created the reusable credential-free payroll frontend artifact.");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  const valid = args.filter((arg, index) => arg !== "--checks" && index !== outputIndex && index !== outputIndex + 1);
  if (outputIndex < 0 || !args[outputIndex + 1] || args[outputIndex + 1].startsWith("--")
      || args.filter((arg) => arg === "--checks").length > 1 || valid.length) {
    throw new Error("Usage: build-ui.ts --output .qa-payroll-build [--checks]");
  }
  void buildPayrollUi(args[outputIndex + 1], args.includes("--checks")).catch((error: unknown) => {
    console.error(redact(error instanceof Error ? error.message : "Payroll UI build failed"));
    process.exitCode = 1;
  });
}
