function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * True when a failed finance write may still have committed: the server said so
 * explicitly, a gateway lost the reply, or no response arrived at all. Callers
 * refresh the register instead of retrying, so the operator verifies the
 * persisted state before any resubmission.
 */
export function isFinanceOutcomeUncertain(error: unknown): boolean {
  const response = isRecord(error) && isRecord(error.response) ? error.response : null;
  if (!response || typeof response.status !== "number") return true;
  const data = isRecord(response.data) ? response.data : null;
  if (data?.outcome_uncertain === true) return true;
  if (response.status === 502 || response.status === 504) return true;
  return response.status >= 500 && data?.outcome_uncertain !== false;
}
