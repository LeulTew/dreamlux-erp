// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ActivityDrawer from "./ActivityDrawer";
import { api } from "@/lib/api";

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ lang: "en" }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
  },
}));

const mockedApiGet = api.get as unknown as ReturnType<typeof vi.fn>;

function renderDrawer(props: Partial<React.ComponentProps<typeof ActivityDrawer>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityDrawer
        entityType="event"
        entityId="event 123"
        isOpen={true}
        onClose={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  );
}

describe("ActivityDrawer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches encoded activity feed and renders actor, source, and before/after values", async () => {
    const mockData = {
      data: {
        activity: [
          {
            id: "log-1",
            entity_type: "event",
            entity_id: "event 123",
            user_id: "user-1",
            username: "ops",
            full_name: "Ops Manager",
            action: "update",
            field_changed: "venue",
            old_value: "Old Hall",
            new_value: "Main Hall",
            note: "Venue corrected",
            source_route: "event_logs",
            created_at: "2026-06-30T02:00:00.000Z",
          },
        ],
      },
    };
    mockedApiGet.mockResolvedValue(mockData);

    renderDrawer();

    await waitFor(() => {
      expect(screen.getByText("Updated record")).toBeInTheDocument();
    });

    expect(api.get).toHaveBeenCalledWith("/api/activity", {
      params: {
        entity_type: "event",
        entity_id: "event 123",
        page: 1,
        limit: 100,
      },
    });
    expect(screen.getByText("Ops Manager")).toBeInTheDocument();
    expect(screen.getByText(/Source:/)).toBeInTheDocument();
    expect(screen.getByText("event_logs")).toBeInTheDocument();
    expect(screen.getByText("Old Hall")).toBeInTheDocument();
    expect(screen.getByText("Main Hall")).toBeInTheDocument();
  });

  it("renders empty state and closes from the header button", async () => {
    mockedApiGet.mockResolvedValue({
      data: { activity: [] },
    });
    const onClose = vi.fn();

    renderDrawer({ onClose });

    await waitFor(() => {
      expect(screen.getByText("No activity logged for this record yet.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
