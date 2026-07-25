import type { Employee } from "./types";

export type CompensationMode = "regular" | "commission_only";
export type PayrollEventLine = {
  event_type_id: string;
  quantity: number;
  price_override: number | null;
  override_reason: string | null;
};

export function normalizeCompensationMode(value: unknown): CompensationMode {
  return value === "commission_only" ? "commission_only" : "regular";
}

export function resolvePayrollBaseSalary(employee: Pick<Employee, "compensation_mode" | "base_salary">, salaryLevelAmount?: number): number {
  if (normalizeCompensationMode(employee.compensation_mode) === "commission_only") return 0;
  const amount = salaryLevelAmount ?? Number(employee.base_salary ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function mapEligibleCommissions(lines: Array<{
  employee_id: string;
  event_type_id: string;
  quantity: number;
  commission_total: number;
}>): Record<string, PayrollEventLine[]> {
  const mapped: Record<string, PayrollEventLine[]> = {};
  for (const line of lines) {
    (mapped[line.employee_id] ??= []).push({
      event_type_id: line.event_type_id,
      quantity: 1,
      price_override: line.commission_total,
      override_reason: `Verified attendance across ${line.quantity} event(s)`,
    });
  }
  return mapped;
}
