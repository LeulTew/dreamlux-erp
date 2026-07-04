// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import OverheadsPage from "../app/hr/finance/overheads/page";

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
let mockSummaryData: any = null;
let mockListData: any = null;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[] }) => {
    if (options.queryKey[0] === "auth-permissions") {
      return { data: mockAuthData, isLoading: false };
    }
    if (options.queryKey[0] === "finance-overheads-summary") {
      return { data: mockSummaryData, isLoading: false };
    }
    if (options.queryKey[0] === "finance-overheads-list") {
      return { data: mockListData, isLoading: false };
    }
    if (options.queryKey[0] === "employees-lookup") {
      return { data: { employees: [] }, isLoading: false };
    }
    return { data: undefined, isLoading: false };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  OVERHEAD_CATEGORIES: [
    "Salary", "Fuel", "Car Rental", "Office Rent", "Store Rent",
    "Wifi", "Water & Electric", "Marketing/Boost", "Sticker",
    "Seasonal/Ekub", "Food", "House Expense", "Supplies", "Other"
  ],
  getFinanceOverheads: vi.fn(),
  getFinanceOverheadSummary: vi.fn(),
  createFinanceOverhead: vi.fn(),
  updateFinanceOverhead: vi.fn(),
  deleteFinanceOverhead: vi.fn(),
  approveFinanceOverhead: vi.fn(),
  rejectFinanceOverhead: vi.fn(),
  closeOverheadMonth: vi.fn(),
  reopenOverheadMonth: vi.fn(),
  getEmployees: vi.fn().mockResolvedValue({ employees: [] }),
  api: { get: vi.fn() },
}));

const SUMMARY_FIXTURE = {
  month: "2026-05",
  closed: false,
  closure: null,
  blocks: {
    officeStaff: 5000,
    storeStaff: 4000,
    shared: 2500,
    rentalAndOther: 8000,
    grandOfficeStore: 9000,
    grandSharedRental: 10500,
  },
  totals: {
    subtotalMonthly: 19500,
    staffPayments: 9000,
    nonPayrollOverhead: 10500,
    pendingExposure: 1200,
    pendingCount: 2,
  },
  byCategory: [
    { category: "Salary", amount: 9000 },
    { category: "Office Rent", amount: 6000 },
  ],
};

const LEDGER_FIXTURE = {
  overheads: [
    {
      id: "oh-1",
      expense_month: "2026-05-01",
      due_date: "2026-05-15",
      category: "Salary",
      payee: "Abebe Kebede",
      scope: "Office",
      shared_with: null,
      payment_kind: "staff_payment",
      employee_id: "emp-1",
      employee_name: "Abebe Kebede",
      is_recurring: false,
      amount: 5000,
      notes: "Office payroll line",
      status: "Approved",
      rejected_reason: null,
      created_by: "u-1",
      approved_by: "u-2",
      created_at: "2026-05-01T10:00:00Z",
    },
    {
      id: "oh-2",
      expense_month: "2026-05-01",
      due_date: "2026-05-20",
      category: "Wifi",
      payee: "Telecom",
      scope: "General",
      shared_with: null,
      payment_kind: "overhead",
      employee_id: null,
      is_recurring: true,
      amount: 1500,
      notes: "Office internet",
      status: "Pending",
      rejected_reason: null,
      created_by: "u-1",
      approved_by: null,
      created_at: "2026-05-01T11:00:00Z",
    },
  ],
  total: 2,
  page: 1,
  limit: 25,
  totalPages: 1,
};

describe("Overhead Register Page UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLang = "en";
    mockAuthData = {
      permission_slugs: ["finance:overheads:read", "finance:overheads:write"],
      is_superuser: false,
    };
    mockSummaryData = SUMMARY_FIXTURE;
    mockListData = LEDGER_FIXTURE;
  });

  it("gates access with ForbiddenState for unauthorized users", () => {
    mockAuthData = { permission_slugs: [] };
    render(<OverheadsPage />);
    expect(screen.queryByTestId("auth-layout")).not.toBeInTheDocument();
    expect(screen.getByText(/forbidden/i)).toBeInTheDocument();
  });

  it("renders month summary blocks correctly in workbook style", () => {
    render(<OverheadsPage />);
    expect(screen.getByTestId("auth-layout")).toBeInTheDocument();
    expect(screen.getByText("Office Staff")).toBeInTheDocument();
    expect(screen.getByText("Store Staff")).toBeInTheDocument();
    expect(screen.getByText("Shared with Koti")).toBeInTheDocument();
    expect(screen.getByText("Rental & Other")).toBeInTheDocument();
    expect(screen.getByText("Subtotal Monthly")).toBeInTheDocument();
  });

  it("renders list and badges correctly", () => {
    render(<OverheadsPage />);
    expect(screen.getByText("Abebe Kebede")).toBeInTheDocument();
    expect(screen.getByText("Office payroll line")).toBeInTheDocument();
    expect(screen.getByText("Office internet")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("hides approve/reject buttons for write-only accountant", () => {
    render(<OverheadsPage />);
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("shows approve/reject buttons for owner/approver", () => {
    mockAuthData.permission_slugs.push("finance:overheads:approve");
    render(<OverheadsPage />);
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  it("disables edit/delete buttons for approved entries", () => {
    render(<OverheadsPage />);
    // Abebe's entry is Approved, Wifi entry is Pending.
    // Edit/delete buttons should only be rendered/enabled for Wifi entry.
    const editBtns = screen.getAllByRole("button", { name: /edit/i });
    expect(editBtns.length).toBe(1); // Only Wifi entry gets edit button.
  });

  it("shows disabled states when the month is closed", () => {
    mockSummaryData = {
      ...SUMMARY_FIXTURE,
      closed: true,
      closure: { closed_at: "2026-06-01T00:00:00Z", closed_by_username: "owner" },
    };
    render(<OverheadsPage />);
    expect(screen.getByText(/this month is closed for edits/i)).toBeInTheDocument();

    const addBtn = screen.getByRole("button", { name: /add expense/i });
    expect(addBtn).toBeDisabled();
  });
});
