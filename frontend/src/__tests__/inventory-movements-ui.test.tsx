// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import InventoryMovementsPage from "@/app/assets/movements/page";

const refetch = vi.fn();
let canRead = true;
let queryState: Record<string, unknown> = {};

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("sourceId=7c3f9b65-3333-4ee7-8b62-41d6e5f11101"),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/AuthLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "en" }) }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ hasPermission: () => canRead, isLoading: false, isAuthenticated: true }),
}));
vi.mock("@/lib/api", () => ({ getInventoryMovements: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => queryState }));

const movement = {
  id: "movement-1",
  item_id: "item-1",
  item_name: "White Fabric",
  unit_of_measurement: "pcs",
  quantity_delta: 18,
  quantity_before: 24,
  quantity_after: 42,
  source_type: "capital_investment",
  source_id: "7c3f9b65-3333-4ee7-8b62-41d6e5f11101",
  created_at: "2026-07-15T08:00:00Z",
  created_by_name: "Finance Owner",
};

describe("Inventory movement history", () => {
  beforeEach(() => {
    canRead = true;
    refetch.mockReset();
    queryState = { data: { movements: [movement], total: 1, page: 1, limit: 25, totalPages: 1 }, isLoading: false, isError: false, refetch };
  });

  it("renders immutable movement attribution and before/after quantities", () => {
    render(<InventoryMovementsPage />);
    expect(screen.getByRole("heading", { name: "Stock Movements" })).toBeInTheDocument();
    expect(screen.getByText("White Fabric")).toBeInTheDocument();
    expect(screen.getByText("+18 pcs")).toBeInTheDocument();
    expect(screen.getByText("24 → 42")).toBeInTheDocument();
    expect(screen.getByText("Finance Owner")).toBeInTheDocument();
  });

  it("offers recovery after a query failure", () => {
    queryState = { isLoading: false, isError: true, refetch };
    render(<InventoryMovementsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("blocks users without inventory history permission", () => {
    canRead = false;
    render(<InventoryMovementsPage />);
    expect(screen.getByText(/only authorized personnel/i)).toBeInTheDocument();
  });
});
