// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
let mockLang = "en";
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    get lang() {
      return mockLang;
    },
  }),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({
  __esModule: true,
  default: toastMocks,
}));

// Mock api
const apiMocks = vi.hoisted(() => ({
  getItems: vi.fn().mockResolvedValue({ items: [] }),
  getAvailableEmployees: vi.fn().mockResolvedValue([]),
  getAvailableVehicles: vi.fn().mockResolvedValue([]),
  updateEventAllocationDispatchCheck: vi.fn().mockResolvedValue({}),
  markEventDispatchDeparted: vi.fn().mockResolvedValue({ success: true }),
  createEventTripLog: vi.fn().mockResolvedValue({}),
  updateEventAllocation: vi.fn().mockResolvedValue({}),
  updateEmployeeAttendance: vi.fn().mockResolvedValue({}),
  createEmployeeAssignment: vi.fn().mockResolvedValue({}),
}));

type AllocationFixture = {
  id: string;
  item_id: string;
  item_name: string;
  status: string;
  quantity_allocated: number;
  notes: string | null;
  dispatch_checked_at: string | null;
  departed_at: string | null;
};

type AssignmentFixture = {
  id: string;
  employee_id: string;
  employee_name: string;
  role: string;
  commission_amount: number;
  attended: boolean | null;
  attendance_marked_at?: string | null;
};

