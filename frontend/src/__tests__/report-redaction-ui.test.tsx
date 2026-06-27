import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import FinancialDashboardPage from "../app/hr/reports/profit/page";

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

// Mock AuthLayout to prevent redirection/spinner logic
vi.mock("@/components/AuthLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-layout">{children}</div>,
}));

// Mock react-query
let mockAuthData: unknown = null;
let mockAuthLoading = false;
let mockReportData: unknown = null;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[]; queryFn?: () => unknown; enabled?: boolean }) => {
    if (options.queryKey[0] === "auth-permissions") {
      return {
        data: mockAuthData,
        isLoading: mockAuthLoading,
      };
    }
    if (options.queryKey[0] === "profit-report") {
      return {
        data: mockReportData,
        isLoading: false,
        isError: false,
      };
    }
    return { data: undefined, isLoading: false };
  },
}));

vi.mock("@/lib/api", () => ({
  getProfitReport: vi.fn(),
  getEventTypes: vi.fn().mockResolvedValue([]),
  getProfitReportExportUrl: vi.fn(),
  getEffectivePermissions: vi.fn().mockResolvedValue({ permission_slugs: [] }),
  api: {
    get: vi.fn(),
  },
}));

describe("FinancialDashboardPage Report Redaction & Accessibility", () => {
  beforeEach(() => {
    mockLang = "en";
    mockAuthData = null;
    mockAuthLoading = false;
    mockReportData = null;
    vi.clearAllMocks();
  });

  it("renders ForbiddenState if user lacks reports:profit:read permission", () => {
    mockAuthData = { permission_slugs: ["events:read"], is_superuser: false };
    render(<FinancialDashboardPage />);

    expect(screen.getByText("Forbidden: Insufficient privileges")).toBeInTheDocument();
    expect(screen.getByText("Only Owners, Accountants, and Administrators can access financial reports.")).toBeInTheDocument();
  });

  it("renders dashboard overview if user has reports:profit:read permission", () => {
    mockAuthData = { permission_slugs: ["reports:profit:read"], is_superuser: false };
    mockReportData = {
      summary: {
        totalEvents: 10,
        totalRevenue: 500000,
        totalExpenses: 120000,
        netProfit: 380000,
        profitMargin: 76.0,
        pendingExpenseExposure: 5000,
      },
      categoryBreakdown: [],
      monthlyData: [],
      eventTypePerformance: [],
      kpis: {
        mostProfitableEvent: null,
        mostProfitableEventType: null,
        highestMarginEventType: null,
        lowestMarginEvent: null,
        pendingExpenseExposure: 5000,
        proposalConversionRate: 85.0,
      },
      proposalVariance: {
        events: [],
        averageVariance: 15000,
      },
    };

    render(<FinancialDashboardPage />);

    expect(screen.getByText("Financial Dashboard & Reports")).toBeInTheDocument();
    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    expect(screen.getByText("ETB 500,000.00")).toBeInTheDocument();
  });

  it("renders localized dashboard strings in Amharic", () => {
    mockLang = "am";
    mockAuthData = { permission_slugs: ["reports:profit:read"], is_superuser: false };
    mockReportData = {
      summary: {
        totalEvents: 10,
        totalRevenue: 500000,
        totalExpenses: 120000,
        netProfit: 380000,
        profitMargin: 76.0,
        pendingExpenseExposure: 5000,
      },
      categoryBreakdown: [],
      monthlyData: [],
      eventTypePerformance: [],
      kpis: {
        mostProfitableEvent: null,
        mostProfitableEventType: null,
        highestMarginEventType: null,
        lowestMarginEvent: null,
        pendingExpenseExposure: 5000,
        proposalConversionRate: 85.0,
      },
      proposalVariance: {
        events: [],
        averageVariance: 15000,
      },
    };

    render(<FinancialDashboardPage />);

    expect(screen.getByText("የፋይናንስ ዳሽቦርድ እና ሪፖርቶች")).toBeInTheDocument();
  });
});
