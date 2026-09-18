import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as fs from "node:fs/promises";
import { Client } from "pg";
import { backupDatabase } from "./backup-db";
import { runPostgresTool } from "./postgres-tool";
import { attestDreamluxNativeTarget, dreamluxFixtureTarget } from "./testing/dreamlux-native-target";

const adminUrl = process.env.DREAMLUX_BACKUP_TEST_ADMIN_URL;
if (process.env.DREAMLUX_BACKUP_TEST_REQUIRED === "1" && !adminUrl) {
  throw new Error("DREAMLUX_BACKUP_TEST_ADMIN_URL is required for the explicit native backup command");
}
const nativeTest = adminUrl ? test : test.skip;
const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
const sourceName = `dreamlux_ephemeral_backup_${suffix}`;
const restoreName = `dreamlux_ephemeral_restore_${suffix}`;
let admin: Client | undefined;
let directory: string;
let sourceUrl: string;
let sourceCreated = false;
const fixedDate = new Date("2026-09-18T12:00:00.000Z");

function maintenance() {
  if (!admin) throw new Error("The independent backup administrator is unavailable");
  return admin;
}

function systemEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(?:PATH|HOME|TMPDIR|LANG)$/i.test(name)));
}

async function privateFiles() {
  return (await readdir(tmpdir())).filter((name) => name.startsWith("dreamlux-pg-tool-")).sort();
}

beforeAll(async () => {
  if (!adminUrl) return;
  if (process.platform !== "linux") throw new Error("Native backup proof requires the isolated Linux PostgreSQL service");
  const target = attestDreamluxNativeTarget(adminUrl, "admin");
  sourceUrl = dreamluxFixtureTarget(adminUrl, `backup_${suffix}`).href;
  directory = await mkdtemp(join(tmpdir(), "dreamlux-backup-native-"));
  admin = new Client({ connectionString: target.href, connectionTimeoutMillis: 10_000, query_timeout: 30_000 });
  await admin.connect();
  await admin.query(`create database "${sourceName}"`);
  sourceCreated = true;
  const source = new Client({ connectionString: sourceUrl });
  try {
    await source.connect();
    await source.query(`
      create table public.events(id integer primary key, label text not null, amount numeric(16,6), payload text);
      create table public.event_lines(id integer primary key, event_id integer references public.events(id), quantity numeric(16,6));
      create table public."records""quoted"(label text);
      insert into public.events(id,label,amount) values(1,'Synthetic DreamLux event',1234.567890),(2,'Synthetic zero',0);
      update public.events set payload=repeat(chr(9731),400000) where id=1;
      insert into public.event_lines values(1,1,2.500001),(2,1,0),(3,2,1);
      insert into public."records""quoted" values('Keep exact quoted identifier');
    `);
  } finally { await source.end(); }
}, 30_000);

afterAll(async () => {
  try {
    if (admin) {
      try {
        if (sourceCreated) await admin.query(`drop database "${sourceName}" with (force)`);
        expect((await admin.query("select datname from pg_database where datname=$1", [restoreName])).rows).toEqual([]);
      } finally { await admin.end(); }
    }
  } finally { if (directory) await rm(directory, { recursive: true }); }
});

