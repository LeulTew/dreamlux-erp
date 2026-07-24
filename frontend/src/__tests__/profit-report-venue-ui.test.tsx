import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import FinancialDashboardPage from "@/app/hr/reports/profit/page";
import { generateReportPdf } from "@/lib/pdf-report";
import { getProfitReportExportUrl } from "@/lib/api";

// Mock next/navigation
vi.mock("next/navigation", () => {
  const params = new URLSearchParams();
  return {
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
    }),
    usePathname: () => "/hr/reports/profit",
    useSearchParams: () => params,
  };
});

// Mock hooks and APIs
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: "en",
    toggle: vi.fn(),
  }),
}));

vi.mock("@/lib/pdf-report", () => ({
  generateReportPdf: vi.fn(),
}));

const { mockProfitReportData } = vi.hoisted(() => {
  const list = [
    {
      event_id: "event-1",
      event_name: "Gala at Hilton",
      event_type_name: "Gala",
      event_type_id: "type-gala",
      venue_location: "Hilton Addis Ababa",
      start_date: "2026-06-10",
      status: "Completed",
      revenue: 100000.0,
      approved_expenses: 20000.0,
      labor_cost: 15000.0,
      fuel_cost: 5000.0,
      other_cost: 0,
      pending_expense_exposure: 0,
      net_profit: 80000.0,
      margin_percentage: 80.0,
      proposal_id: "prop-1",
      proposal_status: "Approved",
      estimated_total_cost: 25000.0,
      estimated_net_profit: 75000.0,
      estimated_profit_variance: 5000.0,
    },
    {
      event_id: "event-2",
      event_name: "Private Dinner",
      event_type_name: null,
      event_type_id: null,
      venue_location: null,
      start_date: "2026-06-15",
      status: "Completed",
      revenue: 50000.0,
      approved_expenses: 10000.0,
      labor_cost: 8000.0,
      fuel_cost: 2000.0,
      other_cost: 0,
      pending_expense_exposure: 0,
      net_profit: 40000.0,
      margin_percentage: 80.0,
      proposal_id: null,
      proposal_status: null,
      estimated_total_cost: 0,
      estimated_net_profit: 0,
      estimated_profit_variance: null,
    },
  ];

  const reportData = {
    summary: {
      totalEvents: 2,
      totalRevenue: 150000.0,
      totalExpenses: 30000.0,
      netProfit: 120000.0,
      profitMargin: 80.0,
      pendingExpenseExposure: 0,
    },
    categoryBreakdown: [
      { category: "Labor", amount: 23000.0 },
      { category: "Fuel", amount: 7000.0 },
    ],
    monthlyData: [
      { month: "2026-06", eventCount: 2, revenue: 150000.0, expenses: 30000.0, profit: 120000.0, margin: 80.0 },
    ],
    eventTypePerformance: [
      { eventType: "Gala", eventCount: 1, revenue: 100000.0, expenses: 20000.0, netProfit: 80000.0, averageMargin: 80.0 },
    ],
    kpis: {
      mostProfitableEvent: list[0],
      mostProfitableEventType: { eventType: "Gala", eventCount: 1, revenue: 100000.0, expenses: 20000.0, netProfit: 80000.0, averageMargin: 80.0 },
      highestMarginEventType: { eventType: "Gala", eventCount: 1, revenue: 100000.0, expenses: 20000.0, netProfit: 80000.0, averageMargin: 80.0 },
      lowestMarginEvent: list[1],
      pendingExpenseExposure: 0,
      proposalConversionRate: 50.0,
    },
    proposalVariance: {
      events: [
        {
          eventId: "event-1",
          eventName: "Gala at Hilton",
          proposalId: "prop-1",
          estimatedNetProfit: 75000.0,
          actualNetProfit: 80000.0,
          variance: 5000.0,
        },
      ],
      averageVariance: 5000.0,
    },
    events: list,
    total: 2,
    page: 1,
    limit: 10,
  };

  return { mockEventsList: list, mockProfitReportData: reportData };
});

// Mock AuthLayout
vi.mock("@/components/AuthLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-layout">{children}</div>,
}));

