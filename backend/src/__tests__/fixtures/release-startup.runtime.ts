import { mock } from "bun:test";
import request from "supertest";

Object.assign(process.env, {
  NODE_ENV: "production",
  JWT_SECRET: "synthetic-dreamlux-startup-test",
  DATABASE_URL: "postgresql://127.0.0.1:1/dreamlux_startup_test",
  SUPABASE_URL: "http://127.0.0.1:1",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-dreamlux-startup-key",
});

function denyDatabaseAccess(): never {
  throw new Error("Unmocked database or provider access during isolated startup verification");
}
globalThis.fetch = Object.assign(denyDatabaseAccess, { preconnect: denyDatabaseAccess });
mock.module("pg", () => ({ Client: denyDatabaseAccess, Pool: denyDatabaseAccess }));
mock.module("../../db/supabase", () => ({
  supabase: { from: denyDatabaseAccess, rpc: denyDatabaseAccess, storage: { from: denyDatabaseAccess } },
}));

let startupMigrations = 0;
let permissionListenerStarts = 0;
const queries: string[] = [];
mock.module("../../db/startup-migration", () => ({
  runStartupMigrations: async () => { startupMigrations += 1; },
}));
mock.module("../../lib/permissions-cache-listener", () => ({
  startPermissionCacheInvalidationListener: async () => { permissionListenerStarts += 1; },
}));
mock.module("../../db/pool", () => ({
  pool: {
    connect: denyDatabaseAccess,
    query: async (sql: string) => {
      queries.push(sql);
      if (sql !== "SELECT 1") throw new Error("Unexpected SQL during startup/health verification");
      return { rows: [{ ok: 1 }] };
    },
  },
}));

async function verifyStartup() {
  const app = (await import("../../index")).default;
  const startupQueries = [...queries];
  queries.length = 0;
  const health = await request(app).get("/health");
  const healthQueries = [...queries];
  queries.length = 0;
  const session = await request(app).get("/auth/me");
  await Bun.write(Bun.stdout, `${JSON.stringify({
    startupMigrations,
    startupQueries,
    permissionListenerStarts,
    health: { status: health.status, body: health.body, queries: healthQueries },
    session: { status: session.status, queries: [...queries] },
  })}\n`);
  process.exit(0);
}

void verifyStartup().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
