import type { AnchorHTMLAttributes, ReactNode } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { previewEmployeeId, previewResult, previewUserId } from "@/__tests__/payroll-preview-fixtures";

const mocks = vi.hoisted(() => ({
  api: {
    getEmployees: vi.fn(), getStores: vi.fn(), getSalaryLevels: vi.fn(), getEventTypes: vi.fn(),
    previewPayrollRun: vi.fn(), savePayrollDraft: vi.fn(), finalizePayrollRun: vi.fn(),
    getPayrollRuns: vi.fn(), getPayrollRun: vi.fn(), getPayrollCycleSettings: vi.fn(), getEligiblePayrollCommissions: vi.fn(),
  },
  push: vi.fn(), replace: vi.fn(), success: vi.fn(),
  permissions: ["payroll:read", "payroll:write"], userId: "", authLoading: false,
  params: new URLSearchParams("date=2026-04&period_type=w1"),
}));
vi.mock("@/lib/api", () => mocks.api);
vi.mock("@/lib/toast", () => ({ default: { success: mocks.success } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }), useSearchParams: () => mocks.params,
}));
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "en" }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: mocks.userId }, isAuthenticated: Boolean(mocks.userId), isLoading: mocks.authLoading,
    hasPermission: (permission: string) => mocks.permissions.includes(permission),
  }),
}));
vi.mock("@/components/AuthLayout", () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/PrintOptionsModal", () => ({ default: () => null }));
vi.mock("@/components/PaginationControls", () => ({ default: () => null }));
vi.mock("@/components/UserAvatar", () => ({ default: () => null }));
vi.mock("@/components/ForbiddenState", () => ({ default: () => <p>Forbidden</p> }));
vi.mock("@/components/ui/Select", () => ({
  default: ({ options, value, onChange }: {
    options: { id: string; label: string }[]; value: string; onChange: (value: string) => void;
  }) => <select aria-label="Synthetic selector" value={value} onChange={(event) => onChange(event.target.value)}>
    {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select>,
}));

import RunPage from "./page";
import { usePayrollMutationGuard } from "@/hooks/usePayrollMutationGuard";

const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } } });
  clients.push(client);
  const tree = () => <QueryClientProvider client={client}><RunPage /></QueryClientProvider>;
  const view = render(tree());
  return { ...view, refresh: () => view.rerender(tree()) };
}

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => { resolve = done; });
  return { promise, resolve };
}

async function openPreview() {
  const trigger = await screen.findByRole("button", { name: "Preview" });
  await waitFor(() => expect(trigger).toBeEnabled());
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mocks.api).forEach((method) => method.mockReset());
  const guard = renderHook(usePayrollMutationGuard);
  act(() => guard.result.current.complete());
  guard.unmount();
  mocks.permissions = ["payroll:read", "payroll:write"];
  mocks.userId = previewUserId;
  mocks.authLoading = false;
  mocks.params = new URLSearchParams("date=2026-04&period_type=w1");
  mocks.api.getEmployees.mockResolvedValue({ employees: [{
    id: previewEmployeeId(0), employee_id: "SYNTHETIC-LOCAL", full_name: "Synthetic setup planner",
    salary_level: "PLAN", base_salary: 14500, compensation_mode: "regular", event_prices: {},
  }] });
  mocks.api.getSalaryLevels.mockResolvedValue([{ id: "23300000-0000-4000-8000-000000000201", level_name: "PLAN", base_salary: 14500 }]);
  mocks.api.getEventTypes.mockResolvedValue([]);
  mocks.api.getStores.mockResolvedValue([]);
  mocks.api.getEligiblePayrollCommissions.mockResolvedValue({ lines: [] });
  mocks.api.getPayrollCycleSettings.mockResolvedValue({ payroll_cycle: "weekly" });
  mocks.api.getPayrollRuns.mockResolvedValue({ runs: [], pagination: { total: 0, page: 1, totalPages: 1, limit: 100 } });
  mocks.api.previewPayrollRun.mockResolvedValue({
    ...previewResult(), period_kind: "weekly", period_start: "2026-04-01", period_end: "2026-04-07",
  });
  mocks.api.savePayrollDraft.mockResolvedValue({ id: "23300000-0000-4000-8000-000000000301", status: "DRAFT" });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
});

