import { describe, expect, test } from "bun:test";
import { NATIVE_GUARD_BANNER } from "../payroll/contracts";
import {
  BROWSER_FILES, browserReceipt, browserRegistry, equipmentDescriptor, equipmentEnvironment,
  NATIVE_TEST, NATIVE_TEST_COUNT, nativeArguments, nativeReceipt,
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
  ].map((spec, index) => ({
    ...spec, id: `equipment-${index}`, line: index + 1, column: 1, ok: true,
    tests: projects.map((project) => ({
      projectName: project.name, projectId: project.id, expectedStatus: "passed",
      status: "expected", results: executed ? [{ status: "passed", retry: 0 }] : [],
    })),
  }));
  return {
    config: { workers: 1, fullyParallel: false, forbidOnly: true, projects },
    errors: [], stats: { unexpected: 0, flaky: 0, expected: executed ? 8 : 0, skipped: 0 },
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
    expect(nativeReceipt(nativeOutput(1), 0, true).passed).toBe(1);
    expect(() => nativeReceipt(nativeOutput(1), 0)).toThrow();
    expect(() => nativeReceipt(nativeOutput(25), 0)).toThrow();
    expect(() => nativeReceipt(`${nativeOutput()}1 skip\n`, 0)).toThrow();
    expect(() => nativeReceipt(nativeOutput().replace(NATIVE_GUARD_BANNER, ""), 0)).toThrow();
    expect(() => nativeReceipt(nativeOutput(), 1)).toThrow();
    expect(nativeArguments("test.junit.xml")[1]).toBe("test");
    expect(nativeArguments("test.junit.xml").some((arg) => arg.startsWith("--timeout"))).toBe(false);
  });

  test("binds browser readiness to the exact fixture without accepting injected cookies", () => {
    const value = {
      purpose: "dreamlux-equipment-259", apiOrigin: "http://127.0.0.1:5326",
      database: "dreamlux_ephemeral_equipment_259_012345abcdef", writerCookie: "synthetic=session", shutdownKey: "d".repeat(48),
    };
    expect(equipmentDescriptor(value, fixture).database).toBe(value.database);
    expect(() => equipmentDescriptor({ ...value, database: `${value.database}_other` }, fixture)).toThrow();
    expect(() => equipmentDescriptor({ ...value, writerCookie: "synthetic=value\r\nheader" }, fixture)).toThrow();
    expect(() => equipmentDescriptor({ ...value, apiOrigin: "https://unexpected.invalid" }, fixture)).toThrow();
  });

  test("exhausts the exact discovered eight-case desktop/mobile registry", () => {
    const registry = browserRegistry(browserReport(false), 0);
    expect(browserReceipt(browserReport(true), 0, registry)).toEqual({
      desktop: 4, mobile: 4, requested: 8, passed: 8, retries: 0, skipped: 0,
    });
  });

  test.each(["skip", "retry", "missing-native", "wrong-total", "stale-registry"] as const)(
    "rejects %s browser evidence", (kind) => {
      const registry = browserRegistry(browserReport(false), 0);
      const report = browserReport(true);
      if (kind === "skip") report.suites[0].specs[0].tests[0].expectedStatus = "skipped";
      if (kind === "retry") report.suites[0].specs[0].tests[0].results[0].retry = 1;
      if (kind === "missing-native") report.suites[0].specs.pop();
      if (kind === "wrong-total") report.stats.expected = 7;
      if (kind === "stale-registry") report.suites[0].specs[0].id = "different-case";
      expect(() => browserReceipt(report, 0, registry)).toThrow();
    },
  );
});
