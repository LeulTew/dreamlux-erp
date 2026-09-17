import type { PayrollGenerateRequest } from "./types";

export type PayrollPreviewPeriodKind = NonNullable<PayrollGenerateRequest["period_kind"]>;

export type PayrollPreviewLine = Readonly<{
  employee_id: string;
  employee_code_snapshot: string | null;
  employee_name_snapshot: string;
  compensation_mode_snapshot: "regular" | "commission_only";
  snapshot_base_salary: number;
  total_events_value: number;
  total_line_pay: number;
}>;

export type PayrollPreview = Readonly<{
  period_start: string;
  period_end: string;
  period_kind: PayrollPreviewPeriodKind;
  total_payroll_value: number;
  employee_lines: readonly PayrollPreviewLine[];
  base_total: number;
  commission_total: number;
}>;

type PreviewPayload = Readonly<Omit<PayrollGenerateRequest, "employeeLineEvents"> & {
  employeeLineEvents: readonly Readonly<{
    employee_id: string;
    events: readonly Readonly<PayrollGenerateRequest["employeeLineEvents"][number]["events"][number]>[];
  }>[];
}>;

export type PayrollPreviewRequest = Readonly<{
  sequence: number;
  userId: string;
  contextKey: string;
  periodStart: string;
  periodEnd: string;
  periodKind: PayrollPreviewPeriodKind;
  payload: PreviewPayload;
}>;

export function capturePayrollPreviewRequest(
  request: Omit<PayrollPreviewRequest, "payload"> & { payload: PayrollGenerateRequest },
): PayrollPreviewRequest {
  return Object.freeze({
    ...request,
    payload: Object.freeze({
      ...request.payload,
      employeeLineEvents: Object.freeze(request.payload.employeeLineEvents.map((line) => Object.freeze({
        ...line,
        events: Object.freeze(line.events.map((event) => Object.freeze({ ...event }))),
      }))),
    }),
  });
}

export class InvalidPayrollPreviewError extends Error {
  constructor() {
    super("Payroll preview could not be verified");
    this.name = "InvalidPayrollPreviewError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function moneyCents(value: unknown, additionCount = 1): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new InvalidPayrollPreviewError();
  const scaled = value * 100;
  const cents = Math.round(scaled);
  // Bound accumulated arithmetic noise by the number of operations, never by
  // a percentage of payroll. The absolute cap is one hundredth of a cent.
  const tolerance = Math.min(0.01, Number.EPSILON * Math.max(1, Math.abs(scaled)) * Math.max(4, additionCount * 2));
  if (!Number.isSafeInteger(cents) || Math.abs(scaled - cents) > tolerance) throw new InvalidPayrollPreviewError();
  return cents === 0 ? 0 : cents;
}

export function parsePayrollPreview(value: unknown): PayrollPreview {
  if (!isRecord(value) || "error" in value || !Array.isArray(value.employee_lines)
      || typeof value.period_start !== "string" || typeof value.period_end !== "string"
      || !validPreviewPeriod(value.period_start, value.period_end)) throw new InvalidPayrollPreviewError();
  const kind = value.period_kind;
  if (kind !== "month" && kind !== "half_month" && kind !== "weekly" && kind !== "range") throw new InvalidPayrollPreviewError();

  const seen = new Set<string>();
  let additionCount = 0;
  let baseCents = 0;
  let commissionCents = 0;
  let lineTotalCents = 0;
  const lines = value.employee_lines.map((row: unknown): PayrollPreviewLine => {
    if (!isRecord(row) || typeof row.employee_id !== "string" || !row.employee_id.trim()
        || seen.has(row.employee_id) || typeof row.employee_name_snapshot !== "string" || !row.employee_name_snapshot.trim()) {
      throw new InvalidPayrollPreviewError();
    }
    const mode = row.compensation_mode_snapshot;
    if (mode !== "regular" && mode !== "commission_only") throw new InvalidPayrollPreviewError();
    if (row.employee_code_snapshot !== undefined && row.employee_code_snapshot !== null
        && (typeof row.employee_code_snapshot !== "string" || !row.employee_code_snapshot.trim())) {
      throw new InvalidPayrollPreviewError();
    }
    seen.add(row.employee_id);
    const eventCount = Array.isArray(row.events) ? row.events.length : 0;
    additionCount += eventCount + 2;
    const base = moneyCents(row.snapshot_base_salary);
    const commission = moneyCents(row.total_events_value, eventCount);
    const lineTotal = moneyCents(row.total_line_pay, eventCount + 1);
    if ((mode === "commission_only" && base !== 0) || lineTotal !== base + commission) throw new InvalidPayrollPreviewError();
    baseCents += base;
    commissionCents += commission;
    lineTotalCents += lineTotal;
    return Object.freeze({
      employee_id: row.employee_id,
      employee_name_snapshot: row.employee_name_snapshot,
      employee_code_snapshot: typeof row.employee_code_snapshot === "string" ? row.employee_code_snapshot : null,
      compensation_mode_snapshot: mode,
      snapshot_base_salary: base / 100,
      total_events_value: commission / 100,
      total_line_pay: lineTotal / 100,
    });
  });
  const total = moneyCents(value.total_payroll_value, additionCount + lines.length);
  if (!Number.isSafeInteger(lineTotalCents) || total !== lineTotalCents) throw new InvalidPayrollPreviewError();
  return Object.freeze({
    period_start: value.period_start,
    period_end: value.period_end,
    period_kind: kind,
    total_payroll_value: total / 100,
    employee_lines: Object.freeze(lines),
    base_total: baseCents / 100,
    commission_total: commissionCents / 100,
  });
}

export function validPreviewPeriod(start: string, end: string): boolean {
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  return valid(start) && valid(end) && start <= end;
}
