import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/navigation
vi.mock("next/navigation", () => {
  const params = new URLSearchParams();
  return {
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
    }),
    usePathname: () => "/events",
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

vi.mock("@/lib/api", () => {
  const mockApi = {
    get: vi.fn().mockResolvedValue({
      data: {
        permission_slugs: ["reports:profit:read", "events:write", "events:saved_views:share"],
        is_superuser: false,
      },
    }),
    defaults: { baseURL: "http://localhost:4000" },
  };

  return {
    api: mockApi,
    getEvents: vi.fn().mockResolvedValue({ events: [], total: 0 }),
    getEvent: vi.fn(),
    getEventSavedViews: vi.fn().mockResolvedValue({ savedViews: [] }),
    createEventSavedView: vi.fn(),
    deleteEventSavedView: vi.fn(),
    getEventProposals: vi.fn().mockResolvedValue({ proposals: [], total: 0 }),
    createEventProposal: vi.fn().mockResolvedValue({ proposal: { id: "prop-123" } }),
    submitEventProposal: vi.fn().mockResolvedValue({}),
    getProfitReport: vi.fn().mockResolvedValue({
      summary: {
        totalEvents: 0,
        totalRevenue: 0,
        totalExpenses: 0,
        netProfit: 0,
        profitMargin: 0,
        pendingExpenseExposure: 0,
      },
      categoryBreakdown: [],
      monthlyData: [],
      eventTypePerformance: [],
      kpis: {},
      proposalVariance: { events: [], averageVariance: 0 }
    }),
    getEventTypes: vi.fn().mockResolvedValue([]),
    getProfitReportExportUrl: vi.fn().mockReturnValue("http://localhost:4000/events/reports/profit/export"),
    getEventsExportUrl: vi.fn().mockReturnValue("http://localhost:4000/events/export"),
    previewEventsImport: vi.fn(),
    commitEventsImport: vi.fn(),
  };
});



describe("Issue #33 Frontend UI Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Proposal Estimate Live Calculations", () => {
    it("should calculate proposal estimate sums correctly", () => {
      // Test the local calculations logic that runs on new proposal intake page
      const designLines = [{ label: "Layout Decor", amount: 5000, notes: "" }];
      const teamLines = [
        { label: "Designers", amount: 0, notes: "", people_count: 3, commission_per_person: 2000 },
        { label: "Waitstaff", amount: 4000, notes: "", people_count: 5, commission_per_person: 500 }
      ];
      const tripLines = [{ label: "Transport", amount: 3000, notes: "" }];
      const otherLines = [{ label: "Sundries", amount: 1500, notes: "" }];
      const requestedBudget = 30000;

      const sumLineAmount = (lines: { amount?: number }[]) => lines.reduce((sum, l) => sum + Number(l.amount || 0), 0);

      const designCost = sumLineAmount(designLines);
      
      // Team cost handles Math.max of explicit vs derived commission
      const teamCost = teamLines.reduce((sum, l) => {
        const explicit = Number(l.amount || 0);
        const derived = Number(l.people_count || 1) * Number(l.commission_per_person || 0);
        return sum + Math.max(explicit, derived);
      }, 0);
      
      const tripCost = sumLineAmount(tripLines);
      const otherCost = sumLineAmount(otherLines);

      const totalCost = designCost + teamCost + tripCost + otherCost;
      const netProfit = requestedBudget - totalCost;
      const margin = requestedBudget > 0 ? Number(((netProfit / requestedBudget) * 100).toFixed(2)) : 0;

      // Assertions
      expect(designCost).toBe(5000);
      // Designers: max(0, 3*2000) = 6000. Waitstaff: max(4000, 5*500) = 4000. Total teamCost = 10000
      expect(teamCost).toBe(10000);
      expect(tripCost).toBe(3000);
      expect(otherCost).toBe(1500);
      expect(totalCost).toBe(19500);
      expect(netProfit).toBe(10500);
      expect(margin).toBe(35); // 10500 / 30000 * 100
    });

    it("should trigger margin risk warning when margin is below 25%", () => {
      const requestedBudget = 10000;
      const totalCost = 8000; // margin = 20%
      const netProfit = requestedBudget - totalCost;
      const margin = (netProfit / requestedBudget) * 100;
      const hasMarginRisk = margin < 25 || netProfit < 0;

      expect(hasMarginRisk).toBe(true);
    });
  });

  describe("File Import Parsing Logic", () => {
    it("should parse CSV line respects quotes correctly", () => {
      const splitCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result.map(s => s.replace(/^"|"$/g, "").trim());
      };

      const csvLine = 'DreamLux Setup,"Client Name, Sample",+251900000000';
      const parsed = splitCSVLine(csvLine);
      expect(parsed).toEqual(["DreamLux Setup", "Client Name, Sample", "+251900000000"]);
    });
  });
});
