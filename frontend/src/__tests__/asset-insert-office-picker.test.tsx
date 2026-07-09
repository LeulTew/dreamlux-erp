import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import InsertAssetPage from "@/app/assets/insert/page";

const getAllOfficesMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span aria-label={alt} />,
}));

vi.mock("@/components/AuthLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    hasPermission: (slug: string) => slug === "assets:write",
    isLoading: false,
    isAuthenticated: true,
  }),
}));

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ lang: "en" }),
}));

vi.mock("@/lib/api", () => ({
  createItem: vi.fn(),
  getAllOffices: () => getAllOfficesMock(),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe("InsertAssetPage office picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllOfficesMock.mockResolvedValue([
      { id: "office-unused", name: "Unused New Office", is_active: true },
    ]);
  });

  it("loads all offices so unused locations can be selected for new assets", async () => {
    renderWithClient(<InsertAssetPage />);

    await waitFor(() => expect(getAllOfficesMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "Unused New Office" })).toBeInTheDocument();
  });
});
