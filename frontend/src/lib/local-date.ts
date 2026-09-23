import { addDays, endOfMonth, format, startOfMonth, subMonths } from "date-fns";

// toISOString() reports the UTC day, which is the previous day east of UTC
// before the local offset has elapsed (00:00-03:00 in Addis Ababa).
export function localDateString(date: Date = new Date()): string {
  return format(date, "yyyy-MM-dd");
}

export interface DateRangeParams {
  start_date: string | undefined;
  end_date: string | undefined;
}

export function eventDateRangeParams(range: string, now: Date = new Date()): DateRangeParams {
  if (range === "next_14") {
    return { start_date: localDateString(now), end_date: localDateString(addDays(now, 14)) };
  }
  if (range === "this_month") {
    return { start_date: localDateString(startOfMonth(now)), end_date: localDateString(endOfMonth(now)) };
  }
  if (range === "last_month") {
    const previous = subMonths(now, 1);
    return { start_date: localDateString(startOfMonth(previous)), end_date: localDateString(endOfMonth(previous)) };
  }
  return { start_date: undefined, end_date: undefined };
}
