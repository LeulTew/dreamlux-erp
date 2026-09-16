import { afterAll, expect, mock } from "bun:test";
import http from "node:http";
import net from "node:net";
import tls from "node:tls";
import jwt from "jsonwebtoken";
import { attestDreamluxNativeTarget } from "./dreamlux-native-target";

const adminUrl = process.env.DREAMLUX_NATIVE_TEST_ADMIN_URL;
if (!adminUrl) throw new Error("Native QA must explicitly select the owned DreamLux cluster");
attestDreamluxNativeTarget(adminUrl, "admin");
attestDreamluxNativeTarget(process.env.DATABASE_URL ?? "", "fixture");
if (process.env.DATABASE_BACKUP_URL || process.env.DATABASE_DIRECT_URL) {
  throw new Error("Native QA must not inherit a backup or alternate database");
}
if (!/^[a-f0-9]{64}$/.test(process.env.JWT_SECRET ?? "")) {
  throw new Error("Native QA requires a newly generated synthetic application secret");
}
const restSecret = process.env.DREAMLUX_TEST_REST_JWT_SECRET ?? "";
if (process.env.SUPABASE_URL !== "http://127.0.0.1:54335" || !/^[a-f0-9]{64}$/.test(restSecret)) {
  throw new Error("Native QA requires its own local REST target and generated signing secret");
}
process.env.SUPABASE_SERVICE_ROLE_KEY = jwt.sign({ role: "dreamlux_parity" }, restSecret, { expiresIn: "1h" });
process.env.NODE_ENV = "test";
mock.module("dotenv", () => ({ config: () => ({ parsed: {} }), default: { config: () => ({ parsed: {} }) } }));
mock.module("dotenv/config", () => ({}));

const denied: string[] = [];
const servers = new Set<http.Server>();
const approvedSockets = new WeakSet<net.Socket>();
const originals = {
  fetch: globalThis.fetch,
  socketConnect: net.Socket.prototype.connect,
  tlsConnect: tls.connect,
  listen: http.Server.prototype.listen,
  webSocket: globalThis.WebSocket,
};

function deny(kind: string): never {
  denied.push(kind);
  throw new Error(`DreamLux native QA blocked ${kind} before network access`);
}

function connectionOptions(args: unknown[]): { host: string; port: number } {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (first && typeof first === "object") {
    return {
      host: "host" in first && typeof first.host === "string" ? first.host : "localhost",
      port: "port" in first ? Number(first.port) : NaN,
    };
  }
  return { host: typeof args[1] === "string" ? args[1] : "localhost", port: Number(first) };
}

function ownsHttpPort(port: number) {
  return [54334, 54335].includes(port) || [...servers].some((server) => {
    const address = server.address();
    return address && typeof address === "object" && address.port === port;
  });
}

Object.defineProperty(http.Server.prototype, "listen", {
  configurable: true,
  writable: true,
  value: function (this: http.Server, ...args: unknown[]) {
    if (typeof args[0] === "number" && (args.length === 1 || typeof args[1] === "function")) {
      args.splice(1, 0, "127.0.0.1");
    }
    if (typeof args[0] !== "number" || args[1] !== "127.0.0.1") return deny("non-loopback HTTP listener");
    servers.add(this);
    this.once("close", () => servers.delete(this));
    return Reflect.apply(originals.listen, this, args);
  },
});

Object.defineProperty(net.Socket.prototype, "connect", {
  configurable: true,
  writable: true,
  value: function (this: net.Socket, ...args: unknown[]) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const socket = first && typeof first === "object" && "socket" in first ? first.socket : undefined;
    const upgradeOnly = first && typeof first === "object"
      && !("port" in first) && !("path" in first)
      && (!("host" in first) || first.host === "127.0.0.1" || first.host === "localhost");
    if (upgradeOnly && socket instanceof net.Socket && approvedSockets.has(socket)) {
      approvedSockets.add(this);
      return Reflect.apply(originals.socketConnect, this, args);
    }
    const options = connectionOptions(args);
    if (
      !["127.0.0.1", "localhost", "::1"].includes(options.host)
      || (options.port !== 55434 && !ownsHttpPort(options.port))
    ) {
      return deny("unapproved TCP connection");
    }
    approvedSockets.add(this);
    return Reflect.apply(originals.socketConnect, this, args);
  },
});

Object.defineProperty(tls, "connect", {
  configurable: true,
  writable: true,
  value: function (...args: unknown[]) {
    const first = args[0];
    const socket = first && typeof first === "object" && "socket" in first ? first.socket : undefined;
    if (!(socket instanceof net.Socket) || !approvedSockets.has(socket)) return deny("unapproved TLS connection");
    return Reflect.apply(originals.tlsConnect, tls, args);
  },
});

globalThis.fetch = Object.assign(
  (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !ownsHttpPort(Number(url.port))) {
      return deny("unapproved fetch");
    }
    return originals.fetch(input, { ...init, redirect: "error" });
  },
  { preconnect: originals.fetch.preconnect },
);
globalThis.WebSocket = new Proxy(originals.webSocket, { construct: () => deny("WebSocket") });

console.log("[native DreamLux] Only the independent local PG/REST fixtures and test-owned HTTP servers are permitted.");
afterAll(() => {
  globalThis.fetch = originals.fetch;
  net.Socket.prototype.connect = originals.socketConnect;
  tls.connect = originals.tlsConnect;
  http.Server.prototype.listen = originals.listen;
  globalThis.WebSocket = originals.webSocket;
  expect(denied).toEqual([]);
});
