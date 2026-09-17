import { capturePayrollPreviewRequest, type PayrollPreviewLine, type PayrollPreviewRequest } from "@/lib/payroll-preview";
import type { PayrollGenerateRequest } from "@/lib/types";

export const previewUserId = "23300000-0000-4000-8000-000000000001";
export const previewEmployeeId = (index: number) => `23300000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`;
export const previewPeriod = { period_start: "2026-04-01", period_end: "2026-04-30", period_kind: "month" as const };

type FixtureLine = { -readonly [Field in keyof PayrollPreviewLine]: PayrollPreviewLine[Field] } & {
  events: Array<{ quantity: number; price_applied: number; total_price_for_type: number }>;
};

export function previewResult(count = 2) {
  const employee_lines = Array.from({ length: count }, (_, index): FixtureLine => {
    const regular = index % 2 === 0;
    return {
      employee_id: previewEmployeeId(index),
      employee_code_snapshot: `SYNTHETIC-${index + 1}`,
      employee_name_snapshot: `Synthetic ${regular ? "Planner" : "Team Leader"} ${index + 1}`,
      compensation_mode_snapshot: regular ? "regular" : "commission_only",
      snapshot_base_salary: regular ? 14500 : 0,
      total_events_value: regular ? 0 : 2500,
      total_line_pay: regular ? 14500 : 2500,
      events: regular ? [] : [
        { quantity: 1, price_applied: 2000, total_price_for_type: 2000 },
        { quantity: 1, price_applied: 500, total_price_for_type: 500 },
      ],
    };
  });
  return {
    ...previewPeriod, month: 4, year: 2026, employee_lines,
    total_payroll_value: employee_lines.reduce((total, line) => total + line.total_line_pay, 0),
  };
}

export function previewRequest(overrides: Partial<Omit<PayrollPreviewRequest, "payload">> & { payload?: PayrollGenerateRequest } = {}) {
  return capturePayrollPreviewRequest({
    sequence: 1, userId: previewUserId, contextKey: "synthetic-month",
    periodStart: previewPeriod.period_start, periodEnd: previewPeriod.period_end, periodKind: "month",
    payload: { month: 4, year: 2026, ...previewPeriod, employeeLineEvents: [] },
    ...overrides,
  });
}
