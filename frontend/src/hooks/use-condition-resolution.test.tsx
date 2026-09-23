import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConditionResolution } from "./use-condition-resolution";
import { assertConditionActor, getConditionItem, submitConditionResolution } from "@/lib/condition-stock-api";
import { invalidateInventoryState } from "@/lib/inventory-cache";
import { conditionStorageKey } from "@/lib/condition-resolution-store";
import { conditionActor, conditionDraft, conditionItem, conditionReceipt, otherConditionActor } from "@/__tests__/helpers/condition-stock";
import type { ConditionResolution } from "@/lib/condition-stock";

vi.mock("@/lib/condition-stock-api", () => ({
  assertConditionActor: vi.fn(), getConditionItem: vi.fn(), submitConditionResolution: vi.fn(),
}));
vi.mock("@/lib/inventory-cache", () => ({ invalidateInventoryState: vi.fn() }));
const clients: QueryClient[] = [];
function setup(actor = conditionActor) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 5, networkMode: "online" }, queries: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(({ actorId, write }) => useConditionResolution(actorId, true, write), {
    wrapper, initialProps: { actorId: actor, write: true },
  });
  return { ...hook, client, wrapper };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  onlineManager.setOnline(true);
  vi.mocked(assertConditionActor).mockResolvedValue(undefined);
  vi.mocked(invalidateInventoryState).mockResolvedValue(undefined);
  vi.mocked(submitConditionResolution).mockImplementation(async (intent) => ({
    ...conditionReceipt, idempotency_key: intent.payload.idempotency_key,
  }));
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); onlineManager.setOnline(true); vi.restoreAllMocks(); });

