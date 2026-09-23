import { describe, expect, test } from "bun:test";
import { frontendArguments, frontendStages, verifyFrontendUnitReceipt } from "./ui-build-plan";
import { selectedFrontendFile } from "./contracts";

describe("bounded independent frontend verification phases", () => {
  test("preserves the original complete local invocation and all phase caps", () => {
    expect(frontendArguments(["--checks", "--output", ".qa-payroll-build"])).toEqual({
      mode: "all", output: ".qa-payroll-build",
    });
    expect(frontendStages("all", "linux").map(({ name, timeout }) => ({ name, timeout }))).toEqual([
      { name: "lint", timeout: 45_000 }, { name: "types", timeout: 45_000 },
      { name: "units", timeout: 90_000 }, { name: "build", timeout: 150_000 },
    ]);
    expect(frontendStages("all", "win32")[0].timeout).toBe(90_000);
  });

  test("partitions each original check exactly once without changing isolation or retry semantics", () => {
    const quality = frontendStages("lint-test", "linux");
    const build = frontendStages("type-build", "linux");
    expect([...quality, ...build].map((stage) => stage.name).sort()).toEqual(["build", "lint", "types", "units"]);
    expect(quality.map((stage) => stage.name)).toEqual(["lint", "units"]);
    expect(build.map((stage) => stage.name)).toEqual(["types", "build"]);
    expect(build[0].args).toContain("--noEmit");
    expect(build[0].args.slice(-2)).toEqual(["--incremental", "false"]);
    expect(selectedFrontendFile("frontend/.next/cache/.tsbuildinfo")).toBe(false);
    expect(selectedFrontendFile("frontend/tsconfig.tsbuildinfo")).toBe(false);
    expect(quality[1]).toEqual({
      name: "units", args: ["run", "test", "--maxWorkers=2"], timeout: 90_000, environment: "test",
    });
    expect(frontendArguments(["--lint-and-test"])).toEqual({ mode: "lint-test" });
    expect(frontendArguments(["--typecheck", "--output", ".qa-payroll-build"])).toEqual({
      mode: "type-build", output: ".qa-payroll-build",
    });
    expect(frontendArguments(["--output", ".qa-payroll-build"])).toEqual({
      mode: "build", output: ".qa-payroll-build",
    });
  });

  test.each([
    { args: [] }, { args: ["--checks"] }, { args: ["--output"] },
    { args: ["--lint-and-test", "--output", ".qa-payroll-build"] },
    { args: ["--checks", "--typecheck", "--output", ".qa-payroll-build"] },
    { args: ["--checks", "--checks", "--output", ".qa-payroll-build"] },
    { args: ["--output", ".qa-payroll-build", "--output", ".qa-payroll-other"] },
    { args: ["--output", ".qa-payroll-build", "--unknown"] },
  ])("rejects incomplete or contradictory CLI modes", ({ args }) => {
    expect(() => frontendArguments(args)).toThrow("Usage:");
  });
});

const complete = () => ({
  success: true, numPassedTests: 2, numTotalTests: 2, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
  testResults: [{ assertionResults: [{ status: "passed" }, { status: "passed" }] }],
});

describe("complete frontend unit evidence", () => {
  test("requires every registered assertion to pass", () => {
    expect(verifyFrontendUnitReceipt(complete())).toBe(2);
  });

  test.each([
    { change: { success: false } }, { change: { numPassedTests: 0, numTotalTests: 0, testResults: [] } },
    { change: { numFailedTests: 1 } }, { change: { numPendingTests: 1 } }, { change: { numTodoTests: 1 } },
    { change: { numPassedTests: "2" } }, { change: { numTotalTests: 3 } }, { change: { testResults: [] } },
    { change: { testResults: [{ assertionResults: [{ status: "passed" }, { status: "skipped" }] }] } },
    { change: { testResults: [{ assertionResults: [{ status: "passed" }] }] } },
    { change: { testResults: [{}] } },
  ])("rejects skipped, failed, absent or inconsistent unit evidence", ({ change }) => {
    expect(() => verifyFrontendUnitReceipt({ ...complete(), ...change })).toThrow();
  });
});
