import { describe, expect, test } from "bun:test";
import { NATIVE_GUARD_BANNER } from "../payroll/contracts";
import {
  BROWSER_FILES, browserReceipt, browserRegistry, equipmentDescriptor, equipmentEnvironment,
  CONDITION_TEST, CONDITION_TEST_COUNT, NATIVE_TEST, NATIVE_TEST_COUNT, nativeArguments, nativeReceipt,
  RETURN_TEST, RETURN_TEST_COUNT,
  PROVISIONING_TEST, PROVISIONING_TEST_COUNT,
} from "./contracts";

const admin = `postgresql://dreamlux_parity:${"a".repeat(64)}@127.0.0.1:55434/postgres?sslmode=disable`;
const fixture = admin.replace("/postgres?", "/dreamlux_ephemeral_equipment_259_012345abcdef?");
const nativeOutput = (count = NATIVE_TEST_COUNT) =>
  `${NATIVE_GUARD_BANNER}\n${NATIVE_TEST}:\n ${count} pass\n 0 fail\nRan ${count} tests across 1 file.\n`;

function browserReport(executed: boolean) {
  const projects = ["desktop", "mobile"].map((name) => ({ name, id: name, retries: 0, repeatEach: 1 }));
  const specs = [
    ...Array.from({ length: 3 }, (_, index) => ({ file: BROWSER_FILES[0], title: `Presentation ${index}` })),
    { file: BROWSER_FILES[1], title: "Actual custody and restoration" },
    { file: BROWSER_FILES[2], title: "Actual return correction and receipt workflow" },
    { file: BROWSER_FILES[2], title: "Actual reserved capacity conflict" },
    { file: BROWSER_FILES[3], title: "Actual condition stock and recovery" },
  ].map((spec, index) => ({
    ...spec, id: `equipment-${index}`, line: index + 1, column: 1, ok: true,
    tests: projects.map((project) => ({
      projectName: project.name, projectId: project.id, expectedStatus: "passed",
      status: "expected", results: executed ? [{ status: "passed", retry: 0 }] : [],
    })),
  }));
  return {
    config: { workers: 1, fullyParallel: false, forbidOnly: true, projects },
    errors: [], stats: { unexpected: 0, flaky: 0, expected: executed ? 14 : 0, skipped: 0 },
    suites: [{ title: "Equipment QA", specs }],
  };
}

