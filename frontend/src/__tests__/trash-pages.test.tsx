import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventsTrashPage from "@/app/events/trash/page";
import ProposalTrashPage from "@/app/events/proposals/trash/page";
import { getEventsTrash, getEventProposalsTrash } from "@/lib/api";

let mockPermissions = new Set<string>();

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/AuthLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/DeleteConfirmModal", () => ({
  default: ({ isOpen, title }: { isOpen: boolean; title: string }) => (isOpen ? <div>{title}</div> : null),
}));

vi.mock("@/components/ForbiddenState", () => ({
  default: ({ title, description }: { title: string; description: string }) => (
    <section>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  ),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    hasPermission: (slug: string) => mockPermissions.has(slug),
    hasAnyPermission: (slugs: string[]) => slugs.some((slug) => mockPermissions.has(slug)),
  }),
}));

vi.mock("@/lib/api", () => ({
  getEventsTrash: vi.fn(),
  restoreEvent: vi.fn(),
  deleteEventPermanent: vi.fn(),
  getEventProposalsTrash: vi.fn(),
  restoreEventProposal: vi.fn(),
  deleteEventProposalPermanent: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockGetEventsTrash = getEventsTrash as ReturnType<typeof vi.fn>;
const mockGetEventProposalsTrash = getEventProposalsTrash as ReturnType<typeof vi.fn>;

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("trash management pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = new Set(["events:read"]);
    mockGetEventsTrash.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      events: [{
        id: "event-1",
        name: "Deleted Gala",
        client_name: "Aster",
        client_phone: null,
        event_type_id: null,
        start_date: "2026-07-20",
        end_date: "2026-07-20",
        start_time: null,
        end_time: null,
        venue_location: "Hilton",
        contract_price: 100000,
        status: "Planned",
        created_by: null,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        deleted_at: "2026-07-01T00:00:00.000Z",
      }],
    });
    mockGetEventProposalsTrash.mockResolvedValue({
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      proposals: [{
        id: "proposal-1",
        name: "Deleted Proposal",
        client_name: "Aster",
        client_phone: null,
        event_type_id: null,
        requested_budget: 120000,
        requested_start_date: "2026-07-20",
        requested_end_date: "2026-07-20",
        requested_start_time: null,
        requested_end_time: null,
        venue_location: "Hilton",
        notes: null,
        package_design_notes: null,
        cost_breakdown: {},
        estimated_design_cost: 0,
        estimated_team_cost: 0,
        estimated_trip_cost: 0,
        estimated_other_cost: 0,
        estimated_total_cost: 80000,
        estimated_net_profit: 40000,
        estimated_margin_percentage: 33.33,
        status: "Draft",
        rejection_reason: null,
        converted_event_id: null,
        submitted_at: null,
        approved_by: null,
        approved_at: null,
        created_by: "user-1",
        proposed_by_name: "Tigist Haile",
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        deleted_at: "2026-07-01T00:00:00.000Z",
      }],
    });
  });

  it("lets event readers view deleted events without restore/delete actions", async () => {
    renderWithQueryClient(<EventsTrashPage />);

    expect(await screen.findByText("Deleted Gala")).toBeInTheDocument();
    expect(mockGetEventsTrash).toHaveBeenCalledWith({ page: 1, limit: 10 });
    expect(screen.getByText("1 records in trash")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("shows event restore and permanent delete actions only with events:delete", async () => {
    mockPermissions = new Set(["events:read", "events:delete"]);
    renderWithQueryClient(<EventsTrashPage />);

    expect(await screen.findByText("Deleted Gala")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("lets proposal readers view deleted proposals without mutation actions", async () => {
    mockPermissions = new Set(["events:proposals:approve"]);
    renderWithQueryClient(<ProposalTrashPage />);

    expect(await screen.findByText("Deleted Proposal")).toBeInTheDocument();
    expect(mockGetEventProposalsTrash).toHaveBeenCalledWith({ page: 1, limit: 10 });
    expect(screen.getByText("Tigist Haile")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("requires proposal access before calling the proposal trash API", () => {
    mockPermissions = new Set(["events:read"]);
    renderWithQueryClient(<ProposalTrashPage />);

    expect(screen.getByText("Forbidden: Insufficient privileges")).toBeInTheDocument();
    expect(getEventProposalsTrash).not.toHaveBeenCalled();
  });
});
