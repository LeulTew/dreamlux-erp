import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

let mockCanWrite = true;
let mockLang = "en";
let mockQueueState: "success" | "loading" | "error" | "empty" = "success";
const mockSearchParams = new URLSearchParams();
const { mockMutate, mockToastError } = vi.hoisted(() => ({ mockMutate: vi.fn(), mockToastError: vi.fn() }));
let mockMutationPending = false;
let mockMutationConflict = false;

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/assets/returns",
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    hasPermission: (slug: string) =>
      mockCanWrite ? slug === "event_allocations:write" || slug === "assets:write" : false,
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: mockLang }) }));
vi.mock("@/lib/toast", () => ({ default: { success: vi.fn(), error: mockToastError } }));

vi.mock("@/components/AuthLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const mockQueueData = {
  queue: [
    {
      event_id: "ev-1",
      event_name: "Hana & Daniel Wedding",
      client_name: "Hana",
      start_date: "2026-07-01",
      end_date: "2026-07-02",
      event_status: "Completed",
      open_allocation_count: 2,
      dispatched_quantity: 30,
      accounted_quantity: 10,
      outstanding_quantity: 20,
    },
  ],
  total: 1,
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown[]; enabled?: boolean }) => {
    if (options.queryKey[0] === "event-return-queue") {
      if (mockQueueState === "loading") return { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
      if (mockQueueState === "error") return { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
      if (mockQueueState === "empty") return { data: { ...mockQueueData, queue: [], total: 0 }, isLoading: false, isError: false, refetch: vi.fn() };
      return { data: mockQueueData, isLoading: false, isError: false, refetch: vi.fn() };
    }
    if (options.queryKey[0] === "event-returns") {
      return {
        data: {
          event: { id: "ev-1", name: "Hana & Daniel Wedding", client_name: "Hana", status: "Completed" },
          allocations: [{
            id: "alloc-1", item_id: "item-1", item_name: "Gold Charger Plates", unit_of_measurement: "pcs",
            store_name: "Bole", quantity_allocated: 10, status: "Pulled", notes: null, departed_at: "2026-07-01",
            returned_at: null, returned_by_name: null, returned_good_quantity: 4, returned_damaged_quantity: 0,
            returned_lost_quantity: 0, returned_repair_quantity: 0, outstanding_quantity: 6,
          }],
          receipts: [],
        },
        isLoading: false, isError: false, refetch: vi.fn(),
      };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
  },
  useMutation: (options: { onError?: (error: Error & { response?: { data?: { error?: string } } }) => void }) => ({
    mutate: mockMutationConflict
      ? () => options.onError?.(Object.assign(new Error("Conflict"), { response: { data: { error: "Return exceeds outstanding quantity" } } }))
      : mockMutate,
    isPending: mockMutationPending,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  getReturnQueue: vi.fn(),
  getEventReturns: vi.fn(),
  recordEventReturn: vi.fn(),
}));

import ReturnsPage from "@/app/assets/returns/page";

describe("Inventory Returns page (issue #173)", () => {
  beforeEach(() => {
    mockCanWrite = true;
    mockLang = "en";
    mockQueueState = "success";
    mockMutationPending = false;
    mockMutationConflict = false;
    mockMutate.mockReset();
    mockToastError.mockReset();
    mockSearchParams.delete("event");
  });

  it("shows a forbidden state for users without return privileges", () => {
    mockCanWrite = false;
    render(<ReturnsPage />);
    expect(screen.queryByText("Inventory Returns")).toBeNull();
  });

  it("renders the queue with outstanding totals for authorized users", () => {
    render(<ReturnsPage />);
    expect(screen.getByText("Inventory Returns")).toBeTruthy();
    expect(screen.getByText("Hana & Daniel Wedding")).toBeTruthy();
    // Outstanding total (20) shows in the header stat and the row.
    expect(screen.getAllByText("20").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Open returns")).toBeTruthy();
  });

  it("renders stable loading, empty, and error states", () => {
    mockQueueState = "loading";
    const loading = render(<ReturnsPage />);
    expect(loading.container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    loading.unmount();

    mockQueueState = "empty";
    const empty = render(<ReturnsPage />);
    expect(screen.getByText("No returns pending.")).toBeTruthy();
    empty.unmount();

    mockQueueState = "error";
    render(<ReturnsPage />);
    expect(screen.getByText("Failed to load returns.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("renders the primary workflow labels in Amharic", () => {
    mockLang = "am";
    render(<ReturnsPage />);
    expect(screen.getByText("የክምችት መመለሻዎች")).toBeTruthy();
    expect(screen.getByRole("button", { name: /መመለሻ ክፈት/ })).toBeTruthy();
  });

  it("validates outstanding condition totals and submits a complete payload", () => {
    mockSearchParams.set("event", "ev-1");
    render(<ReturnsPage />);
    fireEvent.change(screen.getByLabelText("Good"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Record return" }));
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("Exceeds outstanding quantity"));
    expect(mockMutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Good"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Damaged"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Record return" }));
    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({
      allocationId: "alloc-1",
      payload: expect.objectContaining({ good_quantity: 3, damaged_quantity: 1 }),
    }));
  });

  it("disables return submission while a request is pending", () => {
    mockSearchParams.set("event", "ev-1");
    mockMutationPending = true;
    render(<ReturnsPage />);
    expect(screen.getByRole("button", { name: "Record return" })).toBeDisabled();
  });

  it("surfaces an actionable backend conflict", () => {
    mockSearchParams.set("event", "ev-1");
    mockMutationConflict = true;
    render(<ReturnsPage />);
    fireEvent.change(screen.getByLabelText("Good"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Record return" }));
    expect(mockToastError).toHaveBeenCalledWith("Return exceeds outstanding quantity");
  });
});
