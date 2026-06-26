// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ExpenseApprovalPage from "../app/hr/expenses/approve/page";

// Mock router/navigation hooks
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
  }),
  usePathname: () => "/hr/expenses/approve",
  useSearchParams: () => mockSearchParams,
}));

// Mock AuthLayout to render children directly
vi.mock("@/components/AuthLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-layout">{children}</div>,
}));

// Mock hooks & permissions
let mockLang = "en";
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: mockLang,
  }),
}));

let mockUser = { role: "ACCOUNTANT", id: "user-123" };
let mockIsAuthenticated = true;
let mockHasPermission = vi.fn().mockReturnValue(true);

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: mockIsAuthenticated,
    hasPermission: mockHasPermission,
    user: mockUser,
  }),
}));

// Mock React Query
const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => {
  return {
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
    useQuery: ({ queryKey, queryFn, enabled }: any) => {
      // Return custom mock data based on queryKey
      if (!enabled) return { data: null, isLoading: false, isError: false };
      
      const tab = queryKey[0];
      if (tab === "pending-event-expenses") {
        return {
          data: {
            data: [
              {
                id: "expense-pending-1",
                event_id: "event-1",
                category: "Fuel",
                amount: 1500.5,
                description: "Fuel for delivery truck",
                status: "Pending",
                client_name: "John Doe",
                submitted_by_name: "Submitter Joe",
                created_at: "2026-06-25T10:00:00Z",
              },
            ],
            total: 1,
            page: 1,
            totalPages: 1,
          },
          isLoading: false,
          isError: false,
        };
      } else if (tab === "history-event-expenses") {
        return {
          data: {
            data: [
              {
                id: "expense-approved-1",
                event_id: "event-1",
                category: "Labor",
                amount: 3200,
                description: "Event crew logistics",
                status: "Approved",
                event_name: "Acme Corp Event",
                client_name: "Acme Corp",
                submitted_by_name: "Worker Bill",
                approved_by_name: "Approver Boss",
                approved_at: "2026-06-26T09:00:00Z",
              },
              {
                id: "expense-rejected-1",
                event_id: "event-2",
                category: "Other",
                amount: 450,
                description: "Extra balloons",
                status: "Rejected",
                rejected_reason: "Not pre-approved",
                event_name: "Extra balloons Event",
                client_name: "Private Wedding",
                submitted_by_name: "Planner Mary",
                approved_by_name: "Approver Boss",
                approved_at: "2026-06-26T09:05:00Z",
              },
            ],
            total: 2,
            page: 1,
            totalPages: 1,
          },
          isLoading: false,
          isError: false,
        };
      }
      return { data: null, isLoading: false, isError: false };
    },
    useMutation: ({ mutationFn, onSuccess, onError }: any) => {
      return {
        mutate: (variables: any) => {
          // Mock successful mutation execution
          mutationFn(variables)
            .then((data: any) => {
              React.act(() => {
                if (onSuccess) onSuccess(data, variables);
              });
            })
            .catch((err: any) => {
              React.act(() => {
                if (onError) onError(err);
              });
            });
        },
        isPending: false,
      };
    },
  };
});

// Mock API layer
const mockReviewEventExpense = vi.fn().mockResolvedValue({ id: "expense-pending-1", status: "Approved" });
vi.mock("@/lib/api", () => ({
  getPendingEventExpenses: vi.fn(),
  getExpenseHistory: vi.fn(),
  reviewEventExpense: (id: string, data: any) => mockReviewEventExpense(id, data),
}));

// Mock hot-toast
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock("react-hot-toast", () => ({
  default: {
    success: (msg: string) => mockToastSuccess(msg),
    error: (msg: string) => mockToastError(msg),
  },
}));

