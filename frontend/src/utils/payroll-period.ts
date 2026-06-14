export type PayrollPeriodType = "h1" | "h2";

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
  periodType: PayrollPeriodType
): boolean {
  if (run.year !== year || run.month !== month) return false;

  if (periodType === "h1") {
    return run.period_start.endsWith("-01") && run.period_end.endsWith("-15");
  }

  return run.period_start.endsWith("-16");
}

export function findRunForPeriod(
  runs: PayrollRunLike[] | undefined,
  status: PayrollRunLike["status"],
  year: number,
  month: number,
  periodType: PayrollPeriodType
): PayrollRunLike | null {
  if (!runs || runs.length === 0) return null;

  return (
    runs.find((run) => run.status === status && matchesPayrollPeriod(run, year, month, periodType)) ||
    null
  );
}
