import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const assignmentMigrationSql = readFileSync(
  join(process.cwd(), "src/db/migrations/assignment_integrity.sql"),
  "utf8",
);

const eventsRouteSource = readFileSync(
  join(process.cwd(), "src/routes/events.ts"),
  "utf8",
);

describe("DB concurrency integrity assertions", () => {
  test("employee, vehicle, and driver overlap checks take transaction-scoped locks before conflict reads", () => {
    const employeeLockIndex = assignmentMigrationSql.indexOf("employee-assignment:' || NEW.employee_id");
    const employeeConflictIndex = assignmentMigrationSql.indexOf("Employee % is already assigned");
    const vehicleLockIndex = assignmentMigrationSql.indexOf("vehicle-assignment:' || NEW.vehicle_id");
    const vehicleConflictIndex = assignmentMigrationSql.indexOf("Vehicle % is already assigned");
    const driverLockIndex = assignmentMigrationSql.indexOf("employee-assignment:' || NEW.driver_id");
    const driverConflictIndex = assignmentMigrationSql.indexOf("Driver % is already assigned");

    expect(employeeLockIndex).toBeGreaterThan(-1);
    expect(employeeConflictIndex).toBeGreaterThan(employeeLockIndex);
    expect(vehicleLockIndex).toBeGreaterThan(-1);
    expect(vehicleConflictIndex).toBeGreaterThan(vehicleLockIndex);
    expect(driverLockIndex).toBeGreaterThan(-1);
    expect(driverConflictIndex).toBeGreaterThan(driverLockIndex);
    expect(assignmentMigrationSql).toContain("pg_advisory_xact_lock");
  });

  test("assignment guards compare active event date ranges and ignore deleted events", () => {
    expect(assignmentMigrationSql).toContain("e.deleted_at IS NULL");
    expect(assignmentMigrationSql).toContain("e.start_date <= target_event.end_date");
    expect(assignmentMigrationSql).toContain("e.end_date >= target_event.start_date");
    expect(assignmentMigrationSql).toContain("e.id <> NEW.event_id");
  });

  test("inventory allocation stock check locks the item row before summing active allocations", () => {
    const lockIndex = eventsRouteSource.indexOf("SELECT * FROM items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE");
    const sumIndex = eventsRouteSource.indexOf("SELECT COALESCE(SUM(quantity_allocated), 0) as total_allocated");
    const insertIndex = eventsRouteSource.indexOf("INSERT INTO event_allocations");

    expect(lockIndex).toBeGreaterThan(-1);
    expect(sumIndex).toBeGreaterThan(lockIndex);
    expect(insertIndex).toBeGreaterThan(sumIndex);
    expect(eventsRouteSource).toContain("WHERE item_id = $1 AND status != 'Returned'");
    expect(eventsRouteSource).toContain("Requested quantity exceeds available stock");
  });
});
