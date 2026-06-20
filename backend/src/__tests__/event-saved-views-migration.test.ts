import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const migrationSql = readFileSync(
  join(process.cwd(), "src/db/migrations/event_saved_views.sql"),
  "utf8",
);

describe("event saved views migration", () => {
  test("creates scoped saved views with constrained targets and default indexes", () => {
    expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS event_saved_views");
    expect(migrationSql).toContain("scope TEXT NOT NULL CHECK (scope IN ('personal', 'role', 'global'))");
    expect(migrationSql).toContain("(scope = 'personal' AND user_id IS NOT NULL AND role_name IS NULL)");
    expect(migrationSql).toContain("(scope = 'role' AND user_id IS NULL AND role_name IS NOT NULL)");
    expect(migrationSql).toContain("(scope = 'global' AND user_id IS NULL AND role_name IS NULL)");
    expect(migrationSql).toContain("idx_event_saved_views_default_personal");
    expect(migrationSql).toContain("idx_event_saved_views_default_role");
    expect(migrationSql).toContain("idx_event_saved_views_default_global");
  });

  test("hardens direct Supabase table access when run independently", () => {
    expect(migrationSql).toContain("ALTER TABLE event_saved_views ENABLE ROW LEVEL SECURITY");
    expect(migrationSql).toContain("REVOKE ALL PRIVILEGES ON TABLE public.event_saved_views");
    expect(migrationSql).toContain("'anon'");
    expect(migrationSql).toContain("'authenticated'");
    expect(migrationSql).not.toMatch(/CREATE\s+POLICY/i);
    expect(migrationSql).not.toMatch(/GRANT\s+.*\s+TO\s+(anon|authenticated)/i);
  });
});
