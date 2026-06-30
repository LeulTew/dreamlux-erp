// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ActivityDrawer from "./ActivityDrawer";

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ lang: "en" }),
}));

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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
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
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDrawer();

    await waitFor(() => {
      expect(screen.getByText("Updated record")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/activity?entity_type=event&entity_id=event+123");
    expect(screen.getByText("Ops Manager")).toBeInTheDocument();
    expect(screen.getByText(/Source:/)).toBeInTheDocument();
    expect(screen.getByText("event_logs")).toBeInTheDocument();
    expect(screen.getByText("Old Hall")).toBeInTheDocument();
    expect(screen.getByText("Main Hall")).toBeInTheDocument();
  });

  it("renders empty state and closes from the header button", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ activity: [] }),
    }));
    const onClose = vi.fn();

    renderDrawer({ onClose });

    await waitFor(() => {
      expect(screen.getByText("No activity logged for this record yet.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
