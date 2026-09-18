import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";

let proof: unknown;

beforeAll(async () => {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE)$/.test(name.toUpperCase())) {
      env[name] = value;
    }
  }
  // A fresh process proves initialization even when another test has already imported the app.
  const child = Bun.spawn([process.execPath, "--no-env-file", join(__dirname, "fixtures", "release-startup.runtime.ts")], {
    cwd: join(__dirname, "..", ".."),
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeout = setTimeout(() => child.kill(), 55_000);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exitCode !== 0) throw new Error(`Isolated startup check failed (${exitCode}): ${stderr}`);
    proof = JSON.parse(stdout);
  } finally {
    clearTimeout(timeout);
  }
}, 60_000);

describe("production release startup", () => {
  test("does not run legacy schema or data migrations", () => {
    expect(proof).toMatchObject({ startupMigrations: 0, startupQueries: [], permissionListenerStarts: 1 });
  });

  test("keeps health as a read-only connection check", () => {
    expect(proof).toMatchObject({
      health: { status: 200, body: { status: "ok", database: "connected" }, queries: ["SELECT 1"] },
    });
  });

  test("keeps unauthenticated session reads denied without database work", () => {
    expect(proof).toMatchObject({ session: { status: 401, queries: [] } });
  });
});
