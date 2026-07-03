// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import InvestmentsPage from "../app/hr/finance/investments/page";

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
let mockSummaryData: unknown = null;
let mockListData: unknown = null;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[] }) => {
    if (options.queryKey[0] === "auth-permissions") {
      return { data: mockAuthData, isLoading: false };
    }
    if (options.queryKey[0] === "finance-investments-summary") {
      return { data: mockSummaryData, isLoading: false };
    }
    if (options.queryKey[0] === "finance-investments-list") {
      return { data: mockListData, isLoading: false };
    }
    if (options.queryKey[0] === "inventory-items-lookup") {
      return { data: { items: [{ id: "item-1", name: "Washing Machine", quantity: 2 }] }, isLoading: false };
    }
    return { data: undefined, isLoading: false };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  INVESTMENT_CATEGORIES: [
    "Equipment", "Fabric", "Fixtures", "Hardware", "Vehicle", "Store Buildout", "Office Equipment", "Other"
  ],
  CAPEX_CLASSIFICATIONS: [
    "Capital Asset", "Inventory Asset", "Leasehold Improvement", "Fixture", "Other Capex"
  ],
  getCapitalInvestments: vi.fn(),
  getCapitalInvestmentSummary: vi.fn(),
  createCapitalInvestment: vi.fn(),
  updateCapitalInvestment: vi.fn(),
  deleteCapitalInvestment: vi.fn(),
  approveCapitalInvestment: vi.fn(),
  rejectCapitalInvestment: vi.fn(),
  getCapitalInvestmentsExportUrl: vi.fn().mockReturnValue("https://mock-export-url"),
  getItems: vi.fn().mockResolvedValue({ items: [] }),
  api: { get: vi.fn(), defaults: { baseURL: "http://localhost:4000" } },
}));

const SUMMARY_FIXTURE = {
  totals: {
    approvedTotal: 15000,
    pendingTotal: 4500,
    pendingCount: 1,
    linkedCount: 1,
    unlinkedCount: 2,
  },
  byCategory: [
    { category: "Equipment", amount: 15000 },
  ],
  byClassification: [
    { capex_classification: "Capital Asset", amount: 15000 },
  ],
};

const LEDGER_FIXTURE = {
  investments: [
    {
      id: "ci-1",
      purchase_date: "2026-06-01",
      item_name: "Heavy Washing Machine",
      category: "Equipment",
      quantity: 1,
      unit: "pcs",
      unit_cost: 15000,
      total_cost: 15000,
      vendor: "SINGER Corp",
      notes: "Capex machinery",
      capex_classification: "Capital Asset",
      asset_id: "item-1",
      asset_name: "Washing Machine",
      creates_inventory_stock: true,
      status: "Approved",
      rejected_reason: null,
      created_by: "u-1",
      created_at: "2026-06-01T10:00:00Z",
    },
    {
      id: "ci-2",
      purchase_date: "2026-06-05",
      item_name: "Fabric Roll Blue",
      category: "Fabric",
      quantity: 10,
      unit: "rolls",
      unit_cost: 450,
      total_cost: 4500,
      vendor: "Textile Inc",
      notes: "Unlinked purchase lines",
      capex_classification: "Inventory Asset",
      asset_id: null,
      creates_inventory_stock: false,
      status: "Pending",
      rejected_reason: null,
      created_by: "u-1",
      created_at: "2026-06-05T12:00:00Z",
    },
  ],
  total: 2,
  page: 1,
  limit: 25,
  totalPages: 1,
};

describe("Capital Investments Page UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLang = "en";
    mockAuthData = {
      permission_slugs: ["finance:investments:read", "finance:investments:write"],
      is_superuser: false,
    };
    mockSummaryData = SUMMARY_FIXTURE;
    mockListData = LEDGER_FIXTURE;
  });

  it("gates access with ForbiddenState for unauthorized users", () => {
    mockAuthData = { permission_slugs: [] };
    render(<InvestmentsPage />);
    expect(screen.queryByTestId("auth-layout")).not.toBeInTheDocument();
    expect(screen.getByText(/forbidden/i)).toBeInTheDocument();
  });

  it("renders summary blocks correctly with workbook capex metrics", () => {
    render(<InvestmentsPage />);
    expect(screen.getByTestId("auth-layout")).toBeInTheDocument();
    expect(screen.getByText("Approved Total")).toBeInTheDocument();
    expect(screen.getByText("Pending Exposure")).toBeInTheDocument();
    expect(screen.getByText("Linked Assets")).toBeInTheDocument();
    expect(screen.getByText("Unlinked Purchases")).toBeInTheDocument();
  });

  it("renders ledger rows, badges, and linked asset states correctly", () => {
    render(<InvestmentsPage />);
    expect(screen.getByText("Heavy Washing Machine")).toBeInTheDocument();
    expect(screen.getByText("Fabric Roll Blue")).toBeInTheDocument();
    expect(screen.getByText(/SINGER Corp/)).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();

    // Check linked asset badge matches
    expect(screen.getByTestId("linked-asset-badge")).toBeInTheDocument();
    expect(screen.getByTestId("unlinked-asset-badge")).toBeInTheDocument();
  });

  it("hides approve/reject buttons for write-only accountant", () => {
    render(<InvestmentsPage />);
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("shows approve/reject buttons for owner/approver role", () => {
    mockAuthData.permission_slugs.push("finance:investments:approve");
    render(<InvestmentsPage />);
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  it("disables edit/delete buttons for approved entries", () => {
    render(<InvestmentsPage />);
    // Heavy Washing Machine is Approved, Fabric Roll Blue is Pending.
    // Edit/delete buttons should only render for Fabric Roll Blue (Pending).
    const editBtns = screen.getAllByRole("button", { name: /edit/i });
    expect(editBtns.length).toBe(1);
  });
});
