import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

// Issue #206 follow-up. The additive seed shipped with 22 fabricated column names across five
// tables (`event_proposals`, `events`, `capital_investments`, `inventory_movements`,
// `event_logs`) and two status values that violate CHECK constraints. Nothing caught it: the
// unit tests mock `pg`, and a dry-run that only probes table/object existence cannot see a
// column mismatch. These tests parse the real SQL out of the seed and diff it against the
// canonical schema, so the whole class of bug fails at `bun test` instead of at runtime.
const backendSrc = path.join(__dirname, "..");
// Strip `--` comments first: a comment inside a statement can contain a `)` that would
// truncate the column-list capture and silently make these checks vacuous.
const seedSql = fs
  .readFileSync(path.join(backendSrc, "lib", "seed-demo-additive-core.ts"), "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
// Not every table lives in schema.sql: the event service scope tables (issue #194) are created
// by the startup migration, so both files together are the canonical definition.
const schemaSql = [
  fs.readFileSync(path.join(backendSrc, "db", "schema.sql"), "utf8"),
  fs.readFileSync(path.join(backendSrc, "db", "startup-migration.ts"), "utf8"),
].join("\n");

/** Columns declared for a table in the canonical schema, ignoring table-level constraints. */
function schemaColumns(table: string): string[] {
  const match = schemaSql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\);`));
  if (!match) throw new Error(`no CREATE TABLE found for ${table}`);
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("--"))
    .map((line) => line.split(/[\s(]/)[0])
    .filter((token) => /^[a-z_]+$/.test(token))
    .filter((token) => !["unique", "primary", "foreign", "constraint", "check"].includes(token));
}

/** Every `INSERT INTO <table> (...)` the seed issues, with its column list. */
function seedInserts(): { table: string; columns: string[] }[] {
  return [...seedSql.matchAll(/INSERT\s+INTO\s+([a-z_]+)\s*\(([^)]*)\)/gi)].map((m) => ({
    table: m[1],
    columns: m[2]
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c && !c.startsWith("--")),
  }));
}

/** Allowed values of a CHECK (col = ANY (ARRAY[...])) / IN (...) constraint in schema.sql. */
function allowedValues(table: string, column: string): string[] | null {
  const body = schemaSql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(([\\s\\S]*?)\\n\\);`));
  if (!body) return null;
  const check = body[1].match(new RegExp(`${column}[^,\\n]*CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]*)\\)`, "i"));
  if (!check) return null;
  return check[1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
}

describe("additive demo seed matches the canonical schema (issue #206)", () => {
  const inserts = seedInserts();

  test("the seed actually issues inserts (guards against a silent regex break)", () => {
    expect(inserts.length).toBeGreaterThan(10);
  });

  test("every inserted column exists in schema.sql", () => {
    const problems: string[] = [];
    for (const { table, columns } of inserts) {
      let real: string[];
      try {
        real = schemaColumns(table);
      } catch {
        problems.push(`${table}: table not found in schema.sql`);
        continue;
      }
      const missing = columns.filter((c) => !real.includes(c));
      if (missing.length) problems.push(`${table}: ${missing.join(", ")}`);
    }
    expect(problems).toEqual([]);
  });

  test("every NOT NULL column without a default is supplied", () => {
    // A renamed column can leave a required one unsupplied - inventory_movements lost
    // quantity_before/quantity_after exactly this way.
    const problems: string[] = [];
    for (const { table, columns } of inserts) {
      const body = schemaSql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(([\\s\\S]*?)\\n\\);`));
      if (!body) continue;
      for (const line of body[1].split("\n").map((l) => l.trim())) {
        if (!/NOT NULL/i.test(line) || /DEFAULT/i.test(line) || /^(PRIMARY|UNIQUE|CONSTRAINT|CHECK|FOREIGN)/i.test(line)) continue;
        const col = line.split(/[\s(]/)[0];
        if (!/^[a-z_]+$/.test(col)) continue;
        if (!columns.includes(col)) problems.push(`${table}.${col} is NOT NULL with no default but is not inserted`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("seeded status literals satisfy their CHECK constraints", () => {
    // 'In Progress' and lower-case proposal statuses both slipped through review.
    const statusChecks: { table: string; column: string }[] = [
      { table: "events", column: "status" },
      { table: "event_proposals", column: "status" },
      { table: "expenses", column: "status" },
      { table: "event_allocations", column: "status" },
      { table: "capital_investments", column: "status" },
    ];

    const problems: string[] = [];
    for (const { table, column } of statusChecks) {
      const allowed = allowedValues(table, column);
      if (!allowed) continue;
      const insert = seedSql.match(new RegExp(`INSERT\\s+INTO\\s+${table}\\s*\\(([^)]*)\\)([\\s\\S]*?)ON CONFLICT`, "i"));
      if (!insert) continue;
      const cols = insert[1].split(",").map((c) => c.trim());
      const idx = cols.indexOf(column);
      if (idx === -1) continue;
      // Any quoted literal in the VALUES block that looks like a status word must be allowed.
      for (const row of insert[2].matchAll(/\(([^()]*)\)/g)) {
        const cells = row[1].split(",").map((c) => c.trim());
        const cell = cells[idx];
        if (!cell || !cell.startsWith("'")) continue;
        const value = cell.replace(/^'|'$/g, "");
        if (!allowed.includes(value)) problems.push(`${table}.${column} = '${value}' not in ${allowed.join("|")}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