describe("condition resolution admission and settlement", () => {
  it("writes verified recovery intent before admission and releases acknowledgement independently of a hung refresh", async () => {
    const hook = setup();
    vi.mocked(invalidateInventoryState).mockReturnValue(new Promise(() => {}));
    vi.mocked(assertConditionActor).mockImplementation(async () => {
      expect(JSON.parse(sessionStorage.getItem(conditionStorageKey(conditionActor))!).intent.draft).toEqual(conditionDraft);
    });
    act(() => hook.result.current.submit(conditionItem, conditionDraft));
    await waitFor(() => expect(hook.result.current.state.phase).toBe("acknowledged"));
    const key = hook.result.current.state.intent!.payload.idempotency_key;
    act(() => expect(hook.result.current.release(key)).toBe(true));
    expect(hook.result.current.state.phase).toBe("idle");
    expect(submitConditionResolution).toHaveBeenCalledTimes(1);
  });

  it("has no inherited online pause or automatic mutation retry", async () => {
    const hook = setup();
    onlineManager.setOnline(false);
    vi.mocked(submitConditionResolution).mockRejectedValue(new Error("Lost acknowledgement"));
    act(() => hook.result.current.submit(conditionItem, conditionDraft));
    await waitFor(() => expect(hook.result.current.state.phase).toBe("unknown"));
    act(() => { onlineManager.setOnline(true); window.dispatchEvent(new Event("online")); });
    expect(submitConditionResolution).toHaveBeenCalledTimes(1);
    expect(hook.client.getMutationCache().getAll()).toEqual([]);
  });

  it("preflights offline state both before admission and immediately before dispatch", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const hook = setup();
    act(() => hook.result.current.submit(conditionItem, conditionDraft));
    expect(hook.result.current.notice).toBe("offline");
    expect(assertConditionActor).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    const admission = deferred<void>();
    vi.mocked(assertConditionActor).mockReturnValue(admission.promise);
    act(() => hook.result.current.submit(conditionItem, conditionDraft));
    online.mockReturnValue(false);
    await act(async () => admission.resolve(undefined));
    expect(submitConditionResolution).not.toHaveBeenCalled();
    expect(hook.result.current.state).toMatchObject({ phase: "rejected", failure: "offline" });
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(submitConditionResolution).not.toHaveBeenCalled();
  });

  it("keeps a pending guard across navigation and QueryClient clearing", async () => {
    const hook = setup();
    const write = deferred<ConditionResolution>();
    vi.mocked(submitConditionResolution).mockReturnValue(write.promise);
    act(() => hook.result.current.submit(conditionItem, conditionDraft));
    await waitFor(() => expect(submitConditionResolution).toHaveBeenCalledTimes(1));
    const intent = hook.result.current.state.intent!;
    hook.unmount();
    act(() => hook.client.clear());
    const next = renderHook(() => useConditionResolution(conditionActor, true, true), { wrapper: hook.wrapper });
    expect(next.result.current.state.phase).toBe("pending");
    act(() => next.result.current.submit(conditionItem, conditionDraft));
    expect(submitConditionResolution).toHaveBeenCalledTimes(1);
    await act(async () => write.resolve({ ...conditionReceipt, idempotency_key: intent.payload.idempotency_key }));
    expect(next.result.current.state.phase).toBe("acknowledged");
  });

  it("restores an unknown operation across a new QueryClient and retains it after a known retry rejection", async () => {
    const hook = setup();
    vi.mocked(submitConditionResolution).mockRejectedValue(new Error("Connection lost"));
    act(() => hook.result.current.submit(conditionItem, conditionDraft));
    await waitFor(() => expect(hook.result.current.state.phase).toBe("unknown"));
    const original = hook.result.current.state.intent;
    hook.unmount();
    const restored = setup();
    expect(restored.result.current.state).toMatchObject({ phase: "unknown", intent: original });
    expect(submitConditionResolution).toHaveBeenCalledTimes(1);
    vi.mocked(submitConditionResolution).mockRejectedValue({ response: { status: 409 } });
    act(() => restored.result.current.retry());
    await waitFor(() => expect(restored.result.current.state.phase).toBe("unknown"));
    expect(submitConditionResolution).toHaveBeenLastCalledWith(original);
    expect(restored.result.current.state.intent).toEqual(original);
  });

  it("blocks dispatch when authority changes during admission and never affects another account's draft", async () => {
    const hook = setup();
    const admission = deferred<void>();
    vi.mocked(assertConditionActor).mockReturnValue(admission.promise);
    act(() => hook.result.current.submit(conditionItem, conditionDraft));
    hook.rerender({ actorId: otherConditionActor, write: true });
    expect(hook.result.current.state.phase).toBe("idle");
    await act(async () => admission.resolve(undefined));
    expect(submitConditionResolution).not.toHaveBeenCalled();
    expect(hook.result.current.state).toMatchObject({ phase: "idle", intent: null });
    hook.rerender({ actorId: conditionActor, write: false });
    expect(hook.result.current.state.phase).toBe("rejected");
    act(() => hook.result.current.retry());
    expect(submitConditionResolution).not.toHaveBeenCalled();
  });

  it("retains uncertainty after failed or missing recovery reads and confirms only an exact saved record", async () => {
    const hook = setup();
    vi.mocked(submitConditionResolution).mockRejectedValue(new Error("Uncertain"));
    act(() => hook.result.current.submit(conditionItem, conditionDraft));
    await waitFor(() => expect(hook.result.current.state.phase).toBe("unknown"));
    const intent = hook.result.current.state.intent!;
    vi.mocked(getConditionItem).mockRejectedValue({ response: { status: 503 } });
    await act(() => hook.result.current.check());
    expect(hook.result.current.notice).toBe("read");
    vi.mocked(getConditionItem).mockResolvedValue({ item: conditionItem, history: [], next_cursor: null, recovery: null });
    await act(() => hook.result.current.check());
    expect(hook.result.current.state).toMatchObject({ phase: "unknown", failure: "noRecord" });
    vi.mocked(getConditionItem).mockResolvedValue({ item: conditionItem, history: [], next_cursor: null,
      recovery: { ...conditionReceipt, idempotency_key: intent.payload.idempotency_key } });
    await act(() => hook.result.current.check());
    expect(hook.result.current.state.phase).toBe("acknowledged");
    expect(submitConditionResolution).toHaveBeenCalledTimes(1);
  });

  it("sends nothing if recovery storage cannot be persisted", () => {
    const hook = setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage denied"); });
    act(() => hook.result.current.submit(conditionItem, conditionDraft));
    expect(hook.result.current.state.storageWarning).toBe(true);
    expect(assertConditionActor).not.toHaveBeenCalled();
    expect(submitConditionResolution).not.toHaveBeenCalled();
  });

  it("retains a source acknowledgement when advisory refresh rejects", async () => {
    const hook = setup();
    vi.mocked(invalidateInventoryState).mockRejectedValue(new Error("Read failed"));
    act(() => hook.result.current.submit(conditionItem, conditionDraft));
    await waitFor(() => expect(hook.result.current.refreshFailed).toBe(true));
    expect(hook.result.current.state.phase).toBe("acknowledged");
    const key = hook.result.current.state.intent!.payload.idempotency_key;
    act(() => expect(hook.result.current.release(key)).toBe(true));
    expect(hook.result.current.state.phase).toBe("idle");
  });

  it("does not expose a late acknowledgement or recovery read after switching accounts", async () => {
    const hook = setup();
    const write = deferred<ConditionResolution>();
    vi.mocked(submitConditionResolution).mockReturnValue(write.promise);
    act(() => hook.result.current.submit(conditionItem, conditionDraft));
    await waitFor(() => expect(submitConditionResolution).toHaveBeenCalledOnce());
    const original = hook.result.current.state.intent!;
    hook.rerender({ actorId: otherConditionActor, write: true });
    await act(async () => write.resolve({ ...conditionReceipt, idempotency_key: original.payload.idempotency_key }));
    expect(hook.result.current.state).toMatchObject({ phase: "idle", receipt: null, intent: null });
    expect(invalidateInventoryState).not.toHaveBeenCalled();

    hook.rerender({ actorId: conditionActor, write: true });
    expect(hook.result.current.state.phase).toBe("acknowledged");
    act(() => hook.result.current.release(original.payload.idempotency_key));
    vi.mocked(submitConditionResolution).mockRejectedValue(new Error("Unknown"));
    act(() => hook.result.current.submit(conditionItem, conditionDraft));
    await waitFor(() => expect(hook.result.current.state.phase).toBe("unknown"));
    const checking = deferred<Awaited<ReturnType<typeof getConditionItem>>>();
    vi.mocked(getConditionItem).mockReturnValue(checking.promise);
    let pending: Promise<void>;
    act(() => { pending = hook.result.current.check(); });
    hook.rerender({ actorId: otherConditionActor, write: true });
    await act(async () => { checking.resolve({ item: conditionItem, history: [], next_cursor: null, recovery: conditionReceipt }); await pending; });
    expect(hook.result.current.state).toMatchObject({ phase: "idle", receipt: null, intent: null });
    expect(hook.result.current.notice).toBeNull();
  });

  it("honors explicit uncertainty even on a response status normally used for rejection", async () => {
    const hook = setup();
    vi.mocked(submitConditionResolution).mockRejectedValue({ response: { status: 409, data: { outcome_uncertain: true } } });
    act(() => hook.result.current.submit(conditionItem, conditionDraft));
    await waitFor(() => expect(hook.result.current.state.phase).toBe("unknown"));
    expect(hook.result.current.state.intent?.draft).toEqual(conditionDraft);
  });
});
