import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { payrollSystemEnvironment } from "../../frontend/payroll-qa-environment";
import { buildPayrollUi } from "./build-ui";
import { nativePlan } from "./contracts";
import { repositoryRoot } from "./files";
import { ManagedProcess, redact } from "./processes";
import { verifyPayroll } from "./run";
import { verifyEquipment } from "../equipment/run";

export async function localPayrollCi(args: readonly string[]) {
  const plan = nativePlan(args, process.env, repositoryRoot);
  const env = payrollSystemEnvironment(process.env);
  const children: ManagedProcess[] = [];
  let interrupted = false;
  let failure: unknown;
  const interrupt = () => {
    interrupted = true;
    for (const child of children) void child.stop().catch(() => { console.error("Owned local-CI child cleanup failed."); });
  };
  const checkInterrupted = () => { if (interrupted) throw new Error("Local payroll CI was interrupted"); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    const boundaries = new ManagedProcess("release hold and runner boundary tests", process.execPath,
      ["--no-env-file", "test", join("scripts", "release-hold.test.ts"), join("scripts", "payroll"), join("scripts", "equipment"),
        join("backend", "src", "db", "testing", "dreamlux-native-target.test.ts")],
      { cwd: repositoryRoot, env });
    children.push(boundaries);
    await boundaries.requireSuccess(60_000);
    checkInterrupted();
    const types = new ManagedProcess("verification infrastructure types", process.execPath,
      ["--no-env-file", join("backend", "node_modules", "typescript", "bin", "tsc"),
        "--project", join("scripts", "payroll", "tsconfig.json"), "--noEmit"],
      { cwd: repositoryRoot, env });
    children.push(types);
    await types.requireSuccess(45_000);
    checkInterrupted();
    const backend = new ManagedProcess("offline backend tests", process.execPath,
      ["--no-env-file", "test", "--timeout=30000", "--preload", join(repositoryRoot, "scripts", "payroll", "offline-unit-guard.ts")],
      { cwd: join(repositoryRoot, "backend"), env });
    children.push(backend);
    const result = await backend.requireSuccess(150_000);
    if (!/^\s*[1-9]\d* pass\s*$/m.test(stripVTControlCharacters(result.output))) throw new Error("Backend testing produced no passing receipt");
    checkInterrupted();
    const storage = new ManagedProcess("synthetic Storage workflow", process.execPath,
      ["--no-env-file", "run", "test:storage"], { cwd: repositoryRoot, env });
    children.push(storage);
    const storageResult = await storage.requireSuccess(60_000);
    const storageOutput = stripVTControlCharacters(storageResult.output);
    if (!/^\s*[1-9]\d* pass\s*$/m.test(storageOutput) || /^\s*[1-9]\d* skip\s*$/m.test(storageOutput)) {
      throw new Error("Storage verification produced no complete non-skipped receipt");
    }
    checkInterrupted();
    await buildPayrollUi(plan.artifact, true);
    checkInterrupted();
    await verifyPayroll(plan);
    checkInterrupted();
    await verifyEquipment(plan);
    checkInterrupted();
  } catch (error) {
    failure = error;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    const cleanup = await Promise.allSettled(children.map((child) => child.stop()));
    const errors = cleanup.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (errors.length) failure = new AggregateError(failure ? [failure, ...errors] : errors, "Local CI child cleanup failed");
  }
  if (failure) throw failure;
}

if (import.meta.main) {
  void localPayrollCi(process.argv.slice(2)).catch((error: unknown) => {
    console.error(redact(error instanceof Error ? error.message : "Local CI failed"));
    process.exitCode = 1;
  });
}
