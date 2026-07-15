import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let mockCanWrite = true;
const mockSearchParams = new URLSearchParams();

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

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "en" }) }));

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
      return { data: mockQueueData, isLoading: false, isError: false, refetch: vi.fn() };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
});
