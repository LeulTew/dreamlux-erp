import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DepartmentsPage from "@/app/settings/departments/page";

const getDepartmentsMock = vi.fn();
const getDepartmentDeleteImpactMock = vi.fn();
const deleteDepartmentMock = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/AuthLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    hasPermission: (slug: string) => slug === "departments:manage",
    isLoading: false,
    isAuthenticated: true,
  }),
}));

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ lang: "en" }),
}));

vi.mock("@/lib/api", () => ({
  getDepartments: () => getDepartmentsMock(),
  getDepartmentDeleteImpact: (id: string) => getDepartmentDeleteImpactMock(id),
  deleteDepartment: (id: string) => deleteDepartmentMock(id),
  createDepartment: vi.fn(),
  updateDepartment: vi.fn(),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe("DepartmentsPage delete impact warnings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDepartmentsMock.mockResolvedValue([
      { id: "dept-1", name: "Logistics" },
    ]);
  });

  it("blocks deletion and displays active employees when delete impact contains active employee references", async () => {
    getDepartmentDeleteImpactMock.mockResolvedValue({
      department_name: "Logistics",
      active_employee_count: 2,
      employees: [
        { id: "emp-1", full_name: "Daniel Kebede" },
        { id: "emp-2", full_name: "Hana Kebede" },
      ],
    });

    renderWithClient(<DepartmentsPage />);

    // Wait for department to render
    const logisticsText = await screen.findByText("Logistics");
    expect(logisticsText).toBeInTheDocument();

    // Click delete button
    const deleteBtn = screen.getByTitle("Delete");
    fireEvent.click(deleteBtn);

    // Wait for the delete impact check to resolve
    await waitFor(() => {
      expect(getDepartmentDeleteImpactMock).toHaveBeenCalledWith("dept-1");
    });

    // Verify warning text shows employee names
    expect(
      await screen.findByText(/Cannot delete department: associated with active employee\(s\) \(Daniel Kebede, Hana Kebede\)/i)
    ).toBeInTheDocument();

    // Verify confirm delete button is hidden / not in document because confirmDisabled={true}
    const confirmBtn = screen.queryByRole("button", { name: /Confirm Delete/i });
    expect(confirmBtn).not.toBeInTheDocument();
  });

  it("allows deletion when department has no active employees", async () => {
    getDepartmentDeleteImpactMock.mockResolvedValue({
      department_name: "Logistics",
      active_employee_count: 0,
      employees: [],
    });

    renderWithClient(<DepartmentsPage />);

    const logisticsText = await screen.findByText("Logistics");
    expect(logisticsText).toBeInTheDocument();

    const deleteBtn = screen.getByTitle("Delete");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(getDepartmentDeleteImpactMock).toHaveBeenCalledWith("dept-1");
    });

    // Verify clear confirmation message
    expect(
      await screen.findByText(/Are you sure you want to remove this department\?/i)
    ).toBeInTheDocument();

    // Verify confirm delete button is present
    const confirmBtn = screen.getByRole("button", { name: /Confirm Delete/i });
    expect(confirmBtn).toBeInTheDocument();
  });
});
