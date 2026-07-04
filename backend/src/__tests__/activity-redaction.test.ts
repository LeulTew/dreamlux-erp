import { describe, expect, test } from "bun:test";
import { ActivityService, ActivityLogEntry } from "../services/activity-service";

const financeLog: ActivityLogEntry = {
  id: "1",
  entity_type: "finance_operational_expense",
  entity_id: "expense-1",
  user_id: "user-1",
  username: "accountant",
  full_name: "Accountant",
  action: "update",
  field_changed: "amount",
  old_value: "1000",
  new_value: "1500",
  note: "Vendor invoice corrected",
  source_route: "activity_logs",
  created_at: "2026-07-04T00:00:00Z",
};

describe("ActivityService finance redaction", () => {
  test("redacts finance amount and note without finance/report permissions", () => {
    const [redacted] = ActivityService.redactLogs([financeLog], ["events:read"]);

    expect(redacted.old_value).toBe("[REDACTED]");
    expect(redacted.new_value).toBe("[REDACTED]");
    expect(redacted.note).toBe("[REDACTED]");
  });

  test("keeps finance amount visible for finance readers", () => {
    const [visible] = ActivityService.redactLogs([financeLog], ["finance:hisab:read"]);

    expect(visible.old_value).toBe("1000");
    expect(visible.new_value).toBe("1500");
    expect(visible.note).toBe("Vendor invoice corrected");
  });
});
