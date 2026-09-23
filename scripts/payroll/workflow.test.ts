import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  POSTGREST_LINUX_ARCHIVE_SHA256, POSTGREST_LINUX_ARCHIVE_URL, POSTGREST_LINUX_BINARY_SHA256, RUNNER_TIMEOUT_MS, record,
} from "./contracts";
import { repositoryRoot } from "./files";
import { attestDreamluxNativeTarget } from "../../backend/src/db/testing/dreamlux-native-target";
import { RUNNER_TIMEOUT_MS as EQUIPMENT_TIMEOUT_MS } from "../equipment/contracts";

function object(value: unknown): Record<string, unknown> {
  if (!record(value)) throw new Error("Missing workflow contract object");
  return value;
}
function steps(job: Record<string, unknown>) {
  if (!Array.isArray(job.steps)) throw new Error("Missing workflow steps");
  return job.steps.map(object);
}

describe("local, unbilled CI definition contracts", () => {
  test("budgets the expanded serial browser registry inside the unchanged driver cap", async () => {
    const config = await readFile(join(repositoryRoot, "frontend", "playwright.payroll-native.config.ts"), "utf8");
    const runner = await readFile(join(repositoryRoot, "scripts", "payroll", "run.ts"), "utf8");
    const browserBudget = Number(config.match(/globalTimeout:\s*([\d_]+)/)?.[1].replaceAll("_", ""));
    const processBudget = Number(runner.match(/browser\.requireSuccess\(budget\(([\d_]+)\)\)/)?.[1].replaceAll("_", ""));
    expect(browserBudget).toBe(150_000);
    expect(processBudget).toBe(160_000);
    expect(browserBudget).toBeLessThan(processBudget);
    expect(processBudget).toBeLessThan(RUNNER_TIMEOUT_MS);
    expect(RUNNER_TIMEOUT_MS).toBe(225_000);
  });

  test("retains existing triggers, concurrency, permissions and job caps", async () => {
    const parsed: unknown = Bun.YAML.parse(await readFile(join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8"));
    const workflow = object(parsed);
    expect(workflow.on).toEqual({ push: { branches: ["main", "master"] }, pull_request: { branches: ["main", "master"] } });
    expect(workflow.concurrency).toEqual({ group: "${{ github.workflow }}-${{ github.ref }}", "cancel-in-progress": true });
    expect(workflow.permissions).toEqual({ contents: "read" });
    const jobs = object(workflow.jobs);
    expect(object(jobs["backend-test"])["timeout-minutes"]).toBe(3);
    expect(object(jobs["frontend-build"])["timeout-minutes"]).toBe(3);
    expect(object(jobs["native-payroll"])["timeout-minutes"]).toBeLessThanOrEqual(5);
    expect(object(jobs["native-payroll"]).needs).toEqual(["backend-test", "frontend-build"]);
    expect(steps(object(jobs["backend-test"])).find((step) => step.name === "Run tests")?.run)
      .toContain("test --timeout=30000 --preload");
    for (const job of Object.values(jobs).map(object)) {
      expect(steps(job).find((step) => step.uses === "oven-sh/setup-bun@v2")?.with).toEqual({ "bun-version": "1.3.14" });
      expect(steps(job).find((step) => step.uses === "actions/checkout@v4")?.with).toEqual({ "persist-credentials": false });
    }
  });
  test("uses one source-isolated build artifact, not a duplicate native-job build", async () => {
    const workflow = object(Bun.YAML.parse(await readFile(join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8")));
    const jobs = object(workflow.jobs);
    const frontend = steps(object(jobs["frontend-build"]));
    const native = steps(object(jobs["native-payroll"]));
    expect(frontend.filter((step) => String(step.run).includes("build-ui.ts"))).toHaveLength(1);
    expect(frontend.some((step) => step.uses === "actions/upload-artifact@v4")).toBe(true);
    expect(native.some((step) => step.uses === "actions/download-artifact@v4")).toBe(true);
    expect(native.some((step) => /build-ui\.ts|bun run build|next build/.test(String(step.run)))).toBe(false);
    expect(native.find((step) => String(step.run).includes("scripts/payroll/run.ts"))?.run).toContain("--allow-disposable-postgres");
  });
  test("uses spare backend capacity for lint and all frontend units while retaining separate build types", async () => {
    const workflow = object(Bun.YAML.parse(await readFile(join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8")));
    const jobs = object(workflow.jobs);
    const quality = steps(object(jobs["backend-test"]));
    const frontend = steps(object(jobs["frontend-build"]));
    const lintAndUnits = quality.filter((step) => String(step.run).includes("--lint-and-test"));
    expect(lintAndUnits).toHaveLength(1);
    expect(String(lintAndUnits[0].run)).toBe("bun --no-env-file scripts/payroll/build-ui.ts --lint-and-test");
    expect(quality.some((step) => String(step.run).includes("bun install --cwd frontend --frozen-lockfile"))).toBe(true);
    const build = frontend.filter((step) => String(step.run).includes("build-ui.ts"));
    expect(build).toHaveLength(1);
    expect(String(build[0].run)).toBe("bun --no-env-file scripts/payroll/build-ui.ts --typecheck --output .qa-payroll-build");
    expect([...quality, ...frontend].filter((step) => String(step.run).includes("--checks"))).toHaveLength(0);
    expect(object(jobs["native-payroll"]).needs).toEqual(["backend-test", "frontend-build"]);
  });
  test("runs the complete domain and import verifiers against the same build without adding runner jobs", async () => {
    const workflow = object(Bun.YAML.parse(await readFile(join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8")));
    const jobs = object(workflow.jobs);
    expect(Object.keys(jobs).sort()).toEqual(["backend-test", "frontend-build", "native-payroll"]);
    expect(Object.values(jobs).map(object).reduce((sum, job) => sum + Number(job["timeout-minutes"]), 0)).toBe(11);
    const native = steps(object(jobs["native-payroll"])).map((step) => String(step.run)).join("\n");
    expect(native.match(/scripts\/payroll\/run\.ts/g)).toHaveLength(1);
    expect(native.match(/scripts\/equipment\/run\.ts/g)).toHaveLength(1);
    expect(native.match(/--frontend-build \.qa-payroll-build/g)).toHaveLength(3);
    expect(native.match(/verify:imports:native/g)).toHaveLength(1);
    expect(native.match(/verify:imports:browser/g)).toHaveLength(1);
    const local = await readFile(join(repositoryRoot, "scripts", "payroll", "local-ci.ts"), "utf8");
    expect(local).toContain("await verifyEquipment(plan)");
    expect(local).toContain('"run", "test:storage"');
    expect(local.indexOf("await verifyEquipment(plan)")).toBeGreaterThan(local.indexOf("await verifyPayroll(plan)"));
    expect(local).toContain('"run", "verify:imports:native"');
    expect(local.indexOf("await verifyImportBrowser(")).toBeGreaterThan(local.indexOf("await verifyEquipment(plan)"));
    const config = await readFile(join(repositoryRoot, "frontend", "playwright.equipment-native.config.ts"), "utf8");
    const runner = await readFile(join(repositoryRoot, "scripts", "equipment", "run.ts"), "utf8");
    expect(config).toContain("globalTimeout: 120_000");
    expect(runner).toContain("browser.requireSuccess(budget(125_000))");
    expect(runner).toContain('nativeArguments(conditionReport, "conditions")');
    expect(runner).toContain('nativeReceipt(conditionResult.output, conditionResult.exitCode, { suite: "conditions" })');
    expect(runner.indexOf("const conditionReport")).toBeGreaterThan(runner.indexOf("const nativeSummary"));
    expect(runner.indexOf("const descriptorPath")).toBeGreaterThan(runner.indexOf("const conditionSummary"));
    expect(runner).toContain('nativeArguments(provisioningReport, "provisioning")');
    expect(runner.indexOf("const provisioningReport")).toBeGreaterThan(runner.indexOf("const returnSummary"));
    expect(runner.indexOf("const descriptorPath")).toBeGreaterThan(runner.indexOf("const provisioningSummary"));
    expect(EQUIPMENT_TIMEOUT_MS).toBe(170_000);
  });
  test("pins the disposable server's physical port and verifies both binary hashes before native QA", async () => {
    const workflow = object(Bun.YAML.parse(await readFile(join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8")));
    const native = object(object(workflow.jobs)["native-payroll"]);
    const postgres = object(object(native.services).postgres);
    expect(postgres.image).toBe("postgres:16.15");
    expect(postgres.ports).toEqual(["55434:55434"]);
    expect(object(postgres.env).PGPORT).toBe("55434");
    expect(object(postgres.env).POSTGRES_USER).toBe("dreamlux_parity");
    expect(String(postgres.options)).toContain("--tmpfs /var/lib/postgresql/data:rw,size=1g");
    expect(String(postgres.options)).toContain("--memory 2g");
    expect(String(postgres.options)).not.toMatch(/fsync=off|full_page_writes=off|synchronous_commit=off/);
    const commands = steps(native);
    const download = String(commands.find((step) => String(step.run).includes("curl --fail"))?.run);
    expect(download).toContain(POSTGREST_LINUX_ARCHIVE_URL);
    expect(download).toContain(POSTGREST_LINUX_ARCHIVE_SHA256);
    expect(download).toContain(POSTGREST_LINUX_BINARY_SHA256);
    expect(download).toContain("--version");
    expect(download).not.toContain("/latest/");
    const run = commands.find((step) => String(step.run).includes("scripts/payroll/run.ts"));
    const admin = object(run?.env).DREAMLUX_NATIVE_TEST_ADMIN_URL;
    if (typeof admin !== "string") throw new Error("Missing explicit disposable CI admin target");
    expect(attestDreamluxNativeTarget(admin, "admin").search).toBe("?sslmode=disable");
  });
});
