/** @vitest-environment jsdom */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HRDashboardPage from "../page";
import { getEmployees } from "@/lib/api";
import { Employee } from "@/lib/types";

// Mock imports
let mockLang = "en";
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: mockLang,
  }),
}));

let mockPermissions = new Set<string>();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    hasPermission: (slug: string) => mockPermissions.has(slug) || mockPermissions.has("*"),
    hasAnyPermission: (slugs: string[]) => slugs.some((slug) => mockPermissions.has(slug) || mockPermissions.has("*")),
  }),
}));

vi.mock("@/components/AuthLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-layout">{children}</div>,
}));

vi.mock("@/components/ForbiddenState", () => ({
  default: () => <div data-testid="forbidden-state">Forbidden State</div>,
}));

vi.mock("@/lib/api", () => ({
  getEmployees: vi.fn(),
}));

const mockGetEmployees = getEmployees as ReturnType<typeof vi.fn>;

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

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
    updated_at: "2024-01-10T00:00:00Z"
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
    updated_at: "2024-02-15T00:00:00Z"
  }
];

describe("HR Dashboard Screen", () => {
  beforeEach(() => {
    mockLang = "en";
    mockPermissions.clear();
    vi.clearAllMocks();
  });

  it("denies access and renders ForbiddenState when user lacks permissions", () => {
    renderWithQueryClient(<HRDashboardPage />);
    expect(screen.getByTestId("forbidden-state")).toBeInTheDocument();
  });

  it("allows access and fetches statistics if user has hr:read permission", async () => {
    mockPermissions.add("hr:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("auth-layout")).toBeInTheDocument();
      expect(screen.getByText("HR Dashboard")).toBeInTheDocument();
      // Abebe has front/back ID and photo, Chala doesn't.
      // 1 active documented out of 1 active = 100% readiness
      expect(screen.getByText("100%")).toBeInTheDocument();
      // Total workforce: 2
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  it("redacts payroll metrics automatically and hides redact button if user lacks payroll permission", async () => {
    mockPermissions.add("hr:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("••••••")).toBeInTheDocument();
    });

    // Redact/Show button should not be present
    expect(screen.queryByText("Show Sensitive Data")).not.toBeInTheDocument();
    expect(screen.queryByText("Redact Sensitive Data")).not.toBeInTheDocument();
  });

  it("displays and allows toggling payroll redaction if user has payroll:read permission", async () => {
    mockPermissions.add("hr:read");
    mockPermissions.add("payroll:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      // Default is redacted/masked
      expect(screen.getByText("••••••")).toBeInTheDocument();
    });

    const toggleBtn = screen.getByRole("button", { name: /Show Sensitive Data/i });
    fireEvent.click(toggleBtn);

    // After clicking show, it should display the base payroll sum (8500)
    await waitFor(() => {
      expect(screen.queryByText("••••••")).not.toBeInTheDocument();
      expect(screen.getByText(/8,500/i)).toBeInTheDocument();
    });
  });

  it("switches exception tabs correctly", async () => {
    mockPermissions.add("hr:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      // Default tab: Missing Bank Info
      expect(screen.getByText("Missing Bank Info")).toBeInTheDocument();
      // Chala Belay (Active with missing bank details)
      // Wait, Chala Belay's status is "Suspended". Abebe Kebede is "Active" but has bank details.
      // Wait, let's see how many active employees have missing bank info. Abebe has details. Chala is suspended.
      // So missing bank info list should show empty state or list.
    });

    const docTab = screen.getByRole("button", { name: /Missing IDs/i });
    fireEvent.click(docTab);

    // Incomplete documents should list Chala Belay
    await waitFor(() => {
      expect(screen.getByText("Chala Belay")).toBeInTheDocument();
    });
  });

  it("displays localized headers when Amharic is enabled", async () => {
    mockLang = "am";
    mockPermissions.add("hr:read");
    mockGetEmployees.mockResolvedValue({ employees: dummyEmployees, total: 2, page: 1 });

    renderWithQueryClient(<HRDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("የሰው ኃይል ዳሽቦርድ")).toBeInTheDocument();
    });
  });
});
