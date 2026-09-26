import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotificationInbox from "@/components/NotificationInbox";

const { unread, notifications, createClient, markRead, markAll, archive } = vi.hoisted(() => ({
  unread: vi.fn(), notifications: vi.fn(), createClient: vi.fn(() => { throw new Error("Provider initialization is not allowed"); }),
  markRead: vi.fn(), markAll: vi.fn(), archive: vi.fn(),
}));
const clients: QueryClient[] = [];
vi.mock("@/utils/supabase/client", () => ({ canCreateSupabaseClient: () => false, createClient }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "synthetic-inbox-286" } }) }));
vi.mock("@/lib/api", () => ({
  getUnreadNotificationsCount: unread, getNotifications: notifications,
  markNotificationRead: markRead, markAllNotificationsRead: markAll, archiveNotification: archive,
}));
vi.mock("@/lib/toast", () => ({ notify: { info: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function renderInbox() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><NotificationInbox /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  unread.mockResolvedValue({ unread_count: 3 });
  notifications.mockResolvedValue({ notifications: [] });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe("Dream notification trigger only", () => {
  it.each([
    { lang: "en", count: 0, label: "Open notifications" },
    { lang: "en", count: 3, label: "Open notifications" },
    { lang: "am", count: 0, label: "ማሳወቂያዎችን ክፈት" },
    { lang: "am", count: 3, label: "ማሳወቂያዎችን ክፈት" },
  ])("review: keeps a named 48px trigger in $lang with $count unread", async ({ lang, count, label }) => {
    localStorage.setItem("lang", lang);
    unread.mockResolvedValue({ unread_count: count });
    renderInbox();
    const trigger = screen.getByRole("button", { name: label });
    expect(trigger).toHaveClass("h-12", "w-12");
    expect(trigger).toHaveAttribute("type", "button");
    await waitFor(() => expect(unread).toHaveBeenCalledTimes(1));
    if (count) expect(await screen.findByText(String(count))).toBeVisible();
    expect(notifications).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("review: updates its saved-language name while preserving existing open-close behavior", async () => {
    renderInbox();
    const trigger = screen.getByRole("button", { name: "Open notifications" });
    fireEvent.click(trigger);
    await screen.findByText("No notifications");
    expect(notifications).toHaveBeenCalledExactlyOnceWith({ page: 1, limit: 5 });
    act(() => {
      localStorage.setItem("lang", "am");
      window.dispatchEvent(new Event("lang-change"));
    });
    expect(screen.getByRole("button", { name: "ማሳወቂያዎችን ክፈት" })).toBe(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByText("ምንም ማሳወቂያ የለም")).not.toBeInTheDocument();
    expect(markRead).not.toHaveBeenCalled();
    expect(markAll).not.toHaveBeenCalled();
    expect(archive).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});
