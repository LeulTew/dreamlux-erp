import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  POSTGREST_LINUX_ARCHIVE_SHA256, POSTGREST_LINUX_ARCHIVE_URL, POSTGREST_LINUX_BINARY_SHA256, record,
} from "./contracts";
import { repositoryRoot } from "./files";
import { attestDreamluxNativeTarget } from "../../backend/src/db/testing/dreamlux-native-target";

function object(value: unknown): Record<string, unknown> {
  if (!record(value)) throw new Error("Missing workflow contract object");
  return value;
}
function steps(job: Record<string, unknown>) {
  if (!Array.isArray(job.steps)) throw new Error("Missing workflow steps");
  return job.steps.map(object);
}

describe("local, unbilled CI definition contracts", () => {
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
  test("pins the disposable server's physical port and verifies both binary hashes before native QA", async () => {
    const workflow = object(Bun.YAML.parse(await readFile(join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8")));
    const native = object(object(workflow.jobs)["native-payroll"]);
    const postgres = object(object(native.services).postgres);
    expect(postgres.image).toBe("postgres:16.15");
    expect(postgres.ports).toEqual(["55434:55434"]);
    expect(object(postgres.env).PGPORT).toBe("55434");
    expect(object(postgres.env).POSTGRES_USER).toBe("dreamlux_parity");
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
