export function getPeriodTitle(year: number, month: number, periodType: "full" | "h1" | "h2"): string {
  const monthStr = String(month).padStart(2, "0");
  if (periodType === "h1") return `Payroll ${year}-${monthStr} H1`;
  if (periodType === "h2") return `Payroll ${year}-${monthStr} H2`;
  return `Payroll ${year}-${monthStr}`;
}

export function isPayrollDay(date: Date): boolean {
  const day = date.getDate();
  const nextDay = new Date(date);
  nextDay.setDate(day + 1);
  const isLast = nextDay.getMonth() !== date.getMonth();
  
  return day === 1 || day === 15 || isLast;
}
