import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SecurityPosturePage from "../app/settings/security/page";

const mockPush = vi.fn();
const mockBack = vi.fn();

let authState = {
  hasPermission: () => false,
  isAuthenticated: true,
  isLoading: false,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

vi.mock("@/components/AuthLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ForbiddenState", () => ({
  default: ({ title, description }: { title?: string; description?: string }) => (
    <div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  ),
}));

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ lang: "en" }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

describe("Security posture settings page", () => {
  it("blocks unauthorized users", () => {
    authState = {
      hasPermission: () => false,
      isAuthenticated: true,
      isLoading: false,
    };

    render(<SecurityPosturePage />);

    expect(screen.getByText("Restricted to security reviewers")).toBeInTheDocument();
    expect(
      screen.getByText("Only security reviewers, system managers, and administrators can access this page."),
    ).toBeInTheDocument();
  });

  it("renders tracked status cards and expandable sections for authorized users", () => {
    authState = {
      hasPermission: (slug: string) => slug === "settings:write",
      isAuthenticated: true,
      isLoading: false,
    };

    render(<SecurityPosturePage />);

    expect(screen.getByRole("heading", { name: "Security Posture" })).toBeInTheDocument();
    expect(screen.getByText("Tracked Areas")).toBeInTheDocument();
    expect(screen.getByText("OWASP and API controls")).toBeInTheDocument();
    expect(screen.getByText("No runtime secrets, environment values, hashes, or credentials are displayed here.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "docs/SENIOR_ISSUE_REVIEW_PROMPT.md" })).toBeInTheDocument();
  });

  it("toggles expanded review content", () => {
    authState = {
      hasPermission: (slug: string) => slug === "users:manage",
      isAuthenticated: true,
      isLoading: false,
    };

    render(<SecurityPosturePage />);

    expect(screen.getByText("Dynamic permission slugs gate direct URLs and backend routes across HR, events, assets, payroll, and settings surfaces.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Open platform caveats/i }));

    expect(screen.getByText("The codebase still carries known architecture caveats: localStorage JWT usage, in-memory permission cache limits, and the oversized events route file.")).toBeInTheDocument();
  });
});
