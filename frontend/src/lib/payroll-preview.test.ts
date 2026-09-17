import { describe, expect, it } from "vitest";
import { previewEmployeeId, previewPeriod, previewRequest, previewResult } from "@/__tests__/payroll-preview-fixtures";
import { InvalidPayrollPreviewError, parsePayrollPreview, validPreviewPeriod } from "./payroll-preview";
import type { PayrollGenerateRequest } from "./types";

describe("authoritative payroll preview validation", () => {
  it("retains the server identities, complete amounts and canonical period without mutating its input", () => {
    const input = previewResult();
    const before = structuredClone(input);
    const result = parsePayrollPreview(input);
    expect(result).toMatchObject({ ...previewPeriod, total_payroll_value: 17000, base_total: 14500, commission_total: 2500 });
    expect(result.employee_lines).toEqual([
      {
        employee_id: previewEmployeeId(0), employee_code_snapshot: "SYNTHETIC-1", employee_name_snapshot: "Synthetic Planner 1",
        compensation_mode_snapshot: "regular", snapshot_base_salary: 14500, total_events_value: 0, total_line_pay: 14500,
      },
      {
        employee_id: previewEmployeeId(1), employee_code_snapshot: "SYNTHETIC-2", employee_name_snapshot: "Synthetic Team Leader 2",
        compensation_mode_snapshot: "commission_only", snapshot_base_salary: 0, total_events_value: 2500, total_line_pay: 2500,
      },
    ]);
    expect(input).toEqual(before);
    expect(result.employee_lines[0]).not.toBe(input.employee_lines[0]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.employee_lines)).toBe(true);
    expect(Object.isFrozen(result.employee_lines[0])).toBe(true);
  });

  it("captures a deep immutable request while leaving the existing save payload shape unchanged", () => {
    const payload: PayrollGenerateRequest = {
      month: 4, year: 2026, ...previewPeriod,
      employeeLineEvents: [{ employee_id: previewEmployeeId(0), events: [{
        event_type_id: "23300000-0000-4000-8000-000000000201",
        quantity: 1, selected_level_id: null, price_override: 2000, override_reason: null,
      }] }],
    };
    const before = structuredClone(payload);
    const captured = previewRequest({ payload });
    expect(captured.payload).toEqual(before);
    payload.month = 5;
    payload.employeeLineEvents[0].events[0].quantity = 2;
    payload.employeeLineEvents.push({ employee_id: previewEmployeeId(1), events: [] });
    expect(captured.payload).toEqual(before);
    expect(Object.isFrozen(captured.payload)).toBe(true);
    expect(Object.isFrozen(captured.payload.employeeLineEvents)).toBe(true);
    expect(Object.isFrozen(captured.payload.employeeLineEvents[0].events[0])).toBe(true);
  });

  it("accepts an explicit empty result and keeps a missing code distinct from the UUID", () => {
    expect(parsePayrollPreview(previewResult(0))).toEqual({
      ...previewPeriod, employee_lines: [], total_payroll_value: 0, base_total: 0, commission_total: 0,
    });
    const input = previewResult();
    input.employee_lines[0].employee_code_snapshot = null;
    expect(parsePayrollPreview(input).employee_lines[0]).toMatchObject({
      employee_code_snapshot: null, employee_id: previewEmployeeId(0),
    });
    const withoutCode = Object.fromEntries(Object.entries(input.employee_lines[0]).filter(([field]) => field !== "employee_code_snapshot"));
    expect(parsePayrollPreview({ ...previewResult(1), employee_lines: [withoutCode] }).employee_lines[0].employee_code_snapshot).toBeNull();
  });

  it.each(["month", "half_month", "weekly", "range"])("keeps the server's %s metadata rather than resolving a period locally", (kind) => {
    expect(parsePayrollPreview({ ...previewResult(), period_kind: kind, period_start: "2026-03-29", period_end: "2026-04-04" }))
      .toMatchObject({ period_kind: kind, period_start: "2026-03-29", period_end: "2026-04-04" });
  });

  // Arithmetic stress partitions the documented ETB 500 training total.
  // These divisional terms test floating-point accumulation, not pay/proration policy.
  const trainingPart = 500 / 5000;
  it.each([25, 250, 1000, 5000])("reconciles %i actual floating additions but rejects ETB 0.001 corruption", (count) => {
    const employee_lines = Array.from({ length: count }, (_, index) => ({
      ...previewResult(1).employee_lines[0],
      employee_id: previewEmployeeId(index), employee_code_snapshot: `SYNTHETIC-${index}`,
      total_events_value: trainingPart, total_line_pay: 14500 + trainingPart,
      events: [{ quantity: 1, price_applied: trainingPart, total_price_for_type: trainingPart }],
    }));
    const input = { ...previewPeriod, employee_lines, total_payroll_value: employee_lines.reduce((total, line) => total + line.total_line_pay, 0) };
    const result = parsePayrollPreview(input);
    expect(result.total_payroll_value).toBe(count * 1450010 / 100);
    expect(result.base_total).toBe(count * 14500);
    expect(result.commission_total).toBe(count * 10 / 100);
    expect(() => parsePayrollPreview({ ...input, total_payroll_value: input.total_payroll_value + 0.001 })).toThrow(InvalidPayrollPreviewError);
    expect(() => parsePayrollPreview({
      ...input,
      total_payroll_value: input.total_payroll_value + 0.001,
      employee_lines: [{ ...employee_lines[0], total_events_value: trainingPart + 0.001, total_line_pay: employee_lines[0].total_line_pay + 0.001 }, ...employee_lines.slice(1)],
    })).toThrow(InvalidPayrollPreviewError);
  });

  it.each([250, 1000, 5000])("allows noise from %i event totals before integer-cent reconciliation", (count) => {
    const events = Array.from({ length: count }, () => ({ quantity: 1, price_applied: trainingPart, total_price_for_type: trainingPart }));
    const commission = events.reduce((sum, event) => sum + event.total_price_for_type, 0);
    const input = {
      ...previewResult(1), total_payroll_value: 14500 + commission,
      employee_lines: [{ ...previewResult(1).employee_lines[0], events, total_events_value: commission, total_line_pay: 14500 + commission }],
    };
    expect(parsePayrollPreview(input)).toMatchObject({ total_payroll_value: (1450000 + count * 10) / 100, commission_total: count * 10 / 100 });
    expect(() => parsePayrollPreview({
      ...input, total_payroll_value: input.total_payroll_value + 0.001,
      employee_lines: [{ ...input.employee_lines[0], total_events_value: commission + 0.001, total_line_pay: input.total_payroll_value + 0.001 }],
    })).toThrow(InvalidPayrollPreviewError);
  });

  it.each([
    { label: "missing body", value: undefined },
    { label: "null body", value: null },
    { label: "HTML", value: "<html>Synthetic unavailable response</html>" },
    { label: "array body", value: [] },
    { label: "missing rows", value: { ...previewPeriod, total_payroll_value: 0 } },
    { label: "null rows", value: { ...previewPeriod, total_payroll_value: 0, employee_lines: null } },
    { label: "string total", value: { ...previewResult(0), total_payroll_value: "0" } },
    { label: "nonzero empty total", value: { ...previewResult(0), total_payroll_value: 0.01 } },
    { label: "negative total", value: { ...previewResult(0), total_payroll_value: -1 } },
    { label: "infinite total", value: { ...previewResult(0), total_payroll_value: Infinity } },
    { label: "NaN total", value: { ...previewResult(0), total_payroll_value: NaN } },
    { label: "unsafe total", value: { ...previewResult(0), total_payroll_value: Number.MAX_SAFE_INTEGER } },
    { label: "error envelope", value: { ...previewResult(), error: "Synthetic source failure" } },
    { label: "missing canonical dates", value: { total_payroll_value: 0, employee_lines: [] } },
    { label: "missing kind", value: { ...previewResult(), period_kind: undefined } },
    { label: "invalid kind", value: { ...previewResult(), period_kind: "monthly" } },
    { label: "reversed dates", value: { ...previewResult(), period_end: "2026-03-01" } },
    { label: "invalid date", value: { ...previewResult(), period_start: "2026-02-29" } },
    { label: "header mismatch", value: { ...previewResult(), total_payroll_value: 17000.01 } },
  ])("rejects $label instead of displaying fabricated zeroes", ({ value }) => {
    expect(() => parsePayrollPreview(value)).toThrow(InvalidPayrollPreviewError);
  });

  it.each([
    { label: "blank ID", changes: { employee_id: " " } },
    { label: "blank name", changes: { employee_name_snapshot: "" } },
    { label: "numeric human code", changes: { employee_code_snapshot: 233 } },
    { label: "blank human code", changes: { employee_code_snapshot: " " } },
    { label: "unknown compensation mode", changes: { compensation_mode_snapshot: "unknown" } },
    { label: "commission-only salary", changes: { compensation_mode_snapshot: "commission_only" } },
    { label: "base mismatch", changes: { snapshot_base_salary: 14500.01 } },
    { label: "negative commission", changes: { total_events_value: -1 } },
    { label: "fractional-cent base", changes: { snapshot_base_salary: 14500.001, total_line_pay: 14500.001 } },
    { label: "fractional-cent commission", changes: { total_events_value: 0.001, total_line_pay: 14500.001 } },
    { label: "string amount", changes: { snapshot_base_salary: "14500" } },
  ])("rejects a $label employee line", ({ changes }) => {
    const input = previewResult(1);
    expect(() => parsePayrollPreview({ ...input, employee_lines: [{ ...input.employee_lines[0], ...changes }] })).toThrow(InvalidPayrollPreviewError);
  });

  it("rejects duplicate employees even when the duplicated total reconciles", () => {
    const line = previewResult(1).employee_lines[0];
    expect(() => parsePayrollPreview({ ...previewPeriod, employee_lines: [line, line], total_payroll_value: 29000 })).toThrow(InvalidPayrollPreviewError);
  });

  it.each([
    { start: "2026-04-01", end: "2026-04-30", valid: true },
    { start: "2024-02-29", end: "2024-03-06", valid: true },
    { start: "2025-02-29", end: "2025-03-06", valid: false },
    { start: "2026-04-30", end: "2026-04-01", valid: false },
    { start: "2026-04-01T00:00:00Z", end: "2026-04-30", valid: false },
    { start: "", end: "2026-04-30", valid: false },
  ])("validates civil dates $start to $end without timezone relabeling", ({ start, end, valid }) => {
    expect(validPreviewPeriod(start, end)).toBe(valid);
  });
});
