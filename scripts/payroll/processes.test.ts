import { describe, expect, spyOn, test } from "bun:test";
import { payrollSystemEnvironment } from "../../frontend/payroll-qa-environment";
import { ManagedProcess, waitForHttp } from "./processes";

describe("owned non-network process supervision", () => {
  test("accepts protected REST readiness without granting anonymous access", async () => {
    const request = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));
    try {
      await waitForHttp("http://127.0.0.1:54334", { assertRunning() {} }, 100);
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      request.mockRestore();
    }
  });

  test("does not mistake an anonymous REST success for the protected fixture", async () => {
    const request = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    try {
      await expect(waitForHttp("http://127.0.0.1:54334", { assertRunning() {} }, 1)).rejects.toThrow("readiness deadline");
    } finally {
      request.mockRestore();
    }
  });

  test("retains the normal frontend readiness status", async () => {
    const request = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    try {
      await waitForHttp("http://127.0.0.1:3126", { assertRunning() {} }, 100);
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      request.mockRestore();
    }
  });

  test("waits through pinned Bun's ConnectionRefused startup response", async () => {
    const request = spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(Object.assign(new Error("Synthetic listener not started"), { code: "ConnectionRefused" }))
      .mockResolvedValue(new Response(null, { status: 401 }));
    try {
      await waitForHttp("http://127.0.0.1:54334", { assertRunning() {} }, 1_000);
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      request.mockRestore();
    }
  });

  test("does not hide an unexpected readiness failure", async () => {
    const request = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Synthetic unexpected readiness failure"));
    try {
      await expect(waitForHttp("http://127.0.0.1:54334", { assertRunning() {} }, 1_000))
        .rejects.toThrow("Synthetic unexpected readiness failure");
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      request.mockRestore();
    }
  });

  test("requires an actual exit and captures a harmless child receipt", async () => {
    const child = new ManagedProcess("synthetic receipt child", process.execPath,
      ["--no-env-file", "-e", "console.log('synthetic child receipt')"],
      { cwd: process.cwd(), env: payrollSystemEnvironment(process.env) });
    try {
      expect(await child.requireSuccess(5_000)).toMatchObject({ exitCode: 0, output: "synthetic child receipt\n" });
      expect(child.exited).toBe(true);
    } finally {
      await child.stop();
    }
  });
  test("terminates only its owned timer child on timeout and reports failure", async () => {
    const child = new ManagedProcess("synthetic timer child", process.execPath,
      ["--no-env-file", "-e", "setInterval(() => {}, 1000)"],
      { cwd: process.cwd(), env: payrollSystemEnvironment(process.env) });
    try {
      await expect(child.wait(100)).rejects.toThrow("time budget");
      expect(child.exited).toBe(true);
    } finally {
      await child.stop();
    }
  }, 15_000);
});
