import { describe, expect, test } from "bun:test";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const linuxTest = process.platform === "linux" ? test : test.skip;

describe("actual backup CLI with non-authenticating native stub", () => {
  linuxTest("preserves SQL output and backup URL precedence without exposing credentials or inherited secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "dreamlux-backup-cli-"));
    try {
      await mkdir(join(root, "backend"));
      await mkdir(join(root, "bin"));
      for (const file of ["db/backup-db.ts", "db/postgres-tool.ts", "config/postgres-url-options.ts", "lib/env.ts"]) {
        const destination = join(root, "backend", "src", ...file.split("/"));
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(join(__dirname, "..", ...file.split("/")), destination);
      }
      const argumentsPath = join(root, "arguments");
      const environmentPath = join(root, "environment");
      const script = join(root, "bin", "pg_dump");
      const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
      await writeFile(script, [
        "#!/bin/sh",
        `printf '%s\\n' "$@" > ${quote(argumentsPath)}`,
        `env > ${quote(environmentPath)}`,
        "output=''",
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "--file" ]; then shift; output="$1"; fi',
        "  shift",
        "done",
        'if [ -n "$output" ]; then printf \'SELECT 1;\\n\' > "$output"; else printf \'SELECT 1;\\n\'; fi',
      ].join("\n"), { mode: 0o700 });
      await chmod(script, 0o700);
      const preload = join(root, "offline.ts");
      await writeFile(preload, [
        'import dns from "node:dns/promises";',
        'import { Socket } from "node:net";',
        'dns.resolve4 = async () => ["127.0.0.1"];',
        'Socket.prototype.connect = () => { throw new Error("Unexpected CLI network attempt"); };',
      ].join("\n"));
      const preferred = new URL("postgresql://127.0.0.1:55434/dreamlux_ephemeral_backup_stub");
      preferred.username = "synthetic_role";
      preferred.password = "non-auth-fixture-value";
      const system = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(?:PATH|HOME|TMPDIR|LANG)$/i.test(name)));
      const child = Bun.spawn([process.execPath, "--no-env-file", "--preload", preload, "src/db/backup-db.ts"], {
        cwd: join(root, "backend"),
        env: {
          ...system, PATH: `${join(root, "bin")}:${system.PATH ?? "/usr/bin:/bin"}`,
          DATABASE_BACKUP_URL: preferred.href,
          DATABASE_URL: "postgresql://unselected.invalid/not-selected",
          JWT_SECRET: "not-for-the-child", PGPASSWORD: "not-for-the-child", PGHOST: "unselected.invalid",
        },
        stdout: "pipe", stderr: "pipe", timeout: 10_000,
      });
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect(code, stderr).toBe(0);
      expect(stdout, stderr).toContain("DB backup saved to:");
      const files = await readdir(join(root, "backups"));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^database-dump-[\dTZ-]+\.sql$/);
      expect(await readFile(join(root, "backups", files[0]), "utf8")).toBe("SELECT 1;\n");
      const args = (await readFile(argumentsPath, "utf8")).split("\n");
      expect(args.some((value) => value.includes("non-auth-fixture-value"))).toBe(false);
      expect(args).toContain("--no-password");
      expect(args.some((value) => value.includes("dreamlux_ephemeral_backup_stub"))).toBe(true);
      expect(args.some((value) => value.includes("unselected.invalid"))).toBe(false);
      const environment = await readFile(environmentPath, "utf8");
      expect(environment).not.toMatch(/^(JWT_SECRET|PGHOST|PGPASSWORD|DATABASE_URL|DATABASE_BACKUP_URL)=/m);
      expect(environment).toContain("PGPASSFILE=");
      expect(stdout + stderr).not.toContain("non-auth-fixture-value");
    } finally { await rm(root, { recursive: true }); }
  });
});
