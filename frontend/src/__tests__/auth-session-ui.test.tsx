import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthLayout from "@/components/AuthLayout";

const replaceMock = vi.fn();
let authState = {
  isPreviewActive: false,
  previewRoleName: null as string | null,
  clearPreview: vi.fn(),
  isLoading: false,
  isAuthenticated: true,
  isSessionResolved: true,
  user: {
    id: "u-1",
    username: "owner",
    full_name: "Owner User",
    role_name: "OWNER",
    role_names: ["OWNER"],
    profile_image_url: null,
  },
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: "en",
    toggle: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({
    dark: false,
    toggle: vi.fn(),
  }),
}));

vi.mock("@/components/app-sidebar", () => ({
  AppSidebar: () => <aside>Protected Sidebar</aside>,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarInset: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarTrigger: () => <button type="button">Sidebar</button>,
}));

vi.mock("@/components/PayrollReminder", () => ({
  default: () => <div>Payroll Reminder</div>,
}));

vi.mock("@/components/NotificationInbox", () => ({
  default: () => <div>Notifications</div>,
}));

vi.mock("@/components/PwaLifecycle", () => ({
  default: () => null,
}));

vi.mock("@/components/Breadcrumbs", () => ({
  default: () => <nav>Breadcrumbs</nav>,
}));

vi.mock("@/components/UserAvatar", () => ({
  default: ({ fullName }: { fullName: string }) => <div>{fullName}</div>,
}));

vi.mock("@/lib/api", () => ({
  getEmployees: vi.fn(),
  getEvents: vi.fn(),
  getItems: vi.fn(),
  getPayrollRuns: vi.fn(),
  getSalaryLevels: vi.fn(),
}));

function renderAuthLayout(queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <AuthLayout>
          <main>Protected Content</main>
        </AuthLayout>
      </QueryClientProvider>
    ),
  };
}

describe("AuthLayout session hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    authState = {
      isPreviewActive: false,
      previewRoleName: null,
      clearPreview: vi.fn(),
      isLoading: false,
      isAuthenticated: true,
      isSessionResolved: true,
      user: {
        id: "u-1",
        username: "owner",
        full_name: "Owner User",
        role_name: "OWNER",
        role_names: ["OWNER"],
        profile_image_url: null,
      },
    };
  });

  it("does not render protected shell while token verification is unresolved", async () => {
    window.localStorage.setItem("token", "stale-token");
    window.localStorage.setItem("user", JSON.stringify({ full_name: "Stale Admin", role_name: "ADMIN" }));
    authState = {
      ...authState,
      isLoading: true,
      isAuthenticated: false,
      isSessionResolved: false,
      user: undefined,
    };

    renderAuthLayout();

    await waitFor(() => {
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
      expect(screen.queryByText("Protected Sidebar")).not.toBeInTheDocument();
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("clears stale credentials and redirects when the session resolves unauthenticated", async () => {
    window.localStorage.setItem("token", "expired-token");
    window.localStorage.setItem("user", JSON.stringify({ full_name: "Stale Admin", role_name: "ADMIN" }));
    window.localStorage.setItem("previewRole", "OWNER");
    window.localStorage.setItem("previewPermissionSlugs", JSON.stringify(["*"]));
    authState = {
      ...authState,
      isAuthenticated: false,
      isSessionResolved: true,
      user: undefined,
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(["sensitive-report"], { total: 1000 });

    renderAuthLayout(queryClient);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
    expect(window.localStorage.getItem("token")).toBeNull();
    expect(window.localStorage.getItem("user")).toBeNull();
    expect(window.localStorage.getItem("previewRole")).toBeNull();
    expect(queryClient.getQueryData(["sensitive-report"])).toBeUndefined();
  });

  it("clears auth storage and cached query data on confirmed logout", async () => {
    window.localStorage.setItem("token", "valid-token");
    window.localStorage.setItem("user", JSON.stringify({ full_name: "Owner User", role_name: "OWNER" }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(["employees"], [{ id: "employee-1" }]);

    renderAuthLayout(queryClient);
    expect(await screen.findByText("Protected Content")).toBeInTheDocument();

    const userMenuButton = screen.getByText("Owner User").closest("button");
    expect(userMenuButton).not.toBeNull();
    fireEvent.click(userMenuButton!);
    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /^sign out$/i }).at(-1)!);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
    expect(window.localStorage.getItem("token")).toBeNull();
    expect(window.localStorage.getItem("user")).toBeNull();
    expect(queryClient.getQueryData(["employees"])).toBeUndefined();
  });

  it("redirects restored protected pages when the user was removed elsewhere", async () => {
    window.localStorage.setItem("user", JSON.stringify({ full_name: "Owner User", role_name: "OWNER" }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(["profit-report"], { total: 5000 });

    renderAuthLayout(queryClient);
    expect(await screen.findByText("Protected Content")).toBeInTheDocument();

    window.localStorage.removeItem("user");
    window.dispatchEvent(new Event("pageshow"));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
    expect(queryClient.getQueryData(["profit-report"])).toBeUndefined();
  });
});
