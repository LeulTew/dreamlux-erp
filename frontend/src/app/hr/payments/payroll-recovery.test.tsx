import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentType, ReactNode } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosAdapter } from "axios";

const mocks = vi.hoisted(() => ({
  api: {
    getEmployees: vi.fn(), getStores: vi.fn(), getSalaryLevels: vi.fn(), getEventTypes: vi.fn(),
    previewPayrollRun: vi.fn(), savePayrollDraft: vi.fn(), finalizePayrollRun: vi.fn(),
    getPayrollRuns: vi.fn(), getPayrollRun: vi.fn(), getPayrollCycleSettings: vi.fn(),
    getEligiblePayrollCommissions: vi.fn(), updatePayrollRunStatus: vi.fn(), permanentlyDeletePayrollRun: vi.fn(),
    exportPayrollExcel: vi.fn(), exportPayrollCSV: vi.fn(), exportPayrollPDF: vi.fn(),
  },
  push: vi.fn(), replace: vi.fn(), success: vi.fn(), error: vi.fn(), markApplied: vi.fn(), savePreference: vi.fn(),
  permissions: ["payroll:read", "payroll:write"],
  params: new URLSearchParams("date=2026-04&period_type=h1"),
}));

vi.mock("@/lib/api", () => mocks.api);
vi.mock("@/lib/toast", () => ({ default: { success: mocks.success, error: mocks.error } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => mocks.params,
  useParams: () => ({ id: "23900000-0000-4000-8000-000000000301" }),
}));
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "en" }) }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "23900000-0000-4000-8000-000000000001", roles: ["DECORATOR", "ACCOUNTANT"] },
    hasPermission: (permission: string) => mocks.permissions.includes(permission),
    isAuthenticated: true, isLoading: false,
  }),
}));
vi.mock("@/hooks/useRecordListPreferences", () => ({
  useRecordListPreferences: () => ({
    preference: null, isLoaded: true, isReady: true, markApplied: mocks.markApplied, save: mocks.savePreference,
  }),
}));
vi.mock("@/components/AuthLayout", () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/ui/FancyButton", () => ({ FancyButton: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} /> }));
vi.mock("@/components/ui/StatusBadge", () => ({ default: ({ status }: { status: string }) => <span>{status}</span> }));
vi.mock("@/components/ActivityDrawer", () => ({ default: () => null }));
vi.mock("@/components/PrintOptionsModal", () => ({ default: () => null }));
vi.mock("@/components/PaginationControls", () => ({ default: () => null }));
vi.mock("@/components/UserAvatar", () => ({ default: () => null }));
vi.mock("@/components/ForbiddenState", () => ({ default: () => <p>Forbidden</p> }));
vi.mock("@/components/ui/Select", () => ({
  default: ({ options, value, onChange, disabled }: {
    options: { id: string; label: string }[]; value: string; onChange: (value: string) => void; disabled?: boolean;
  }) => <select aria-label="Synthetic selector" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
    {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select>,
}));
vi.mock("@/components/DeleteConfirmModal", () => ({
  default: ({ isOpen, onConfirm, onClose, title, message, confirmLabel, confirmDisabled, isDeleting }: {
    isOpen: boolean; onConfirm: () => void; onClose: () => void; title: string; message: string;
    confirmLabel?: string; confirmDisabled?: boolean; isDeleting: boolean;
  }) => isOpen ? <section role="dialog" aria-label={title}>
    <p>{message}</p>
    {!confirmDisabled && <button onClick={onConfirm} disabled={isDeleting}>{confirmLabel ?? "Confirm change"}</button>}
    <button onClick={onClose}>Cancel</button>
  </section> : null,
}));

import RunPage from "./run/page";
import DetailPage from "./[id]/page";
import HistoryPage from "./page";
import { usePayrollMutationGuard } from "@/hooks/usePayrollMutationGuard";

const RUN_ID = "23900000-0000-4000-8000-000000000301";
const confirmedFailure = { response: { status: 500, data: { error: "Synthetic confirmed rollback", outcome_uncertain: false } } };
const uncertainFailure = { response: { status: 503, data: { error: "Synthetic lost commit acknowledgement", outcome_uncertain: true } } };
const clients: QueryClient[] = [];
const restoreAdapters: Array<() => void> = [];

async function wirePayrollHttpAcknowledgement(data: unknown) {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  const previousAdapter = actual.api.defaults.adapter;
  const adapter = vi.fn<AxiosAdapter>(async (config) => ({ data, status: 200, statusText: "OK", headers: {}, config }));
  actual.api.defaults.adapter = adapter;
  restoreAdapters.push(() => { actual.api.defaults.adapter = previousAdapter; });
  mocks.api.savePayrollDraft.mockImplementation(actual.savePayrollDraft);
  mocks.api.finalizePayrollRun.mockImplementation(actual.finalizePayrollRun);
  mocks.api.updatePayrollRunStatus.mockImplementation(actual.updatePayrollRunStatus);
  mocks.api.permanentlyDeletePayrollRun.mockImplementation(actual.permanentlyDeletePayrollRun);
  return adapter;
}

function run(status = "DRAFT") {
  return {
    id: RUN_ID, title: "Synthetic saved payroll", status, month: 4, year: 2026,
    period_start: "2026-04-01", period_end: "2026-04-15", period_kind: "half_month",
    updated_at: "2026-04-16T00:00:00.000Z", total_payroll_value: 35000, employee_count: 1,
    employee_lines: [{
      id: "23900000-0000-4000-8000-000000000401", employee_id: "23900000-0000-4000-8000-000000000201",
      employee_name_snapshot: "Synthetic Operations Manager", snapshot_base_salary: 35000, total_events_value: 0,
      total_line_pay: 35000, events: [],
    }],
  };
}
let historyRows: ReturnType<typeof run>[] = [];

function mount(Page: ComponentType) {
  // Explicit mutation retry:false on each caller must override this nonzero default.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 3, retryDelay: 1 } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><Page /></QueryClientProvider>);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

async function confirm(label = "Confirm change") {
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: label }));
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mocks.api).forEach((method) => method.mockReset());
  const { result, unmount } = renderHook(usePayrollMutationGuard);
  act(() => result.current.complete());
  unmount();
  historyRows = [];
  mocks.permissions = ["payroll:read", "payroll:write"];
  mocks.api.getEmployees.mockResolvedValue({ employees: [{
    id: "23900000-0000-4000-8000-000000000201", full_name: "Synthetic Operations Manager",
    employee_id: "SYNTHETIC-OPS", salary_level: "OPS", base_salary: 35000, compensation_mode: "regular", event_prices: {},
  }] });
  mocks.api.getSalaryLevels.mockResolvedValue([{ id: "23900000-0000-4000-8000-000000000101", level_name: "OPS", base_salary: 35000 }]);
  mocks.api.getEventTypes.mockResolvedValue([]);
  mocks.api.getStores.mockResolvedValue([]);
  mocks.api.getEligiblePayrollCommissions.mockResolvedValue({ lines: [] });
  mocks.api.getPayrollCycleSettings.mockResolvedValue({ payroll_cycle: "half_month" });
  mocks.api.getPayrollRun.mockResolvedValue(run());
  mocks.api.getPayrollRuns.mockImplementation(async (params?: { view?: string }) => {
    const visible = historyRows.filter((row) => params?.view === "trash" ? row.status === "TRASH" : row.status !== "TRASH");
    return { runs: visible, total: visible.length, page: 1, limit: 8, totalPages: 1 };
  });
  mocks.api.savePayrollDraft.mockReset().mockResolvedValue({ id: RUN_ID, status: "DRAFT" });
  mocks.api.finalizePayrollRun.mockReset().mockResolvedValue({ id: RUN_ID, status: "FINALIZED" });
  mocks.api.updatePayrollRunStatus.mockReset().mockResolvedValue({ id: RUN_ID, status: "FINALIZED" });
  mocks.api.permanentlyDeletePayrollRun.mockReset().mockResolvedValue({ success: true, id: RUN_ID });
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  restoreAdapters.splice(0).reverse().forEach((restore) => restore());
  vi.useRealTimers();
});

