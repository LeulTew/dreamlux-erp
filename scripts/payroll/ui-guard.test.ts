import { describe, expect, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Script } from "node:vm";
import { repositoryRoot } from "./files";

async function guard(serve: boolean, serverPorts?: number[]) {
  const calls: string[] = [];
  const diagnostics: string[] = [];
  class Socket { connect() { calls.push("TCP"); return this; } }
  const http = { request: () => { calls.push("HTTP"); }, get: () => { calls.push("HTTP"); } };
  const https = { request: () => { calls.push("HTTPS"); }, get: () => { calls.push("HTTPS"); } };
  const tls = { connect: () => { calls.push("TLS"); return new Socket(); } };
  const modules: Record<string, unknown> = {
    "node:http": http, "node:https": https, "node:net": { Socket }, "node:tls": tls,
    "node:async_hooks": { AsyncLocalStorage },
  };
  const exported: { exports: unknown } = { exports: undefined };
  const context = {
    module: exported, URL, Request,
    require: (name: string) => {
      if (!Object.hasOwn(modules, name)) throw new Error("Unexpected guard dependency");
      return modules[name];
    },
    process: { stderr: { write: (value: string) => { diagnostics.push(value); } } },
    fetch: (_input: unknown, init: unknown) => { calls.push("fetch"); return Promise.resolve(init); },
    WebSocket: class {},
  };
  new Script(await readFile(join(repositoryRoot, "scripts", "payroll", "ui-http-guard.cjs"), "utf8")).runInNewContext(context);
  if (typeof exported.exports !== "function") throw new Error("Missing network guard installer");
  exported.exports(serve, serverPorts);
  return { context, calls, diagnostics, http, https, tls, Socket };
}

describe("UI transport guard with no real sockets or HTTP", () => {
  test("builds can fetch reviewed font GETs but cannot use a currently running local API", async () => {
    const wrapped = await guard(false);
    await expect(wrapped.context.fetch("https://fonts.googleapis.com/css2?family=Inter", {})).resolves.toEqual({ redirect: "error" });
    expect(() => wrapped.context.fetch("http://127.0.0.1:5326/payroll/runs", {})).toThrow("blocked");
    expect(() => wrapped.context.fetch("https://fonts.googleapis.com", { method: "POST" })).toThrow("blocked");
    expect(wrapped.calls).toEqual(["fetch"]);
  });
  test("servers permit only owned loopback HTTP and force no redirect following", async () => {
    const wrapped = await guard(true);
    await expect(wrapped.context.fetch("http://127.0.0.1:5326/payroll/runs", { redirect: "follow" })).resolves.toEqual({ redirect: "error" });
    expect(() => wrapped.context.fetch("https://fonts.googleapis.com/css2", {})).toThrow("blocked");
    expect(() => wrapped.context.fetch("https://unapproved.invalid", {})).toThrow("blocked");
    expect(() => wrapped.context.fetch("http://127.0.0.1:55434", {})).toThrow("blocked");
    expect(wrapped.calls).toEqual(["fetch"]);
  });
  test("raw TCP, TLS and WebSocket callers cannot bypass the HTTP policy", async () => {
    const wrapped = await guard(true);
    expect(() => new wrapped.Socket().connect()).toThrow("blocked");
    expect(() => wrapped.tls.connect()).toThrow("blocked");
    expect(() => new wrapped.context.WebSocket()).toThrow("blocked");
    expect(wrapped.calls).toEqual([]);
    expect(wrapped.diagnostics).toHaveLength(3);
  });
  test("mocked import UI permits only its own port, not payroll API or REST services", async () => {
    const wrapped = await guard(true, [3261]);
    await expect(wrapped.context.fetch("http://127.0.0.1:3261/login", {})).resolves.toEqual({ redirect: "error" });
    for (const port of [3126, 5326, 54334, 54335, 55434]) {
      expect(() => wrapped.context.fetch(`http://127.0.0.1:${port}`, {})).toThrow("blocked");
    }
    expect(wrapped.calls).toEqual(["fetch"]);
    await expect(guard(true, [0])).rejects.toThrow("explicit valid loopback ports");
  });
});