describe("run page authoritative preview", () => {
  it("uses the real weekly setup request, displays server-only employees and writes nothing on Preview", async () => {
    mount();
    const trigger = await openPreview();
    await screen.findByText("Synthetic Planner 1");
    expect(mocks.api.previewPayrollRun).toHaveBeenCalledWith({
      month: 4, year: 2026, period_kind: "weekly", period_start: "2026-04-01", period_end: "2026-04-07",
      employeeLineEvents: [{ employee_id: previewEmployeeId(0), events: [] }],
    }, expect.objectContaining({ signal: expect.any(AbortSignal), timeout: 30000 }));
    expect(screen.getByText("Calculated total").parentElement).toHaveTextContent("17,000.00");
    expect(screen.getByText("Synthetic Team Leader 2")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).not.toHaveTextContent("Synthetic setup planner");
    expect(mocks.api.savePayrollDraft).not.toHaveBeenCalled();
    expect(mocks.api.finalizePayrollRun).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByText("Setup totals are estimates. Use Preview to review the server calculation before saving.")).toBeInTheDocument();
    expect(screen.getByText("Grand Total Disbursement (estimate)").parentElement).toHaveTextContent("14,500");
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(mocks.api.savePayrollDraft).not.toHaveBeenCalled();
    expect(mocks.api.finalizePayrollRun).not.toHaveBeenCalled();
  });

  it("does not feed returned amounts or employee scope back into Save Draft", async () => {
    mount();
    await openPreview();
    await screen.findByText("Synthetic Planner 1");
    const sent = structuredClone(mocks.api.previewPayrollRun.mock.calls[0][0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Close preview" }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(mocks.api.savePayrollDraft).toHaveBeenCalledTimes(1));
    expect(mocks.api.savePayrollDraft).toHaveBeenCalledWith({ ...sent, created_by_user_id: previewUserId });
  });

  it.each([
    { label: "weekly rollover", cycle: "weekly", selection: "w5", start: "2026-04-29", end: "2026-05-05", kind: "weekly" },
    { label: "monthly", cycle: "monthly", selection: "monthly", start: "2026-04-01", end: "2026-04-30", kind: "month" },
    { label: "H1", cycle: "half_month", selection: "h1", start: "2026-04-01", end: "2026-04-15", kind: "half_month" },
    { label: "H2", cycle: "half_month", selection: "h2", start: "2026-04-16", end: "2026-04-30", kind: "half_month" },
    { label: "manual range", cycle: "manual", selection: "manual", start: "2026-03-29", end: "2026-04-04", kind: "range" },
  ])("preserves the configured $label policy", async ({ cycle, selection, start, end, kind }) => {
    mocks.params = new URLSearchParams(`date=2026-04&period_type=${selection}`);
    mocks.api.getPayrollCycleSettings.mockResolvedValue({ payroll_cycle: cycle, payroll_manual_start_date: "2026-03-29", payroll_cycle_days: 7 });
    mocks.api.previewPayrollRun.mockResolvedValue({ ...previewResult(), period_start: start, period_end: end, period_kind: kind });
    mount();
    await waitFor(() => expect(mocks.api.getEligiblePayrollCommissions).toHaveBeenLastCalledWith(start, end));
    await openPreview();
    await screen.findByText("Synthetic Planner 1");
    expect(mocks.api.previewPayrollRun.mock.calls[0][0]).toMatchObject({ month: 4, year: 2026, period_kind: kind, period_start: start, period_end: end });
  });

  it("closes a pending period immediately, ignores its late response and never relabels it as the new request", async () => {
    const old = deferred();
    mocks.api.previewPayrollRun.mockReturnValueOnce(old.promise).mockResolvedValueOnce({
      ...previewResult(), period_kind: "weekly", period_start: "2026-05-01", period_end: "2026-05-07",
    });
    const view = mount();
    await openPreview();
    await screen.findByText("Calculating payroll preview...");
    const oldSignal = mocks.api.previewPayrollRun.mock.calls[0][1].signal;
    mocks.params = new URLSearchParams("date=2026-05&period_type=w1");
    view.refresh();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(oldSignal.aborted).toBe(true);
    await screen.findByDisplayValue("2026-05");
    await openPreview();
    await screen.findByText("Synthetic Planner 1");
    expect(screen.getByRole("dialog")).toHaveTextContent("Calculated period: 2026-05-01 – 2026-05-07 (Weekly)");
    const obsolete = previewResult();
    obsolete.employee_lines[0].employee_name_snapshot = "Synthetic obsolete identity";
    await act(async () => old.resolve(obsolete));
    expect(screen.queryByText("Synthetic obsolete identity")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("2026-05-01 – 2026-05-07");
    expect(mocks.api.previewPayrollRun).toHaveBeenCalledTimes(2);
    mocks.params = new URLSearchParams("date=2026-04&period_type=w1");
    view.refresh();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["cached", "pending"])("invalidates a %s preview when the user changes, including a later switch back", async (state) => {
    const old = deferred();
    if (state === "pending") mocks.api.previewPayrollRun.mockReturnValueOnce(old.promise);
    const view = mount();
    await openPreview();
    await screen.findByText(state === "cached" ? "Synthetic Planner 1" : "Calculating payroll preview...");
    const signal = mocks.api.previewPayrollRun.mock.calls[0][1].signal;
    mocks.userId = "23300000-0000-4000-8000-000000000002";
    view.refresh();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Calculated total")).not.toBeInTheDocument();
    if (state === "pending") expect(signal.aborted).toBe(true);
    await act(async () => old.resolve(previewResult()));
    mocks.userId = previewUserId;
    view.refresh();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.api.previewPayrollRun).toHaveBeenCalledTimes(1);
  });

  it("does not treat payroll write permission as permission to preview", async () => {
    mocks.permissions = ["payroll:write"];
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Draft" })).toBeEnabled());
    const trigger = screen.getByRole("button", { name: "Preview" });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAccessibleDescription("Preview requires payroll read permission.");
    fireEvent.click(trigger);
    expect(mocks.api.previewPayrollRun).not.toHaveBeenCalled();
  });

  it.each(["cached", "pending"])("closes and hides %s results when the current read grant is revoked and focuses the explanation", async (state) => {
    const old = deferred();
    if (state === "pending") mocks.api.previewPayrollRun.mockReturnValueOnce(old.promise);
    const view = mount();
    await openPreview();
    await screen.findByText(state === "cached" ? "Synthetic Planner 1" : "Calculating payroll preview...");
    mocks.permissions = ["payroll:write"];
    view.refresh();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Calculated total")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    await act(async () => old.resolve(previewResult()));
    await waitFor(() => expect(screen.getByText("Preview requires payroll read permission.")).toHaveFocus());
    mocks.permissions = ["payroll:read", "payroll:write"];
    view.refresh();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.api.previewPayrollRun).toHaveBeenCalledTimes(1);
  });

  it("hides an existing result while the current authentication state is unresolved", async () => {
    const view = mount();
    await openPreview();
    await screen.findByText("Synthetic Planner 1");
    mocks.authLoading = true;
    view.refresh();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Calculated total")).not.toBeInTheDocument();
    mocks.authLoading = false;
    view.refresh();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["pending", "unknown"])("leaves the existing %s write guard intact", async (state) => {
    const guard = renderHook(usePayrollMutationGuard);
    act(() => {
      if (state === "pending") guard.result.current.begin();
      else guard.result.current.fail({ response: { status: 503, data: { outcome_uncertain: true } } }, "Synthetic unknown write");
    });
    mount();
    const trigger = await screen.findByRole("button", { name: "Preview" });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(mocks.api.previewPayrollRun).not.toHaveBeenCalled();
    expect(guard.result.current.pending).toBe(state === "pending");
    expect(guard.result.current.needsReload).toBe(state === "unknown");
  });

  it("does not clear even a known write-failure notice when opening or closing Preview", async () => {
    const guard = renderHook(usePayrollMutationGuard);
    act(() => guard.result.current.fail({ response: { status: 400, data: { error: "Synthetic known write failure" } } }, "Unable to save"));
    mount();
    await openPreview();
    await screen.findByText("Synthetic Planner 1");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(guard.result.current.failure).toEqual({ message: "Synthetic known write failure", needsReload: false });
    expect(screen.getByRole("alert")).toHaveTextContent("Synthetic known write failure");
  });
});
