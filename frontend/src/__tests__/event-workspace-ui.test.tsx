// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
const apiMocks = vi.hoisted(() => ({
  getItems: vi.fn().mockResolvedValue({ items: [] }),
  getAvailableEmployees: vi.fn().mockResolvedValue([]),
  getAvailableVehicles: vi.fn().mockResolvedValue([]),
  updateEventAllocationDispatchCheck: vi.fn().mockResolvedValue({}),
  markEventDispatchDeparted: vi.fn().mockResolvedValue({ success: true }),
  createEventTripLog: vi.fn().mockResolvedValue({}),
}));

const workspaceData = vi.hoisted(() => ({
  event: {
    id: "event-123",
    name: "Wedding Decoration",
    client_name: "John Doe",
    venue_location: "Sheraton",
    contract_price: 150000,
    estimated_design_cost: 20000,
  },
  allocations: [
    {
      id: "alloc-1",
      item_id: "item-1",
      item_name: "Gold Chairs",
      status: "Reserved",
      quantity_allocated: 50,
      dispatch_checked_at: null,
      departed_at: null,
    },
  ],
  checklist: [
    { id: "task-1", title: "Stage Setup", status: "Pending" },
  ],
  assignments: [
    { id: "asg-1", employee_id: "emp-1", employee_name: "Abebe", role: "Decorator", commission_amount: 5000 },
  ],
  vehicleAssignments: [
    { id: "va-1", vehicle_id: "v-1", plate_number: "AA-2-345", driver_name: "Driver Joe", vehicle_type: "Truck", fuel_consumption_rate: 0.22 },
  ],
  expenses: [],
  trips: [],
}));

vi.mock("@/lib/api", () => ({
  getEventWorkspace: vi.fn().mockResolvedValue(workspaceData),
  getItems: apiMocks.getItems,
  getAvailableEmployees: apiMocks.getAvailableEmployees,
  getAvailableVehicles: apiMocks.getAvailableVehicles,
  createEventAllocation: vi.fn(),
  deleteEventAllocation: vi.fn(),
  updateEventAllocationDispatchCheck: apiMocks.updateEventAllocationDispatchCheck,
  markEventDispatchDeparted: apiMocks.markEventDispatchDeparted,
  createEventChecklistItem: vi.fn(),
  updateEventChecklistItem: vi.fn(),
  updateEventDesign: vi.fn(),
  createEmployeeAssignment: vi.fn(),
  deleteEmployeeAssignment: vi.fn(),
  createVehicleAssignment: vi.fn(),
  deleteVehicleAssignment: vi.fn(),
  updateEmployeeAttendance: vi.fn(),
  createEventTripLog: apiMocks.createEventTripLog,
  createEventExpense: vi.fn(),
  generateEventLaborExpense: vi.fn(),
  getEventProfit: vi.fn().mockResolvedValue({}),
}));

// Mock react-query
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[]; queryFn?: () => unknown; enabled?: boolean }) => {
    if (options.enabled !== false && options.queryFn) {
      options.queryFn();
    }
    // If it's workspace query, return mock data
    if (options.queryKey[0] === "event-workspace") {
      return {
        data: workspaceData,
        isLoading: false,
      };
    }
    return { data: undefined, isLoading: false };
  },
  useMutation: (options: { mutationFn?: (payload?: unknown) => unknown; onSuccess?: () => void }) => ({
    mutate: vi.fn((payload?: unknown) => {
      options.mutationFn?.(payload);
      options.onSuccess?.();
    }),
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
  Input: (props: React.ComponentPropsWithoutRef<"input">) => <input {...props} />,
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
    apiMocks.getItems.mockClear();
    apiMocks.getAvailableEmployees.mockClear();
    apiMocks.getAvailableVehicles.mockClear();
    apiMocks.updateEventAllocationDispatchCheck.mockClear();
    apiMocks.markEventDispatchDeparted.mockClear();
    apiMocks.createEventTripLog.mockClear();
    workspaceData.allocations = [
      {
        id: "alloc-1",
        item_id: "item-1",
        item_name: "Gold Chairs",
        status: "Reserved",
        quantity_allocated: 50,
        dispatch_checked_at: null,
        departed_at: null,
      },
    ];
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

  it("does not fetch mutation-only option lists for read-only event users", () => {
    mockPermissions = ["events:read"];
    render(<EventWorkspacePage />);

    expect(apiMocks.getItems).not.toHaveBeenCalled();
    expect(apiMocks.getAvailableEmployees).not.toHaveBeenCalled();
    expect(apiMocks.getAvailableVehicles).not.toHaveBeenCalled();
  });

  it("disables dispatch departure until every allocation is checked", () => {
    mockPermissions = ["events:read", "event_allocations:write"];
    render(<EventWorkspacePage />);

    fireEvent.click(screen.getByRole("button", { name: /Inventory Allocation/i }));

    expect(screen.getByRole("checkbox", { name: /Dispatch Checklist Gold Chairs/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Mark Departed/i })).toBeDisabled();
  });

  it("calls dispatch check mutation when storekeeper checks an allocation", () => {
    mockPermissions = ["events:read", "event_allocations:write"];
    render(<EventWorkspacePage />);

    fireEvent.click(screen.getByRole("button", { name: /Inventory Allocation/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Dispatch Checklist Gold Chairs/i }));

    expect(apiMocks.updateEventAllocationDispatchCheck).toHaveBeenCalledWith("event-123", "alloc-1", true);
  });

  it("enables departure for checked allocations and disables departed rows", () => {
    mockPermissions = ["events:read", "event_allocations:write"];
    workspaceData.allocations = [
      {
        id: "alloc-1",
        item_id: "item-1",
        item_name: "Gold Chairs",
        status: "Pulled",
        quantity_allocated: 50,
        dispatch_checked_at: "2026-07-01T10:00:00.000Z",
        departed_at: null,
      },
      {
        id: "alloc-2",
        item_id: "item-2",
        item_name: "Silver Stands",
        status: "Pulled",
        quantity_allocated: 10,
        dispatch_checked_at: "2026-07-01T10:01:00.000Z",
        departed_at: "2026-07-01T11:00:00.000Z",
      },
    ];

    render(<EventWorkspacePage />);
    fireEvent.click(screen.getByRole("button", { name: /Inventory Allocation/i }));

    expect(screen.getByRole("button", { name: /Mark Departed/i })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /Dispatch Checklist Silver Stands/i })).toBeDisabled();
  });

  it("shows L/km fuel preview formula and submits trip data unchanged", () => {
    mockPermissions = ["events:read", "trips:create", "reports:profit:read"];
    render(<EventWorkspacePage />);

    fireEvent.click(screen.getByRole("button", { name: /Expenses & Trips/i }));
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "va-1" } });
    fireEvent.change(screen.getByPlaceholderText("Destination"), { target: { value: "Friendship Hotel" } });
    fireEvent.change(screen.getByPlaceholderText("Distance (km)"), { target: { value: "12" } });
    fireEvent.change(screen.getByPlaceholderText("Fuel Price"), { target: { value: "169" } });

    expect(screen.getByText("Vehicle consumption:")).toBeInTheDocument();
    expect(screen.getByText("0.22 L/km")).toBeInTheDocument();
    expect(screen.getByText(/12 km x 0.22 L\/km = 2.64 L; 2.64 L x 169 ETB\/L = ETB 446.16/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Log Trip/i }));
    expect(apiMocks.createEventTripLog).toHaveBeenCalledWith("event-123", {
      vehicle_assignment_id: "va-1",
      destination: "Friendship Hotel",
      distance_km: 12,
      fuel_price_etb: 169,
    });
  });
});