describe("Expense Approval Page UI and Logic Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockLang = "en";
    mockUser = { role: "ACCOUNTANT", id: "user-123" };
    mockIsAuthenticated = true;
    mockHasPermission.mockReturnValue(true);
  });

  it("should render the Pending tab by default", () => {
    render(<ExpenseApprovalPage />);
    expect(screen.getByText("Expense Approval Queue")).toBeInTheDocument();
    expect(screen.getByText("Fuel for delivery truck")).toBeInTheDocument();
    expect(screen.getByText("ETB 1,500.50")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pending Queue" })).toHaveClass("bg-amber-500");
  });

  it("should render the History tab when tab=history search param is active", () => {
    mockSearchParams.set("tab", "history");
    render(<ExpenseApprovalPage />);
    expect(screen.getByRole("button", { name: "History" })).toHaveClass("bg-amber-500");
    
    // Check history table data
    expect(screen.getByText("Acme Corp Event")).toBeInTheDocument();
    expect(screen.getByText("ETB 3,200.00")).toBeInTheDocument();
    expect(screen.getByText("Extra balloons Event")).toBeInTheDocument();
    expect(screen.getByText("Not pre-approved")).toBeInTheDocument();
  });

  it("should support tab switching and preserve/sync parameters in routing URL", () => {
    render(<ExpenseApprovalPage />);
    
    const historyTab = screen.getByRole("button", { name: "History" });
    fireEvent.click(historyTab);
    
    // Check that tab=history is pushed/replaced into the URL
    expect(mockReplace).toHaveBeenLastCalledWith(expect.stringContaining("tab=history"), expect.anything());
  });

  it("should show inline review and successfully approve a pending expense", async () => {
    render(<ExpenseApprovalPage />);
    
    // Open review accordion
    const reviewBtn = screen.getByRole("button", { name: /Review/i });
    fireEvent.click(reviewBtn);
    
    expect(screen.getByText("Review comment")).toBeInTheDocument();
    
    // Click approve button
    const approveBtn = screen.getByRole("button", { name: /Approve/i });
    fireEvent.click(approveBtn);
    
    expect(mockReviewEventExpense).toHaveBeenCalledWith("expense-pending-1", {
      status: "Approved",
      rejected_reason: undefined,
    });
    await vi.waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("Expense approved"));
  });

  it("should reject pending expense and enforce comment validation check", () => {
    render(<ExpenseApprovalPage />);
    
    const reviewBtn = screen.getByRole("button", { name: /Review/i });
    fireEvent.click(reviewBtn);
    
    // 1. Try rejecting without comment
    const rejectBtn = screen.getByRole("button", { name: /Reject/i });
    fireEvent.click(rejectBtn);
    expect(mockToastError).toHaveBeenCalledWith("Reason required");
    expect(mockReviewEventExpense).not.toHaveBeenCalled();

    // 2. Type reason comment and reject
    const commentInput = screen.getByPlaceholderText("Enter comment or reject reason...");
    fireEvent.change(commentInput, { target: { value: "Pricing is wrong" } });
    
    fireEvent.click(rejectBtn);
    expect(mockReviewEventExpense).toHaveBeenCalledWith("expense-pending-1", {
      status: "Rejected",
      rejected_reason: "Pricing is wrong",
    });
  });

  it("should support Amharic translation keys rendering when lang=am", () => {
    mockLang = "am";
    render(<ExpenseApprovalPage />);
    
    // Header label in Amharic
    expect(screen.getByText("የወጪ ማጽደቂያ ዝርዝር")).toBeInTheDocument();
  });

  it("should sync search input filter with URL parameters on change", () => {
    vi.useFakeTimers();
    render(<ExpenseApprovalPage />);
    
    const searchInput = screen.getByPlaceholderText("Search event, category or submitter...");
    
    React.act(() => {
      fireEvent.change(searchInput, { target: { value: "Wedding" } });
      vi.runAllTimers();
    });
    
    expect(mockReplace).toHaveBeenLastCalledWith(expect.stringContaining("q=Wedding"), expect.anything());
    vi.useRealTimers();
  });
});
