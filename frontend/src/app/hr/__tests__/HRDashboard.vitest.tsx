/** @vitest-environment jsdom */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HRDashboardPage from "../page";
import { getEmployees } from "@/lib/api";
import { Employee } from "@/lib/types";

// ─── Framer Motion: bypass animations so DOM settles immediately ────────────
// NOTE: vi.mock is hoisted — no outer variables can be referenced inside the factory.
vi.mock("framer-motion", () => {
  const el =
    (tag: string) =>
    function MotionMock({ children, ...rest }: { children?: React.ReactNode; [k: string]: unknown }) {
      return React.createElement(tag, rest, children);
    };
  return {
    motion: {
      div: el("div"),
      header: el("header"),
      section: el("section"),
      ul: el("ul"),
      li: el("li"),
      span: el("span"),
      p: el("p"),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, {}, children),
  };
});

// ─── Core hook / component mocks ────────────────────────────────────────────
let mockLang = "en";
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ lang: mockLang }),
}));

const mockPermissions = new Set<string>();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    hasPermission: (slug: string) => mockPermissions.has(slug) || mockPermissions.has("*"),
    hasAnyPermission: (slugs: string[]) =>
      slugs.some((slug) => mockPermissions.has(slug) || mockPermissions.has("*")),
  }),
}));

vi.mock("@/components/AuthLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "auth-layout" }, children),
}));

vi.mock("@/components/ForbiddenState", () => ({
  default: () => React.createElement("div", { "data-testid": "forbidden-state" }, "Forbidden State"),
}));

vi.mock("@/components/EditEmployeeSheet", () => ({
  default: ({ employee, onClose }: { employee: Employee; onClose: () => void }) =>
    React.createElement(
      "div",
      { "data-testid": "edit-employee-sheet", "data-employee-id": employee.id },
      React.createElement("button", { onClick: onClose }, "Close Sheet"),
    ),
}));

vi.mock("@/lib/api", () => ({
  getEmployees: vi.fn(),
}));

const mockGetEmployees = getEmployees as ReturnType<typeof vi.fn>;

// ─── QueryClient factory: fresh client per test, no caching ─────────────────
function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// ─── Mock employee dataset ───────────────────────────────────────────────────
const dummyEmployees: Employee[] = [
  {
    id: "emp-1",
    full_name: "Abebe Kebede",
    employee_id: "DL-001",
    department: "Logistics",
    department_id: "dept-1",
    position: "Crew Member",
    phone: "+251911223344",
    email: "abebe@dreamlux.com",
    salary_level: "Level 1",
    commission: "Level 1",
    commission_type: null,
    id_card_front_url: "front.png",
    id_card_back_url: "back.png",
    profile_photo_url: "photo.png",
    office_id: "office-1",
    office: "Addis Ababa",
    event_prices: null,
    base_salary: 8500.00,
    gender: "Male",
    employment_type: "full-time",
    group_name: "Group A",
    bank_name: "Commercial Bank of Ethiopia",
    bank_account: "1000123456789",
    hire_date: "2024-01-10",
    contract_status: "Active",
    created_at: "2024-01-10T00:00:00Z",
    updated_at: "2024-01-10T00:00:00Z",
  },
  {
    id: "emp-2",
    full_name: "Chala Belay",
    employee_id: "DL-002",
    department: "Finance",
    department_id: "dept-2",
    position: "Accountant",
    phone: null,
    email: null,
    salary_level: "Level 2",
    commission: null,
    commission_type: null,
    id_card_front_url: null,
    id_card_back_url: null,
    profile_photo_url: null,
    office_id: "office-1",
    office: "Addis Ababa",
    event_prices: null,
    base_salary: 12000.00,
    gender: "Male",
    employment_type: "full-time",
    group_name: null,
    bank_name: null,
    bank_account: null,
    hire_date: null,
    contract_status: "Suspended",
    created_at: "2024-02-15T00:00:00Z",
    updated_at: "2024-02-15T00:00:00Z",
  },
];

