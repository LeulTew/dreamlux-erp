import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { StringDecoder } from "node:string_decoder";
import { payrollSystemEnvironment } from "../../frontend/payroll-qa-environment";

export type ProcessResult = { exitCode: number; output: string };
const OUTPUT_LIMIT = 8 * 1024 * 1024;
export const UI_EGRESS_MARKER = "[payroll-qa-egress]";

function subprocessEnvironment(values: Record<string, string>): NodeJS.ProcessEnv {
  const mode = values.NODE_ENV ?? "test";
  if (mode !== "test" && mode !== "production" && mode !== "development") throw new Error("Unexpected child NODE_ENV");
  return { ...values, NODE_ENV: mode };
}

async function within<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function redact(text: string, secrets: readonly string[] = []): string {
  let result = text;
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    result = result.split(secret).join("[redacted]");
  }
  return result
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted database URL]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted JWT]")
    .replace(/\bdreamlux_ephemeral_[a-z0-9_]+\b/g, "[redacted fixture database]")
    .replace(/\b[a-f0-9]{64}\b/gi, "[redacted 64-hex value]");
}

export class CleanupStack {
  private entries: Array<{ name: string; close: () => Promise<void> }> = [];
  defer(name: string, close: () => Promise<void>) { this.entries.push({ name, close }); }

  async close(): Promise<void> {
    const errors: Error[] = [];
    for (const entry of this.entries.splice(0).reverse()) {
      try {
        await entry.close();
      } catch (cause) {
        errors.push(new Error(`Failed to clean up owned ${entry.name}`, { cause }));
      }
    }
    if (errors.length) throw new AggregateError(errors, "Payroll QA cleanup was incomplete");
  }
}

export class ManagedProcess {
  private child: ChildProcess;
  private finished = false;
  private output = "";
  private overflow = false;
  private stopping: Promise<void> | undefined;
  private completion: Promise<ProcessResult>;
  private secrets: string[];

