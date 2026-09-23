import { join } from "node:path";

export type FrontendVerification =
  | { mode: "lint-test" }
  | { mode: "build" | "type-build" | "all"; output: string };

export function frontendStages(mode: FrontendVerification["mode"], platform = process.platform) {
  const stages: Array<{ name: string; args: string[]; timeout: number; environment: "production" | "test" }> = [];
  if (mode === "lint-test" || mode === "all") {
    stages.push({ name: "lint", args: ["run", "lint"], timeout: platform === "win32" ? 90_000 : 45_000, environment: "production" });
  }
  if (mode === "type-build" || mode === "all") {
    stages.push({ name: "types", args: [join("node_modules", "typescript", "bin", "tsc"), "--noEmit", "--incremental", "false"], timeout: 45_000, environment: "production" });
  }
  if (mode === "lint-test" || mode === "all") {
    stages.push({ name: "units", args: ["run", "test", "--maxWorkers=2"], timeout: 90_000, environment: "test" });
  }
  if (mode !== "lint-test") {
    stages.push({ name: "build", args: ["run", "build"], timeout: 150_000, environment: "production" });
  }
  return stages;
}

export function frontendArguments(args: readonly string[]): FrontendVerification {
  if (args.length === 1 && args[0] === "--lint-and-test") return { mode: "lint-test" };
  const outputIndex = args.indexOf("--output");
  const modes = args.filter((arg) => arg === "--checks" || arg === "--typecheck");
  const extra = args.filter((arg, index) =>
    index !== outputIndex && index !== outputIndex + 1 && !["--checks", "--typecheck"].includes(arg));
  if (outputIndex < 0 || !args[outputIndex + 1] || args[outputIndex + 1].startsWith("--")
    || modes.length > 1 || extra.length) {
    throw new Error("Usage: build-ui.ts --lint-and-test | --output .qa-payroll-build [--checks | --typecheck]");
  }
  return {
    mode: modes[0] === "--checks" ? "all" : modes[0] === "--typecheck" ? "type-build" : "build",
    output: args[outputIndex + 1],
  };
}

export function verifyFrontendUnitReceipt(value: unknown): number {
  if (!value || typeof value !== "object") throw new Error("Missing frontend unit receipt");
  const receipt = value as Record<string, unknown>;
  if (receipt.success !== true || !Number.isInteger(receipt.numPassedTests) || Number(receipt.numPassedTests) < 1
    || receipt.numTotalTests !== receipt.numPassedTests || receipt.numFailedTests !== 0
    || receipt.numPendingTests !== 0 || receipt.numTodoTests !== 0 || !Array.isArray(receipt.testResults)) {
    throw new Error("Frontend units did not produce a complete non-skipped receipt");
  }
  const cases = receipt.testResults.flatMap((file: unknown) => {
    if (!file || typeof file !== "object" || !("assertionResults" in file) || !Array.isArray(file.assertionResults)) {
      throw new Error("Incomplete frontend unit file receipt");
    }
    return file.assertionResults;
  });
  if (cases.length !== receipt.numPassedTests || cases.some((entry: unknown) =>
    !entry || typeof entry !== "object" || !("status" in entry) || entry.status !== "passed")) {
    throw new Error("Frontend unit case inventory is incomplete");
  }
  return Number(receipt.numPassedTests);
}
