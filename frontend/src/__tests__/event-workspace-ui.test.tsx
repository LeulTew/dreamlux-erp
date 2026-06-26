import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import EventWorkspacePage from "../app/events/[id]/page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "event-123" }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock useLanguage
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: "en",
  }),
}));

// Mock api
vi.mock("@/lib/api", () => ({
  getEventWorkspace: vi.fn().mockResolvedValue({
    event: {
      id: "event-123",
      name: "Wedding Decoration",
      client_name: "John Doe",
      venue_location: "Sheraton",
      contract_price: 150000,
      estimated_design_cost: 20000,
    },
    allocations: [
      { id: "alloc-1", item_id: "item-1", item_name: "Gold Chairs", status: "Allocated", quantity_allocated: 50 },
    ],
    checklist: [
      { id: "task-1", title: "Stage Setup", status: "Pending" },
    ],
    assignments: [
      { id: "asg-1", employee_id: "emp-1", employee_name: "Abebe", role: "Decorator", commission_amount: 5000 },
    ],
    vehicleAssignments: [
      { id: "va-1", vehicle_id: "v-1", plate_number: "AA-2-345", driver_name: "Driver Joe", vehicle_type: "Truck" },
    ],
    expenses: [],
    trips: [],
  }),
  getItems: vi.fn().mockResolvedValue({ items: [] }),
  getAvailableEmployees: vi.fn().mockResolvedValue([]),
  getAvailableVehicles: vi.fn().mockResolvedValue([]),
  getEventProfit: vi.fn().mockResolvedValue({}),
}));

// Mock react-query
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[] }) => {
    // If it's workspace query, return mock data
    if (options.queryKey[0] === "event-workspace") {
      return {
        data: {
          event: {
            id: "event-123",
            name: "Wedding Decoration",
            client_name: "John Doe",
            venue_location: "Sheraton",
            contract_price: 150000,
            estimated_design_cost: 20000,
          },
          allocations: [
            { id: "alloc-1", item_id: "item-1", item_name: "Gold Chairs", status: "Allocated", quantity_allocated: 50 },
          ],
          checklist: [
            { id: "task-1", title: "Stage Setup", status: "Pending" },
          ],
          assignments: [
            { id: "asg-1", employee_id: "emp-1", employee_name: "Abebe", role: "Decorator", commission_amount: 5000 },
          ],
          vehicleAssignments: [
            { id: "va-1", vehicle_id: "v-1", plate_number: "AA-2-345", driver_name: "Driver Joe", vehicle_type: "Truck" },
          ],
          expenses: [],
          trips: [],
        },
        isLoading: false,
      };
    }
    return { data: undefined, isLoading: false };
  },
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

let mockUser = { full_name: "Admin User", role: "ADMIN", role_name: "ADMIN" };
let mockPermissions: string[] = [];
let mockIsSuperuser = false;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    hasPermission: (slug: string) => {
      if (mockIsSuperuser || mockPermissions.includes("*")) return true;
      return mockPermissions.includes(slug);
    },
    hasAnyPermission: (slugs: string[]) => {
      if (mockIsSuperuser || mockPermissions.includes("*")) return true;
      return slugs.some(slug => mockPermissions.includes(slug));
    },
  }),
}));

// Mock subcomponents to avoid rendering complexity
vi.mock("@/components/AuthLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-layout">{children}</div>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock("@/components/ui/input", () => ({
  default: (props: React.ComponentPropsWithoutRef<"input">) => <input {...props} />,
}));
vi.mock("@/components/ui/Select", () => ({
  default: (props: React.ComponentPropsWithoutRef<"select">) => <select {...props} />,
}));
vi.mock("@/components/ui/DatePicker", () => ({
  default: (props: React.ComponentPropsWithoutRef<"input">) => <input type="date" {...props} />,
}));
vi.mock("@/components/PaginationControls", () => ({
  default: () => <div>Pagination</div>,
}));
vi.mock("@/components/ui/StatusBadge", () => ({
  default: ({ status }: { status: string }) => <span>{status}</span>,
}));
vi.mock("../[id]/DesignPackagePanel", () => ({
  default: () => <div>Design Package Panel</div>,
}));

describe("EventWorkspacePage Role-Aware Controls", () => {
  beforeEach(() => {
    mockUser = { full_name: "Admin User", role: "ADMIN", role_name: "ADMIN" };
    mockPermissions = ["events:read"];
    mockIsSuperuser = false;
    vi.clearAllMocks();
  });

  it("redacts contract price if user lacks reports:profit:read", () => {
    mockPermissions = ["events:read"]; // lacks reports:profit:read
    render(<EventWorkspacePage />);
    
    // Contract price FieldRow should not be rendered
    expect(screen.queryByText("Contract Price")).toBeNull();
  });

  it("shows contract price if user has reports:profit:read", () => {
    mockPermissions = ["events:read", "reports:profit:read"];
    render(<EventWorkspacePage />);
    
    expect(screen.getByText("Contract Price")).toBeInTheDocument();
    expect(screen.getByText("ETB 150,000")).toBeInTheDocument();
  });
});
