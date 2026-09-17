import { describe, expect, it } from "vitest";
import {
  extractPayrollHttpError, getPayrollMutationFailure, PayrollAcknowledgementError,
  validatePayrollDeleteAcknowledgement, validatePayrollRunAcknowledgement,
} from "./payroll-error";

describe("payroll mutation acknowledgements", () => {
  it.each([400, 401, 403, 404, 409, 429])("permits a manual retry after normal HTTP %i failure", (status) => {
    expect(getPayrollMutationFailure({ response: { status, data: { error: "  Synthetic confirmed failure  " } } }, "Fallback"))
      .toEqual({ message: "Synthetic confirmed failure", needsReload: false });
  });

  it.each([500, 501, 503, 507])("requires the server's explicit no-commit marker to retry HTTP %i", (status) => {
    expect(getPayrollMutationFailure({
      response: { status, data: { error: "Synthetic confirmed failure", outcome_uncertain: false } },
    }, "Fallback")).toEqual({ message: "Synthetic confirmed failure", needsReload: false });
  });

  it.each([
    { label: "HTML", data: "<html>Synthetic proxy failure</html>" },
    { label: "null", data: null },
    { label: "missing body", data: undefined },
    { label: "empty object", data: {} },
    { label: "error-shaped JSON", data: { error: "Synthetic server failure" } },
    { label: "malformed marker", data: { error: "Synthetic failure", outcome_uncertain: "false" } },
  ])("does not mistake HTTP 500 $label for a confirmed rollback", ({ data }) => {
    expect(getPayrollMutationFailure({ response: { status: 500, data } }, "Unable to confirm").needsReload).toBe(true);
  });

  it("requires reload after a lost commit acknowledgement", () => {
    expect(getPayrollMutationFailure({
      response: { status: 503, data: { error: "Reload before retrying", outcome_uncertain: true } },
    }, "Fallback")).toEqual({ message: "Reload before retrying", needsReload: true });
  });

  it("retains manual recovery after an explicitly rolled-back busy response", () => {
    expect(getPayrollMutationFailure({
      response: { status: 503, data: { error: "Busy", outcome_uncertain: false } },
    }, "Fallback")).toEqual({ message: "Busy", needsReload: false });
  });

  it.each([500, 501, 502, 503, 504, 507, 599])("never infers rollback from an unclassified server HTTP %i", (status) => {
    expect(getPayrollMutationFailure({ response: { status, data: null } }, "Unable to confirm"))
      .toEqual({ message: "Unable to confirm", needsReload: true });
  });

  it.each([502, 504])("does not let gateway HTTP %i claim certainty about an upstream write", (status) => {
    expect(getPayrollMutationFailure({ response: { status, data: { outcome_uncertain: false } } }, "Unable to confirm").needsReload)
      .toBe(true);
  });

  it("does not expose raw transport errors or describe them as a rollback", () => {
    expect(getPayrollMutationFailure(new Error("Synthetic low-level transport detail"), "Unable to confirm"))
      .toEqual({ message: "Unable to confirm", needsReload: true });
  });

  it("rejects malformed response metadata rather than coercing it", () => {
    expect(extractPayrollHttpError({ response: { status: "503", data: { error: [], outcome_uncertain: "false" } } }))
      .toEqual({ status: null, message: null, outcomeUncertain: undefined });
    expect(getPayrollMutationFailure(undefined, "Unavailable"))
      .toEqual({ message: "Unavailable", needsReload: true });
    expect(getPayrollMutationFailure({ response: { status: 503, data: { outcome_uncertain: "false" } } }, "Unavailable").needsReload)
      .toBe(true);
  });
});

