import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const getMock = vi.fn();
const saveMock = vi.fn();

vi.mock("@/lib/api", () => ({
  getRecordListPreference: (rt: string) => getMock(rt),
  saveRecordListPreference: (rt: string, payload: unknown) => saveMock(rt, payload),
}));

import { useRecordListPreferences } from "@/hooks/useRecordListPreferences";

describe("useRecordListPreferences (issue #155)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("loads the stored preference and reports isLoaded", async () => {
    getMock.mockResolvedValue({
      record_type: "events",
      sort: { sortBy: "recent", sortOrder: "desc" },
      filters: { status: "Completed" },
      page_size: 25,
      visible_columns: [],
      density: null,
      active_tab: null,
      updated_at: "2026-07-14T00:00:00Z",
    });

    const { result } = renderHook(() => useRecordListPreferences("events"));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(getMock).toHaveBeenCalledWith("events");
    expect(result.current.preference?.sort?.sortBy).toBe("recent");
  });

  it("stays loaded (defaults) when the fetch fails", async () => {
    getMock.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useRecordListPreferences("assets"));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.preference).toBeNull();
  });

  it("debounces saves and coalesces rapid changes into one request", async () => {
    vi.useFakeTimers();
    getMock.mockResolvedValue(null);
    saveMock.mockResolvedValue({});
    const { result } = renderHook(() => useRecordListPreferences("events", { debounceMs: 300 }));

    act(() => {
      result.current.save({ sort: { sortBy: "start_date", sortOrder: "asc" } });
      result.current.save({ filters: { status: "Planned" } });
    });
    expect(saveMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith("events", {
      sort: { sortBy: "start_date", sortOrder: "asc" },
      filters: { status: "Planned" },
    });
  });

  it("does not fetch or save when disabled", async () => {
    const { result } = renderHook(() => useRecordListPreferences("events", { enabled: false }));
    expect(result.current.isLoaded).toBe(true);
    act(() => result.current.save({ filters: { status: "x" } }));
    expect(getMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });
});