describe("run payroll recovery", () => {
  it("requires a successful history read rather than assuming a failed lookup means no existing run", async () => {
    mocks.api.getPayrollRuns.mockRejectedValueOnce(new Error("Synthetic history unavailable"));
    mount(RunPage);
    expect(await screen.findByRole("alert")).toHaveTextContent("Payroll history could not be loaded");
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Finalize Run" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry history" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Draft" })).toBeEnabled());
    expect(mocks.api.savePayrollDraft).not.toHaveBeenCalled();
  });

  it("does not autosave an untouched page whose dirty flag starts false", async () => {
    mount(RunPage);
    const save = await screen.findByRole("button", { name: "Save Draft" });
    await waitFor(() => expect(save).toBeEnabled());
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(mocks.api.savePayrollDraft).not.toHaveBeenCalled();
    expect(mocks.api.finalizePayrollRun).not.toHaveBeenCalled();
  });

  it("blocks concurrent save/publication and retains manual retry for a confirmed save failure", async () => {
    const pending = deferred<{ id: string }>();
    mocks.api.savePayrollDraft.mockReturnValueOnce(pending.promise);
    mount(RunPage);
    const save = await screen.findByRole("button", { name: "Save Draft" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    fireEvent.click(save);
    expect(screen.getByRole("button", { name: "Finalize Run" })).toBeDisabled();
    await waitFor(() => expect(mocks.api.savePayrollDraft).toHaveBeenCalledTimes(1));
    expect(mocks.api.finalizePayrollRun).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Updating payroll");
    await act(async () => pending.reject(confirmedFailure));
    expect(await screen.findByRole("alert")).toHaveTextContent("retry manually");
    expect(screen.queryByRole("button", { name: "Reload payroll" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(mocks.api.savePayrollDraft).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it.each(["save", "finalize"])("blocks every repeat write after an uncertain %s outcome", async (action) => {
    const mutation = action === "save" ? mocks.api.savePayrollDraft : mocks.api.finalizePayrollRun;
    mutation.mockRejectedValueOnce(uncertainFailure);
    mount(RunPage);
    const trigger = await screen.findByRole("button", { name: action === "save" ? "Save Draft" : "Finalize Run" });
    await waitFor(() => expect(trigger).toBeEnabled());
    fireEvent.click(trigger);
    expect(await screen.findByRole("alert")).toHaveTextContent("Further changes are blocked");
    expect(screen.getByRole("button", { name: "Reload payroll" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Finalize Run" }));
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Finalize Run" })).toBeDisabled();
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("allows a known busy publication to be retried deliberately, then waits for navigation", async () => {
    mocks.api.finalizePayrollRun.mockRejectedValueOnce({ response: { status: 503, data: { error: "Busy", outcome_uncertain: false } } });
    mount(RunPage);
    const finalize = await screen.findByRole("button", { name: "Finalize Run" });
    await waitFor(() => expect(finalize).toBeEnabled());
    fireEvent.click(finalize);
    expect(await screen.findByRole("alert")).toHaveTextContent("retry manually");
    fireEvent.click(screen.getByRole("button", { name: "Finalize Run" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/hr/payments/${RUN_ID}`));
    expect(mocks.api.finalizePayrollRun).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
  });
});

describe("detail payroll recovery", () => {
  it("retains reload-required state when moving from details to history without a full reload", async () => {
    mocks.api.updatePayrollRunStatus.mockRejectedValueOnce(uncertainFailure);
    const detail = mount(DetailPage);
    fireEvent.click(await screen.findByRole("button", { name: "Finalize Payout" }));
    await confirm("Confirm Finalization");
    await screen.findByRole("alert");
    detail.unmount();
    mount(HistoryPage);
    expect(await screen.findByRole("alert")).toHaveTextContent("Further changes are blocked");
    expect(await screen.findByRole("button", { name: "New Payout" })).toBeDisabled();
  });

  it("keeps finalization pending until acknowledged and permits a manual known-failure retry", async () => {
    const pending = deferred<{ id: string; status: string }>();
    mocks.api.updatePayrollRunStatus.mockReturnValueOnce(pending.promise);
    mount(DetailPage);
    fireEvent.click(await screen.findByRole("button", { name: "Finalize Payout" }));
    await confirm("Confirm Finalization");
    await waitFor(() => expect(mocks.api.updatePayrollRunStatus).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Confirm Finalization" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Finalize Payout" })).toBeDisabled();
    await act(async () => pending.reject(confirmedFailure));
    expect(await screen.findByRole("alert")).toHaveTextContent("retry manually");
    fireEvent.click(screen.getByRole("button", { name: "Finalize Payout" }));
    await confirm("Confirm Finalization");
    await waitFor(() => expect(mocks.api.updatePayrollRunStatus).toHaveBeenCalledTimes(2));
  });

  it.each([
    { label: "commit acknowledgement", error: uncertainFailure },
    { label: "network response", error: new Error("Synthetic network failure") },
  ])("requires reload after a lost $label", async ({ error }) => {
    mocks.api.updatePayrollRunStatus.mockRejectedValueOnce(error);
    mount(DetailPage);
    fireEvent.click(await screen.findByRole("button", { name: "Finalize Payout" }));
    await confirm("Confirm Finalization");
    expect(await screen.findByRole("alert")).toHaveTextContent("Payroll change not confirmed");
    expect(screen.getByRole("button", { name: "Finalize Payout" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.api.updatePayrollRunStatus).toHaveBeenCalledTimes(1);
  });

  it("does not expose official writers to a read-only actor", async () => {
    mocks.permissions = ["payroll:read"];
    mount(DetailPage);
    await screen.findByRole("heading", { name: "Payroll Run Detail" });
    expect(screen.queryByRole("button", { name: "Finalize Payout" })).not.toBeInTheDocument();
    expect(mocks.api.updatePayrollRunStatus).not.toHaveBeenCalled();
  });
});

describe("history payroll recovery", () => {
  it("does not show an empty archive or enable writes after a failed history lookup", async () => {
    mocks.api.getPayrollRuns.mockRejectedValueOnce(new Error("Synthetic history unavailable"));
    mount(HistoryPage);
    expect(await screen.findByRole("alert")).toHaveTextContent("Saved payroll history could not be loaded");
    expect(screen.queryByText("No payroll records found in the archive")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Payout" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry history" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "New Payout" })).toBeEnabled());
  });

  const actions = [
    { action: "trash", title: "Move to Trash", view: "active", confirmLabel: "Confirm change" },
    { action: "restore", title: "Restore", view: "trash", confirmLabel: "Confirm Restore" },
    { action: "delete", title: "Delete Permanently", view: "trash", confirmLabel: "Confirm change" },
  ];

  it.each(actions)("keeps manual recovery for a confirmed $action failure", async ({ action, title, view, confirmLabel }) => {
    historyRows = [run(view === "trash" ? "TRASH" : "DRAFT")];
    const mutation = action === "delete" ? mocks.api.permanentlyDeletePayrollRun : mocks.api.updatePayrollRunStatus;
    mutation.mockRejectedValueOnce(confirmedFailure);
    mount(HistoryPage);
    if (view === "trash") fireEvent.click(await screen.findByRole("button", { name: "Trash" }));
    fireEvent.click(await screen.findByTitle(title));
    await confirm(confirmLabel);
    expect(await screen.findByRole("alert")).toHaveTextContent("retry manually");
    expect(screen.getByTitle(title)).toBeEnabled();
    fireEvent.click(screen.getByTitle(title));
    await confirm(confirmLabel);
    await waitFor(() => expect(mutation).toHaveBeenCalledTimes(2));
  });

  it.each(actions)("blocks $action repeats after uncertainty, even when history is refreshed", async ({ action, title, view, confirmLabel }) => {
    historyRows = [run(view === "trash" ? "TRASH" : "DRAFT")];
    const mutation = action === "delete" ? mocks.api.permanentlyDeletePayrollRun : mocks.api.updatePayrollRunStatus;
    mutation.mockRejectedValueOnce(uncertainFailure);
    mount(HistoryPage);
    if (view === "trash") fireEvent.click(await screen.findByRole("button", { name: "Trash" }));
    fireEvent.click(await screen.findByTitle(title));
    await confirm(confirmLabel);
    expect(await screen.findByRole("alert")).toHaveTextContent("Further changes are blocked");
    expect(screen.getByTitle(title)).toBeDisabled();
    expect(screen.getByRole("button", { name: "New Payout" })).toBeDisabled();
    const reads = mocks.api.getPayrollRuns.mock.calls.length;
    fireEvent.click(screen.getByTitle("Sync History"));
    await waitFor(() => expect(mocks.api.getPayrollRuns.mock.calls.length).toBeGreaterThan(reads));
    expect(screen.getByTitle(title)).toBeDisabled();
    fireEvent.click(screen.getByTitle(title));
    expect(mutation).toHaveBeenCalledTimes(1);
  });
});

describe("resolved HTTP acknowledgement recovery", () => {
  const malformedBodies = [
    { body: "empty object", data: {} },
    { body: "undefined", data: undefined },
    { body: "null", data: null },
    { body: "HTML", data: "<html>Synthetic gateway response</html>" },
  ];

  it.each(["save", "finalize"].flatMap((action) => malformedBodies.map((body) => ({ action, ...body }))))(
    "blocks $action after a resolved $body without a success toast or navigation", async ({ action, data }) => {
      const adapter = await wirePayrollHttpAcknowledgement(data);
      mount(RunPage);
      const trigger = await screen.findByRole("button", { name: action === "save" ? "Save Draft" : "Finalize Run" });
      await waitFor(() => expect(trigger).toBeEnabled());
      fireEvent.click(trigger);
      expect(await screen.findByRole("alert")).toHaveTextContent("Payroll change not confirmed");
      expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Finalize Run" })).toBeDisabled();
      expect(mocks.success).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
      expect(adapter).toHaveBeenCalledTimes(1);
      expect(adapter.mock.calls[0][0].timeout).toBe(45_000);
    },
  );

  it.each([
    { label: "wrong record", data: { id: "23900000-0000-4000-8000-000000000302", status: "FINALIZED" } },
    { label: "wrong status", data: { id: RUN_ID, status: "DRAFT" } },
    { label: "empty response", data: {} },
  ])("blocks detail finalization for a resolved $label", async ({ data }) => {
    const adapter = await wirePayrollHttpAcknowledgement(data);
    const detail = mount(DetailPage);
    fireEvent.click(await screen.findByRole("button", { name: "Finalize Payout" }));
    await confirm("Confirm Finalization");
    expect(await screen.findByRole("alert")).toHaveTextContent("Further changes are blocked");
    expect(screen.getByRole("button", { name: "Finalize Payout" })).toBeDisabled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(adapter).toHaveBeenCalledTimes(1);
    detail.unmount();
    mount(HistoryPage);
    expect(await screen.findByRole("alert")).toHaveTextContent("Further changes are blocked");
    expect(screen.getByRole("button", { name: "New Payout" })).toBeDisabled();
  });

  it.each([
    { title: "Move to Trash", view: "active", confirmLabel: "Confirm change" },
    { title: "Restore", view: "trash", confirmLabel: "Confirm Restore" },
    { title: "Delete Permanently", view: "trash", confirmLabel: "Confirm change" },
  ])("blocks history $title after a resolved malformed success", async ({ title, view, confirmLabel }) => {
    historyRows = [run(view === "trash" ? "TRASH" : "DRAFT")];
    const adapter = await wirePayrollHttpAcknowledgement({});
    mount(HistoryPage);
    if (view === "trash") fireEvent.click(await screen.findByRole("button", { name: "Trash" }));
    fireEvent.click(await screen.findByTitle(title));
    await confirm(confirmLabel);
    expect(await screen.findByRole("alert")).toHaveTextContent("Payroll change not confirmed");
    expect(screen.getByTitle(title)).toBeDisabled();
    expect(screen.getByRole("button", { name: "New Payout" })).toBeDisabled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
