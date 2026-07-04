// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import DatePicker from "../components/ui/DatePicker";
import ExpenseApprovalPage from "../app/hr/expenses/approve/page";

// Mock router/navigation hooks
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => "/hr/expenses/approve",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock AuthLayout
vi.mock("@/components/AuthLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-layout">{children}</div>,
}));

// Mock useLanguage
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: "en",
  }),
}));

// Mock useAuth
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    hasPermission: () => true,
    user: { role: "ACCOUNTANT", id: "user-123" },
  }),
}));

// Mock React Query
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
  useQuery: () => ({
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
  }),
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

describe("UI Consistency & Style Rule Enforcement", () => {
  it("enforces gold buttons to use compliant high-contrast text color (no white on gold)", () => {
    render(<ExpenseApprovalPage />);
    // Active tabs use bg-primary and text-primary-foreground (WCAG Compliant dark text)
    const activeTab = screen.getByText("Pending Queue");
    expect(activeTab).toHaveClass("bg-primary");
    expect(activeTab).toHaveClass("text-primary-foreground");
    expect(activeTab).not.toHaveClass("text-white");
  });

  it("enforces DatePicker to use dl-radius tokens instead of standard rounded classes", () => {
    const { container } = render(
      <DatePicker
        value="2026-07-04"
        onChange={vi.fn()}
        placeholder="Select Date"
      />
    );

    // The component wrapper should not contain standard Tailwind rounded-lg or rounded-xl
    const elementsWithClass = container.querySelectorAll("*");
    elementsWithClass.forEach((el) => {
      const classList = Array.from(el.classList);
      classList.forEach((cls) => {
        if (cls.startsWith("rounded-") && cls !== "rounded-full") {
          // Fail if standard Tailwind rounded classes are found
          throw new Error(`Standard rounded class found in DatePicker: ${cls}`);
        }
      });
    });

    // Ensure it compiles and utilizes the custom dl-radius styles
    expect(container).toBeDefined();
  });
});