describe("typed payroll acknowledgement validation", () => {
  const id = "a3900000-0000-4000-8000-000000000301";
  const otherId = "a3900000-0000-4000-8000-000000000302";

  it("retains valid generated IDs/statuses and additional response fields", () => {
    const data = { id, status: "DRAFT", title: "Synthetic monthly payroll", employee_count: 1, total_payroll_value: 35000 };
    expect(validatePayrollRunAcknowledgement(data, "DRAFT")).toEqual(data);
    expect(validatePayrollRunAcknowledgement({ id, status: "FINALIZED" }, "FINALIZED", id.toUpperCase()))
      .toEqual({ id, status: "FINALIZED" });
  });

  it.each([
    { label: "undefined", data: undefined },
    { label: "null", data: null },
    { label: "HTML", data: "<html>Synthetic non-JSON response</html>" },
    { label: "array", data: [] },
    { label: "empty object", data: {} },
    { label: "invalid ID", data: { id: "not-a-uuid", status: "DRAFT" } },
    { label: "nil ID", data: { id: "00000000-0000-0000-0000-000000000000", status: "DRAFT" } },
    { label: "missing status", data: { id } },
    { label: "wrong status", data: { id, status: "FINALIZED" } },
    { label: "contradictory error", data: { id, status: "DRAFT", error: "Synthetic failure" } },
    { label: "uncertainty marker", data: { id, status: "DRAFT", outcome_uncertain: true } },
    { label: "string true uncertainty", data: { id, status: "DRAFT", outcome_uncertain: "true" } },
    { label: "string false uncertainty", data: { id, status: "DRAFT", outcome_uncertain: "false" } },
    { label: "null uncertainty", data: { id, status: "DRAFT", outcome_uncertain: null } },
    { label: "numeric uncertainty", data: { id, status: "DRAFT", outcome_uncertain: 0 } },
    { label: "string success", data: { id, status: "DRAFT", success: "true" } },
    { label: "null success", data: { id, status: "DRAFT", success: null } },
    { label: "numeric success", data: { id, status: "DRAFT", success: 1 } },
  ])("rejects a resolved $label without exposing its payload", ({ data }) => {
    expect(() => validatePayrollRunAcknowledgement(data, "DRAFT")).toThrow(PayrollAcknowledgementError);
  });

  it("rejects a status acknowledgement for another record", () => {
    expect(() => validatePayrollRunAcknowledgement({ id: otherId, status: "TRASH" }, "TRASH", id))
      .toThrow(PayrollAcknowledgementError);
  });

  it("keeps both legitimate delete envelopes, without manufacturing a missing ID", () => {
    expect(validatePayrollDeleteAcknowledgement({ success: true }, id)).toEqual({ success: true });
    expect(validatePayrollDeleteAcknowledgement({ success: true, id }, id)).toEqual({ success: true, id });
  });

  it("retains explicitly boolean success and certainty metadata", () => {
    const data = { id, status: "DRAFT", outcome_uncertain: false, success: true };
    expect(validatePayrollRunAcknowledgement(data, "DRAFT")).toEqual(data);
  });

  it.each([
    { data: undefined }, { data: null }, { data: "<html>Synthetic response</html>" }, { data: {} },
    { data: { success: false } }, { data: { success: "true" } }, { data: { success: true, id: undefined } },
    { data: { success: true, id: null } }, { data: { success: true, id: otherId } },
    { data: { success: true, id: "not-a-uuid" } }, { data: { success: true, outcome_uncertain: true } },
    { data: { success: true, outcome_uncertain: "true" } }, { data: { success: true, outcome_uncertain: "false" } },
    { data: { success: true, outcome_uncertain: null } }, { data: { success: true, outcome_uncertain: 0 } },
  ])("rejects a malformed or wrong-record delete acknowledgement", ({ data }) => {
    expect(() => validatePayrollDeleteAcknowledgement(data, id)).toThrow(PayrollAcknowledgementError);
  });

  it("reports a validation failure as safe unknown-outcome guidance", () => {
    const error = new PayrollAcknowledgementError();
    expect(getPayrollMutationFailure(error, "Failed")).toEqual({ message: error.message, needsReload: true });
    expect(error.message).toContain("Reload and check payroll history");
  });
});
