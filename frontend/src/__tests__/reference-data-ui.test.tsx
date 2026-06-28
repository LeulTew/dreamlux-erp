import React from "react";
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DepartmentsPage from "../app/settings/departments/page";
import PositionsPage from "../app/settings/positions/page";
import OfficesPage from "../app/settings/offices/page";

// Mock AuthLayout as a simple wrapper to bypass route checks, localstorage, and loading spinners
vi.mock("@/components/AuthLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock hooks
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    hasPermission: (perm: string) => {
      if (perm === "departments:manage" || perm === "positions:manage" || perm === "offices:manage") return true;
      return false;
    },
    isLoading: false,
    isAuthenticated: true,
  }),
}));

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: "en",
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [],
    isLoading: false,
  }),
  useMutation: () => ({
    isPending: false,
    mutate: () => {},
  }),
  useQueryClient: () => ({
    invalidateQueries: () => {},
  }),
}));

// Mock API clients
vi.mock("@/lib/api", () => ({
  getDepartments: () => Promise.resolve([]),
  createDepartment: () => Promise.resolve({}),
  updateDepartment: () => Promise.resolve({}),
  deleteDepartment: () => Promise.resolve({}),
  getPositions: () => Promise.resolve([]),
  createPosition: () => Promise.resolve({}),
  updatePosition: () => Promise.resolve({}),
  deletePosition: () => Promise.resolve({}),
  getAllOffices: () => Promise.resolve([]),
  createOffice: () => Promise.resolve({}),
  updateOffice: () => Promise.resolve({}),
  deleteOffice: () => Promise.resolve({}),
}));

// Mock Next.js routing searchParams & router
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe("Reference Data Pages UI", () => {
  test("renders DepartmentsPage correctly", () => {
    render(<DepartmentsPage />);
    expect(screen.getByText("Department Setup")).toBeDefined();
    expect(screen.getByText("Add Department")).toBeDefined();
  });

  test("renders PositionsPage correctly", () => {
    render(<PositionsPage />);
    expect(screen.getByText("Position Setup")).toBeDefined();
    expect(screen.getByText("Add Position")).toBeDefined();
  });

  test("renders OfficesPage correctly", () => {
    render(<OfficesPage />);
    expect(screen.getByText("Office Setup")).toBeDefined();
    expect(screen.getByText("Add Office")).toBeDefined();
  });
});
