import type { Pool, PoolClient } from "pg";

// One advisory lock per overhead month orders every closure against every
// overhead writer: writers hold it shared, close/reopen hold it exclusively.
const LOCK_NAMESPACE = "finance-overhead-month";

/** Normalizes a YYYY-MM or YYYY-MM-DD value to the stored first-of-month key. */
export function overheadMonthKey(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

/**
 * Acquires the transaction-scoped month locks in ascending order, so writers
 * spanning several months (moves, imports) cannot deadlock with each other.
 * Callers must take any overhead row locks first and then these locks.
 */
export async function lockOverheadMonths(
  client: PoolClient,
  months: Iterable<string>,
  mode: "shared" | "exclusive",
): Promise<void> {
  const lock = mode === "shared" ? "pg_advisory_xact_lock_shared" : "pg_advisory_xact_lock";
  for (const month of [...new Set([...months].map(overheadMonthKey))].sort()) {
    await client.query(`SELECT ${lock}(hashtext($1), hashtext($2))`, [LOCK_NAMESPACE, month]);
  }
}

/** Returns the closed months (as YYYY-MM) among the given months, ascending. */
export async function closedOverheadMonths(client: PoolClient | Pool, months: Iterable<string>): Promise<string[]> {
  const keys = [...new Set([...months].map(overheadMonthKey))];
  if (keys.length === 0) return [];
  const result = await client.query<{ month: string }>(
    `SELECT to_char(month, 'YYYY-MM') AS month FROM finance_overhead_month_closures
     WHERE month = ANY($1::date[]) ORDER BY month`,
    [keys],
  );
  return result.rows.map((row) => row.month);
}
