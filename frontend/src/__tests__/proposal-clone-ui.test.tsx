import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosRequestConfig } from "axios";
import NewProposalPage from "@/app/events/proposals/new/page";
import { createPermissionMatcher } from "@/lib/permission-matcher";
import { PROPOSAL_CLONE_TIMEOUT_MS } from "@/lib/proposal-clone";
import {
  CLONE_SOURCE_ID, CLONE_CREATED_ID, CLONE_EVENT_TYPE_ID,
  cloneScopes, expectedClonePayload, proposalCloneSource,
} from "./fixtures/proposal-clone";

const state = vi.hoisted(() => ({
  sourceId: "aaaaaaaa-0000-4000-8000-000000000001" as string | null,
  userId: "clone-writer",
  authenticated: true,
  loading: false,
  permissions: ["events:proposals:write"],
  lang: "en",
}));
const mocks = vi.hoisted(() => ({
  getSource: vi.fn<(id: string, options?: Pick<AxiosRequestConfig, "signal" | "timeout">) => Promise<unknown>>(),
  create: vi.fn<(data: Record<string, unknown>) => Promise<{ proposal: { id: string } }>>(),
  submit: vi.fn<(id: string) => Promise<unknown>>(),
  eventTypes: vi.fn(),
  scopes: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(state.sourceId === null ? "" : { clone_from_id: state.sourceId }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => {
    const hasPermission = createPermissionMatcher(state.permissions);
    return {
      user: state.authenticated ? { id: state.userId } : undefined,
      isAuthenticated: state.authenticated,
      isLoading: state.loading,
      hasPermission,
      hasAnyPermission: (slugs: string[]) => slugs.some(hasPermission),
    };
  },
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: state.lang }) }));
vi.mock("@/components/AuthLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/toast", () => ({ notify: { success: mocks.success, error: vi.fn() } }));
vi.mock("@/lib/api", () => ({
  getEventProposal: mocks.getSource,
  createEventProposal: mocks.create,
  submitEventProposal: mocks.submit,
  getEventTypes: mocks.eventTypes,
  createEventType: vi.fn(),
  getServiceScopes: mocks.scopes,
}));

let client: QueryClient;

function viewPage() {
  const tree = () => <QueryClientProvider client={client}><NewProposalPage /></QueryClientProvider>;
  const view = render(tree());
  return { ...view, refresh: () => view.rerender(tree()) };
}

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function review() {
  await screen.findByDisplayValue(`${proposalCloneSource().name} (Copy)`);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByDisplayValue("Stage decor")).toBeInTheDocument();
  expect(screen.getByDisplayValue("Decor crew")).toBeInTheDocument();
  expect(screen.getByDisplayValue("Decor transport")).toBeInTheDocument();
  expect(screen.getByDisplayValue("Consumables")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Review Details")).toBeInTheDocument();
}