  constructor(
    readonly label: string,
    command: string,
    args: string[],
    options: { cwd: string; env: Record<string, string>; secrets?: string[] },
  ) {
    this.secrets = options.secrets ?? [];
    this.child = spawn(command, args, {
      cwd: options.cwd,
      env: subprocessEnvironment(options.env),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      // A ref'ed, owned process group lets cleanup terminate Node/Playwright descendants.
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    for (const stream of [this.child.stdout, this.child.stderr]) {
      const decoder = new StringDecoder("utf8");
      stream?.on("data", (data: Buffer) => {
        const text = decoder.write(data);
        if (this.output.length + text.length > OUTPUT_LIMIT) this.overflow = true;
        else this.output += text;
      });
      stream?.on("end", () => { this.output += decoder.end(); });
    }
    this.completion = new Promise((resolve) => {
      this.child.once("error", () => {
        this.finished = true;
        resolve({ exitCode: -1, output: this.output });
      });
      this.child.once("close", (code) => {
        this.finished = true;
        resolve({ exitCode: code ?? -1, output: this.output });
      });
    });
  }

  assertRunning() {
    if (this.finished) throw new Error(`${this.label} exited before readiness`);
    this.assertOutputSafe();
  }

  get exited() { return this.finished; }

  assertOutputSafe() {
    if (this.overflow) throw new Error(`${this.label} exceeded the bounded log limit`);
    if (this.output.includes(UI_EGRESS_MARKER)) throw new Error(`${this.label} attempted forbidden egress`);
  }

  async wait(timeoutMs: number): Promise<ProcessResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.completion,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`${this.label} exceeded its time budget`)), timeoutMs);
        }),
      ]);
      this.assertOutputSafe();
      return result;
    } catch (error) {
      await this.stop();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async requireSuccess(timeoutMs: number): Promise<ProcessResult> {
    const result = await this.wait(timeoutMs);
    if (result.exitCode !== 0) {
      console.error(redact(result.output, this.secrets).split(/\r?\n/).slice(-60).join("\n"));
      throw new Error(`${this.label} failed (exit ${result.exitCode})`);
    }
    return result;
  }

  stop(): Promise<void> {
    this.stopping ??= this.stopOwnedTree();
    return this.stopping;
  }

  private async stopOwnedTree() {
    if (this.finished || !this.child.pid) return;
    const pid = this.child.pid;
    if (process.platform === "win32") {
      const script = `
        $ErrorActionPreference = 'Stop'
        $rootId = ${pid}
        $processes = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
        $owned = [System.Collections.Generic.List[int]]::new()
        $owned.Add($rootId)
        for ($index = 0; $index -lt $owned.Count; $index++) {
          foreach ($child in $processes) {
            if ($child.ParentProcessId -eq $owned[$index] -and -not $owned.Contains([int]$child.ProcessId)) {
              $owned.Add([int]$child.ProcessId)
            }
          }
        }
        for ($index = $owned.Count - 1; $index -ge 0; $index--) {
          try { Stop-Process -Id $owned[$index] -Force -ErrorAction Stop }
          catch { if (Get-Process -Id $owned[$index] -ErrorAction SilentlyContinue) { throw } }
        }
      `;
      const killer = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        stdio: "ignore", windowsHide: true, env: subprocessEnvironment(payrollSystemEnvironment(process.env)),
      });
      const code = await within(new Promise<number | null>((resolve, reject) => {
        killer.once("error", reject);
        killer.once("close", resolve);
      }), 5_000, "Owned Windows process-tree cleanup timed out");
      if (code !== 0) throw new Error(`Could not terminate the owned ${this.label} process tree`);
    } else {
      const signal = (value: NodeJS.Signals) => {
        try { process.kill(-pid, value); }
        catch (error) {
          if (!(error && typeof error === "object" && "code" in error && error.code === "ESRCH")) throw error;
        }
      };
      signal("SIGTERM");
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([this.completion, new Promise((resolve) => { timer = setTimeout(resolve, 1_500); })]);
      clearTimeout(timer);
      if (!this.finished) signal("SIGKILL");
    }
    await within(this.completion, 5_000, `Owned ${this.label} did not stop`);
  }
}

export async function reserveLocalPorts(requested: readonly number[]) {
  if (requested.length === 0 || new Set(requested).size !== requested.length
      || requested.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error("Expected distinct explicit local QA ports");
  }
  const reservations = new Map<number, ReturnType<typeof createServer>>();
  try {
    for (const port of requested) {
      const server = createServer((socket) => socket.destroy());
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
      });
      reservations.set(port, server);
    }
  } catch (cause) {
    await Promise.all([...reservations.values()].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    throw new Error("Required QA ports are occupied; existing services will not be reused or stopped", { cause });
  }
  return {
    async release(port: number) {
      const server = reservations.get(port);
      if (!server) return;
      reservations.delete(port);
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
    async close() {
      for (const port of [...reservations.keys()]) await this.release(port);
    },
  };
}

export function reservePayrollPorts() {
  return reserveLocalPorts([3126, 5326, 54334, 54335]);
}

export async function waitForHttp(origin: string, process: Pick<ManagedProcess, "assertRunning">, timeoutMs: number) {
  if (!["http://127.0.0.1:54334", "http://127.0.0.1:3126", "http://127.0.0.1:3261"].includes(origin)) throw new Error("Refusing an unowned readiness target");
  const rest = origin === "http://127.0.0.1:54334";
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    process.assertRunning();
    try {
      const response = await fetch(rest ? origin : `${origin}/login`,
        { redirect: "error", signal: AbortSignal.timeout(1_000) });
      const expected = rest ? 401 : 200;
      if (response.status === expected) {
        await response.body?.cancel();
        process.assertRunning();
        return;
      }
      await response.body?.cancel();
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (!(error instanceof TypeError || (error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name))
          || ["ECONNREFUSED", "ConnectionRefused", "ECONNRESET", "UND_ERR_CONNECT_TIMEOUT"].includes(String(code)))) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Owned readiness deadline exceeded for port ${new URL(origin).port}`);
}
