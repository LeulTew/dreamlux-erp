import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, type AxiosAdapter } from "axios";
import {
  api, deletePayrollRun, finalizePayrollRun, permanentlyDeletePayrollRun, savePayrollDraft, updatePayrollRunStatus,
} from "@/lib/api";
import { getPayrollMutationFailure, PayrollAcknowledgementError } from "@/lib/payroll-error";

const RUN_ID = "a3900000-0000-4000-8000-000000000301";
const OTHER_ID = "a3900000-0000-4000-8000-000000000302";
const payload = { month: 4, year: 2026, period_kind: "month", employeeLineEvents: [] };
const originalAdapter = api.defaults.adapter;
let acknowledgement: unknown;
let timeout = false;
const adapter = vi.fn<AxiosAdapter>(async (config) => {
  if (timeout) throw new AxiosError("Synthetic request timeout", "ECONNABORTED", config);
  return { data: acknowledgement, status: 200, statusText: "OK", headers: {}, config };
});

beforeEach(() => {
  acknowledgement = {};
  timeout = false;
  adapter.mockClear();
  api.defaults.adapter = adapter;
});
afterEach(() => { api.defaults.adapter = originalAdapter; });

const writes = [
  { label: "draft", method: "post", url: "/payroll/drafts", invoke: () => savePayrollDraft(payload), valid: { id: RUN_ID, status: "DRAFT" } },
  { label: "publication", method: "post", url: "/payroll/runs", invoke: () => finalizePayrollRun(payload), valid: { id: RUN_ID, status: "FINALIZED" } },
  { label: "status", method: "patch", url: `/payroll/runs/${RUN_ID}/status`, invoke: () => updatePayrollRunStatus(RUN_ID, "TRASH"), valid: { id: RUN_ID, status: "TRASH" } },
  { label: "soft delete", method: "delete", url: `/payroll/runs/${RUN_ID}`, invoke: () => deletePayrollRun(RUN_ID), valid: { success: true, id: RUN_ID } },
  { label: "permanent delete", method: "delete", url: `/payroll/runs/${RUN_ID}/permanent`, invoke: () => permanentlyDeletePayrollRun(RUN_ID), valid: { success: true, id: RUN_ID } },
];

describe("payroll API acknowledgements and transport limits", () => {
  it.each(writes)("preserves the valid $label contract, endpoint and 45-second timeout", async ({ invoke, valid, method, url }) => {
    acknowledgement = valid;
    expect(await invoke()).toEqual(valid);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0]).toMatchObject({ method, url, timeout: 45_000 });
    if (method === "post") expect(adapter.mock.calls[0][0].data).toBe(JSON.stringify(payload));
    if (method === "patch") expect(adapter.mock.calls[0][0].data).toBe(JSON.stringify({ status: "TRASH" }));
  });

  const malformedBodies = [
    { body: "undefined", data: undefined },
    { body: "null", data: null },
    { body: "HTML", data: "<html>Synthetic gateway response</html>" },
    { body: "empty object", data: {} },
    { body: "array", data: [] },
  ];
  it.each(writes.flatMap((write) => malformedBodies.map((body) => ({ ...write, ...body }))))(
    "rejects a resolved $body $label response before any success observer", async ({ invoke, data }) => {
      acknowledgement = data;
      const success = vi.fn();
      const result = invoke().then((receipt) => { success(receipt); return receipt; });
      await expect(result).rejects.toBeInstanceOf(PayrollAcknowledgementError);
      expect(success).not.toHaveBeenCalled();
      expect(adapter).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { label: "draft", invoke: () => savePayrollDraft(payload), status: "DRAFT", wrongStatus: "FINALIZED" },
    { label: "publication", invoke: () => finalizePayrollRun(payload), status: "FINALIZED", wrongStatus: "DRAFT" },
  ])("rejects invalid generated IDs and wrong $label statuses", async ({ invoke, status, wrongStatus }) => {
    acknowledgement = { id: "invalid-generated-id", status };
    await expect(invoke()).rejects.toBeInstanceOf(PayrollAcknowledgementError);
    acknowledgement = { id: RUN_ID, status: wrongStatus };
    await expect(invoke()).rejects.toBeInstanceOf(PayrollAcknowledgementError);
    acknowledgement = { id: RUN_ID };
    await expect(invoke()).rejects.toBeInstanceOf(PayrollAcknowledgementError);
  });

  it("requires both the requested run and requested status in a status receipt", async () => {
    acknowledgement = { id: OTHER_ID, status: "FINALIZED" };
    await expect(updatePayrollRunStatus(RUN_ID, "FINALIZED")).rejects.toBeInstanceOf(PayrollAcknowledgementError);
    acknowledgement = { id: RUN_ID, status: "DRAFT" };
    await expect(updatePayrollRunStatus(RUN_ID, "FINALIZED")).rejects.toBeInstanceOf(PayrollAcknowledgementError);
    acknowledgement = { id: RUN_ID.toUpperCase(), status: "FINALIZED" };
    expect(await updatePayrollRunStatus(RUN_ID, "FINALIZED")).toEqual(acknowledgement);
  });

  it.each([
    { label: "soft delete", invoke: () => deletePayrollRun(RUN_ID) },
    { label: "permanent delete", invoke: () => permanentlyDeletePayrollRun(RUN_ID) },
  ])("accepts the legacy $label receipt but rejects a supplied wrong ID or false success", async ({ invoke }) => {
    acknowledgement = { success: true };
    expect(await invoke()).toEqual({ success: true });
    acknowledgement = { success: true, id: OTHER_ID };
    await expect(invoke()).rejects.toBeInstanceOf(PayrollAcknowledgementError);
    acknowledgement = { success: true, id: undefined };
    await expect(invoke()).rejects.toBeInstanceOf(PayrollAcknowledgementError);
    acknowledgement = { success: false, id: RUN_ID };
    await expect(invoke()).rejects.toBeInstanceOf(PayrollAcknowledgementError);
  });

  it.each(writes)("treats a $label timeout as unknown and never retries automatically", async ({ invoke }) => {
    timeout = true;
    const result = await invoke().then(
      () => { throw new Error("Synthetic timeout unexpectedly succeeded"); },
      (error: unknown) => getPayrollMutationFailure(error, "Unable to confirm payroll"),
    );
    expect(result).toEqual({ message: "Unable to confirm payroll", needsReload: true });
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
