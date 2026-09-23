import { afterAll, expect, mock } from "bun:test";
import http from "node:http";
import net from "node:net";
import tls from "node:tls";
import { TEST_ADMIN_PASSWORD, TEST_JWT_SECRET, TEST_MANAGER_PASSWORD } from "../../backend/src/__tests__/auth-test-config";

for (const name of Object.keys(process.env)) {
  if (/^(?:DATABASE|DIRECT_DATABASE|PG|POSTGRES|PGRST|SUPABASE|NEXT_PUBLIC_|JWT|ADMIN_PASSWORD|MANAGER_PASSWORD|DREAMLUX_NATIVE_|DREAMLUX_TEST_|DREAMLUX_BACKUP_|DREAMLUX_STORAGE_|DREAMLUX_EQUIPMENT_)/i.test(name)) delete process.env[name];
}
Object.assign(process.env, {
  NODE_ENV: "test", JWT_SECRET: TEST_JWT_SECRET, ADMIN_PASSWORD: TEST_ADMIN_PASSWORD, MANAGER_PASSWORD: TEST_MANAGER_PASSWORD,
  DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/dreamlux_unit_only",
  SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_SERVICE_ROLE_KEY: "synthetic-offline-unit-key",
});
mock.module("dotenv", () => ({ config: () => ({ parsed: {} }), default: { config: () => ({ parsed: {} }) } }));
mock.module("dotenv/config", () => ({}));

const denied: string[] = [];
const servers = new Set<http.Server>();
const original = {
  fetch: globalThis.fetch, socketConnect: net.Socket.prototype.connect,
  tlsConnect: tls.connect, listen: http.Server.prototype.listen,
};
function deny(kind: string): never {
  denied.push(kind);
  throw new Error(`Offline verification blocked ${kind} before network access`);
}
Object.defineProperty(http.Server.prototype, "listen", {
  configurable: true, writable: true,
  value: function (this: http.Server, ...args: unknown[]) {
    if (typeof args[0] === "number" && (args.length === 1 || typeof args[1] === "function")) args.splice(1, 0, "127.0.0.1");
    if (typeof args[0] !== "number" || args[1] !== "127.0.0.1") return deny("unapproved listener");
    servers.add(this);
    this.once("close", () => servers.delete(this));
    return Reflect.apply(original.listen, this, args);
  },
});
Object.defineProperty(net.Socket.prototype, "connect", {
  configurable: true, writable: true,
  value: function (this: net.Socket, ...args: unknown[]) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const options = first && typeof first === "object" ? first : { port: first, host: typeof args[1] === "string" ? args[1] : "localhost" };
    const host = "host" in options && typeof options.host === "string" ? options.host : "localhost";
    const port = "port" in options ? Number(options.port) : NaN;
    const owned = [...servers].some((server) => {
      const address = server.address();
      return address && typeof address === "object" && address.port === port;
    });
    if (!["127.0.0.1", "localhost", "::1"].includes(host) || !owned) return deny("unowned TCP connection");
    return Reflect.apply(original.socketConnect, this, args);
  },
});
Object.defineProperty(tls, "connect", { configurable: true, writable: true, value: () => deny("TLS connection") });
globalThis.fetch = Object.assign(() => deny("fetch"), { preconnect: () => deny("fetch preconnect") });
afterAll(() => {
  globalThis.fetch = original.fetch;
  net.Socket.prototype.connect = original.socketConnect;
  tls.connect = original.tlsConnect;
  http.Server.prototype.listen = original.listen;
  expect(denied).toEqual([]);
});
