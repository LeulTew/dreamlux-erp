import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const migrationSql = readFileSync(
  join(process.cwd(), "src/db/migrations/event_proposals.sql"),
  "utf8",
);

describe("event proposals migration", () => {
  test("creates separate proposal and audit history tables with conversion links", () => {
    expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS event_proposals");
    expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS event_proposal_logs");
    expect(migrationSql).toContain("ALTER TABLE events ADD COLUMN IF NOT EXISTS event_proposal_id");
    expect(migrationSql).toContain("converted_event_id UUID");
    expect(migrationSql).toContain("event_proposals_converted_event_fk");
    expect(migrationSql).toContain("idx_event_proposals_converted_event_unique");
    expect(migrationSql).toContain("idx_events_event_proposal_unique");
    expect(migrationSql).toContain("status TEXT NOT NULL CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected', 'Converted', 'Canceled'))");
  });

  test("keeps rough estimates as proposal data and hardens direct Supabase access", () => {
    expect(migrationSql).toContain("cost_breakdown JSONB");
    expect(migrationSql).toContain("estimated_total_cost");
    expect(migrationSql).toContain("estimated_net_profit");
    expect(migrationSql).toContain("ALTER TABLE event_proposals ENABLE ROW LEVEL SECURITY");
    expect(migrationSql).toContain("ALTER TABLE event_proposal_logs ENABLE ROW LEVEL SECURITY");
    expect(migrationSql).toContain("REVOKE ALL PRIVILEGES ON TABLE public.event_proposals");
    expect(migrationSql).toContain("REVOKE ALL PRIVILEGES ON TABLE public.event_proposal_logs");
    expect(migrationSql).not.toMatch(/CREATE\s+POLICY/i);
    expect(migrationSql).not.toMatch(/GRANT\s+.*\s+TO\s+(anon|authenticated)/i);
  });
});
