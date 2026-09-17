import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import net from "node:net";
import type express from "express";
import type { Pool, PoolClient } from "pg";
import type supertest from "supertest";

// Run alone from the repository root: backend/bunfig.toml preloads a mocked pg.
const enabled = process.env.DREAM_EXPENSE_NATIVE === "1";
const suite = enabled ? describe : describe.skip;

suite("expense review native PostgreSQL", () => {
  const schema = `expense_review_${randomUUID().replaceAll("-", "")}`;
  const eventId = randomUUID();
  const expenseId = randomUUID();
  const creatorId = randomUUID();
  const approverId = randomUUID();
  const rejectorId = randomUUID();
  const secret = randomUUID();
  let database: Pool;
  let admin: PoolClient;
  let request: typeof supertest;
  let sign: typeof import("jsonwebtoken").sign;
  let server: Server | undefined;
  let apiUrl: string;
  let httpPort: number | undefined;
  const originalConnect = net.Socket.prototype.connect;
  let restoreFetch: (() => void) | undefined;
  let schemaCreated = false;
  let fault: "audit" | "write" | "commit" | "rollback" | "early-rollback" | "notification" | null = null;
  let race: {
    releaseApproval: ReturnType<typeof deferred>;
    approvalCommitted: ReturnType<typeof deferred>;
    rejectionAtUpdate: boolean;
  } | null = null;
  const leases: { pid: number; released: boolean; discarded: boolean; queries: string[] }[] = [];
  const notifications: { status: string; released: boolean }[] = [];

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
  }

  async function until(condition: () => Promise<boolean>, message: string) {
    const deadline = Date.now() + 4000;
    while (!(await condition())) {
      if (Date.now() >= deadline) throw new Error(message);
      await Bun.sleep(20);
    }
  }

  async function connect() {
    const client = await database.connect();
    let pid: number;
    try {
      await client.query(`SET search_path TO "${schema}"`);
      const { rows } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      pid = rows[0].pid;
    } catch (error) {
      client.release(true);
      throw error;
    }
    const lease = { pid, released: false, discarded: false, queries: [] as string[] };
    leases.push(lease);
    return {
      async query(sql: string, params?: unknown[]) {
        lease.queries.push(sql);
        if (race && sql.includes("UPDATE expenses")) {
          if (params?.[0] === "Approved") {
            await race.releaseApproval.promise;
          } else {
            race.rejectionAtUpdate = true;
            await race.approvalCommitted.promise;
          }
        }
        if ((fault === "audit" || fault === "rollback") && sql.includes("INSERT INTO event_logs")) {
          // A genuine server error aborts the transaction, including the prior expense UPDATE.
          return client.query("SELECT 1 / 0");
        }
        if (fault === "write" && sql.includes("UPDATE expenses")) return client.query("SELECT 1 / 0");
        const result = await client.query(sql, params);
        if (sql === "COMMIT") {
          race?.approvalCommitted.resolve();
          if (fault === "commit") throw new Error("Synthetic lost COMMIT acknowledgement");
        }
        if (sql === "ROLLBACK" && (fault === "rollback" || fault === "early-rollback")) {
          throw new Error("Synthetic lost ROLLBACK acknowledgement");
        }
        return result;
      },
      release(discard = false) {
        lease.released = true;
        lease.discarded = discard;
        client.release(discard);
      },
    };
  }

  const token = (id: string, role = "ACCOUNTANT") =>
    sign({ id, username: `reviewer-${id}`, role }, secret, { expiresIn: "5m" });

  function review(status: "Approved" | "Rejected", actor = approverId, reason = "Duplicate receipt") {
    return request(apiUrl).patch(`/events/expenses/${expenseId}/review`)
      .set("Authorization", `Bearer ${token(actor)}`)
      .send({ status, rejected_reason: reason });
  }

  async function readState() {
    const expense = await admin.query("SELECT * FROM expenses WHERE id = $1", [expenseId]);
    const logs = await admin.query("SELECT * FROM event_logs WHERE event_id = $1 ORDER BY changed_at", [eventId]);
    return { expense: expense.rows[0], logs: logs.rows };
  }

  beforeAll(async () => {
    const port = Number(process.env.DREAM_EXPENSE_PGPORT);
    const name = process.env.DREAM_EXPENSE_PGDATABASE || "";
    const user = process.env.DREAM_EXPENSE_PGUSER || "";
    const password = process.env.DREAM_EXPENSE_PGPASSWORD;
    if (port !== 55431 || name !== "dream_issue231_aa556166" ||
        user !== "dream_issue231" || !password) {
      throw new Error("Requires an owned loopback scratch database/role and dedicated non-default port");
    }
    for (const key of Object.keys(process.env)) {
      if (/^(DATABASE_|POSTGRES|PG|SUPABASE|JWT|NEXT_PUBLIC_.*SUPABASE|OTEL_|SENTRY_|VERCEL_)|SECRET|TOKEN|PASSWORD|TELEMETRY|DSN/i.test(key)) {
        delete process.env[key];
      }
    }
    // Admit only the owned database and this fixture's ephemeral loopback HTTP listener.
    net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]): net.Socket {
      const first: unknown = Array.isArray(args[0]) ? args[0][0] : args[0];
      const options = first && typeof first === "object" ? first : undefined;
      const targetPort = Number(options && "port" in options ? options.port : first);
      const host = options && "host" in options ? options.host : args[1];
      if (host !== "127.0.0.1" || (targetPort !== port && targetPort !== httpPort)) {
        throw new Error("Native expense fixture blocked an unowned network target");
      }
      return Reflect.apply(originalConnect, this, args);
    };
    const fetchGuard = spyOn(globalThis, "fetch").mockImplementation(Object.assign(
      async () => { throw new Error("Native expense fixture does not permit fetch/provider traffic"); },
      { preconnect: () => { throw new Error("Native expense fixture does not permit fetch preconnect"); } },
    ));
    restoreFetch = () => { fetchGuard.mockRestore(); };
    const { Pool: NativePool } = await import("pg");
    const { default: express } = await import("express");
    const { default: jwt } = await import("jsonwebtoken");
    request = (await import("supertest")).default;
    sign = jwt.sign;
    database = new NativePool({
      host: "127.0.0.1", port, database: name, user,
      password,
      ssl: false, max: 4, connectionTimeoutMillis: 3000,
      statement_timeout: 15000, idle_in_transaction_session_timeout: 15000,
      application_name: schema,
    });
    admin = await database.connect();
    const target = await admin.query<{
      name: string; owner: string; actor: string; address: string; port: number;
      rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean;
    }>(`
      SELECT current_database() AS name, pg_get_userbyid(d.datdba) AS owner,
             current_user AS actor, host(inet_server_addr()) AS address,
             inet_server_port() AS port, r.rolsuper, r.rolcreatedb, r.rolcreaterole
      FROM pg_database d JOIN pg_roles r ON r.rolname = current_user
      WHERE d.datname = current_database()
    `);
    const identity = target.rows[0];
    if (!identity || identity.name !== name || identity.owner !== user || identity.actor !== user ||
        identity.address !== "127.0.0.1" || identity.port !== port ||
        identity.rolsuper || identity.rolcreatedb || identity.rolcreaterole) {
      throw new Error("Scratch database endpoint, ownership or least-privilege attestation failed");
    }
    console.info("[expense-native] Target identity and least privilege verified", identity);
    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await admin.query(`SET search_path TO "${schema}"`);
    // Only dependencies of the three real schema definitions exercised by this route.
    await admin.query(`
      CREATE TABLE users (id uuid PRIMARY KEY, full_name text);
      CREATE TABLE event_types (id uuid PRIMARY KEY);
      CREATE TABLE finance_import_batches (id uuid PRIMARY KEY);
    `);
    const source = readFileSync(new URL("../src/db/schema.sql", import.meta.url), "utf8");
    const definitions = ["events", "expenses", "event_logs"].map((table) => {
      const definition = source.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`))?.[0];
      if (!definition) throw new Error(`Missing version-controlled table definition: ${table}`);
      return definition;
    });
    await admin.query(definitions.join("\n"));
    await admin.query("INSERT INTO users (id, full_name) SELECT unnest($1::uuid[]), 'Synthetic reviewer'", [
      [creatorId, approverId, rejectorId],
    ]);

    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = secret;
    mock.module("../src/db/pool", () => ({
      pool: {
        connect,
        async query(sql: string, params?: unknown[]) {
          const client = await connect();
          try { return await client.query(sql, params); } finally { client.release(); }
        },
      },
    }));
    mock.module("../src/db/supabase", () => ({
      supabase: new Proxy({}, { get() { throw new Error("Supabase is outside this native fixture"); } }),
    }));
    mock.module("../src/services/notifications-service", () => ({
      NotificationsService: {
        createNotification(params: { title: string }) {
          notifications.push({ status: params.title, released: leases.every((lease) => lease.released) });
          if (fault === "notification") throw new Error("Synthetic synchronous notification failure");
          return Promise.resolve(true);
        },
      },
    }));
    const { default: events } = await import("../src/routes/events");
    const app: express.Express = express();
    app.use(express.json());
    app.use("/events", events);
    server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing owned HTTP listener address");
    httpPort = address.port;
    apiUrl = `http://127.0.0.1:${httpPort}`;
    console.info("[expense-native] Owned HTTP listener ready", httpPort);
  });

  beforeEach(async () => {
    fault = null;
    race = null;
    leases.length = 0;
    notifications.length = 0;
    await admin.query("TRUNCATE event_logs, expenses, events");
    await admin.query(`
      INSERT INTO events (id, name, client_name, start_date, end_date, venue_location)
      VALUES ($1, 'Synthetic review event', 'Synthetic client', '2031-01-10', '2031-01-10', 'Test venue')
    `, [eventId]);
    await admin.query(`
      INSERT INTO expenses (id, event_id, category, amount, description, created_by)
      VALUES ($1, $2, 'Fuel', 1200.50, 'Synthetic receipt', $3)
    `, [expenseId, eventId, creatorId]);
  });

  afterAll(async () => {
    try {
      try {
        if (server?.listening) {
          await new Promise<void>((resolve, reject) => {
            server!.close((error) => error ? reject(error) : resolve());
          });
        }
      } finally {
        try {
          if (admin) {
            try {
              if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
            } finally {
              admin.release();
            }
          }
        } finally {
          if (database) await database.end();
        }
      }
    } finally {
      net.Socket.prototype.connect = originalConnect;
      restoreFetch?.();
    }
  });

  test("ordinary decisions preserve amount, reason, reviewer and atomic audit", async () => {
    expect((await review("Rejected", rejectorId)).status).toBe(200);
    let state = await readState();
    expect(state.expense.status).toBe("Rejected");
    expect(state.expense.approved_by).toBe(rejectorId);
    expect(state.expense.rejected_reason).toBe("Duplicate receipt");
    expect(state.expense.amount).toBe("1200.50");
    expect(state.logs[0].old_value).toStartWith("Pending (ID:");
    expect(state.logs[0].user_id).toBe(rejectorId);
    expect((await review("Approved")).status).toBe(200);
    state = await readState();
    expect(state.expense.status).toBe("Approved");
    expect(state.expense.approved_by).toBe(approverId);
    expect(state.expense.rejected_reason).toBeNull();
    expect(state.expense.approved_at).not.toBeNull();
    expect(state.logs).toHaveLength(2);
    expect(state.logs[1].old_value).toStartWith("Rejected (ID:");
    expect(state.logs[1].new_value).toBe("Approved");
    expect(notifications).toEqual([
      { status: "Expense Rejected", released: true },
      { status: "Expense Approved", released: true },
    ]);
  });

  test("concurrent approval then stale rejection preserves Approved", async () => {
    const control = {
      releaseApproval: deferred(), approvalCommitted: deferred(),
      rejectionAtUpdate: false,
    };
    race = control;
    const approval = review("Approved").then((res) => res);
    let rejection: typeof approval | undefined;
    try {
      await until(async () => leases.some((lease) => lease.queries.some((sql) => sql.includes("UPDATE expenses"))), "Approval did not reach the write barrier");
      rejection = review("Rejected", rejectorId).then((res) => res);
      await until(async () => {
        if (control.rejectionAtUpdate) return true;
        const second = leases[1];
        if (!second) return false;
        const blocked = await admin.query<{ blocked: boolean }>(
          "SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked", [second.pid],
        );
        return blocked.rows[0].blocked;
      }, "Second reviewer neither blocked nor reached the original stale write");
      control.releaseApproval.resolve();
      const first = await approval;
      const second = await rejection;
      expect(first.status).toBe(200);
      expect(second.status).toBe(409);
      const state = await readState();
      expect(state.expense.status).toBe("Approved");
      expect(state.expense.approved_by).toBe(approverId);
      expect(state.logs).toHaveLength(1);
      expect(notifications).toHaveLength(1);
      const pending = await request(apiUrl).get("/events/expenses/pending")
        .set("Authorization", `Bearer ${token(approverId)}`);
      const history = await request(apiUrl).get("/events/expenses/history")
        .set("Authorization", `Bearer ${token(approverId)}`);
      expect(pending.status).toBe(200);
      expect(pending.body.data).toHaveLength(0);
      expect(history.status).toBe(200);
      expect(history.body.data).toHaveLength(1);
      expect(history.body.data[0].id).toBe(expenseId);
      expect(history.body.data[0].status).toBe("Approved");
    } finally {
      control.releaseApproval.resolve();
      control.approvalCommitted.resolve();
      await Promise.allSettled([approval, ...(rejection ? [rejection] : [])]);
    }
  }, 12000);

  test("permissions and missing rejection reason fail before any mutation", async () => {
    const anonymous = await request(apiUrl).patch(`/events/expenses/${expenseId}/review`).send({ status: "Approved" });
    expect(anonymous.status).toBe(401);
    const forbidden = await request(apiUrl).patch(`/events/expenses/${expenseId}/review`)
      .set("Authorization", `Bearer ${token(rejectorId, "EVENT_MANAGER")}`).send({ status: "Approved" });
    expect(forbidden.status).toBe(403);
    expect((await review("Rejected", rejectorId, "")).status).toBe(400);
    expect(leases).toHaveLength(0);
    const state = await readState();
    expect(state.expense.status).toBe("Pending");
    expect(state.logs).toHaveLength(0);
  });

  test("already approved and deleted parents retain explicit rejection contracts", async () => {
    await admin.query("UPDATE expenses SET status = 'Approved' WHERE id = $1", [expenseId]);
    expect((await review("Rejected")).status).toBe(409);
    await admin.query("UPDATE events SET deleted_at = NOW() WHERE id = $1", [eventId]);
    expect((await review("Approved")).status).toBe(404);
    const state = await readState();
    expect(state.expense.status).toBe("Approved");
    expect(state.logs).toHaveLength(0);
  });

  test("a queued review rechecks a concurrently soft-deleted parent", async () => {
    await admin.query("BEGIN");
    await admin.query("UPDATE events SET deleted_at = NOW() WHERE id = $1", [eventId]);
    const response = review("Approved").then((res) => res);
    try {
      await until(async () => {
        if (leases[0]?.released) return true;
        if (!leases[0]) return false;
        const result = await admin.query<{ blocked: boolean }>(
          "SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked", [leases[0].pid],
        );
        return result.rows[0].blocked;
      }, "Review did not observe the deletion barrier");
      await admin.query("COMMIT");
      expect((await response).status).toBe(404);
      const state = await readState();
      expect(state.expense.status).toBe("Pending");
      expect(state.logs).toHaveLength(0);
    } finally {
      await admin.query("ROLLBACK");
      await response;
    }
  });

  test.each(["write", "audit", "rollback"] as const)("%s failure leaves no decision or audit", async (failure) => {
    fault = failure;
    expect((await review("Approved")).status).toBe(500);
    const state = await readState();
    expect(state.expense.status).toBe("Pending");
    expect(state.expense.approved_by).toBeNull();
    expect(state.logs).toHaveLength(0);
    expect(notifications).toHaveLength(0);
    expect(leases[0].discarded).toBe(failure === "rollback");
  });

  test("failed early rollback discards the lease without retrying it", async () => {
    fault = "early-rollback";
    await admin.query("UPDATE expenses SET status = 'Approved' WHERE id = $1", [expenseId]);
    expect((await review("Rejected")).status).toBe(500);
    expect(leases[0].discarded).toBe(true);
    expect(leases[0].queries.filter((sql) => sql === "ROLLBACK")).toHaveLength(1);
    expect((await readState()).logs).toHaveLength(0);
  });

  test("lost commit acknowledgement is uncertain even when PostgreSQL committed", async () => {
    fault = "commit";
    const response = await review("Approved");
    expect(response.status).toBe(503);
    expect(response.body.outcome_uncertain).toBe(true);
    expect(response.body.error).toContain("Reload before retrying");
    const state = await readState();
    expect(state.expense.status).toBe("Approved");
    expect(state.logs).toHaveLength(1);
    expect(notifications).toHaveLength(0);
    expect(leases[0].discarded).toBe(true);
  });

  test("notification failure cannot roll back or misreport a committed review", async () => {
    fault = "notification";
    expect((await review("Approved")).status).toBe(200);
    expect(notifications[0].released).toBe(true);
    expect(leases[0].queries).not.toContain("ROLLBACK");
    const state = await readState();
    expect(state.expense.status).toBe("Approved");
    expect(state.logs).toHaveLength(1);
  });

  test("a real parent lock wait is bounded and returns explicit reload guidance", async () => {
    await admin.query("BEGIN");
    await admin.query("SELECT id FROM events WHERE id = $1 FOR UPDATE", [eventId]);
    const response = review("Approved").then((result) => result);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        response,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Review exceeded its ten-second lock budget")), 12000);
        }),
      ]);
      expect(result.status).toBe(503);
      expect(result.body.outcome_uncertain).toBe(false);
      expect(result.body.error).toContain("Reload");
    } finally {
      clearTimeout(timer);
      await admin.query("ROLLBACK");
      await response;
    }
    expect((await readState()).expense.status).toBe("Pending");
  }, 14000);
});
