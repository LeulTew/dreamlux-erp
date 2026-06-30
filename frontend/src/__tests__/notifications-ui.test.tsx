import React from "react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import NotificationInbox from "../components/NotificationInbox";
import NotificationsPage from "../app/notifications/page";

// Mock Supabase client
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};
const mockSupabase = {
  channel: vi.fn(() => mockChannel),
  removeChannel: vi.fn(),
};
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

// Mock AuthLayout
vi.mock("@/components/AuthLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock hooks
const mockUser = { id: "user-123", username: "tester", fullName: "Test User" };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
    isAuthenticated: true,
  }),
}));

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: "en",
  }),
}));

const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => {
    if (queryKey[0] === "notifications-unread-count") {
      return { data: { unread_count: 3 }, isLoading: false };
    }
    if (queryKey[0] === "notifications-recent" || queryKey[0] === "notifications-list") {
      return {
        data: {
          notifications: [
            {
              id: "n-1",
              title: "Alert Title 1",
              message: "Notification message content 1",
              created_at: "2026-06-30T05:45:00.000Z",
              read_at: null,
              priority: "high",
            },
            {
              id: "n-2",
              title: "Alert Title 2",
              message: "Notification message content 2",
              created_at: "2026-06-30T05:40:00.000Z",
              read_at: "2026-06-30T05:42:00.000Z",
              priority: "low",
            },
          ],
          total: 2,
          totalPages: 1,
        },
        isLoading: false,
      };
    }
    return { data: null, isLoading: false };
  },
  useMutation: () => ({
    isPending: false,
    mutate: () => {},
  }),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
  keepPreviousData: (data: any) => data,
}));

// Mock API clients
vi.mock("@/lib/api", () => ({
  getNotifications: () => Promise.resolve({ notifications: [], total: 0 }),
  getUnreadNotificationsCount: () => Promise.resolve({ unread_count: 0 }),
  markNotificationRead: () => Promise.resolve({}),
  markAllNotificationsRead: () => Promise.resolve({}),
  archiveNotification: () => Promise.resolve({}),
  getNotificationPreferences: () => Promise.resolve({}),
  updateNotificationPreferences: () => Promise.resolve({}),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("Notifications System UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders NotificationInbox correctly and shows unread badge", () => {
    render(<NotificationInbox />);
    // Check bell icon is present
    const bellIcon = screen.getByRole("button");
    expect(bellIcon).toBeDefined();

    // Check count badge renders
    expect(screen.getByText("3")).toBeDefined();
  });

  test("NotificationInbox subscribes to Supabase Realtime channel", () => {
    render(<NotificationInbox />);
    expect(mockSupabase.channel).toHaveBeenCalledWith("public:notifications:user-123");
    expect(mockChannel.on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: "recipient_id=eq.user-123",
      },
      expect.any(Function)
    );
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });

  test("renders NotificationsPage correctly with list of items", () => {
    render(<NotificationsPage />);
    expect(screen.getByText("Notification Center")).toBeDefined();
    expect(screen.getByText("Alert Title 1")).toBeDefined();
    expect(screen.getByText("Notification message content 1")).toBeDefined();
    expect(screen.getByText("Alert Title 2")).toBeDefined();
    expect(screen.getByText("Notification message content 2")).toBeDefined();

    // Priority badges
    expect(screen.getByText("High")).toBeDefined();
    expect(screen.getByText("Low")).toBeDefined();
  });
});