beforeEach(() => {
  state.sourceId = CLONE_SOURCE_ID;
  state.userId = "clone-writer";
  state.authenticated = true;
  state.loading = false;
  state.permissions = ["events:proposals:write"];
  state.lang = "en";
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getSource.mockResolvedValue({ proposal: proposalCloneSource(), logs: [] });
  mocks.create.mockResolvedValue({ proposal: { id: CLONE_CREATED_ID } });
  mocks.submit.mockResolvedValue({ success: true });
  mocks.eventTypes.mockResolvedValue([{ id: CLONE_EVENT_TYPE_ID, event_name: "Anniversary" }]);
  mocks.scopes.mockResolvedValue({ service_scopes: cloneScopes });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("actual proposal clone form", () => {
  it("hydrates canonical fields and saves the complete new draft without losing controls or metadata", async () => {
    viewPage();
    await screen.findByDisplayValue(`${proposalCloneSource().name} (Copy)`);
    expect(screen.getByDisplayValue("Gold fabric and warm lighting")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Keep the south entrance clear")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Anniversary client")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0912345678")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("00:00")).toHaveAttribute("type", "time");
    expect(screen.getByDisplayValue("23:45")).toHaveAttribute("type", "time");
    await screen.findByRole("button", { name: "Remove Decoration" });
    expect(screen.getByRole("button", { name: "Remove Lighting" })).toBeInTheDocument();
    expect(screen.queryByText("Live Financial Summary")).not.toBeInTheDocument();
    expect(mocks.getSource).toHaveBeenCalledWith(CLONE_SOURCE_ID, expect.objectContaining({
      timeout: 30000, signal: expect.any(AbortSignal),
    }));

    await review();
    expect(screen.getByText("2026-10-10 00:00")).toBeInTheDocument();
    expect(screen.getByText("2026-10-11 23:45")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create Draft" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][0]).toEqual(expectedClonePayload());
    expect(mocks.submit).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/events/proposals/${CLONE_CREATED_ID}`));
  });

  it("submits the copied draft once and preserves the existing profit permission gate", async () => {
    state.permissions = ["events:write", "reports:profit:read"];
    viewPage();
    await review();
    expect(screen.getByText("Live Financial Summary")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit for Approval" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledExactlyOnceWith(CLONE_CREATED_ID));
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(expectedClonePayload());
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.submit.mock.invocationCallOrder[0]);
  });

  it("keeps Dream Lux scope selection editable and recalculates crew amounts after a copied-line edit", async () => {
    viewPage();
    await screen.findByRole("button", { name: "Remove Decoration" });
    fireEvent.click(screen.getByRole("button", { name: "Remove Decoration" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByPlaceholderText("People Count"), { target: { value: "5" } });
    expect(screen.getByDisplayValue("15000")).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Draft" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const expected = expectedClonePayload();
    expect(mocks.create.mock.calls[0][0]).toEqual({
      ...expected,
      service_scope_ids: ["scope-lighting"],
      cost_breakdown: {
        ...expected.cost_breakdown,
        team: [{ ...expected.cost_breakdown.team![0], people_count: 5, amount: 15000 }],
      },
    });
  });

  it("leaves ordinary no-clone intake working without a source request", async () => {
    state.sourceId = null;
    viewPage();
    fireEvent.change(screen.getByPlaceholderText("e.g. Annual Charity Gala"), { target: { value: "New intake" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Acme Corporation"), { target: { value: "New client" } });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "50000" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Grand Hyatt, Addis Ababa"), { target: { value: "Addis Hall" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Draft" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      name: "New intake", requested_start_date: null, package_design_notes: null,
      cost_breakdown: { design: [], team: [], trip: [], other: [] },
    });
    expect(mocks.getSource).not.toHaveBeenCalled();
  });
});

describe("clone source lifecycle and failure gates", () => {
  it("waits for resolved auth and permissions before fetching the source or showing editable fields", async () => {
    state.loading = true;
    const view = viewPage();
    expect(mocks.getSource).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("e.g. Annual Charity Gala")).not.toBeInTheDocument();
    state.loading = false;
    state.permissions = [];
    view.refresh();
    expect(mocks.getSource).not.toHaveBeenCalled();
    state.permissions = ["events:proposals:write"];
    view.refresh();
    await screen.findByDisplayValue(`${proposalCloneSource().name} (Copy)`);
    expect(mocks.getSource).toHaveBeenCalledTimes(1);
  });

  it("does not fetch for an unauthenticated user even when stale write permissions exist", () => {
    state.authenticated = false;
    viewPage();
    expect(mocks.getSource).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("blocks editing, next, save and submit while the source is pending, and permits cancellation", async () => {
    const pending = deferred();
    mocks.getSource.mockReturnValue(pending.promise);
    viewPage();
    expect(screen.getByRole("status")).toHaveTextContent("Loading source proposal");
    for (const name of ["Next", "Create Draft", "Submit for Approval", "Retry source"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByPlaceholderText("e.g. Annual Charity Gala")).not.toBeInTheDocument();
    const signal = mocks.getSource.mock.calls[0][1]!.signal!;
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signal.aborted).toBe(true);
    expect(mocks.push).toHaveBeenCalledWith("/events/proposals");
    await act(async () => pending.resolve({ proposal: proposalCloneSource() }));
    expect(screen.queryByPlaceholderText("e.g. Annual Charity Gala")).not.toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it.each([null, {}, { proposal: null }, { proposal: { ...proposalCloneSource(), cost_breakdown: null } }])(
    "rejects malformed source responses without partially hydrating the form: %j", async (response) => {
      mocks.getSource.mockResolvedValue(response);
      viewPage();
      await screen.findByRole("alert");
      expect(screen.queryByPlaceholderText("e.g. Annual Charity Gala")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Source could not be loaded"), expect.objectContaining({ sourceId: CLONE_SOURCE_ID }));
    },
  );

  it("requires a source ID rather than treating an empty clone parameter as ordinary intake", async () => {
    state.sourceId = "";
    viewPage();
    await screen.findByRole("alert");
    expect(mocks.getSource).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("e.g. Annual Charity Gala")).not.toBeInTheDocument();
  });

  it("recovers through one manual retry and makes no automatic retries", async () => {
    mocks.getSource.mockRejectedValueOnce(new Error("Synthetic transport failure"));
    const view = viewPage();
    await screen.findByRole("alert");
    await act(async () => client.invalidateQueries());
    view.refresh();
    expect(mocks.getSource).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Retry source/ }));
    await screen.findByDisplayValue(`${proposalCloneSource().name} (Copy)`);
    expect(mocks.getSource).toHaveBeenCalledTimes(2);
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it("caps manual retries at three and resets the budget only for a different source", async () => {
    mocks.getSource.mockRejectedValue(new Error("Synthetic unavailable source"));
    const view = viewPage();
    for (let attempt = 0; attempt <= 3; attempt++) {
      await screen.findByRole("alert");
      expect(mocks.getSource).toHaveBeenCalledTimes(attempt + 1);
      const retry = screen.getByRole("button", { name: /Retry source/ });
      if (attempt < 3) fireEvent.click(retry);
      else expect(retry).toBeDisabled();
    }
    expect(screen.getByText(/Retry limit reached/)).toBeInTheDocument();
    state.sourceId = CLONE_CREATED_ID;
    view.refresh();
    await screen.findByRole("alert");
    expect(mocks.getSource).toHaveBeenCalledTimes(5);
    expect(screen.getByRole("button", { name: /Retry source/ })).toBeEnabled();
  });

  it("bounds a never-settling request to 30 seconds, aborts it and ignores its late success", async () => {
    vi.useFakeTimers();
    const pending = deferred();
    mocks.getSource.mockReturnValue(pending.promise);
    viewPage();
    const signal = mocks.getSource.mock.calls[0][1]!.signal!;
    await act(async () => vi.advanceTimersByTime(PROPOSAL_CLONE_TIMEOUT_MS - 1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(1));
    expect(signal.aborted).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent("timed out after 30 seconds");
    await act(async () => pending.resolve({ proposal: proposalCloneSource() }));
    expect(screen.queryByPlaceholderText("e.g. Annual Charity Gala")).not.toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ reason: "timeout" }));
  });

  it.each(["source", "user"] as const)("aborts old %s requests and ignores late responses when identity changes", async (change) => {
    const first = deferred();
    const second = deferred();
    mocks.getSource.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = viewPage();
    const firstSignal = mocks.getSource.mock.calls[0][1]!.signal!;
    if (change === "source") state.sourceId = CLONE_CREATED_ID;
    else state.userId = "next-writer";
    view.refresh();
    expect(firstSignal.aborted).toBe(true);
    expect(mocks.getSource).toHaveBeenCalledTimes(2);
    await act(async () => first.resolve({ proposal: proposalCloneSource() }));
    expect(screen.queryByPlaceholderText("e.g. Annual Charity Gala")).not.toBeInTheDocument();
    await act(async () => second.resolve({ proposal: proposalCloneSource({ id: state.sourceId!, name: "Current source" }) }));
    expect(screen.getByDisplayValue("Current source (Copy)")).toBeInTheDocument();
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it("cancels on unmount and ignores a late transport rejection", async () => {
    const pending = deferred();
    mocks.getSource.mockReturnValue(pending.promise);
    const view = viewPage();
    const signal = mocks.getSource.mock.calls[0][1]!.signal!;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.reject(new Error("Late transport failure")));
    expect(console.warn).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("preserves loaded user edits through language/auth/query refreshes without rehydration", async () => {
    const view = viewPage();
    const input = await screen.findByDisplayValue(`${proposalCloneSource().name} (Copy)`);
    fireEvent.change(input, { target: { value: "Writer's unsaved edits" } });
    await act(async () => client.invalidateQueries());
    state.lang = "am";
    view.refresh();
    state.loading = true;
    view.refresh();
    state.loading = false;
    view.refresh();
    expect(screen.getByDisplayValue("Writer's unsaved edits")).toBeInTheDocument();
    expect(mocks.getSource).toHaveBeenCalledTimes(1);
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it("clears a loaded clone when switching to ordinary intake", async () => {
    const view = viewPage();
    await screen.findByDisplayValue(`${proposalCloneSource().name} (Copy)`);
    state.sourceId = null;
    view.refresh();
    expect(screen.getByPlaceholderText("e.g. Annual Charity Gala")).toHaveValue("");
    expect(screen.getByPlaceholderText("0.00")).toHaveValue(null);
    expect(mocks.getSource).toHaveBeenCalledTimes(1);
  });

  it("localizes explicit loading, failure and retry states in Amharic", async () => {
    state.lang = "am";
    const pending = deferred();
    mocks.getSource.mockReturnValue(pending.promise);
    viewPage();
    expect(screen.getByRole("status")).toHaveTextContent("ዋናውን ፕሮፖዛል በመጫን ላይ");
    await act(async () => pending.reject(new Error("Synthetic transport failure")));
    expect(screen.getByRole("alert")).toHaveTextContent("ፕሮፖዛሉን መቅዳት አልተቻለም");
    expect(screen.getByRole("button", { name: /ዋናውን እንደገና ጫን/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ሰርዝ" })).toBeInTheDocument();
  });
});
