import { useCallback, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { previewPayrollRun } from "@/lib/api";
import { previewEmployeeId, previewRequest, previewResult } from "@/__tests__/payroll-preview-fixtures";
import PayrollPreviewSheet from "./PayrollPreviewSheet";

const context = vi.hoisted(() => ({ mobile: false, lang: "en" }));
vi.mock("@/lib/api", () => ({ previewPayrollRun: vi.fn() }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: context.lang }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => context.mobile }));

const clients: QueryClient[] = [];
const request = previewRequest();
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => { resolve = done; });
  return { promise, resolve };
}

function mount(canRead = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 1 } } });
  clients.push(client);
  const restored = vi.fn();
  function Harness({ allowed }: { allowed: boolean }) {
    const [open, setOpen] = useState(true);
    const trigger = useRef<HTMLButtonElement>(null);
    const note = useRef<HTMLParagraphElement>(null);
    const close = useCallback(() => setOpen(false), []);
    return <>
      <button ref={trigger} disabled={!allowed} onClick={() => setOpen(true)}>Preview trigger</button>
      {!allowed && <p ref={note} tabIndex={-1}>Synthetic read access revoked</p>}
      {open && <PayrollPreviewSheet request={request} canRead={allowed} onClose={close} restoreFocus={() => {
        restored();
        if (trigger.current && !trigger.current.disabled) trigger.current.focus();
        else note.current?.focus();
      }} />}
    </>;
  }
  const tree = (allowed: boolean) => <QueryClientProvider client={client}><Harness allowed={allowed} /></QueryClientProvider>;
  const view = render(tree(canRead));
  return { ...view, client, restored, setReadAccess: (allowed: boolean) => view.rerender(tree(allowed)) };
}

beforeEach(() => {
  context.mobile = false;
  context.lang = "en";
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.resetAllMocks();
});

