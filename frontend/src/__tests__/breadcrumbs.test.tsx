import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import Breadcrumbs from "../components/Breadcrumbs";

// Mock next/navigation
let mockPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock hooks
let mockLang = "en";
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: mockLang,
  }),
}));

let mockPermissions: string[] = [];
let mockIsSuperuser = false;
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    hasAnyPermission: (slugs: string[]) => {
      if (mockIsSuperuser) return true;
      return slugs.some(slug => mockPermissions.includes(slug));
    },
    hasPermission: (slug: string) => {
      if (mockIsSuperuser) return true;
      return mockPermissions.includes(slug);
    },
  }),
}));

describe("Breadcrumbs Component", () => {
  beforeEach(() => {
    mockPathname = "/";
    mockLang = "en";
    mockPermissions = [];
    mockIsSuperuser = false;
    vi.clearAllMocks();
  });

  it("returns null on /login page", () => {
    mockPathname = "/login";
    const { container } = render(<Breadcrumbs />);
    expect(container.firstChild).toBeNull();
  });

  it("renders simple HR section and Employees label on root path", () => {
    mockPathname = "/";
    render(<Breadcrumbs />);
    expect(screen.getByText("HR")).toBeInTheDocument();
    expect(screen.getByText("Employees")).toBeInTheDocument();
  });

  it("resolves dynamic event workspaces and translates in Amharic", () => {
    mockPathname = "/events/123";
    mockLang = "am";
    render(<Breadcrumbs />);
    // "HR" -> "ዝግጅቶች" -> "የሥራ ቦታ"
    expect(screen.getByText("የሰው ኃይል")).toBeInTheDocument();
    expect(screen.getByText("ዝግጅቶች")).toBeInTheDocument();
    expect(screen.getByText("የሥራ ቦታ")).toBeInTheDocument();
  });

  it("role-aware: suppresses links when user lacks parent permissions", () => {
    mockPathname = "/hr/expenses/approve";
    mockPermissions = ["expenses:approve"]; // User has child permission but lacks parent (payroll:read / payroll:write)
    render(<Breadcrumbs />);

    // Since user lacks permission for parent paths, intermediate crumb is rendered as text, not link
    const hrCrumb = screen.getByText("HR");
    expect(hrCrumb.closest("a")).toBeNull();

    const expensesCrumb = screen.getByText("Expense Approvals");
    expect(expensesCrumb).toBeInTheDocument();
  });

  it("role-aware: enables links when user has parent permissions", () => {
    mockPathname = "/events/proposals";
    mockPermissions = ["events:read", "events:proposals:write"];
    render(<Breadcrumbs />);

    const eventsLink = screen.getByText("Events");
    expect(eventsLink.closest("a")).toHaveAttribute("href", "/events");
  });

  it("marks a single current crumb while preserving authorized desktop ancestors", () => {
    mockPathname = "/events/proposals/123";
    mockPermissions = ["events:read", "events:proposals:write"];
    const { container } = render(<Breadcrumbs />);
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(container.querySelector('[aria-current="page"]')).toHaveTextContent("Proposal Detail");
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute("href", "/events");
    expect(screen.getByRole("link", { name: "Event Proposals" })).toHaveAttribute("href", "/events/proposals");
  });

  it.each([
    { path: "/hr/finance/hisab/imports", lang: "en", label: "Hisab Import", permission: "finance:imports:write" },
    { path: "/hr/finance/hisab/imports", lang: "am", label: "የሂሳብ ማስገቢያ", permission: "finance:imports:write" },
    { path: "/hr/finance/hisab/net-profit", lang: "en", label: "Net Profit", permission: "finance:hisab:read" },
    { path: "/hr/finance/hisab/net-profit", lang: "am", label: "የተጣራ ትርፍ", permission: "finance:hisab:read" },
  ])("labels the implemented $path leaf in $lang", ({ path, lang, label, permission }) => {
    mockPathname = path;
    mockLang = lang;
    mockPermissions = [permission];
    render(<Breadcrumbs />);
    const leaf = screen.getByText(label, { exact: true });
    expect(leaf).toHaveAttribute("aria-current", "page");
    expect(leaf.closest("a")).toBeNull();
    if (permission === "finance:imports:write") {
      expect(screen.getByText(lang === "en" ? "Hisab Reports" : "የሂሳብ ሪፖርቶች").closest("a")).toBeNull();
    }
  });

  it.each(["/hr/expenses/approve", "/hr/reports/profit"])("does not link nonexistent grouping paths on %s", (path) => {
    mockPathname = path;
    mockIsSuperuser = true;
    const { container } = render(<Breadcrumbs />);
    expect(container.querySelector('a[href="/hr/expenses"]')).toBeNull();
    expect(container.querySelector('a[href="/hr/reports"]')).toBeNull();
  });

});
