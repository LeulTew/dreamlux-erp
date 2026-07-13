export type PayrollPeriodType = string;

export type PayrollRunLike = {
  id: string;
  status: "DRAFT" | "FINALIZED" | "FLAGGED_WRONG" | "TRASH";
  year: number;
  month: number;
  period_start: string;
  period_end: string;
};

export function matchesPayrollPeriod(
  run: PayrollRunLike,
  year: number,
  month: number,
  periodType: PayrollPeriodType,
  startDate?: string,
  endDate?: string
): boolean {
  if (startDate && endDate) {
    return run.period_start === startDate && run.period_end === endDate;
  }

  if (run.year !== year || run.month !== month) return false;

  if (periodType === "h1") {
    return run.period_start.endsWith("-01") && run.period_end.endsWith("-15");
  }

  if (periodType === "h2") {
    return run.period_start.endsWith("-16");
  }

  return false;
}

export function findRunForPeriod(
  runs: PayrollRunLike[] | undefined,
  status: PayrollRunLike["status"],
  year: number,
  month: number,
  periodType: PayrollPeriodType,
  startDate?: string,
  endDate?: string
): PayrollRunLike | null {
  if (!runs || runs.length === 0) return null;

  return (
    runs.find((run) => run.status === status && matchesPayrollPeriod(run, year, month, periodType, startDate, endDate)) ||
    null
  );
}
