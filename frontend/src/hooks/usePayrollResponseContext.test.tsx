import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePayrollResponseContext } from "./usePayrollResponseContext";

afterEach(cleanup);

describe("payroll response context", () => {
  it("keeps a request current across ordinary rerenders", () => {
    const { result, rerender } = renderHook(() => usePayrollResponseContext("actor:period"));
    const owns = result.current();
    rerender();
    expect(owns()).toBe(true);
  });

  it("does not revive a response after its context changes away and back", () => {
    const { result, rerender } = renderHook(({ context }) => usePayrollResponseContext(context), {
      initialProps: { context: "April" },
    });
    const owns = result.current();
    rerender({ context: "May" });
    rerender({ context: "April" });
    expect(owns()).toBe(false);
    expect(result.current()()).toBe(true);
  });

  it("invalidates a captured setup when its inputs change", () => {
    const { result, rerender } = renderHook(({ input }) => usePayrollResponseContext("April", input), {
      initialProps: { input: { quantity: 1 } },
    });
    const owns = result.current();
    rerender({ input: { quantity: 2 } });
    expect(owns()).toBe(false);
  });

  it("does not keep an unmounted caller current", () => {
    const { result, unmount } = renderHook(() => usePayrollResponseContext("actor:record"));
    const owns = result.current();
    unmount();
    expect(owns()).toBe(false);
  });
});