describe("read-only authoritative payroll sheet", () => {
  it("shows only the captured server identities, amounts and period through a bounded request", async () => {
    vi.mocked(previewPayrollRun).mockResolvedValue(previewResult());
    mount();
    await screen.findByText("Synthetic Planner 1");
    const dialog = screen.getByRole("dialog", { name: "Payroll preview" });
    expect(dialog).toHaveAccessibleDescription("Read-only server calculation. Preview does not save or finalize payroll.");
    expect(dialog).toHaveTextContent("Calculated period: 2026-04-01 – 2026-04-30 (Full month)");
    expect(screen.getByText("Calculated total").parentElement).toHaveTextContent("17,000.00 ETB");
    expect(screen.getByText("Base salaries").parentElement).toHaveTextContent("14,500.00 ETB");
    expect(screen.getByText("Verified commissions").parentElement).toHaveTextContent("2,500.00 ETB");
    expect(screen.getByText("SYNTHETIC-1")).toBeInTheDocument();
    const leader = screen.getByRole("row", { name: /Synthetic Team Leader 2/ });
    expect(within(leader).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["0.00", "2,500.00", "2,500.00"]);
    expect(previewPayrollRun).toHaveBeenCalledWith(request.payload, expect.objectContaining({ signal: expect.any(AbortSignal), timeout: 30000 }));
    expect(screen.queryByRole("button", { name: /Save|Finalize/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("distinguishes an HTTP failure, malformed success and a legitimate empty preview with manual retries only", async () => {
    vi.mocked(previewPayrollRun)
      .mockRejectedValueOnce({ response: { status: 500, data: { error: "Synthetic preview unavailable" } } })
      .mockResolvedValueOnce({ total_payroll_value: 0 })
      .mockResolvedValueOnce(previewResult(0));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic preview unavailable");
    expect(previewPayrollRun).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Calculated total")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
    await screen.findByText("The preview response could not be verified. Try again.");
    expect(screen.queryByText("No employees were returned for this preview.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
    await screen.findByText("No employees were returned for this preview.");
    expect(screen.getByText("Calculated total").parentElement).toHaveTextContent("0.00");
    expect(previewPayrollRun).toHaveBeenCalledTimes(3);
  });

  it("surfaces a transport timeout instead of treating it as a successful zero payroll", async () => {
    vi.mocked(previewPayrollRun).mockRejectedValue({ code: "ECONNABORTED", message: "Synthetic timeout" });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load payroll preview. Your setup is unchanged.");
    expect(screen.getByRole("button", { name: "Retry preview" })).toBeEnabled();
    expect(previewPayrollRun).toHaveBeenCalledTimes(1);
  });

  it("keeps a denied refresh from exposing the previously successful result", async () => {
    vi.mocked(previewPayrollRun).mockResolvedValueOnce(previewResult())
      .mockRejectedValueOnce({ response: { status: 403, data: { error: "Forbidden" } } });
    mount();
    await screen.findByText("Synthetic Planner 1");
    fireEvent.click(screen.getByRole("button", { name: "Refresh preview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Payroll read permission is required");
    expect(screen.queryByText("Synthetic Planner 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Calculated total")).not.toBeInTheDocument();
  });

  it("renders ten rows per page and reaches the last employee without changing the full-roster totals", async () => {
    vi.mocked(previewPayrollRun).mockResolvedValue(previewResult(25));
    mount();
    await screen.findByText("Synthetic Planner 1");
    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(screen.queryByText("Synthetic Planner 25")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous employees" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next employees" }));
    await screen.findByText("Synthetic Planner 11");
    fireEvent.click(screen.getByRole("button", { name: "Next employees" }));
    await screen.findByText("Synthetic Planner 25");
    expect(screen.getAllByRole("row")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Next employees" })).toBeDisabled();
    expect(screen.getByText("Calculated total").parentElement).toHaveTextContent("218,500.00");
    expect(previewPayrollRun).toHaveBeenCalledTimes(1);
  });

  it("clears old amounts during refresh and resets paging for a smaller current roster", async () => {
    const refreshed = deferred();
    vi.mocked(previewPayrollRun).mockResolvedValueOnce(previewResult(25)).mockReturnValueOnce(refreshed.promise);
    mount();
    await screen.findByText("Synthetic Planner 1");
    fireEvent.click(screen.getByRole("button", { name: "Next employees" }));
    fireEvent.click(screen.getByRole("button", { name: "Next employees" }));
    await screen.findByText("Synthetic Planner 25");
    fireEvent.click(screen.getByRole("button", { name: "Refresh preview" }));
    await screen.findByText("Calculating payroll preview...");
    expect(screen.queryByText("Synthetic Planner 25")).not.toBeInTheDocument();
    expect(screen.queryByText("Calculated total")).not.toBeInTheDocument();
    const next = previewResult();
    Object.assign(next.employee_lines[0], { compensation_mode_snapshot: "commission_only", snapshot_base_salary: 0, total_line_pay: 0 });
    Object.assign(next.employee_lines[1], { total_events_value: 2000, total_line_pay: 2000, events: next.employee_lines[1].events.slice(0, 1) });
    next.total_payroll_value = 2000;
    await act(async () => refreshed.resolve(next));
    expect(await screen.findByText("Page 1 / 1")).toBeInTheDocument();
    expect(screen.getByText("Calculated total").parentElement).toHaveTextContent("2,000.00");
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("labels the returned canonical dates and kind and explains a requested-period difference", async () => {
    vi.mocked(previewPayrollRun).mockResolvedValue({
      ...previewResult(), period_start: "2026-04-29", period_end: "2026-05-05", period_kind: "weekly",
    });
    mount();
    await screen.findByText("Synthetic Planner 1");
    expect(screen.getByRole("dialog")).toHaveTextContent("Calculated period: 2026-04-29 – 2026-05-05 (Weekly)");
    expect(screen.getByRole("status")).toHaveTextContent("The server used a different period from the setup");
    expect(screen.getByRole("status")).toHaveTextContent("Requested period: 2026-04-01 – 2026-04-30 (Full month)");
  });

  it("uses a mobile list with every amount and a clearly labelled UUID when no code exists", async () => {
    context.mobile = true;
    const response = previewResult(12);
    response.employee_lines[0].employee_code_snapshot = null;
    vi.mocked(previewPayrollRun).mockResolvedValue(response);
    mount();
    await screen.findByText("Synthetic Planner 1");
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(`Record ID: ${previewEmployeeId(0)}`);
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("14,500.00");
    expect(screen.getAllByRole("listitem")[1]).toHaveTextContent("0.00");
    expect(screen.getAllByRole("listitem")[1]).toHaveTextContent("2,500.00");
    fireEvent.click(screen.getByRole("button", { name: "Next employees" }));
    await screen.findByText("Synthetic Team Leader 12");
  });

  it("retains the side-qualified mobile height and the same close control across loading and success", async () => {
    context.mobile = true;
    const pending = deferred();
    vi.mocked(previewPayrollRun).mockReturnValue(pending.promise);
    mount();
    const dialog = screen.getByRole("dialog");
    const close = screen.getAllByRole("button", { name: "Close preview" })[0];
    expect(dialog).toHaveAttribute("data-side", "bottom");
    expect(dialog).toHaveClass("data-[side=bottom]:h-[90dvh]", "motion-reduce:transition-none");
    expect(close).toHaveClass("min-h-12", "min-w-12");
    await act(async () => pending.resolve(previewResult()));
    await screen.findByText("Synthetic Planner 1");
    expect(screen.getAllByRole("button", { name: "Close preview" })[0]).toBe(close);
    expect(screen.getByRole("dialog")).toHaveClass("data-[side=bottom]:h-[90dvh]");
  });

  it.each(["close", "Escape", "unmount"])("aborts on %s and ignores a late response without reopening", async (method) => {
    const pending = deferred();
    vi.mocked(previewPayrollRun).mockReturnValue(pending.promise);
    const view = mount();
    await screen.findByText("Calculating payroll preview...");
    const signal = vi.mocked(previewPayrollRun).mock.calls[0][1]?.signal;
    if (method === "unmount") view.unmount();
    else if (method === "Escape") fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    else fireEvent.click(screen.getAllByRole("button", { name: "Close preview" }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(previewResult()));
    expect(screen.queryByText("Synthetic Planner 1")).not.toBeInTheDocument();
    if (method !== "unmount") {
      await waitFor(() => expect(screen.getByRole("button", { name: "Preview trigger" })).toHaveFocus());
      expect(view.restored).toHaveBeenCalled();
    }
    await waitFor(() => expect(view.client.getQueryCache().findAll({ queryKey: ["payroll-preview"] })).toHaveLength(0));
  });

  it("never fetches or renders a preview without current read access", () => {
    mount(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(previewPayrollRun).not.toHaveBeenCalled();
    expect(screen.queryByText("Calculated total")).not.toBeInTheDocument();
  });

  it.each(["cached", "pending"])("closes and hides %s data immediately on read revocation", async (state) => {
    const pending = deferred();
    vi.mocked(previewPayrollRun).mockReturnValue(state === "cached" ? Promise.resolve(previewResult()) : pending.promise);
    const view = mount();
    await screen.findByText(state === "cached" ? "Synthetic Planner 1" : "Calculating payroll preview...");
    const signal = vi.mocked(previewPayrollRun).mock.calls[0][1]?.signal;
    view.setReadAccess(false);
    expect(screen.queryByText("Synthetic Planner 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Calculated total")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    if (state === "pending") expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(previewResult()));
    await waitFor(() => expect(screen.getByText("Synthetic read access revoked")).toHaveFocus());
    view.setReadAccess(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(previewPayrollRun).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing bilingual register for actions, status and financial labels", async () => {
    context.lang = "am";
    vi.mocked(previewPayrollRun).mockResolvedValue(previewResult());
    mount();
    await screen.findByText("Synthetic Planner 1");
    expect(screen.getByRole("dialog", { name: "የክፍያ ቅድመ እይታ" })).toBeInTheDocument();
    expect(screen.getByText("የተሰላ ጠቅላላ ክፍያ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ቅድመ እይታን አድስ" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "ቅድመ እይታን ዝጋ" })).toHaveLength(2);
  });
});
