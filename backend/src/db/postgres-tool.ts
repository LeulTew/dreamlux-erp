import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasPostgresConnectionOverride } from "../config/postgres-url-options";

const OUTPUT_LIMIT = 1024 * 1024;
const TIMEOUT_MS = 120_000;
const CONNECT_TIMEOUT_SECONDS = 10;
const SYSTEM_ENVIRONMENT = /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|SYSTEMDRIVE|COMSPEC|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|TEMP|TMP|TMPDIR|LANG|LC_ALL|TZ)$/i;

export function postgresToolConnection(databaseUrl: string) {
  let target: URL;
  try { target = new URL(databaseUrl); } catch { throw new Error("PostgreSQL tools require a valid connection URL"); }
  if (!["postgres:", "postgresql:"].includes(target.protocol) || !target.username || !target.password) {
    throw new Error("PostgreSQL tools require an explicit authenticated connection");
  }
  if (hasPostgresConnectionOverride(target)) {
    throw new Error("PostgreSQL tool connection contains a routing or credential override");
  }
  const configuredTimeout = target.searchParams.get("connect_timeout") ?? String(CONNECT_TIMEOUT_SECONDS);
  const seconds = Number(configuredTimeout);
  if (!/^\d+$/.test(configuredTimeout) || !Number.isSafeInteger(seconds)) {
    throw new Error("PostgreSQL connection timeout must be a safe non-negative integer");
  }
  target.searchParams.set("connect_timeout", String(seconds > 0 ? Math.min(seconds, CONNECT_TIMEOUT_SECONDS) : CONNECT_TIMEOUT_SECONDS));
  const password = decodeURIComponent(target.password);
  const fields = [
    target.hostname.replace(/^\[|\]$/g, ""), target.port || "5432",
    decodeURIComponent(target.pathname.slice(1)), decodeURIComponent(target.username), password,
  ];
  if (target.hash || fields.some((value) => !value || /[\r\n\0]/.test(value))) {
    throw new Error("PostgreSQL password-file fields must be nonempty single-line values without URL fragments");
  }
  target.password = "";
  return {
    connectionString: target.toString(),
    password,
    passwordFileContents: `${fields.map((value) => value.replace(/\\/g, "\\\\").replace(/:/g, "\\:")).join(":")}\n`,
  };
}

export function redactPostgresOutput(value: string, secrets: readonly string[] = []) {
  let result = value;
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    result = result.split(secret).join("[redacted]");
  }
  return result.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted database URL]");
}

export async function runPostgresTool(
  command: "pg_dump" | "pg_restore",
  args: string[],
  databaseUrl?: string,
  timeoutMs = TIMEOUT_MS,
): Promise<string> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TIMEOUT_MS) {
    throw new Error("PostgreSQL tool timeout must be within its 120-second execution budget");
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([name, value]) => value !== undefined && SYSTEM_ENVIRONMENT.test(name)));
  const connection = databaseUrl ? postgresToolConnection(databaseUrl) : null;
  const secrets = connection && databaseUrl ? [databaseUrl, connection.password, encodeURIComponent(connection.password)] : [];
  let directory: string | undefined;
  let output = "";
  let failure: unknown;
  try {
    if (connection) {
      directory = await mkdtemp(join(tmpdir(), "dreamlux-pg-tool-"));
      const passwordFile = join(directory, "pgpass");
      await writeFile(passwordFile, connection.passwordFileContents, { mode: 0o600, flag: "wx" });
      env.PGPASSFILE = passwordFile;
      env.PGCONNECT_TIMEOUT = String(CONNECT_TIMEOUT_SECONDS);
    }
    const argumentsList = connection ? ["--no-password", "--dbname", connection.connectionString, ...args] : args;
    output = await new Promise<string>((resolve, reject) => {
      const child = spawn(command, argumentsList, {
        env, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs, killSignal: "SIGKILL",
      });
      let stdout = "";
      let stderr = "";
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let overflow = false;
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdoutBytes += Buffer.byteLength(chunk);
        if (stdoutBytes > OUTPUT_LIMIT) {
          overflow = true;
          child.kill("SIGKILL");
        } else stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderrBytes += Buffer.byteLength(chunk);
        if (stderrBytes > OUTPUT_LIMIT) {
          overflow = true;
          child.kill("SIGKILL");
        } else stderr += chunk;
      });
      child.on("error", (error) => reject(new Error(`${command} could not run: ${redactPostgresOutput(error.message, secrets)}`)));
      child.on("close", (code, signal) => {
        if (overflow) reject(new Error(`${command} exceeded its bounded output limit`));
        else if (code === 0) resolve(stdout);
        else reject(new Error(`${command} failed (${signal ?? code}): ${redactPostgresOutput(stderr.trim(), secrets)}`));
      });
    });
  } catch (error) {
    failure = error;
  } finally {
    if (directory) {
      try { await rm(directory, { recursive: true }); } catch (error) {
        failure = new AggregateError(failure ? [failure, error] : [error], "PostgreSQL tool credential-file cleanup failed");
      }
    }
  }
  if (failure) throw failure;
  return output;
}
