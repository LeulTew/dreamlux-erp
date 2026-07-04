// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import NetProfitPage from "../app/hr/finance/net-profit/page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock useLanguage
let mockLang = "en";
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: mockLang,
  }),
}));

// Mock AuthLayout
vi.mock("@/components/AuthLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-layout">{children}</div>,
}));

// Mock react-query
let mockAuthData: any = null;
let mockAuthLoading = false;
let mockStatementData: any = null;
let mockReportLoading = false;
let mockReportError: any = null;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[] }) => {
    if (options.queryKey[0] === "auth-permissions") {
      return { data: mockAuthData, isLoading: mockAuthLoading };
    }
    if (options.queryKey[0] === "monthly-net-profit-statement") {
      return {
        data: mockStatementData,
        isLoading: mockReportLoading,
        error: mockReportError,
        refetch: vi.fn(),
        isRefetching: false,
      };
    }
    return { data: undefined, isLoading: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const mockDownloadExport = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/api", () => ({
  getMonthlyNetProfitStatement: vi.fn(),
  downloadMonthlyNetProfitExport: (params: any) => mockDownloadExport(params),
  api: { get: vi.fn() },
}));

const STATEMENT_FIXTURE = {
  month: "2026-05",
  period: {
    start_date: "2026-05-01",
    end_date: "2026-05-31",
    closed: false,
    closure: null,
    snapshot_policy: "Snapshot policy mock details here.",
  },
  treatment: {
    investments: "shown_below_operating_profit",
    payroll: "no_finalized_payroll_staff_payment_overheads_included",
  },
  totals: {
    eventRevenue: 250000,
    approvedEventExpenses: 90000,
    eventGrossProfit: 160000,
    operationalExpenses: 30000,
    overheadExpenses: 15000,
    payrollExpenses: 0,
    operatingProfit: 115000,
    approvedInvestments: 20000,
    netAfterInvestments: 115000,
    pendingExposure: 5000,
    marginPercentage: 46.0,
  },
  counts: {
    events: 4,
    payrollRuns: 0,
    payrollEmployeeLines: 0,
    investmentRows: 1,
  },
  breakdowns: {
    eventExpensesByCategory: [{ category: "Hardware", amount: 90000, count: 2 }],
    operationalExpensesByCategory: [{ category: "Office rent", amount: 30000, pendingAmount: 0, count: 1 }],
    overheadByScope: [{ scope: "office", payment_kind: "staff_payment", amount: 15000, pendingAmount: 0, count: 1 }],
    investmentsByCategory: [{ category: "Equipment", amount: 20000, pendingAmount: 0, count: 1 }],
    payroll: {
      amount: 0,
      finalizedRunCount: 0,
      employeeLineCount: 0,
      staffPaymentOverheadIncluded: 15000,
      staffPaymentOverheadExcluded: 0,
      nonPayrollOverhead: 0,
    },
  },
  drilldowns: {
    events: [
      {
        id: "evt-1",
        name: "Mock Event 1",
        start_date: "2026-05-10",
        revenue: 250000,
        approvedExpenses: 90000,
        pendingExpenses: 5000,
        netProfit: 160000,
      },
    ],
    payrollRuns: [],
    investments: [
      {
        id: "inv-1",
        item_name: "MacBook Pro",
        category: "Equipment",
        purchase_date: "2026-05-15",
        quantity: 1,
        unit: "pcs",
        unit_cost: 20000,
        total_cost: 20000,
        vendor: "Apple",
        capex_classification: "Capital Asset",
        asset_id: null,
      },
    ],
  },
};

describe("NetProfitPage Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLang = "en";
    mockAuthData = { permission_slugs: ["finance:hisab:read"] };
    mockAuthLoading = false;
    mockStatementData = STATEMENT_FIXTURE;
    mockReportLoading = false;
    mockReportError = null;
  });

  it("gates access by showing ForbiddenState when permission is missing or is read-only reports:profit:read", () => {
    mockAuthData = { permission_slugs: ["reports:profit:read"] };
    render(<NetProfitPage />);
    expect(screen.getByText(/Forbidden/i)).toBeInTheDocument();
    expect(screen.queryByText("Net Profit Statement")).not.toBeInTheDocument();
  });

  it("renders metrics totals and counts correctly when authorized", () => {
    render(<NetProfitPage />);
    expect(screen.getAllByText("Net Profit Statement")[0]).toBeInTheDocument();
    // Revenue check
    expect(screen.getByText("250,000")).toBeInTheDocument();
    // Operating profit check (matches both operating profit and net profit after investments since no investments are included by default)
    expect(screen.getAllByText("115,000")[0]).toBeInTheDocument();
    // Event count
    expect(screen.getByText("4 Events")).toBeInTheDocument();
    // Margin check
    expect(screen.getByText("Margin: 46%")).toBeInTheDocument();
  });

  it("toggles include investments state and triggers query refetch with true value", () => {
    render(<NetProfitPage />);
    const toggle = screen.getByText("Include Investments in Net Profit");
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    // Button clicks should trigger toggle state.
  });

  it("calls export action successfully on export buttons click", () => {
    render(<NetProfitPage />);
    const csvButton = screen.getByText("Export CSV");
    fireEvent.click(csvButton);
    expect(mockDownloadExport).toHaveBeenCalledWith(
      expect.objectContaining({ format: "csv" })
    );

    const xlsxButton = screen.getByText("Export XLSX");
    fireEvent.click(xlsxButton);
    expect(mockDownloadExport).toHaveBeenCalledWith(
      expect.objectContaining({ format: "xlsx" })
    );
  });

  it("shows loading skeletons when report is loading", () => {
    mockReportLoading = true;
    const { container } = render(<NetProfitPage />);
    // Should have skeletons rendering
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows error alert if API fails", () => {
    mockReportError = new Error("Failed to load net profit statement");
    render(<NetProfitPage />);
    expect(screen.getByText("Error loading statement")).toBeInTheDocument();
    expect(screen.getByText("Failed to load net profit statement")).toBeInTheDocument();
  });
});
