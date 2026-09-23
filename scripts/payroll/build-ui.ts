import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { payrollUiEnvironment } from "../../frontend/payroll-qa-environment";
import { assertNewBuildOutput, createFrontendSnapshot, ownedDirectory, publishFrontendArtifact, removeOwnedDirectory, repositoryRoot } from "./files";
import { ManagedProcess, redact } from "./processes";
import { frontendArguments, frontendStages, verifyFrontendUnitReceipt, type FrontendVerification } from "./ui-build-plan";

export async function verifyFrontend(options: FrontendVerification, root = repositoryRoot) {
  if ("output" in options) await assertNewBuildOutput(root, options.output);
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
    for (const stage of frontendStages(options.mode)) {
      const report = join(work, "frontend-units.json");
      const args = stage.name === "units" ? [...stage.args, "--reporter=json", `--outputFile=${report}`] : stage.args;
      await run(`isolated frontend ${stage.name}`, args, stage.timeout, stage.environment);
      if (stage.name === "units") {
        const passed = verifyFrontendUnitReceipt(JSON.parse(await readFile(report, "utf8")));
        console.log(`Frontend units: ${passed} passed, zero failed/skipped/todo.`);
      }
    }
    if ("output" in options) await publishFrontendArtifact(root, snapshot, resolve(root, options.output));
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
  console.log("output" in options
    ? "Created the reusable credential-free payroll frontend artifact."
    : "Completed isolated frontend lint and unit tests without publishing a build.");
}

export function buildPayrollUi(output: string, checks = false, root = repositoryRoot) {
  return verifyFrontend({ mode: checks ? "all" : "build", output }, root);
}

if (import.meta.main) {
  void verifyFrontend(frontendArguments(process.argv.slice(2))).catch((error: unknown) => {
    console.error(redact(error instanceof Error ? error.message : "Payroll UI build failed"));
    process.exitCode = 1;
  });
}
