export function serializeEventCivilDates(event: Record<string, unknown>): Record<string, unknown> {
  const serialized = { ...event };
  for (const field of ["start_date", "end_date"]) {
    const value = serialized[field];
    if (!(value instanceof Date)) continue;
    if (!Number.isFinite(value.getTime())) throw new Error(`Invalid event ${field}`);
    // pg parses DATE at server-local midnight; it is not a UTC instant.
    serialized[field] = [
      String(value.getFullYear()).padStart(4, "0"),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }
  return serialized;
}
