import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const migrationSql = readFileSync(
  join(process.cwd(), "src/db/migrations/record_list_preferences.sql"),
  "utf-8",
);

describe("record list preferences migration", () => {
  test("creates user-scoped preference table with unique user-record key", () => {
    expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.record_list_preferences");
    expect(migrationSql).toContain("user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE");
    expect(migrationSql).toContain("idx_record_list_preferences_user_record");
    expect(migrationSql).toContain("ON public.record_list_preferences(user_id, record_type)");
  });

  test("keeps direct database access locked behind backend", () => {
    expect(migrationSql).toContain("ALTER TABLE public.record_list_preferences ENABLE ROW LEVEL SECURITY");
    expect(migrationSql).toContain("REVOKE ALL PRIVILEGES ON TABLE public.record_list_preferences");
  });
});
