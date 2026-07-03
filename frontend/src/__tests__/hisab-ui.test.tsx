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
let mockAuthData: unknown = null;
let mockAuthLoading = false;
let mockRollupData: unknown = null;
let mockLedgerData: unknown = null;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[] }) => {
    if (options.queryKey[0] === "auth-permissions") {
      return { data: mockAuthData, isLoading: mockAuthLoading };
    }
    if (options.queryKey[0] === "hisab-report") {
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

vi.mock("@/lib/api", () => ({
  FINANCE_OPEX_CATEGORIES: ["Transport", "Rental", "Labour", "Office Lunch", "Lunch", "Utilities", "Supplies", "Maintenance", "Other"],
  getHisabReport: vi.fn(),
  downloadHisabExport: vi.fn().mockResolvedValue(undefined),
  getFinanceOperationalExpenses: vi.fn(),
  createFinanceOperationalExpense: vi.fn(),
  updateFinanceOperationalExpense: vi.fn(),
  deleteFinanceOperationalExpense: vi.fn(),
  approveFinanceOperationalExpense: vi.fn(),
  rejectFinanceOperationalExpense: vi.fn(),
  api: { get: vi.fn() },
}));

const ROLLUP_FIXTURE = {
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
    periodCount: 1,
    eventCount: 1,
    eventIncome: 80000,
    eventExpenses: 22000,
    eventProfit: 58000,
    operationalExpenses: 1500,
    pendingOperationalExposure: 250,
    net: 56500,
  },
};

const LEDGER_FIXTURE = {
  expenses: [
    {
      id: "opex-1",
      expense_date: "2026-05-04",
      category: "Office Lunch",
      amount: 450,
      description: "Office lunch for install crew",
      status: "Pending",
      rejected_reason: null,
      created_by: "user-1",
      created_by_username: "meron",
      approved_by: null,
      created_at: "2026-05-04T10:00:00Z",
      updated_at: "2026-05-04T10:00:00Z",
      approved_at: null,
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
};

describe("HisabReportPage", () => {
  beforeEach(() => {
    mockLang = "en";
    mockAuthData = null;
    mockAuthLoading = false;
    mockRollupData = null;
    mockLedgerData = null;
    vi.clearAllMocks();
  });

  it("renders ForbiddenState when the user lacks finance:hisab:read", () => {
    mockAuthData = { permission_slugs: ["events:read"], is_superuser: false };
    render(<HisabReportPage />);
    expect(screen.getByText("Forbidden: Insufficient privileges")).toBeInTheDocument();
  });

  it("renders weekly rollup with event rows, operational spend, and net for finance users", () => {
    mockAuthData = { permission_slugs: ["finance:hisab:read"], is_superuser: false };
    mockRollupData = ROLLUP_FIXTURE;
    render(<HisabReportPage />);

    expect(screen.getByText("Hisab Reports")).toBeInTheDocument();
    expect(screen.getByText("Hikma Full Package")).toBeInTheDocument();
    // KPI strip: income and net
    expect(screen.getAllByText("ETB 80,000.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ETB 56,500.00").length).toBeGreaterThan(0);
    // Non-event expense block
    expect(screen.getByText("Non-Event Expenses")).toBeInTheDocument();
    expect(screen.getAllByText("Office Lunch").length).toBeGreaterThan(0);
  });

  it("shows the empty state when there is no data in range", () => {
    mockAuthData = { permission_slugs: ["finance:hisab:read"], is_superuser: false };
    mockRollupData = { ...ROLLUP_FIXTURE, periods: [], summary: { ...ROLLUP_FIXTURE.summary, periodCount: 0 } };
    render(<HisabReportPage />);
    expect(screen.getByText("No data found for the selected date range.")).toBeInTheDocument();
  });

  it("hides write and approve actions for read-only finance users", () => {
    mockAuthData = { permission_slugs: ["finance:hisab:read"], is_superuser: false };
    mockRollupData = ROLLUP_FIXTURE;
    mockLedgerData = LEDGER_FIXTURE;
    render(<HisabReportPage />);

    fireEvent.click(screen.getByText("Operational Ledger"));
    expect(screen.getByText("Office lunch for install crew")).toBeInTheDocument();
    expect(screen.queryByText("Add Expense")).not.toBeInTheDocument();
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
  });

  it("shows write and approve actions for full finance users", () => {
    mockAuthData = {
      permission_slugs: ["finance:hisab:read", "finance:opex:write", "finance:opex:approve"],
      is_superuser: false,
    };
    mockRollupData = ROLLUP_FIXTURE;
    mockLedgerData = LEDGER_FIXTURE;
    render(<HisabReportPage />);

    fireEvent.click(screen.getByText("Operational Ledger"));
    expect(screen.getByText("Add Expense")).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getAllByText("Reject").length).toBeGreaterThan(0);
  });

  it("renders Amharic labels when the language is Amharic", () => {
    mockLang = "am";
    mockAuthData = { permission_slugs: ["finance:hisab:read"], is_superuser: false };
    mockRollupData = ROLLUP_FIXTURE;
    render(<HisabReportPage />);
    expect(screen.getByText("የሂሳብ ሪፖርቶች")).toBeInTheDocument();
  });
});
