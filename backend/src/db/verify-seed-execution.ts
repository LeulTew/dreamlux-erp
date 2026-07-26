import { Client } from "pg";
import { applySeed } from "../lib/seed-demo-additive-core";

/**
 * Executes the additive demo seed against a real database and then ROLLS BACK.
 *
 * Why this exists: the seed shipped referencing 22 column names that do not exist, two status
 * values that violate CHECK constraints, and three broken parameter lists. Nothing caught it.
 * The unit tests mock `pg`, and the built-in dry-run only probes that tables/objects exist,
 * which cannot see a column mismatch, a type error, or a foreign-key ordering problem.
 *
 * Here every statement is genuinely planned and run by Postgres, so all of that is exercised
 * for real. The seed's own COMMIT is rewritten to ROLLBACK, so nothing is persisted - this is
 * safe to point at production and is how the fix was validated.
 *
 *   bun run verify:seed-execution
 */
export async function verifySeedExecution(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let reachedCommit = false;
  let failedSql = "";
  let failedParams: unknown;

  const rollbackOnly = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "query") return Reflect.get(target, prop, receiver);
      return (sql: unknown, params?: unknown) => {
        if (typeof sql === "string" && sql.trim().toUpperCase() === "COMMIT") {
          reachedCommit = true;
          return (target as any).query("ROLLBACK");
        }
        return (target as any).query(sql, params).catch((error: unknown) => {
          // Capture here: applySeed's own catch issues a ROLLBACK straight after, which
          // would otherwise hide which statement actually failed.
          if (!failedSql) {
            failedSql = typeof sql === "string" ? sql : JSON.stringify(sql);
            failedParams = params;
          }
          throw error;
        });
      };
    },
  });

  try {
    await applySeed(rollbackOnly as any);
    if (!reachedCommit) throw new Error("Seed returned without reaching COMMIT");
    console.log("[VerifySeed] Seed executed against the live schema and was rolled back. Nothing persisted.");
  } catch (error: any) {
    console.error("[VerifySeed] FAILED:", error.message);
    if (error.detail) console.error("  detail:", error.detail);
    if (error.constraint) console.error("  constraint:", error.constraint);
    if (failedSql) {
      console.error("  statement:", failedSql.trim().slice(0, 400));
      console.error("  params:", JSON.stringify(failedParams));
    }
    throw error;
  } finally {
    // Belt and braces: never leave an open transaction holding writes.
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

if (require.main === module) {
  verifySeedExecution()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
