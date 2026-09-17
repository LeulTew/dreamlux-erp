import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { getEmployees } from "@/lib/api";
import StaffPaymentEmployeePicker from "./StaffPaymentEmployeePicker";

const mocks = vi.hoisted(() => ({
  getEmployees: vi.fn<(...args: Parameters<typeof getEmployees>) => Promise<unknown>>(),
}));
vi.mock("@/lib/api", () => ({ getEmployees: mocks.getEmployees }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "en" }) }));

const employee = { id: "23200000-0000-4000-8000-000000000151", full_name: "Synthetic Zuri", employee_id: "SYN-0151" };
const response = { employees: [employee], total: 1, page: 1, limit: 50 };
const clients: QueryClient[] = [];

function mount(props: { value?: string; savedLabel?: string; onChange?: (value: string) => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 1 } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <StaffPaymentEmployeePicker value={props.value ?? ""} savedLabel={props.savedLabel} onChange={props.onChange ?? vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => mocks.getEmployees.mockReset().mockResolvedValue(response));
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

describe("Staff payment employee lookup", () => {
  it("uses the canonical positional contract, bounded page, cancellation and ten-second deadline", async () => {
    mount();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Employee Link" })).toBeEnabled());
    expect(mocks.getEmployees).toHaveBeenCalledExactlyOnceWith(1, 50, undefined, "active", undefined, undefined, "name", "asc",
      expect.objectContaining({ signal: expect.any(AbortSignal), timeout: 10_000 }));
  });

  it("keeps loading separate from a genuinely empty response", async () => {
    let resolve!: (value: unknown) => void;
    mocks.getEmployees.mockReturnValue(new Promise((done) => { resolve = done; }));
    mount();
    expect(screen.getByText("Loading employees...")).toBeVisible();
    expect(screen.queryByText("No employees available.")).not.toBeInTheDocument();
    await act(async () => resolve({ employees: [], total: 0, page: 1, limit: 50 }));
    expect(await screen.findByText("No employees available.")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("debounces and trims server search, resetting the page without selecting an employee", async () => {
    const onChange = vi.fn();
    mocks.getEmployees.mockImplementation(async (page, limit, search) => ({
      employees: [employee], total: search ? 1 : 151, page, limit,
    }));
    mount({ onChange });
    await waitFor(() => expect(screen.getByRole("button", { name: "Next employees" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Next employees" }));
    await screen.findByText("Page 2 of 4");
    fireEvent.change(screen.getByRole("searchbox", { name: "Find employee" }), { target: { value: "  SYN" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Find employee" }), { target: { value: "  SYN-0151  " } });
    await screen.findByText("Page 1 of 1");
    expect(mocks.getEmployees.mock.calls.map((call) => call.slice(0, 4))).toEqual([
      [1, 50, undefined, "active"], [2, 50, undefined, "active"], [1, 50, "SYN-0151", "active"],
    ]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    { employees: undefined, total: 0, page: 1, limit: 50 },
    { employees: [], total: 1, page: 1, limit: 50 },
    { employees: [], total: -1, page: 1, limit: 50 },
    { ...response, page: 2 },
    { ...response, limit: 5000 },
    { ...response, employees: [employee, employee], total: 2 },
    { ...response, employees: [{ ...employee, full_name: " " }] },
    { ...response, employees: Array.from({ length: 51 }, (_, index) => ({ ...employee, id: String(index) })), total: 51 },
  ])("treats a malformed lookup as an error, not empty success: %j", async (data) => {
    mocks.getEmployees.mockResolvedValue(data);
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Your payment details are unchanged.");
    expect(screen.queryByText("No employees available.")).not.toBeInTheDocument();
    expect(mocks.getEmployees).toHaveBeenCalledTimes(1);
  });

  it("retains the saved association on denied lookup, with no automatic retry on focus or reconnect", async () => {
    const onChange = vi.fn();
    mocks.getEmployees.mockRejectedValue(Object.assign(new Error("Denied"), { isAxiosError: true, response: { status: 403 } }));
    mount({ value: employee.id, savedLabel: "Saved synthetic employee", onChange });
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have access");
    expect(screen.getByRole("combobox")).toHaveTextContent("Saved synthetic employee");
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    expect(mocks.getEmployees).toHaveBeenCalledTimes(1);
    mocks.getEmployees.mockResolvedValue(response);
    fireEvent.click(screen.getByRole("button", { name: "Retry employee lookup" }));
    await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled());
    expect(mocks.getEmployees).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("retains an identifiable record ID when the saved name is unavailable", async () => {
    mocks.getEmployees.mockResolvedValue({ employees: [], total: 0, page: 1, limit: 50 });
    mount({ value: employee.id });
    await screen.findByText("No employees available.");
    expect(screen.getByRole("combobox")).toHaveTextContent(`Linked employee (${employee.id})`);
  });

  it("aborts a cancelled drawer request without clearing or applying any selection", async () => {
    let resolve!: (value: unknown) => void;
    const onChange = vi.fn();
    mocks.getEmployees.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = mount({ value: employee.id, savedLabel: employee.full_name, onChange });
    const signal = mocks.getEmployees.mock.calls[0][8]?.signal;
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(response));
    expect(onChange).not.toHaveBeenCalled();
  });
});
