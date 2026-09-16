export type PayrollMutationFailure = { message: string; needsReload: boolean };
export type PayrollMutationStatus = "DRAFT" | "FINALIZED" | "FLAGGED_WRONG" | "TRASH";
export type PayrollRunAcknowledgement<Status extends PayrollMutationStatus = PayrollMutationStatus> =
  Record<string, unknown> & { id: string; status: Status };
export type PayrollDeleteAcknowledgement = Record<string, unknown> & { success: true; id?: string };

export class PayrollAcknowledgementError extends Error {
  readonly outcomeUncertain = true;

  constructor() {
    super("The payroll change could not be confirmed. Reload and check payroll history before retrying.");
    this.name = "PayrollAcknowledgementError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPayrollId(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAcknowledgement(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !("error" in value)
    && (!("outcome_uncertain" in value) || value.outcome_uncertain === false)
    && (!("success" in value) || value.success === true);
}

export function validatePayrollRunAcknowledgement<Status extends PayrollMutationStatus>(
  data: unknown, status: Status, requestedId?: string,
): PayrollRunAcknowledgement<Status> {
  if (!isAcknowledgement(data) || !isPayrollId(data.id) || data.status !== status
      || (requestedId !== undefined && data.id.toLowerCase() !== requestedId.toLowerCase())) {
    throw new PayrollAcknowledgementError();
  }
  return { ...data, id: data.id, status };
}

export function validatePayrollDeleteAcknowledgement(data: unknown, requestedId: string): PayrollDeleteAcknowledgement {
  if (!isAcknowledgement(data) || data.success !== true) throw new PayrollAcknowledgementError();
  // Older legitimate delete responses omit the ID; never invent one for them.
  if (!("id" in data)) return { ...data, success: true };
  if (!isPayrollId(data.id) || data.id.toLowerCase() !== requestedId.toLowerCase()) throw new PayrollAcknowledgementError();
  return { ...data, success: true, id: data.id };
}

export function extractPayrollHttpError(error: unknown) {
  const response = isRecord(error) && isRecord(error.response) ? error.response : null;
  const status = typeof response?.status === "number" && Number.isInteger(response.status)
    && response.status >= 100 && response.status <= 599 ? response.status : null;
  const data = isRecord(response?.data) ? response.data : null;
  const message = typeof data?.error === "string" && data.error.trim() ? data.error.trim() : null;
  const outcomeUncertain = typeof data?.outcome_uncertain === "boolean" ? data.outcome_uncertain : undefined;
  return { status, message, outcomeUncertain };
}

export function getPayrollMutationFailure(error: unknown, fallback: string): PayrollMutationFailure {
  if (error instanceof PayrollAcknowledgementError) return { message: error.message, needsReload: true };
  const { status, message, outcomeUncertain } = extractPayrollHttpError(error);
  // Missing or gateway acknowledgements cannot prove a financial write failed.
  const needsReload = status === null || status === 502 || status === 504
    || outcomeUncertain === true || (status >= 500 && outcomeUncertain !== false);
  return { message: message ?? fallback, needsReload };
}