describe("actual independent DreamLux SQL backup and restore", () => {
  nativeTest("streams a private SQL artifact and independently restores exact data and constraints", async () => {
    const before = await privateFiles();
    const backup = await backupDatabase(sourceUrl, join(directory, "normal"), fixedDate);
    expect(backup.sizeBytes).toBeGreaterThan(1024 * 1024);
    expect((await stat(backup.path)).mode & 0o777).toBe(0o600);
    expect(backup.path).toEndWith("database-dump-2026-09-18T12-00-00-000Z.sql");
    expect(await readdir(join(directory, "normal"))).toEqual(["database-dump-2026-09-18T12-00-00-000Z.sql"]);
    await maintenance().query(`create database "${restoreName}"`);
    try {
      const child = Bun.spawn(["psql", "-X", "--no-password", "-U", "dreamlux_parity", "-d", restoreName, "-v", "ON_ERROR_STOP=1", "-f", backup.path], {
        env: { ...systemEnvironment(), PGPORT: "55434" }, stdout: "pipe", stderr: "pipe", timeout: 10_000,
      });
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect(code, stderr).toBe(0);
      expect(stdout).toContain("COPY 2");
      const observer = new Client({ connectionString: dreamluxFixtureTarget(adminUrl!, `restore_${suffix}`).href });
      try {
        await observer.connect();
        expect((await observer.query("select id,label,amount::text from events order by id")).rows).toEqual([
          { id: 1, label: "Synthetic DreamLux event", amount: "1234.567890" },
          { id: 2, label: "Synthetic zero", amount: "0.000000" },
        ]);
        expect((await observer.query("select payload=repeat(chr(9731),400000) as intact from events where id=1")).rows[0].intact).toBe(true);
        expect((await observer.query("select quantity::text from event_lines order by id")).rows).toEqual([
          { quantity: "2.500001" }, { quantity: "0.000000" }, { quantity: "1.000000" },
        ]);
        expect((await observer.query('select label from public."records""quoted"')).rows).toEqual([{ label: "Keep exact quoted identifier" }]);
        expect((await observer.query("select count(*)::int as count from pg_constraint where conrelid='public.event_lines'::regclass and contype='f'")).rows[0].count).toBe(1);
      } finally { await observer.end(); }
    } finally { await maintenance().query(`drop database "${restoreName}" with (force)`); }
    expect(await privateFiles()).toEqual(before);
  });

  nativeTest("never overwrites an existing successful artifact", async () => {
    const output = join(directory, "collision");
    const first = await backupDatabase(sourceUrl, output, fixedDate);
    const content = await readFile(first.path);
    await expect(backupDatabase(sourceUrl, output, fixedDate)).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(first.path)).toEqual(content);
    expect(await readdir(output)).toHaveLength(1);
  });

  nativeTest("preserves an IPv6 loopback connection to the same owned test service", async () => {
    const target = new URL(sourceUrl);
    target.hostname = "[::1]";
    const backup = await backupDatabase(target.href, join(directory, "ipv6"));
    expect(backup.sizeBytes).toBeGreaterThan(1024 * 1024);
  });

  nativeTest("failed native execution never publishes a partial SQL file or leaves credentials", async () => {
    const before = await privateFiles();
    const invalid = dreamluxFixtureTarget(adminUrl!, `missing_${suffix}`);
    const output = join(directory, "failed");
    await expect(backupDatabase(invalid.href, output)).rejects.toThrow("pg_dump failed");
    expect(await readdir(output)).toEqual([]);
    expect(await privateFiles()).toEqual(before);
  });

  nativeTest("rejects an overridden target before creating any output directory", async () => {
    const invalid = new URL(sourceUrl);
    invalid.searchParams.set("host", "unowned.invalid");
    const output = join(directory, "rejected");
    await expect(backupDatabase(invalid.href, output)).rejects.toThrow("routing or credential override");
    await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });
  });

  nativeTest("rejects empty native success and cleans staging and credential files", async () => {
    const bin = join(directory, "empty-tool");
    await mkdir(bin);
    await writeFile(join(bin, "pg_dump"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    await chmod(join(bin, "pg_dump"), 0o700);
    const path = process.env.PATH;
    const before = await privateFiles();
    process.env.PATH = `${bin}:${path}`;
    const output = join(directory, "empty-result");
    try {
      await expect(backupDatabase(sourceUrl, output)).rejects.toThrow("empty file");
      expect(await readdir(output)).toEqual([]);
      expect(await privateFiles()).toEqual(before);
    } finally {
      if (path === undefined) delete process.env.PATH;
      else process.env.PATH = path;
    }
  });

  nativeTest("reports a staging cleanup fault instead of returning a success receipt", async () => {
    const output = join(directory, "cleanup-fault");
    const original = fs.rm;
    const cleanup = spyOn(fs, "rm").mockImplementation(new Proxy(original, {
      apply(target, receiver, args) {
        if (typeof args[0] === "string" && args[0].startsWith(join(output, ".dreamlux-db-backup-"))) {
          throw new Error("Synthetic staging cleanup fault");
        }
        return Reflect.apply(target, receiver, args);
      },
    }));
    try {
      await expect(backupDatabase(sourceUrl, output, fixedDate)).rejects.toThrow("staging cleanup failed");
      expect((await stat(join(output, "database-dump-2026-09-18T12-00-00-000Z.sql"))).size).toBeGreaterThan(1024 * 1024);
      expect((await readdir(output)).some((name) => name.startsWith(".dreamlux-db-backup-"))).toBe(true);
    } finally {
      cleanup.mockRestore();
      await rm(output, { recursive: true });
    }
  });

  nativeTest("runs the exact root backup:db script with DATABASE_URL fallback and the expected output directory", async () => {
    const workspace = join(directory, "cli");
    for (const file of ["db/backup-db.ts", "db/postgres-tool.ts", "config/postgres-url-options.ts", "lib/env.ts"]) {
      const destination = join(workspace, "backend", "src", ...file.split("/"));
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(__dirname, "..", ...file.split("/")), destination);
    }
    const manifest: unknown = JSON.parse(await readFile(join(__dirname, "..", "..", "..", "package.json"), "utf8"));
    if (!manifest || typeof manifest !== "object" || !("scripts" in manifest)
      || !manifest.scripts || typeof manifest.scripts !== "object" || !("backup:db" in manifest.scripts)
      || typeof manifest.scripts["backup:db"] !== "string") throw new Error("Missing root backup command");
    await writeFile(join(workspace, "package.json"), JSON.stringify({ private: true, scripts: { "backup:db": manifest.scripts["backup:db"] } }));
    await mkdir(join(workspace, "bin"));
    await symlink(process.execPath, join(workspace, "bin", "bun"));
    const system = systemEnvironment();
    const child = Bun.spawn([process.execPath, "--no-env-file", "run", "backup:db"], {
      cwd: workspace,
      env: { ...system, PATH: `${join(workspace, "bin")}:${system.PATH}`, DATABASE_URL: sourceUrl },
      stdout: "pipe", stderr: "pipe", timeout: 15_000,
    });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(code, stderr).toBe(0);
    expect(stdout).toContain("DB backup saved to:");
    expect((stdout + stderr).includes(new URL(adminUrl!).password)).toBe(false);
    const artifacts = await readdir(join(workspace, "backups"));
    expect(artifacts).toHaveLength(1);
    expect((await stat(join(workspace, "backups", artifacts[0]))).size).toBeGreaterThan(1024 * 1024);
  });

  nativeTest("bounds captured multibyte diagnostics without limiting the streamed SQL artifact", async () => {
    let failure: unknown;
    try { await runPostgresTool("pg_dump", ["--data-only", "--table=public.events"], sourceUrl); } catch (error) { failure = error; }
    expect(failure instanceof Error && failure.message.includes("bounded output limit")).toBe(true);
  });

  nativeTest("keeps the real native child private and terminates a lock-stalled dump", async () => {
    const blocker = new Client({ connectionString: sourceUrl });
    await blocker.connect();
    await blocker.query("begin; lock table public.events in access exclusive mode");
    const previous = { PGHOST: process.env.PGHOST, PGPASSWORD: process.env.PGPASSWORD, JWT_SECRET: process.env.JWT_SECRET };
    Object.assign(process.env, { PGHOST: "unowned.invalid", PGPASSWORD: "not-for-the-child", JWT_SECRET: "not-for-the-child" });
    let failure: unknown;
    let passwordFile: string | undefined;
    const started = Date.now();
    const operation = runPostgresTool("pg_dump", ["--file", join(directory, "stalled.sql")], sourceUrl, 1500)
      .catch((error: unknown) => { failure = error; });
    try {
      while (!passwordFile && Date.now() - started < 1200) {
        const children = (await readFile(`/proc/${process.pid}/task/${process.pid}/children`, "utf8")).trim().split(/\s+/).filter(Boolean);
        for (const pid of children) {
          try {
            if ((await readFile(`/proc/${pid}/comm`, "utf8")).trim() !== "pg_dump") continue;
            const args = await readFile(`/proc/${pid}/cmdline`, "utf8");
            const env = (await readFile(`/proc/${pid}/environ`, "utf8")).split("\0");
            expect(args.includes(new URL(adminUrl!).password)).toBe(false);
            expect(env.some((entry) => /^(PGHOST|PGPASSWORD|JWT_SECRET|DATABASE_URL|DATABASE_BACKUP_URL)=/.test(entry))).toBe(false);
            passwordFile = env.find((entry) => entry.startsWith("PGPASSFILE="))?.slice("PGPASSFILE=".length);
            if (!passwordFile) throw new Error("Native dump is missing its private password file");
            expect((await stat(passwordFile)).mode & 0o777).toBe(0o600);
          } catch (error) {
            if (!error || typeof error !== "object" || !("code" in error) || !["ENOENT", "ESRCH"].includes(String(error.code))) throw error;
          }
        }
        if (!passwordFile) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(passwordFile !== undefined).toBe(true);
      await operation;
      expect(failure instanceof Error && failure.message.includes("SIGKILL")).toBe(true);
      expect(Date.now() - started).toBeGreaterThanOrEqual(1400);
      expect(Date.now() - started).toBeLessThan(5000);
      if (!passwordFile) throw new Error("The private native credential path was not observed");
      await expect(stat(passwordFile)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await blocker.query("rollback");
      await blocker.end();
      await operation;
    }
  }, 10_000);
});