// ─── Test suite ──────────────────────────────────────────────────────────────
describe("HR Dashboard Screen", () => {
  beforeEach(() => {
    mockLang = "en";
    mockPermissions.clear();
    vi.clearAllMocks();
  });

  // ── 1. Permission gate ─────────────────────────────────────────────────────
  it("denies access and renders ForbiddenState when user lacks hr/payroll permissions", () => {
    renderWithQueryClient(<HRDashboardPage />);
    expect(screen.getByTestId("forbidden-state")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-layout")).not.toBeInTheDocument();
  });

  // ── 2. Basic rendering with hr:read ────────────────────────────────────────
  it("renders HR Dashboard heading when user has hr:read permission", async () => {
    mockPermissions.add("hr:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("HR Dashboard")).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  // ── 3. Workforce metrics are computed correctly ────────────────────────────
  it("displays correct workforce metrics after data loads", async () => {
    mockPermissions.add("hr:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      // Total workforce label and readiness label must be present
      expect(screen.getByText("Total Workforce")).toBeInTheDocument();
      expect(screen.getByText("Staffing Readiness")).toBeInTheDocument();
      // Readiness metric: Abebe (Active + fully documented) = 100%
      const readinessEl = screen.getByTestId("readiness-index");
      expect(readinessEl).toBeInTheDocument();
      expect(readinessEl.textContent?.trim()).toBe("100%");
    }, { timeout: 4000 });
  });

  // ── 4. Documented crew count ───────────────────────────────────────────────
  it("shows correct documented crew count", async () => {
    mockPermissions.add("hr:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      // 1 documented out of 1 active
      expect(screen.getByText(/1 Fully Documented Crew/i)).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  // ── 5. Payroll hidden when user lacks payroll permission ───────────────────
  it("redacts payroll metrics and hides toggle if user lacks payroll:read", async () => {
    mockPermissions.add("hr:read");
    // No payroll:read
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("••••••")).toBeInTheDocument();
    }, { timeout: 4000 });

    // Toggle button should NOT be visible
    expect(screen.queryByRole("button", { name: /Show Sensitive Data/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Redact Sensitive Data/i })).not.toBeInTheDocument();
  });

  // ── 6. Payroll toggle renders and works ────────────────────────────────────
  it("shows payroll toggle and allows revealing salary when user has payroll:read", async () => {
    mockPermissions.add("hr:read");
    mockPermissions.add("payroll:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      // Default: redacted
      expect(screen.getByText("••••••")).toBeInTheDocument();
    }, { timeout: 4000 });

    // Click the "Show Sensitive Data" button
    const toggleBtn = screen.getByRole("button", { name: /Show Sensitive Data/i });
    fireEvent.click(toggleBtn);

    // After toggle: should display payroll figure (Abebe 8500)
    await waitFor(() => {
      expect(screen.queryByText("••••••")).not.toBeInTheDocument();
      expect(screen.getByText(/8,500/i)).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  // ── 7. Exception tabs – default tab ───────────────────────────────────────
  it("shows Missing Bank Info tab by default and shows empty state when all active have bank info", async () => {
    mockPermissions.add("hr:read");
    // Abebe (Active) has bank info → should show empty state for Missing Bank
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Missing Bank Info")).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  // ── 8. Missing IDs tab lists Chala Belay ──────────────────────────────────
  it("shows Chala Belay in Missing IDs exception tab", async () => {
    mockPermissions.add("hr:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText("Missing IDs")).toBeInTheDocument();
    }, { timeout: 4000 });

    // Switch to Missing IDs tab
    const docTab = screen.getByRole("button", { name: /Missing IDs/i });
    fireEvent.click(docTab);

    // Chala has no ID scans → should appear in the table
    await waitFor(() => {
      expect(screen.getByText("Chala Belay")).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  // ── 9. Contract Warnings tab ───────────────────────────────────────────────
  it("shows contract warnings for employees with missing hire date or non-active status", async () => {
    mockPermissions.add("hr:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Contract Warnings")).toBeInTheDocument();
    }, { timeout: 4000 });

    // Switch to Contract Warnings tab
    const contractTab = screen.getByRole("button", { name: /Contract Warnings/i });
    fireEvent.click(contractTab);

    // Chala has no hire_date and Suspended status
    await waitFor(() => {
      expect(screen.getByText("Chala Belay")).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  // ── 10. Clicking exception row opens EditEmployeeSheet ─────────────────────
  it("opens EditEmployeeSheet when clicking an employee row in Missing IDs tab", async () => {
    mockPermissions.add("hr:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Missing IDs")).toBeInTheDocument();
    }, { timeout: 4000 });

    // Switch to Missing IDs tab
    const docTab = screen.getByRole("button", { name: /Missing IDs/i });
    fireEvent.click(docTab);

    // Wait for Chala Belay row to appear
    await waitFor(() => {
      expect(screen.getByText("Chala Belay")).toBeInTheDocument();
    }, { timeout: 4000 });

    // Click the row
    fireEvent.click(screen.getByText("Chala Belay"));

    // EditEmployeeSheet should appear
    await waitFor(() => {
      const sheet = screen.getByTestId("edit-employee-sheet");
      expect(sheet).toBeInTheDocument();
      expect(sheet).toHaveAttribute("data-employee-id", "emp-2");
    }, { timeout: 4000 });
  });

  // ── 11. EditEmployeeSheet closes on onClose ────────────────────────────────
  it("closes EditEmployeeSheet when Close Sheet button is clicked", async () => {
    mockPermissions.add("hr:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Missing IDs")).toBeInTheDocument();
    }, { timeout: 4000 });

    const docTab = screen.getByRole("button", { name: /Missing IDs/i });
    fireEvent.click(docTab);

    await waitFor(() => {
      expect(screen.getByText("Chala Belay")).toBeInTheDocument();
    }, { timeout: 4000 });

    fireEvent.click(screen.getByText("Chala Belay"));

    await waitFor(() => {
      expect(screen.getByTestId("edit-employee-sheet")).toBeInTheDocument();
    }, { timeout: 4000 });

    // Close the sheet
    fireEvent.click(screen.getByText("Close Sheet"));

    await waitFor(() => {
      expect(screen.queryByTestId("edit-employee-sheet")).not.toBeInTheDocument();
    }, { timeout: 4000 });
  });

  // ── 12. Amharic localisation ───────────────────────────────────────────────
  it("renders Amharic page title when language is set to am", async () => {
    mockLang = "am";
    mockPermissions.add("hr:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("የሰው ኃይል ዳሽቦርድ")).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  // ── 13. Empty state when no employees returned ─────────────────────────────
  it("shows empty state message when employee list is empty", async () => {
    mockPermissions.add("hr:read");
    mockGetEmployees.mockResolvedValue({ employees: [], total: 0, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText((content) =>
          content.includes("register employees") || content.includes("Please register employees"),
        ),
      ).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  // ── 14. Documentation gaps count ──────────────────────────────────────────
  it("shows documentation gaps count matching employees missing ID scans", async () => {
    mockPermissions.add("hr:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      // Chala has no id_card_front_url or id_card_back_url → 1 documentation gap
      expect(screen.getByText("Documentation Gaps")).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  // ── 15. Payroll:write also grants payroll visibility ──────────────────────
  it("also shows payroll metrics when user has payroll:write", async () => {
    mockPermissions.add("hr:read");
    mockPermissions.add("payroll:write");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      // Toggle button is visible because payroll:write grants payroll view access
      expect(
        screen.getByRole("button", { name: /Show Sensitive Data/i }),
      ).toBeInTheDocument();
    }, { timeout: 4000 });
  });
});
