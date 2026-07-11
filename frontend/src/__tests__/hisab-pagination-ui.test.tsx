// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import HisabReportPage from "../app/hr/finance/hisab/page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock useLanguage
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: "en",
  }),
}));

// Mock AuthLayout
vi.mock("@/components/AuthLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.Node }) => <div data-testid="auth-layout">{children}</div>,
}));

// Mock react-query
let mockAuthData: any = null;
let mockRollupData: any = null;
let mockLedgerData: any = null;
let mockQueryKeyReceived: any = null;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: any[]; queryFn: () => any }) => {
    if (options.queryKey[0] === "auth-permissions") {
      return { data: mockAuthData, isLoading: false };
    }
    if (options.queryKey[0] === "hisab-report") {
      mockQueryKeyReceived = options.queryKey;
      options.queryFn(); // Execute the query function to register call
      return { data: mockRollupData, isLoading: false, isError: false };
    }
    if (options.queryKey[0] === "finance-opex") {
      return { data: mockLedgerData, isLoading: false };
    }
    return { data: undefined, isLoading: false };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const mockGetHisabReport = vi.fn();
vi.mock("@/lib/api", () => ({
  FINANCE_OPEX_CATEGORIES: ["Transport", "Rental", "Labour", "Office Lunch", "Lunch", "Utilities", "Supplies", "Maintenance", "Other"],
  getHisabReport: (params: any) => {
    mockGetHisabReport(params);
    return Promise.resolve(mockRollupData);
  },
  downloadHisabExport: vi.fn().mockResolvedValue(undefined),
  getFinanceOperationalExpenses: vi.fn(),
  createFinanceOperationalExpense: vi.fn(),
  updateFinanceOperationalExpense: vi.fn(),
  deleteFinanceOperationalExpense: vi.fn(),
  approveFinanceOperationalExpense: vi.fn(),
  rejectFinanceOperationalExpense: vi.fn(),
  api: { get: vi.fn() },
}));

const ROLLUP_FIXTURE_PAGINATED = {
  period_type: "week",
  start_date: "2026-05-01",
  end_date: "2026-05-31",
  periods: [
    {
      period_start: "2026-05-04",
      period_end: "2026-05-10",
      label: "Week of 2026-05-04",
      events: [
        {
          event_id: "ev-1",
          event_name: "Hikma Full Package",
          event_date: "2026-05-04",
          period_start: "2026-05-04",
          income: 80000,
          transport: 5000,
          rental: 3000,
          labour: 12000,
          other: 2000,
          expense_total: 22000,
          profit: 58000,
        },
      ],
      eventTotals: { income: 80000, transport: 5000, rental: 3000, labour: 12000, other: 2000, expenses: 22000, profit: 58000 },
      operational: { byCategory: [{ category: "Office Lunch", amount: 1500 }], total: 1500, pendingExposure: 250 },
      net: 56500,
    },
  ],
  summary: {
    periodCount: 2,
    eventCount: 1,
    eventIncome: 80000,
    eventExpenses: 22000,
    eventProfit: 58000,
    operationalExpenses: 1500,
    pendingOperationalExposure: 250,
    net: 56500,
  },
  page: 1,
  limit: 10,
  total: 2,
  totalPages: 2,
};

describe("HisabRollupPaginationUI", () => {
  beforeEach(() => {
    mockAuthData = { permission_slugs: ["finance:hisab:read"], is_superuser: false };
    mockRollupData = ROLLUP_FIXTURE_PAGINATED;
    mockLedgerData = null;
    mockQueryKeyReceived = null;
    vi.clearAllMocks();
  });

  it("renders rollup pagination controls when totalPages > 1", () => {
    render(<HisabReportPage />);
    
    // Check that we requested page 1
    expect(mockGetHisabReport).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      limit: 10
    }));

    // Pagination controls should be in the DOM
    const nextButtons = screen.getAllByRole("button", { name: /next/i });
    expect(nextButtons.length).toBeGreaterThan(0);
  });

  it("resets page index to 1 when period type filter is updated", () => {
    render(<HisabReportPage />);

    // Click on Monthly filter
    const monthlyButton = screen.getByRole("button", { name: /monthly/i });
    fireEvent.click(monthlyButton);

    // Should query again with page reset to 1
    expect(mockGetHisabReport).toHaveBeenLastCalledWith(expect.objectContaining({
      period_type: "month",
      page: 1
    }));
  });
});
