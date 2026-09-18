import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("ordinary offline verification strips native backup opt-ins and target variables", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dreamlux-backup-unit-guard-"));
  try {
    const entry = join(directory, "assert-environment.test.ts");
    await writeFile(entry, [
      'import { expect, test } from "bun:test";',
      'test("backup opt-ins removed", () => {',
      '  expect(process.env.DREAMLUX_BACKUP_TEST_ADMIN_URL).toBeUndefined();',
      '  expect(process.env.DREAMLUX_BACKUP_TEST_REQUIRED).toBeUndefined();',
      '});',
    ].join("\n"));
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
      /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR|HOME|USERPROFILE)$/i.test(name)));
    const guard = join(__dirname, "..", "..", "..", "scripts", "payroll", "offline-unit-guard.ts");
    const child = Bun.spawn([process.execPath, "--no-env-file", "test", "--preload", guard, entry], {
      cwd: directory,
      env: { ...env, DREAMLUX_BACKUP_TEST_ADMIN_URL: "not-a-connection-fixture", DREAMLUX_BACKUP_TEST_REQUIRED: "1" },
      stdout: "pipe", stderr: "pipe", timeout: 10_000,
    });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(code, stdout + stderr).toBe(0);
    expect(stderr).toContain("1 pass");
    expect(stderr).toContain("0 fail");
  } finally { await rm(directory, { recursive: true }); }
});