describe("independent equipment verification contracts", () => {
  test("uses only its attested fixture and distinct synthetic signing credentials", () => {
    const env = equipmentEnvironment({ DATABASE_BACKUP_URL: "unapproved", EXTRA_SECRET: "unapproved", PATH: "test-path" },
      admin, fixture, "b".repeat(64), "c".repeat(64));
    expect(env.DATABASE_URL).toBe(fixture);
    expect(env.DATABASE_BACKUP_URL).toBe("");
    expect(env.EXTRA_SECRET).toBeUndefined();
    expect(env.PATH).toBe("test-path");
    expect(env.NODE_ENV).toBe("development");
    expect(() => equipmentEnvironment({}, admin, fixture.replace("equipment_259", "payroll_239"), "b".repeat(64), "c".repeat(64))).toThrow();
    expect(() => equipmentEnvironment({}, admin, fixture, "a".repeat(64), "c".repeat(64))).toThrow();
    expect(() => equipmentEnvironment({}, admin, fixture, "b".repeat(64), "b".repeat(64))).toThrow();
  });

  test("requires exact native completion and distinguishes the provider from domain assertions", () => {
    expect(nativeReceipt(nativeOutput(), 0)).toEqual({ passed: 26, failed: 0, skipped: 0, tests: 26, files: 1 });
    expect(nativeReceipt(nativeOutput(1), 0, { infrastructure: true }).passed).toBe(1);
    expect(() => nativeReceipt(nativeOutput(1), 0)).toThrow();
    expect(() => nativeReceipt(nativeOutput(25), 0)).toThrow();
    expect(() => nativeReceipt(`${nativeOutput()}1 skip\n`, 0)).toThrow();
    expect(() => nativeReceipt(nativeOutput().replace(NATIVE_GUARD_BANNER, ""), 0)).toThrow();
    expect(() => nativeReceipt(nativeOutput(), 1)).toThrow();
    expect(nativeArguments("test.junit.xml")[1]).toBe("test");
    expect(nativeArguments("test.junit.xml").some((arg) => arg.startsWith("--timeout"))).toBe(false);
  });

  test("requires the entire separate condition suite rather than reusing a deletion receipt", () => {
    const output = nativeOutput(CONDITION_TEST_COUNT).replace(NATIVE_TEST, CONDITION_TEST);
    expect(nativeReceipt(output, 0, { suite: "conditions" })).toEqual({
      passed: 41, failed: 0, skipped: 0, tests: 41, files: 1,
    });
    expect(nativeArguments("condition.junit.xml", "conditions").at(-1)?.replaceAll("\\", "/")).toBe(CONDITION_TEST);
    expect(() => nativeReceipt(nativeOutput(CONDITION_TEST_COUNT), 0, { suite: "conditions" })).toThrow();
    expect(() => nativeReceipt(nativeOutput(CONDITION_TEST_COUNT - 1).replace(NATIVE_TEST, CONDITION_TEST), 0, { suite: "conditions" })).toThrow();
    expect(() => nativeReceipt(`${output}1 skip\n`, 0, { suite: "conditions" })).toThrow();
    expect(() => nativeReceipt(output, 1, { suite: "conditions" })).toThrow();
    expect(() => nativeReceipt(output, 0, { suite: "conditions", infrastructure: true })).toThrow();
  });

  test("binds browser readiness to the exact fixture without accepting injected cookies", () => {
    const value = {
      purpose: "dreamlux-equipment-259", apiOrigin: "http://127.0.0.1:5326",
      database: "dreamlux_ephemeral_equipment_259_012345abcdef", writerCookie: "synthetic=session", legacyCookie: "synthetic=identityless", shutdownKey: "d".repeat(48),
    };
    expect(equipmentDescriptor(value, fixture).database).toBe(value.database);
    expect(() => equipmentDescriptor({ ...value, database: `${value.database}_other` }, fixture)).toThrow();
    expect(() => equipmentDescriptor({ ...value, writerCookie: "synthetic=value\r\nheader" }, fixture)).toThrow();
    expect(() => equipmentDescriptor({ ...value, legacyCookie: "synthetic=value\r\nheader" }, fixture)).toThrow();
    expect(() => equipmentDescriptor({ ...value, apiOrigin: "https://unexpected.invalid" }, fixture)).toThrow();
  });

  test("requires every return regression in its own process and rejects partial receipts", () => {
    const output = nativeOutput(RETURN_TEST_COUNT).replace(NATIVE_TEST, RETURN_TEST);
    expect(nativeReceipt(output, 0, { suite: "returns" })).toEqual({
      passed: 35, failed: 0, skipped: 0, tests: 35, files: 1,
    });

    expect(nativeArguments("returns.junit.xml", "returns").at(-1)?.replaceAll("\\", "/")).toBe(RETURN_TEST);
    expect(() => nativeReceipt(nativeOutput(RETURN_TEST_COUNT), 0, { suite: "returns" })).toThrow();
    expect(() => nativeReceipt(nativeOutput(RETURN_TEST_COUNT - 1).replace(NATIVE_TEST, RETURN_TEST), 0, { suite: "returns" })).toThrow();
    expect(() => nativeReceipt(`${output}1 skip\n`, 0, { suite: "returns" })).toThrow();
    expect(() => nativeReceipt(output, 1, { suite: "returns" })).toThrow();
    expect(() => nativeReceipt(output, 0, { suite: "returns", infrastructure: true })).toThrow();
  });

  test("requires complete provisioning and login proof without accepting a different native suite", () => {
    const output = nativeOutput(PROVISIONING_TEST_COUNT).replace(NATIVE_TEST, PROVISIONING_TEST);
    expect(nativeReceipt(output, 0, { suite: "provisioning" })).toEqual({
      passed: 12, failed: 0, skipped: 0, tests: 12, files: 1,
    });
    expect(nativeArguments("provisioning.junit.xml", "provisioning").at(-1)?.replaceAll("\\", "/")).toBe(PROVISIONING_TEST);
    expect(nativeArguments("provisioning.junit.xml", "provisioning").some((arg) => arg.startsWith("--timeout"))).toBe(false);
    expect(() => nativeReceipt(nativeOutput(PROVISIONING_TEST_COUNT), 0, { suite: "provisioning" })).toThrow();
    expect(() => nativeReceipt(`${output}1 skip\n`, 0, { suite: "provisioning" })).toThrow();
    expect(() => nativeReceipt(output, 1, { suite: "provisioning" })).toThrow();
    expect(() => nativeReceipt(output, 0, { suite: "provisioning", infrastructure: true })).toThrow();
  });

  test("retains all twelve original cases and exhausts the fourteen-case desktop/mobile registry", () => {
    const registry = browserRegistry(browserReport(false), 0);
    expect(browserReceipt(browserReport(true), 0, registry)).toEqual({
      desktop: 7, mobile: 7, requested: 14, passed: 14, retries: 0, skipped: 0,
    });
  });

  test.each(["skip", "retry", "missing-native", "missing-return", "missing-condition", "wrong-total", "stale-registry"] as const)(
    "rejects %s browser evidence", (kind) => {
      const registry = browserRegistry(browserReport(false), 0);
      const report = browserReport(true);
      if (kind === "skip") report.suites[0].specs[0].tests[0].expectedStatus = "skipped";
      if (kind === "retry") report.suites[0].specs[0].tests[0].results[0].retry = 1;
      if (kind === "missing-native") report.suites[0].specs.splice(3, 1);
      if (kind === "missing-return") report.suites[0].specs.splice(5, 1);
      if (kind === "missing-condition") report.suites[0].specs.pop();
      if (kind === "wrong-total") report.stats.expected = 13;
      if (kind === "stale-registry") report.suites[0].specs[0].id = "different-case";
      expect(() => browserReceipt(report, 0, registry)).toThrow();
    },
  );
});
