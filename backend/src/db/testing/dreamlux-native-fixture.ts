import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { attestDreamluxNativeTarget, dreamluxFixtureTarget } from "./dreamlux-native-target";

export function reviewedSchemaTables(schema: string, tables: readonly string[]): string[] {
  return tables.map((table) => {
    if (!/^[a-z_]+$/.test(table)) throw new Error("Invalid reviewed fixture table name");
    const matches = [...schema.matchAll(new RegExp(`^CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?^\\);`, "gm"))];
    if (matches.length !== 1) throw new Error(`Expected one reviewed DreamLux DDL definition for ${table}`);
    return matches[0][0];
  });
}

export async function createDreamluxNativeFixture(adminUrl: string, purpose: string, ddl: string) {
  const adminTarget = attestDreamluxNativeTarget(adminUrl, "admin");
  const target = dreamluxFixtureTarget(adminUrl, `${purpose}_${randomBytes(6).toString("hex")}`);
  const admin = new Client({ connectionString: adminTarget.href, ssl: { rejectUnauthorized: false } });
  const database = target.pathname.slice(1);
  await admin.connect();
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const client = new Client({ connectionString: target.href, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      await client.query(ddl);
    } finally {
      await client.end();
    }
  } catch (error) {
    if (created) {
      try {
        await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "DreamLux fixture setup and cleanup both failed", { cause: cleanupError });
      }
    }
    throw error;
  } finally {
    await admin.end();
  }
  return {
    url: target.href,
    async dispose() {
      attestDreamluxNativeTarget(target.href, "fixture");
      const cleanup = new Client({ connectionString: adminTarget.href, ssl: { rejectUnauthorized: false } });
      await cleanup.connect();
      try {
        await cleanup.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
