import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usePayrollMutationGuard } from "./usePayrollMutationGuard";

beforeEach(() => {
  const { result, unmount } = renderHook(usePayrollMutationGuard);
  act(() => result.current.complete());
  unmount();
});
afterEach(cleanup);

describe("payroll write guard", () => {
  it("excludes another write synchronously, before a pending render", () => {
    const { result } = renderHook(usePayrollMutationGuard);
    act(() => {
      expect(result.current.begin()).toBe(true);
      expect(result.current.begin()).toBe(false);
    });
    expect(result.current.pending).toBe(true);
    act(() => result.current.complete());
    expect(result.current.pending).toBe(false);
    expect(result.current.failure).toBeNull();
  });

  it.each([500, 503])("retains deliberate recovery after a confirmed HTTP %i failure", (status) => {
    const { result } = renderHook(usePayrollMutationGuard);
    act(() => { result.current.begin(); });
    act(() => result.current.fail({ response: { status, data: { error: "Synthetic failure", outcome_uncertain: false } } }, "Fallback"));
    expect(result.current.pending).toBe(false);
    expect(result.current.failure).toEqual({ message: "Synthetic failure", needsReload: false });
    act(() => { expect(result.current.begin()).toBe(true); });
    expect(result.current.failure).toBeNull();
    expect(result.current.pending).toBe(true);
  });

  it.each([
    { label: "lost commit", error: { response: { status: 503, data: { outcome_uncertain: true } } } },
    { label: "gateway timeout", error: { response: { status: 504 } } },
    { label: "unclassified server error", error: { response: { status: 500, data: { error: "Unable to confirm" } } } },
    { label: "server HTML response", error: { response: { status: 500, data: "<html>Synthetic failure</html>" } } },
    { label: "lost response", error: new Error("Synthetic lost response") },
  ])("keeps $label blocked across rerenders", ({ error }) => {
    const { result, rerender } = renderHook(usePayrollMutationGuard);
    act(() => { result.current.begin(); });
    act(() => result.current.fail(error, "Unable to confirm"));
    expect(result.current.pending).toBe(false);
    expect(result.current.needsReload).toBe(true);
    rerender();
    act(() => { expect(result.current.begin()).toBe(false); });
    expect(result.current.failure).toEqual({ message: "Unable to confirm", needsReload: true });
  });

  it("keeps an unknown outcome blocked when navigating between callers", () => {
    const first = renderHook(usePayrollMutationGuard);
    act(() => { first.result.current.begin(); });
    act(() => first.result.current.fail(new Error("Synthetic lost response"), "Unable to confirm"));
    first.unmount();
    const next = renderHook(usePayrollMutationGuard);
    expect(next.result.current.needsReload).toBe(true);
    act(() => { expect(next.result.current.begin()).toBe(false); });
  });

  it("coordinates pending writes across independently mounted callers", () => {
    const first = renderHook(usePayrollMutationGuard);
    const next = renderHook(usePayrollMutationGuard);
    act(() => {
      expect(first.result.current.begin()).toBe(true);
      expect(next.result.current.begin()).toBe(false);
    });
    expect(next.result.current.pending).toBe(true);
    act(() => first.result.current.complete());
    expect(next.result.current.pending).toBe(false);
  });
});
