import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AuthLayout from "@/components/AuthLayout";

const replaceMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  usePathname: () => "/settings/departments",
}));

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ lang: "en" }),
}));

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({ dark: false, toggle: vi.fn() }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/components/app-sidebar", () => ({
  AppSidebar: () => <aside data-testid="protected-sidebar">Employees</aside>,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarTrigger: () => <button type="button">Sidebar</button>,
  SidebarInset: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/PayrollReminder", () => ({
  default: () => <div data-testid="payroll-reminder" />,
}));

vi.mock("@/components/NotificationInbox", () => ({
  default: () => <div data-testid="notifications" />,
}));

vi.mock("@/components/PwaLifecycle", () => ({
  default: () => <div data-testid="pwa" />,
}));

vi.mock("@/components/Breadcrumbs", () => ({
  default: () => <nav data-testid="breadcrumbs" />,
}));

vi.mock("@/components/UserAvatar", () => ({
  default: () => <div data-testid="avatar" />,
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const clearSpy = vi.spyOn(queryClient, "clear");

  render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );

  return { clearSpy };
}

describe("AuthLayout auth bootstrap hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useAuthMock.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      isPreviewActive: false,
      previewRoleName: null,
      clearPreview: vi.fn(),
    });
  });

  it("does not render protected shell or child content while auth is still bootstrapping", async () => {
    useAuthMock.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
      isPreviewActive: false,
      previewRoleName: null,
      clearPreview: vi.fn(),
    });

    renderWithClient(
      <AuthLayout>
        <div>Protected employee payroll data</div>
      </AuthLayout>,
    );

    expect(screen.queryByText("Protected employee payroll data")).not.toBeInTheDocument();
    expect(screen.queryByTestId("protected-sidebar")).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalledWith("/login");
    await waitFor(() => expect(screen.queryByTestId("protected-sidebar")).not.toBeInTheDocument());
  });

  it("redirects unauthenticated users without rendering protected content", async () => {
    useAuthMock.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      isPreviewActive: false,
      previewRoleName: null,
      clearPreview: vi.fn(),
    });

    renderWithClient(
      <AuthLayout>
        <div>Protected finance totals</div>
      </AuthLayout>,
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Protected finance totals")).not.toBeInTheDocument();
    expect(screen.queryByTestId("protected-sidebar")).not.toBeInTheDocument();
  });

  it("clears protected caches and auth storage on sign out", async () => {
    window.localStorage.setItem("token", "token");
    window.localStorage.setItem("user", JSON.stringify({ full_name: "Owner", role_name: "OWNER" }));
    window.localStorage.setItem("previewRole", "DRIVER");
    window.localStorage.setItem("previewPermissionSlugs", "[]");

    const { clearSpy } = renderWithClient(
      <AuthLayout>
        <div>Protected dashboard</div>
      </AuthLayout>,
    );

    const avatar = await screen.findByTestId("avatar");
    fireEvent.click(avatar.closest("button") as HTMLButtonElement);
    fireEvent.click(screen.getAllByText("Sign Out")[0]);
    fireEvent.click(screen.getAllByText("Sign Out").at(-1) as HTMLElement);

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("token")).toBeNull();
    expect(window.localStorage.getItem("user")).toBeNull();
    expect(window.localStorage.getItem("previewRole")).toBeNull();
    expect(window.localStorage.getItem("previewPermissionSlugs")).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith("/login");
  });
});
