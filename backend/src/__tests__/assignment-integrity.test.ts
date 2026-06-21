import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const migrationSql = readFileSync(
  join(process.cwd(), "src/db/migrations/assignment_integrity.sql"),
  "utf8",
);

describe("assignment integrity migration", () => {
  test("installs database triggers for employee and vehicle assignment writes", () => {
    expect(migrationSql).toContain("trg_prevent_event_assignment_overlap");
    expect(migrationSql).toContain("trg_prevent_vehicle_assignment_overlap");
    expect(migrationSql).toContain("BEFORE INSERT OR UPDATE OF event_id, employee_id");
    expect(migrationSql).toContain("BEFORE INSERT OR UPDATE OF event_id, vehicle_id, driver_id");
  });

  test("serializes resource checks before testing overlapping event dates", () => {
    expect(migrationSql).toContain("pg_advisory_xact_lock");
    expect(migrationSql).toContain("employee-assignment:");
    expect(migrationSql).toContain("vehicle-assignment:");
    expect(migrationSql).toContain("e.start_date <= target_event.end_date");
    expect(migrationSql).toContain("e.end_date >= target_event.start_date");
  });

  test("protects employee, vehicle, and cross-role driver double-booking", () => {
    expect(migrationSql).toContain("FROM public.event_assignments ea");
    expect(migrationSql).toContain("FROM public.vehicle_assignments va");
    expect(migrationSql).toContain("va.driver_id = NEW.employee_id");
    expect(migrationSql).toContain("ea.employee_id = NEW.driver_id");
    expect(migrationSql).toContain("va.driver_id = NEW.driver_id");
  });

  test("preserves existing same-event assignment behavior for SRD seed data", () => {
    expect(migrationSql).toContain("e.id <> NEW.event_id");
  });
});
