import type { Response } from "express";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { pool } from "../db/pool";

export class FinanceMutationError extends Error {
  readonly status: number;
  readonly outcomeUncertain: boolean;
  readonly code?: string;

  constructor(status: number, message: string, options: { outcomeUncertain?: boolean; code?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "FinanceMutationError";
    this.status = status;
    this.outcomeUncertain = options.outcomeUncertain ?? false;
    this.code = options.code;
  }
}

type FinanceTransactionOptions = {
  /** Operator-facing subject, e.g. "Operational expense change". */
  subject: string;
  /** Maps a known pre-commit failure to an explicit response. */
  classify?: (error: unknown) => FinanceMutationError | null;
};

export function acknowledgeRows<R extends QueryResultRow>(result: QueryResult<R>, expected: number, label: string): R[] {
  if (result.rowCount !== expected) throw new Error(`${label} was not acknowledged`);
  return result.rows;
}

export function acknowledgeRow<R extends QueryResultRow>(result: QueryResult<R>, label: string): R {
  const rows = acknowledgeRows(result, 1, label);
  if (rows.length !== 1) throw new Error(`${label} was not acknowledged`);
  return rows[0];
}

function preCommitFailure(options: FinanceTransactionOptions, error: unknown): FinanceMutationError {
  if (error instanceof FinanceMutationError) return error;
  const classified = options.classify?.(error);
  if (classified) return classified;
  const message = error instanceof Error && error.message ? error.message : "Internal server error";
  return new FinanceMutationError(500, message, { cause: error });
}

function uncertainCommit(options: FinanceTransactionOptions, error: unknown): FinanceMutationError {
  return new FinanceMutationError(503, `${options.subject} could not be confirmed. Reload before retrying.`, {
    outcomeUncertain: true,
    code: "FINANCE_OUTCOME_UNCERTAIN",
    cause: error,
  });
}

/**
 * Owns one finance transaction: business writes and their required audit rows
 * commit together. A failed or unacknowledged COMMIT is reported as uncertain
 * and never retried; a connection whose transaction state is unknown is
 * discarded instead of being returned to the pool.
 */
export async function runFinanceTransaction<T>(
  options: FinanceTransactionOptions,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw preCommitFailure(options, error);
  }
  let committing = false;
  let discard = false;
  let outcome: { value: T } | { error: FinanceMutationError };
  try {
    await client.query("BEGIN");
    const value = await operation(client);
    committing = true;
    await client.query("COMMIT");
    outcome = { value };
  } catch (error) {
    discard = committing;
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
      console.error(`[finance-transaction] ${options.subject}: rollback failed; discarding connection`);
    }
    // Without an attempted COMMIT the transaction cannot have committed, even
    // when its ROLLBACK acknowledgement was lost.
    outcome = { error: committing ? uncertainCommit(options, error) : preCommitFailure(options, error) };
  }
  try {
    client.release(discard);
  } catch (error) {
    console.error(`[finance-transaction] ${options.subject}: connection release failed`, error);
  }
  if ("error" in outcome) throw outcome.error;
  return outcome.value;
}

export function sendFinanceMutationFailure(
  res: Response,
  logLabel: string,
  error: unknown,
  describe: (failure: FinanceMutationError) => unknown = (failure) => failure.cause ?? failure,
): void {
  const failure = error instanceof FinanceMutationError ? error : preCommitFailure({ subject: logLabel }, error);
  if (failure.status >= 500) console.error(`[${logLabel}] Error:`, describe(failure));
  const body: Record<string, unknown> = { error: failure.message };
  if (failure.code) body.code = failure.code;
  if (failure.status >= 500) body.outcome_uncertain = failure.outcomeUncertain;
  res.status(failure.status).json(body);
}
