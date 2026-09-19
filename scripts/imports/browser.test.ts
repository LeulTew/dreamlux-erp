import { describe, expect, spyOn, test } from "bun:test";
import { createServer } from "node:net";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { payrollSystemEnvironment } from "../../frontend/payroll-qa-environment";
import { assertImportBrowserReceipt, verifyImportBrowser } from "./browser";
import { repositoryRoot } from "../payroll/files";
import { record } from "../payroll/contracts";
import { ManagedProcess, reserveLocalPorts, waitForHttp } from "../payroll/processes";

function receipt() {
  return {
    stats: { expected: 14, unexpected: 0, flaky: 0, skipped: 0 },
    errors: [],
    suites: [{ file: "issue113-imports.spec.ts" }, { file: "issue261-formula-imports.spec.ts" }],
    config: { projects: [{ name: "chromium" }, { name: "mobile-chromium" }] },
  };
}

describe("bounded import verification", () => {
  test("rejects invalid reservations and leaves an existing listener untouched", async () => {
    await expect(reserveLocalPorts([])).rejects.toThrow("distinct explicit");
    await expect(reserveLocalPorts([0])).rejects.toThrow("distinct explicit");
    await expect(reserveLocalPorts([3261, 3261])).rejects.toThrow("distinct explicit");
    const server = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Owned test listener did not bind");
      await expect(reserveLocalPorts([address.port])).rejects.toThrow("will not be reused or stopped");
      expect(server.listening).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  test("waits for its separate import UI without accepting arbitrary origins", async () => {
    const request = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    try {
      await waitForHttp("http://127.0.0.1:3261", { assertRunning() {} }, 100);
      expect(request.mock.calls[0][0]).toBe("http://127.0.0.1:3261/login");
      await expect(waitForHttp("https://unapproved.invalid", { assertRunning() {} }, 100)).rejects.toThrow("unowned readiness");
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      request.mockRestore();
    }
  });

  test("requires a complete two-file, two-viewport browser receipt", () => {
    expect(() => assertImportBrowserReceipt(receipt())).not.toThrow();
    for (const stats of [
      { expected: 0 }, { expected: 13 }, { unexpected: 1 }, { flaky: 1 }, { skipped: 1 },
    ]) {
      const value = receipt();
      Object.assign(value.stats, stats);
      expect(() => assertImportBrowserReceipt(value)).toThrow();
    }
    expect(() => assertImportBrowserReceipt({ ...receipt(), errors: ["unhandled"] })).toThrow();
    expect(() => assertImportBrowserReceipt({ ...receipt(), suites: [{ file: "unrelated.spec.ts" }] })).toThrow();
    expect(() => assertImportBrowserReceipt({ ...receipt(), config: { projects: [{ name: "chromium" }] } })).toThrow();
  });

  test("rejects incomplete or unrequested runner arguments before starting resources", async () => {
    await expect(verifyImportBrowser([])).rejects.toThrow("Usage:");
    await expect(verifyImportBrowser(["--frontend-build", "--unknown"])).rejects.toThrow("Usage:");
    await expect(verifyImportBrowser(["--frontend-build", ".qa-payroll-build", "--extra"])).rejects.toThrow("Usage:");
  });

  test("the explicit native command cannot succeed by skipping an absent target", async () => {
    const child = new ManagedProcess("missing import target guard", process.execPath, [
      "--no-env-file", "--config=backend/bunfig.imports.toml", "test", "backend/src/db/hisab-formula-import.integration.test.ts",
    ], { cwd: repositoryRoot, env: { ...payrollSystemEnvironment(process.env), DREAMLUX_NATIVE_IMPORT_REQUIRED: "1" } });
    try {
      const result = await child.wait(15_000);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain("Native import verification requires the explicitly attested independent DreamLux PostgreSQL target");
    } finally {
      await child.stop();
    }
  });

  test("wires both import layers into the existing capped native job without rebuilding or retrying", async () => {
    const workflow: unknown = Bun.YAML.parse(await readFile(join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8"));
    if (!record(workflow) || !record(workflow.jobs)) throw new Error("Missing workflow jobs");
    const native = workflow.jobs["native-payroll"];
    if (!record(native) || !Array.isArray(native.steps)) throw new Error("Missing capped native job");
    expect(native["timeout-minutes"]).toBeLessThanOrEqual(5);
    const run = native.steps.find((step) => record(step) && String(step.run).includes("scripts/payroll/run.ts"));
    if (!record(run)) throw new Error("Missing existing native execution step");
    expect(run.run).toContain("bun run verify:imports:native");
    expect(run.run).toContain("bun run verify:imports:browser -- --frontend-build .qa-payroll-build");
    expect(run.run).not.toMatch(/build-ui\.ts|gh run rerun|continue-on-error/);
    const config = await readFile(join(repositoryRoot, "frontend", "e2e", "imports-browser.config.ts"), "utf8");
    expect(config).toContain("retries: 0");
    expect(config).toContain("globalTimeout: 60_000");
  });
});