// Mock react-query
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: (string | number)[]; queryFn?: () => unknown; enabled?: boolean }) => {
    if (options.queryKey[0] === "auth-permissions") {
      return {
        data: { permission_slugs: ["reports:profit:read"], is_superuser: false },
        isLoading: false,
      };
    }
    if (options.queryKey[0] === "event-types") {
      return {
        data: [{ id: "type-gala", event_name: "Gala" }],
        isLoading: false,
      };
    }
    if (options.queryKey[0] === "profit-report") {
      return {
        data: mockProfitReportData,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      };
    }
    return { data: undefined, isLoading: false };
  },
}));

vi.mock("@/lib/api", () => {
  return {
    api: {
      get: vi.fn().mockResolvedValue({
        data: { permission_slugs: ["reports:profit:read"], is_superuser: false },
      }),
      defaults: { baseURL: "http://localhost:4000" },
    },
    getEffectivePermissions: vi.fn().mockResolvedValue({ permission_slugs: ["reports:profit:read"], is_superuser: false }),
    getCurrentUser: vi.fn().mockResolvedValue({ user: { id: "user-1", email: "admin@dreamlux.com", role_slug: "OWNER" } }),
    getProfitReport: vi.fn().mockResolvedValue(mockProfitReportData),
    getEventTypes: vi.fn().mockResolvedValue([{ id: "type-gala", event_name: "Gala" }]),
    getProfitReportExportUrl: vi.fn().mockReturnValue("http://localhost:4000/events/reports/profit/export?format=csv"),
  };
});

describe("Issue #193 - Profit Report Event Venue & Events View Frontend Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should default to Overview tab and render all report tabs in order", () => {
    render(<FinancialDashboardPage />);

    expect(screen.getByText("Financial Dashboard & Reports")).toBeInTheDocument();

    // Check all tabs exist in order
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Events View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Monthly View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Event Type View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Category View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Proposal Variance View" })).toBeInTheDocument();

    // Default tab is Overview (Trend chart title is visible)
    expect(screen.getByText("Profit Trend")).toBeInTheDocument();
  });

  it("should switch to Events View tab and display event rows with venue and uncategorized fallback", () => {
    render(<FinancialDashboardPage />);

    // Click Events View tab
    const eventsTabBtn = screen.getByRole("button", { name: "Events View" });
    fireEvent.click(eventsTabBtn);

    // Check venue values and event name
    expect(screen.getAllByText("Gala at Hilton").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hilton Addis Ababa").length).toBeGreaterThan(0);

    // Check missing venue displays "Not recorded"
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);

    // Check missing category displays "Uncategorized"
    expect(screen.getAllByText("Uncategorized").length).toBeGreaterThan(0);
  });

  it("should trigger PDF export with event section containing venue and missing fallbacks", async () => {
    render(<FinancialDashboardPage />);

    const printBtn = screen.getByRole("button", { name: "Print Report" });
    fireEvent.click(printBtn);

    await vi.waitFor(() => {
      expect(generateReportPdf).toHaveBeenCalledTimes(1);
    });

    const pdfOptions = vi.mocked(generateReportPdf).mock.calls[0][0];
    expect(pdfOptions.orientation).toBe("l");

    // Check sections included Event Profitability
    const eventSection = pdfOptions.sections.find((s) => s.title === "Event Profitability");
    expect(eventSection).toBeDefined();
    expect(eventSection?.columns).toEqual(["Event", "Date", "Category", "Venue", "Revenue", "Expenses", "Net Profit", "Margin"]);

    // Check row content in PDF section
    expect(eventSection?.rows[0]).toContain("Gala at Hilton");
    expect(eventSection?.rows[0]).toContain("Hilton Addis Ababa");
    expect(eventSection?.rows[1]).toContain("Private Dinner");
    expect(eventSection?.rows[1]).toContain("Not recorded");
    expect(eventSection?.rows[1]).toContain("Uncategorized");
  });

  it("should trigger export CSV/XLSX using backend endpoint", () => {
    window.open = vi.fn();
    render(<FinancialDashboardPage />);

    // Click Export popover button
    const exportBtn = screen.getByRole("button", { name: "Export" });
    fireEvent.click(exportBtn);

    const exportCsvBtn = screen.getByRole("button", { name: "Export CSV" });
    fireEvent.click(exportCsvBtn);

    expect(getProfitReportExportUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "csv",
      })
    );
    expect(window.open).toHaveBeenCalledWith("http://localhost:4000/events/reports/profit/export?format=csv", "_blank");
  });
});