const workspaceData = vi.hoisted(() => ({
  event: {
    id: "event-123",
    status: "Ongoing",
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
      notes: "Front hall",
      dispatch_checked_at: null,
      departed_at: null,
    },
  ] as AllocationFixture[],
  checklist: [
    { id: "task-1", title: "Stage Setup", status: "Pending" },
  ],
  assignments: [
    { id: "asg-1", employee_id: "emp-1", employee_name: "Abebe", role: "Decorator", commission_amount: 5000, attended: false },
  ] as AssignmentFixture[],
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
  updateEventAllocation: apiMocks.updateEventAllocation,
  updateEventAllocationDispatchCheck: apiMocks.updateEventAllocationDispatchCheck,
  markEventDispatchDeparted: apiMocks.markEventDispatchDeparted,
  createEventChecklistItem: vi.fn(),
  updateEventChecklistItem: vi.fn(),
  updateEventDesign: vi.fn(),
  createEmployeeAssignment: apiMocks.createEmployeeAssignment,
  deleteEmployeeAssignment: vi.fn(),
  createVehicleAssignment: vi.fn(),
  deleteVehicleAssignment: vi.fn(),
  updateEmployeeAttendance: apiMocks.updateEmployeeAttendance,
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
  useMutation: (options: {
    mutationFn?: (payload?: unknown) => unknown;
    onSuccess?: () => void;
    onError?: (error: unknown) => void;
  }) => ({
    mutate: vi.fn((payload?: unknown) => {
      let result: unknown;
      try {
        result = options.mutationFn?.(payload);
      } catch (error) {
        options.onError?.(error);
        return;
      }
      // Only route through the promise when the mocked api fn actually returned one,
      // so existing tests keep their synchronous onSuccess behaviour.
      if (result && typeof (result as Promise<unknown>).then === "function") {
        return (result as Promise<unknown>).then(
          () => options.onSuccess?.(),
          (error) => options.onError?.(error),
        );
      }
      options.onSuccess?.();
    }),
    isPending: mockMutationsPending,
  }),
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

let mockMutationsPending = false;
const invalidateQueriesMock = vi.hoisted(() => vi.fn());

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
  // `loading` is swallowed on purpose: the real Button consumes it, and forwarding it to
  // the DOM would emit React unknown-prop warnings.
  Button: ({
    children,
    onClick,
    disabled,
    className,
    type,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    className?: string;
    type?: "button" | "submit" | "reset";
    "aria-label"?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} className={className} type={type} aria-label={ariaLabel}>
      {children}
    </button>
  ),
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
    mockLang = "en";
    mockMutationsPending = false;
    workspaceData.allocations = [
      {
        id: "alloc-1",
        item_id: "item-1",
        item_name: "Gold Chairs",
        status: "Reserved",
        quantity_allocated: 50,
        notes: "Front hall",
        dispatch_checked_at: null,
        departed_at: null,
      },
    ];
    workspaceData.event.status = "Ongoing";
    workspaceData.assignments = [
      { id: "asg-1", employee_id: "emp-1", employee_name: "Abebe", role: "Decorator", commission_amount: 5000, attended: false },
    ];
    vi.clearAllMocks();
    apiMocks.updateEventAllocation.mockResolvedValue({});
    apiMocks.updateEmployeeAttendance.mockResolvedValue({});
    apiMocks.createEmployeeAssignment.mockResolvedValue({});
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
        notes: null,
        dispatch_checked_at: "2026-07-01T10:00:00.000Z",
        departed_at: null,
      },
      {
        id: "alloc-2",
        item_id: "item-2",
        item_name: "Silver Stands",
        status: "Pulled",
        quantity_allocated: 10,
        notes: null,
        dispatch_checked_at: "2026-07-01T10:01:00.000Z",
        departed_at: "2026-07-01T11:00:00.000Z",
      },
    ];

    render(<EventWorkspacePage />);
    fireEvent.click(screen.getByRole("button", { name: /Inventory Allocation/i }));

    expect(screen.getByRole("button", { name: /Mark Departed/i })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /Dispatch Checklist Silver Stands/i })).toBeDisabled();
  });

  // Issue #196: storekeepers correct an active allocation in place instead of
  // releasing and re-creating it.
  describe("inline allocation editing", () => {
    const openInventoryTab = (permissions = ["events:read", "event_allocations:write"]) => {
      mockPermissions = permissions;
      render(<EventWorkspacePage />);
      fireEvent.click(screen.getByRole("button", { name: /^Inventory Allocation$/i }));
    };

    it("exposes an Edit action on an eligible allocation", () => {
      openInventoryTab();

      expect(screen.getByRole("button", { name: /Edit Allocation Gold Chairs/i })).toBeEnabled();
    });

    it("hides the Edit action for read-only users", () => {
      openInventoryTab(["events:read"]);

      expect(screen.queryByRole("button", { name: /Edit Allocation Gold Chairs/i })).toBeNull();
    });

    it("does not expose Edit on a departed allocation and explains why", () => {
      workspaceData.allocations = [
        {
          id: "alloc-1",
          item_id: "item-1",
          item_name: "Gold Chairs",
          status: "Pulled",
          quantity_allocated: 50,
          notes: null,
          dispatch_checked_at: "2026-07-01T10:00:00.000Z",
          departed_at: "2026-07-01T11:00:00.000Z",
        },
      ];
      openInventoryTab();

      expect(screen.queryByRole("button", { name: /Edit Allocation Gold Chairs/i })).toBeNull();
      expect(screen.getByText("Locked after departure")).toBeInTheDocument();
    });

    it("does not expose Edit on a returned allocation", () => {
      workspaceData.allocations = [
        {
          id: "alloc-1",
          item_id: "item-1",
          item_name: "Gold Chairs",
          status: "Returned",
          quantity_allocated: 50,
          notes: null,
          dispatch_checked_at: "2026-07-01T10:00:00.000Z",
          departed_at: null,
        },
      ];
      openInventoryTab();

      expect(screen.queryByRole("button", { name: /Edit Allocation Gold Chairs/i })).toBeNull();
      expect(screen.getByText("Locked after return")).toBeInTheDocument();
    });

    it("initializes the form from the allocation's current quantity and notes", () => {
      openInventoryTab();
      fireEvent.click(screen.getByRole("button", { name: /Edit Allocation Gold Chairs/i }));

      expect(screen.getByLabelText("Quantity")).toHaveValue(50);
      expect(screen.getByLabelText("Notes")).toHaveValue("Front hall");
    });

    it("restores the row without mutating anything when Cancel is pressed", () => {
      openInventoryTab();
      fireEvent.click(screen.getByRole("button", { name: /Edit Allocation Gold Chairs/i }));
      fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "12" } });
      fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));

      expect(apiMocks.updateEventAllocation).not.toHaveBeenCalled();
      expect(screen.queryByLabelText("Quantity")).toBeNull();
      // Re-opening starts from the server value again, not the abandoned draft.
      fireEvent.click(screen.getByRole("button", { name: /Edit Allocation Gold Chairs/i }));
      expect(screen.getByLabelText("Quantity")).toHaveValue(50);
    });

    it("sends the corrected quantity and notes to the PATCH endpoint", async () => {
      openInventoryTab();
      fireEvent.click(screen.getByRole("button", { name: /Edit Allocation Gold Chairs/i }));
      fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "35" } });
      fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Back hall" } });
      fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

      expect(apiMocks.updateEventAllocation).toHaveBeenCalledWith("event-123", "alloc-1", {
        quantity_allocated: 35,
        notes: "Back hall",
      });
    });

    it("sends null when the notes field is cleared", () => {
      openInventoryTab();
      fireEvent.click(screen.getByRole("button", { name: /Edit Allocation Gold Chairs/i }));
      fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "   " } });
      fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

      expect(apiMocks.updateEventAllocation).toHaveBeenCalledWith("event-123", "alloc-1", {
        quantity_allocated: 50,
        notes: null,
      });
    });

    it("blocks submission and surfaces an accessible error for an invalid quantity", () => {
      openInventoryTab();
      fireEvent.click(screen.getByRole("button", { name: /Edit Allocation Gold Chairs/i }));
      fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "0" } });

      const quantityInput = screen.getByLabelText("Quantity");
      expect(quantityInput).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByRole("alert")).toHaveTextContent("Enter a whole quantity of 1 or more.");
      expect(quantityInput).toHaveAttribute("aria-describedby", "alloc-qty-error-alloc-1");
      expect(screen.getByRole("button", { name: /^Save$/i })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
      expect(apiMocks.updateEventAllocation).not.toHaveBeenCalled();
    });

    it("disables Save while a submission is in flight so it cannot be sent twice", () => {
      mockMutationsPending = true;
      openInventoryTab();
      fireEvent.click(screen.getByRole("button", { name: /Edit Allocation Gold Chairs/i }));

      expect(screen.getByRole("button", { name: /^Save$/i })).toBeDisabled();
      expect(screen.getByLabelText("Quantity")).toBeDisabled();
    });

    it("renders the backend stock conflict message", async () => {
      apiMocks.updateEventAllocation.mockRejectedValueOnce({
        response: { data: { error: "Requested quantity exceeds available stock" } },
      });
      openInventoryTab();
      fireEvent.click(screen.getByRole("button", { name: /Edit Allocation Gold Chairs/i }));
      fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "9999" } });
      fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

      await waitFor(() =>
        expect(toastMocks.error).toHaveBeenCalledWith("Requested quantity exceeds available stock"),
      );
    });

    it("refreshes workspace, item availability, inventory, and dispatch caches after success", async () => {
      openInventoryTab();
      fireEvent.click(screen.getByRole("button", { name: /Edit Allocation Gold Chairs/i }));
      fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

      await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Allocation updated"));
      const invalidatedKeys = invalidateQueriesMock.mock.calls.map((call) =>
        JSON.stringify((call[0] as { queryKey: unknown[] }).queryKey),
      );
      expect(invalidatedKeys).toContain(JSON.stringify(["event-workspace", "event-123"]));
      expect(invalidatedKeys).toContain(JSON.stringify(["event-allocation-items"]));
      expect(invalidatedKeys).toContain(JSON.stringify(["items"]));
      expect(invalidatedKeys).toContain(JSON.stringify(["event-dispatch-queue"]));
    });

    it("renders Amharic labels for the edit flow", () => {
      mockLang = "am";
      mockPermissions = ["events:read", "event_allocations:write"];
      render(<EventWorkspacePage />);
      fireEvent.click(screen.getByRole("button", { name: /የዕቃ ምደባ/ }));

      fireEvent.click(screen.getByRole("button", { name: /ምደባ አስተካክል Gold Chairs/ }));
      expect(screen.getByRole("button", { name: /^አስቀምጥ$/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^ሰርዝ$/ })).toBeInTheDocument();
      expect(screen.getByLabelText("ብዛት")).toHaveValue(50);
    });

    it("gives the edit controls a 48px-safe touch height", () => {
      openInventoryTab();
      fireEvent.click(screen.getByRole("button", { name: /Edit Allocation Gold Chairs/i }));

      expect(screen.getByRole("button", { name: /^Save$/i }).className).toContain("min-h-12");
      expect(screen.getByRole("button", { name: /^Cancel$/i }).className).toContain("min-h-12");
      expect(screen.getByLabelText("Quantity").className).toContain("h-12");
    });
  });

  // Issue #197: an assignment schedules an employee; it never asserts that they showed up.
  // Issue #203: attendance is three-state. A checkbox could only express two, which made a
  // genuine no-show indistinguishable from "not decided yet" and deadlocked event completion.
  describe("staff attendance resolution", () => {
    const openSchedulingTab = (permissions = ["events:read", "event_assignments:write"]) => {
      mockPermissions = permissions;
      render(<EventWorkspacePage />);
      fireEvent.click(screen.getByRole("button", { name: /Team & Vehicles/i }));
    };

    const attendedBtn = (name = "Abebe") => screen.getByRole("radio", { name: new RegExp("^Attended " + name + "$", "i") });
    const absentBtn = (name = "Abebe") => screen.getByRole("radio", { name: new RegExp("^Absent " + name + "$", "i") });

    const assignment = (over: Partial<AssignmentFixture> = {}): AssignmentFixture => ({
      id: "asg-1",
      employee_id: "emp-1",
      employee_name: "Abebe",
      role: "Decorator",
      commission_amount: 5000,
      attended: false,
      attendance_marked_at: null,
      ...over,
    });

    it("renders a new assignment as unresolved with neither option selected", () => {
      openSchedulingTab();

      expect(screen.getByText("ATTENDANCE_UNVERIFIED")).toBeInTheDocument();
      expect(attendedBtn()).toHaveAttribute("aria-checked", "false");
      expect(absentBtn()).toHaveAttribute("aria-checked", "false");
    });

    it("treats a legacy null attendance as unresolved rather than attended", () => {
      workspaceData.assignments = [assignment({ attended: null })];
      openSchedulingTab();

      expect(screen.getByText("ATTENDANCE_UNVERIFIED")).toBeInTheDocument();
      expect(attendedBtn()).toHaveAttribute("aria-checked", "false");
    });

    it("shows a verified assignment as attended", () => {
      workspaceData.assignments = [assignment({ attended: true, attendance_marked_at: "2026-07-10T10:00:00.000Z" })];
      openSchedulingTab();

      expect(screen.getByText("ATTENDED")).toBeInTheDocument();
      expect(attendedBtn()).toHaveAttribute("aria-checked", "true");
      expect(absentBtn()).toHaveAttribute("aria-checked", "false");
    });

    it("shows an explicitly recorded no-show as absent, not as unresolved", () => {
      workspaceData.assignments = [assignment({ attended: false, attendance_marked_at: "2026-07-10T10:00:00.000Z" })];
      openSchedulingTab();

      expect(screen.getByText("ABSENT")).toBeInTheDocument();
      expect(screen.queryByText("ATTENDANCE_UNVERIFIED")).toBeNull();
      expect(absentBtn()).toHaveAttribute("aria-checked", "true");
      expect(attendedBtn()).toHaveAttribute("aria-checked", "false");
    });

    it("treats a legacy attended row with no marker stamp as resolved", () => {
      workspaceData.assignments = [assignment({ attended: true, attendance_marked_at: null })];
      openSchedulingTab();

      expect(screen.getByText("ATTENDED")).toBeInTheDocument();
      expect(attendedBtn()).toHaveAttribute("aria-checked", "true");
    });

    it("renders mixed attendance states accurately", () => {
      workspaceData.assignments = [
        assignment({ attended: true, attendance_marked_at: "2026-07-10T10:00:00.000Z" }),
        assignment({ id: "asg-2", employee_id: "emp-2", employee_name: "Kebede", commission_amount: 1000, attended: false, attendance_marked_at: "2026-07-10T10:05:00.000Z" }),
        assignment({ id: "asg-3", employee_id: "emp-3", employee_name: "Sara", commission_amount: 800 }),
      ];
      openSchedulingTab();

      expect(attendedBtn("Abebe")).toHaveAttribute("aria-checked", "true");
      expect(absentBtn("Kebede")).toHaveAttribute("aria-checked", "true");
      expect(attendedBtn("Sara")).toHaveAttribute("aria-checked", "false");
      expect(absentBtn("Sara")).toHaveAttribute("aria-checked", "false");
      expect(screen.getByText("ATTENDED")).toBeInTheDocument();
      expect(screen.getByText("ABSENT")).toBeInTheDocument();
      expect(screen.getByText("ATTENDANCE_UNVERIFIED")).toBeInTheDocument();
    });

    it("does not claim attendance in the scheduling payload", () => {
      openSchedulingTab();

      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "emp-9" } });
      fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "Assistant" } });
      fireEvent.click(screen.getByRole("button", { name: /^Assign$/i }));

      if (apiMocks.createEmployeeAssignment.mock.calls.length > 0) {
        expect(apiMocks.createEmployeeAssignment.mock.calls[0][1]).not.toHaveProperty("attended");
      }
      expect(screen.getByText("ATTENDANCE_UNVERIFIED")).toBeInTheDocument();
    });

    it("sends attended=true when Attended is chosen", () => {
      openSchedulingTab();
      fireEvent.click(attendedBtn());

      expect(apiMocks.updateEmployeeAttendance).toHaveBeenCalledWith("event-123", "emp-1", true);
    });

    it("sends attended=false when Absent is chosen", () => {
      openSchedulingTab();
      fireEvent.click(absentBtn());

      expect(apiMocks.updateEmployeeAttendance).toHaveBeenCalledWith("event-123", "emp-1", false);
    });

    it("shows a read-only user the attendance state without a mutation control", () => {
      openSchedulingTab(["events:read"]);

      // Disabled is the real gate: browsers do not dispatch click to a disabled button.
      expect(attendedBtn()).toBeDisabled();
      expect(absentBtn()).toBeDisabled();
      expect(screen.getByText("ATTENDANCE_UNVERIFIED")).toBeInTheDocument();
    });

    it("locks attendance on a completed event without the override permission", () => {
      workspaceData.event.status = "Completed";
      openSchedulingTab();

      expect(attendedBtn()).toBeDisabled();
      expect(absentBtn()).toBeDisabled();
      expect(screen.getByText("Attendance is locked after the event is completed.")).toBeInTheDocument();
    });

    it("allows an override-authorized user to correct attendance on a completed event", () => {
      workspaceData.event.status = "Completed";
      openSchedulingTab(["events:read", "event_assignments:write", "events:override_completed"]);

      expect(attendedBtn()).toBeEnabled();
      expect(absentBtn()).toBeEnabled();
      expect(screen.queryByText("Attendance is locked after the event is completed.")).toBeNull();
    });

    it("disables the control while a change is in flight", () => {
      mockMutationsPending = true;
      openSchedulingTab();

      expect(attendedBtn()).toBeDisabled();
      expect(absentBtn()).toBeDisabled();
    });

    it("surfaces a backend error and leaves the state recoverable", async () => {
      apiMocks.updateEmployeeAttendance.mockRejectedValueOnce({
        response: { data: { error: "Completed event assignments cannot be modified" } },
      });
      openSchedulingTab();
      fireEvent.click(attendedBtn());

      await waitFor(() =>
        expect(toastMocks.error).toHaveBeenCalledWith("Completed event assignments cannot be modified"),
      );
      expect(attendedBtn()).toHaveAttribute("aria-checked", "false");
    });

    it("refreshes workspace, profit, and payroll eligibility caches after a change", async () => {
      openSchedulingTab();
      fireEvent.click(attendedBtn());

      await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Attendance updated"));
      const keys = invalidateQueriesMock.mock.calls.map(
        (call: [{ queryKey: unknown[] }]) => JSON.stringify(call[0].queryKey),
      );
      expect(keys).toContain(JSON.stringify(["event-workspace", "event-123"]));
      expect(keys).toContain(JSON.stringify(["event-profit", "event-123"]));
      expect(keys).toContain(JSON.stringify(["eligible-payroll-commissions"]));
    });

    it("blocks labor generation while any assignment is unresolved", () => {
      workspaceData.event.status = "Completed";
      workspaceData.assignments = [
        assignment({ attended: true, attendance_marked_at: "2026-07-10T10:00:00.000Z" }),
        assignment({ id: "asg-2", employee_id: "emp-2", employee_name: "Kebede", commission_amount: 1000 }),
      ];
      mockPermissions = ["events:read", "event_assignments:write", "expenses:write", "expenses:labor_generate", "reports:profit:read"];
      render(<EventWorkspacePage />);
      fireEvent.click(screen.getByRole("button", { name: /Expenses & Trips/i }));

      expect(
        screen.getByText("Prerequisite: Mark every assigned employee attended or absent before generating labor."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Generate Labor Expense/i })).toBeDisabled();
    });

    it("enables labor generation when a no-show is explicitly recorded as absent", () => {
      workspaceData.event.status = "Completed";
      workspaceData.assignments = [
        assignment({ attended: true, attendance_marked_at: "2026-07-10T10:00:00.000Z" }),
        // Kebede did not show up and that decision was recorded - no longer a blocker.
        assignment({ id: "asg-2", employee_id: "emp-2", employee_name: "Kebede", commission_amount: 1000, attended: false, attendance_marked_at: "2026-07-10T10:05:00.000Z" }),
      ];
      mockPermissions = ["events:read", "event_assignments:write", "expenses:write", "expenses:labor_generate", "reports:profit:read"];
      render(<EventWorkspacePage />);
      fireEvent.click(screen.getByRole("button", { name: /Expenses & Trips/i }));

      expect(screen.getByRole("button", { name: /Generate Labor Expense/i })).toBeEnabled();
      // Only the attended employee's commission is billed.
      expect(screen.getByText(/ETB 5,000/)).toBeInTheDocument();
    });

    it("renders the Amharic attendance options", () => {
      mockLang = "am";
      mockPermissions = ["events:read", "event_assignments:write"];
      render(<EventWorkspacePage />);
      fireEvent.click(screen.getByRole("button", { name: /ቡድን እና ተሽከርካሪዎች/ }));

      expect(screen.getByRole("radio", { name: /^ተገኝቷል Abebe$/ })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /^አልተገኘም Abebe$/ })).toBeInTheDocument();
    });

    it("gives both attendance options a 48px-safe touch target", () => {
      openSchedulingTab();

      expect(attendedBtn().className).toContain("min-h-12");
      expect(absentBtn().className).toContain("min-h-12");
    });

    it("groups the attendance options for assistive technology", () => {
      openSchedulingTab();

      const group = screen.getByRole("radiogroup", { name: /Attendance Abebe/i });
      expect(group).toBeInTheDocument();
      expect(within(group).getAllByRole("radio")).toHaveLength(2);
    });
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
