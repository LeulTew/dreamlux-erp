import { describe, expect, test } from "bun:test";
import {
  createEmployeeSchema,
  createEventSchema,
  eventProposalPayloadSchema,
} from "../lib/validation";

describe("strict form validation normalization", () => {
  test("normalizes optional employee blank fields before persistence", () => {
    const result = createEmployeeSchema.safeParse({
      full_name: "Test Employee",
      employee_id: "EMP-001",
      department_id: "",
      email: "",
      commission: "",
      salary_level: "",
      office_id: "",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.department_id).toBeUndefined();
    expect(result.data.email).toBeUndefined();
    expect(result.data.commission).toBeUndefined();
    expect(result.data.salary_level).toBeUndefined();
    expect(result.data.office_id).toBeUndefined();
  });

  test("normalizes nullable event blanks to null instead of empty strings", () => {
    const result = createEventSchema.safeParse({
      name: "Wedding",
      client_name: "Client",
      client_phone: "",
      event_type_id: null,
      start_date: "2026-07-01",
      end_date: "2026-07-01",
      start_time: "",
      end_time: "",
      venue_location: "Hall",
      contract_price: 1000,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.client_phone).toBeNull();
    expect(result.data.start_time).toBeNull();
    expect(result.data.end_time).toBeNull();
  });

  test("normalizes proposal optional blanks to null", () => {
    const result = eventProposalPayloadSchema.safeParse({
      name: "Proposal",
      client_name: "Client",
      client_phone: "",
      event_type_id: "",
      requested_budget: 1000,
      requested_start_date: "",
      requested_end_date: "",
      requested_start_time: "",
      requested_end_time: "",
      venue_location: "",
      notes: "",
      package_design_notes: "",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.client_phone).toBeNull();
    expect(result.data.event_type_id).toBeNull();
    expect(result.data.requested_start_date).toBeNull();
    expect(result.data.requested_end_date).toBeNull();
    expect(result.data.requested_start_time).toBeNull();
    expect(result.data.requested_end_time).toBeNull();
    expect(result.data.venue_location).toBeNull();
    expect(result.data.notes).toBeNull();
    expect(result.data.package_design_notes).toBeNull();
  });
});
