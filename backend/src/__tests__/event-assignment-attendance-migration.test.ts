import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

// Issue #197: an assignment is a schedule, not a presence record. These tests pin the
// attendance default at every authoritative layer so a fresh database, an SRD-parity
// database, and an already-deployed database cannot drift apart again.
const backendSrc = path.join(__dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(backendSrc, relativePath), "utf8");

const schemaSql = read("db/schema.sql");
const paritySql = read("db/migrations/srd_parity.sql");
const attendanceMigrationSql = read("db/migrations/event_assignment_attendance.sql");
const startupMigration = read("db/startup-migration.ts");

// Grabs just the CREATE TABLE ... event_assignments (...) body so assertions cannot be
// satisfied by an unrelated table elsewhere in the file.
function eventAssignmentsTable(sql: string): string {
  const match = sql.match(/CREATE TABLE IF NOT EXISTS event_assignments\s*\(([\s\S]*?)\n\);/);
  if (!match) throw new Error("event_assignments CREATE TABLE block not found");
  return match[1];
}

describe("event assignment attendance default (issue #197)", () => {
  test("canonical schema creates attendance unverified and non-null", () => {
    const table = eventAssignmentsTable(schemaSql);
    expect(table).toContain("attended BOOLEAN NOT NULL DEFAULT FALSE");
    expect(table).not.toContain("DEFAULT TRUE");
  });

  test("SRD parity migration matches the canonical schema", () => {
    const table = eventAssignmentsTable(paritySql);
    expect(table).toContain("attended BOOLEAN NOT NULL DEFAULT FALSE");
    expect(table).not.toContain("DEFAULT TRUE");
  });

  test("both schema paths record who verified attendance and when", () => {
    for (const table of [eventAssignmentsTable(schemaSql), eventAssignmentsTable(paritySql)]) {
      expect(table).toContain("attendance_marked_at");
      expect(table).toContain("attendance_marked_by");
    }
  });

  test("executable migration flips the default and constrains the column", () => {
    expect(attendanceMigrationSql).toContain("ALTER COLUMN attended SET DEFAULT FALSE");
    expect(attendanceMigrationSql).toContain("ALTER COLUMN attended SET NOT NULL");
    expect(attendanceMigrationSql).toContain("ADD COLUMN IF NOT EXISTS attendance_marked_at");
    expect(attendanceMigrationSql).toContain("ADD COLUMN IF NOT EXISTS attendance_marked_by");
  });

  test("migration never rewrites historical attendance", () => {
    // Scan executable SQL only - the file's header comment discusses the blanket UPDATE it
    // deliberately does not perform, and that prose must not be mistaken for a statement.
    const executableSql = attendanceMigrationSql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");

    // The ONLY permitted UPDATE is the NULL normalization, which is financially inert
    // because every money query already excludes NULL.
    const updates = executableSql.match(/UPDATE event_assignments[^;]*;/g) || [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toBe("UPDATE event_assignments SET attended = FALSE WHERE attended IS NULL;");
    // A blanket reset would retroactively erase already-generated labor and payroll.
    expect(executableSql).not.toMatch(/UPDATE event_assignments SET attended = FALSE;/);
    expect(executableSql).not.toMatch(/SET attended = FALSE WHERE attended IS TRUE/);
  });

  test("startup migration applies the same change to already-deployed databases", () => {
    expect(startupMigration).toContain("ALTER TABLE event_assignments ALTER COLUMN attended SET DEFAULT FALSE");
    expect(startupMigration).toContain("ALTER TABLE event_assignments ALTER COLUMN attended SET NOT NULL");
    expect(startupMigration).toContain("UPDATE event_assignments SET attended = FALSE WHERE attended IS NULL");
  });

  test("the migration is wired into the executable migration chain", () => {
    const backendPackageJson = JSON.parse(read("../package.json"));
    expect(backendPackageJson.scripts["db:migrate"]).toContain("migrate-event-assignment-attendance.ts");
  });
});
