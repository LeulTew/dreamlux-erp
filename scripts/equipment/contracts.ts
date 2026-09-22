import { sep } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { attestDreamluxNativeTarget } from "../../backend/src/db/testing/dreamlux-native-target";
import { payrollSystemEnvironment } from "../../frontend/payroll-qa-environment";
import {
  browserReceipt as verifyBrowserReceipt, browserRegistry as readBrowserRegistry,
  NATIVE_GUARD_BANNER, record, type BrowserRegistry, type BunReceipt,
} from "../payroll/contracts";

export const NATIVE_TEST = "src/db/equipment-deletion.integration.test.ts";
export const NATIVE_TEST_COUNT = 26;
export const CONDITION_TEST = "src/db/inventory-condition-resolution.integration.test.ts";
export const CONDITION_TEST_COUNT = 23;
export const RETURN_TEST = "src/db/equipment-return-correction.integration.test.ts";
export const RETURN_TEST_COUNT = 35;
export const PROVISIONING_TEST = "src/db/authority-provisioning.integration.test.ts";
export const PROVISIONING_TEST_COUNT = 11;
const NATIVE_SUITES = {
  deletion: { file: NATIVE_TEST, count: NATIVE_TEST_COUNT },
  conditions: { file: CONDITION_TEST, count: CONDITION_TEST_COUNT },
  returns: { file: RETURN_TEST, count: RETURN_TEST_COUNT },
  provisioning: { file: PROVISIONING_TEST, count: PROVISIONING_TEST_COUNT },
} as const;
type NativeSuite = keyof typeof NATIVE_SUITES;
export const BROWSER_FILES = [
  "issue259-equipment-deletion.spec.ts", "issue259-equipment-native.spec.ts", "issue273-return-correction-native.spec.ts",
] as const;
export const RUNNER_TIMEOUT_MS = 170_000;
export type EquipmentDescriptor = { apiOrigin: string; database: string; writerCookie: string; shutdownKey: string };

export function equipmentEnvironment(
  ambient: Record<string, string | undefined>, adminUrl: string, fixtureUrl: string, jwtSecret: string, restSecret: string,
): Record<string, string> {
  const admin = attestDreamluxNativeTarget(adminUrl, "admin");
  const fixture = attestDreamluxNativeTarget(fixtureUrl, "fixture");
  if (!/^\/dreamlux_ephemeral_equipment_259_[a-f0-9]{12}$/.test(fixture.pathname)
    || fixture.username !== admin.username || fixture.password !== admin.password || fixture.search !== admin.search
    || !/^[a-f0-9]{64}$/.test(jwtSecret) || !/^[a-f0-9]{64}$/.test(restSecret)
    || jwtSecret === restSecret || jwtSecret === admin.password || restSecret === admin.password) {
    throw new Error("Equipment QA requires a fresh fixture and independent application/REST secrets");
  }
  return {
    ...payrollSystemEnvironment(ambient), NODE_ENV: "development",
    DATABASE_URL: fixture.href, DATABASE_BACKUP_URL: "", DATABASE_DIRECT_URL: "", DIRECT_DATABASE_URL: "",
    DREAMLUX_NATIVE_TEST_ADMIN_URL: admin.href, JWT_SECRET: jwtSecret,
    DREAMLUX_TEST_REST_JWT_SECRET: restSecret, SUPABASE_URL: "http://127.0.0.1:54335",
  };
}

export function nativeArguments(report: string, suite: NativeSuite = "deletion"): string[] {
  const { file } = NATIVE_SUITES[suite];
  return ["--no-env-file", "test", `--config=.${sep}bunfig.native.toml`,
    "--reporter=junit", `--reporter-outfile=${report}`, file.split("/").join(sep)];
}

export function nativeReceipt(
  output: string, exitCode: number,
  { suite = "deletion", infrastructure = false }: { suite?: NativeSuite; infrastructure?: boolean } = {},
): BunReceipt {
  if (infrastructure && suite !== "deletion") throw new Error("Only the deletion suite provides a browser server");
  const { file, count: expected } = NATIVE_SUITES[suite];
  const plain = stripVTControlCharacters(output);
  const count = (kind: string) => Number([...plain.matchAll(new RegExp(`^\\s*(\\d+) ${kind}\\s*$`, "gm"))].at(-1)?.[1] ?? (kind === "skip" ? 0 : NaN));
  const passed = count("pass");
  const failed = count("fail");
  const skipped = count("skip");
  const run = [...plain.matchAll(/Ran (\d+) tests? across (\d+) files?/g)].at(-1);
  const tests = Number(run?.[1]);
  const files = Number(run?.[2]);
  if (exitCode !== 0 || !plain.includes(NATIVE_GUARD_BANNER) || !plain.replace(/\\/g, "/").includes(file)
    || passed !== (infrastructure ? 1 : expected) || failed !== 0 || skipped !== 0 || tests !== passed || files !== 1) {
    throw new Error("Equipment QA did not return its complete non-skipped native receipt");
  }
  return { passed, failed, skipped, tests, files };
}

export function equipmentDescriptor(value: unknown, fixtureUrl: string): EquipmentDescriptor {
  const target = attestDreamluxNativeTarget(fixtureUrl, "fixture");
  if (!record(value) || value.purpose !== "dreamlux-equipment-259" || value.apiOrigin !== "http://127.0.0.1:5326"
    || value.database !== target.pathname.slice(1) || typeof value.writerCookie !== "string" || !value.writerCookie
    || /[\r\n]/.test(value.writerCookie) || typeof value.shutdownKey !== "string" || !/^[a-f0-9]{48}$/.test(value.shutdownKey)) {
    throw new Error("Equipment browser descriptor does not identify the independently owned fixture");
  }
  return { apiOrigin: value.apiOrigin, database: value.database, writerCookie: value.writerCookie, shutdownKey: value.shutdownKey };
}

export function browserRegistry(value: unknown, exitCode: number): BrowserRegistry {
  const registry = readBrowserRegistry(value, exitCode, BROWSER_FILES);
  if (registry.tests.length !== 12 || ["desktop", "mobile"].some((project) =>
    registry.tests.filter((test) => test.project === project).length !== 6)) {
    throw new Error("Equipment QA requires its complete twelve-case browser registry");
  }
  return registry;
}

export function browserReceipt(value: unknown, exitCode: number, requested: BrowserRegistry) {
  return verifyBrowserReceipt(value, exitCode, requested, BROWSER_FILES);
}
