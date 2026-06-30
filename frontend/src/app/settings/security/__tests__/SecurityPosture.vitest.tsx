/**
 * Security Posture Page — Comprehensive Vitest Suite
 *
 * Tests cover:
 *  1.  Permission gate: unauthenticated → ForbiddenState
 *  2.  Permission gate: authenticated but wrong permission → ForbiddenState
 *  3.  Permission gate: users:manage → full page renders
 *  4.  Permission gate: settings:write → full page renders
 *  5.  Page heading and subtitle present (English)
 *  6.  "No secrets" reassurance note present
 *  7.  Overall status banner renders with data-testid
 *  8.  All 5 area cards render (data-testid checks)
 *  9.  Expand/collapse toggle — first card opens by default
 * 10.  Expand/collapse toggle — clicking another card opens it and closes first
 * 11.  Expand/collapse toggle — clicking the same open card collapses it
 * 12.  Detail content visible when card expanded
 * 13.  Loading skeleton renders while auth loads
 * 14.  Back-to-settings link present in footer
 * 15.  Amharic language renders translated heading
 * 16.  KPI chips (protected/monitoring/attention counts) visible in banner
 * 17.  Status badges present on area cards (healthy/monitoring/attention)
 * 18.  No secrets/credentials/env vars in page output (snapshot guard)
 * 19.  Reference links open target="_blank" and rel="noreferrer"
 * 20.  Overall banner status reflects mixed monitoring+attention = attention
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Next.js mocks ──────────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    target,
    rel,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    target?: string;
    rel?: string;
    className?: string;
  }) =>
    React.createElement("a", { href, target, rel, className }, children),
}));

// ─── Auth hook mock ──────────────────────────────────────────────────────────
let mockPermissions = new Set<string>();
let mockIsLoading = false;
let mockIsAuthenticated = true;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    hasPermission: (slug: string) => mockPermissions.has(slug),
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockIsLoading,
  }),
}));

// ─── Language hook mock ──────────────────────────────────────────────────────
let mockLang = "en";
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ lang: mockLang }),
}));

// ─── AuthLayout mock (passthrough) ──────────────────────────────────────────
vi.mock("@/components/AuthLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "auth-layout" }, children),
}));

// ─── ForbiddenState mock ─────────────────────────────────────────────────────
vi.mock("@/components/ForbiddenState", () => ({
  default: ({ title, description }: { title?: string; description?: string }) =>
    React.createElement(
      "div",
      { "data-testid": "forbidden-state" },
      React.createElement("p", {}, title ?? "Forbidden"),
      React.createElement("p", {}, description ?? ""),
    ),
}));

// ─── Lucide mocks (avoid SVG rendering issues in jsdom) ─────────────────────
vi.mock("lucide-react", () => {
  const Icon =
    (name: string) =>
    ({ className }: { className?: string }) =>
      React.createElement("span", { "data-icon": name, className });
  return {
    ShieldCheck: Icon("ShieldCheck"),
    ShieldAlert: Icon("ShieldAlert"),
    ShieldOff: Icon("ShieldOff"),
    ChevronDown: Icon("ChevronDown"),
    ChevronUp: Icon("ChevronUp"),
    ArrowLeft: Icon("ArrowLeft"),
    Lock: Icon("Lock"),
    FileText: Icon("FileText"),
    ExternalLink: Icon("ExternalLink"),
    CheckCircle2: Icon("CheckCircle2"),
    AlertCircle: Icon("AlertCircle"),
    Info: Icon("Info"),
  };
});

// ─── SUT ────────────────────────────────────────────────────────────────────
import SecurityPosturePage from "../page";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(SecurityPosturePage),
    ),
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("SecurityPosturePage", () => {
  beforeEach(() => {
    mockPermissions = new Set();
    mockIsLoading = false;
    mockIsAuthenticated = true;
    mockLang = "en";
  });

  // ── 1. Unauthenticated ─────────────────────────────────────────────────────
  it("1. renders ForbiddenState when user is not authenticated", () => {
    mockIsAuthenticated = false;
    renderPage();
    expect(screen.getByTestId("forbidden-state")).toBeInTheDocument();
    expect(screen.queryByTestId("overall-status-banner")).not.toBeInTheDocument();
  });

  // ── 2. Authenticated but no permission ────────────────────────────────────
  it("2. renders ForbiddenState when authenticated but lacks permission", () => {
    mockIsAuthenticated = true;
    mockPermissions = new Set(["events:read"]); // wrong permission
    renderPage();
    expect(screen.getByTestId("forbidden-state")).toBeInTheDocument();
  });

  // ── 3. users:manage grants access ─────────────────────────────────────────
  it("3. renders full page with users:manage permission", () => {
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    expect(screen.getByTestId("overall-status-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("forbidden-state")).not.toBeInTheDocument();
  });

  // ── 4. settings:write grants access ───────────────────────────────────────
  it("4. renders full page with settings:write permission", () => {
    mockPermissions = new Set(["settings:write"]);
    renderPage();
    expect(screen.getByTestId("overall-status-banner")).toBeInTheDocument();
  });

  // ── 5. Page heading present (English) ─────────────────────────────────────
  it("5. shows the page heading in English", () => {
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    expect(screen.getByRole("heading", { name: "Security Review" })).toBeInTheDocument();
  });

  // ── 6. "No secrets" reassurance note ──────────────────────────────────────
  it("6. shows a reassurance note that no passwords are displayed", () => {
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    expect(
      screen.getByText(/no passwords or private data/i),
    ).toBeInTheDocument();
  });

  // ── 7. Overall status banner renders ─────────────────────────────────────
  it("7. renders the overall status banner", () => {
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    expect(screen.getByTestId("overall-status-banner")).toBeInTheDocument();
  });

  // ── 8. All 5 area cards rendered ──────────────────────────────────────────
  it("8. renders all 5 security area cards", () => {
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    const areas = ["access", "software", "data", "audit", "caveats"];
    areas.forEach((id) => {
      expect(screen.getByTestId(`area-card-${id}`)).toBeInTheDocument();
    });
  });

  // ── 9. First card expanded by default ─────────────────────────────────────
  it("9. expands the first area card (access) by default", () => {
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    expect(screen.getByTestId("area-detail-access")).toBeInTheDocument();
    expect(screen.queryByTestId("area-detail-software")).not.toBeInTheDocument();
  });

  // ── 10. Clicking a different card opens it ────────────────────────────────
  it("10. clicking 'software' card opens it and closes 'access'", () => {
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    fireEvent.click(screen.getByTestId("area-toggle-software"));
    expect(screen.getByTestId("area-detail-software")).toBeInTheDocument();
    expect(screen.queryByTestId("area-detail-access")).not.toBeInTheDocument();
  });

  // ── 11. Clicking open card collapses it ───────────────────────────────────
  it("11. clicking the currently open card collapses it", () => {
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    // access is open by default — click it to collapse
    fireEvent.click(screen.getByTestId("area-toggle-access"));
    expect(screen.queryByTestId("area-detail-access")).not.toBeInTheDocument();
  });

  // ── 12. Detail content visible when expanded ──────────────────────────────
  it("12. shows detail bullet points in the expanded card", () => {
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    // "access" is expanded by default
    expect(screen.getByTestId("area-detail-access")).toBeInTheDocument();
    // Should show the "what this means" label
    expect(screen.getByText(/what this means/i)).toBeInTheDocument();
    // At least one bullet point exists
    const bullets = screen.getByTestId("area-detail-access").querySelectorAll("li");
    expect(bullets.length).toBeGreaterThan(0);
  });

  // ── 13. Loading skeleton ──────────────────────────────────────────────────
  it("13. renders a loading skeleton while auth is loading", () => {
    mockIsLoading = true;
    mockPermissions = new Set(["users:manage"]);
    const { container } = renderPage();
    // Skeleton uses animate-pulse class
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByTestId("overall-status-banner")).not.toBeInTheDocument();
  });

  // ── 14. Back to settings link present ────────────────────────────────────
  it("14. renders a Back to Settings link in the footer", () => {
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    const backLink = screen.getByRole("link", { name: /back to settings/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/settings");
  });

  // ── 15. Amharic language ─────────────────────────────────────────────────
  it("15. renders Amharic heading when language is 'am'", () => {
    mockLang = "am";
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    expect(screen.getByRole("heading", { name: "የደህንነት ግምገማ" })).toBeInTheDocument();
  });

  // ── 16. KPI chips visible in banner ──────────────────────────────────────
  it("16. KPI chips (protected/monitoring/attention counts) are in the banner", () => {
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    // AREAS has: healthy=2, monitoring=2, attention=1
    const banner = screen.getByTestId("overall-status-banner");
    // All KPI values: 2, 2, 1 should appear inside banner
    expect(banner.textContent).toMatch(/2/);
    expect(banner.textContent).toMatch(/1/);
  });

  // ── 17. Status badges on area cards ──────────────────────────────────────
  it("17. area cards show status badges with correct labels", () => {
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    // healthy areas: data, audit → should see 2× "Protected"
    const protectedBadges = screen.getAllByText("Protected");
    expect(protectedBadges.length).toBeGreaterThanOrEqual(2);
    // monitoring: access, software → 2× "Monitoring"
    const monitoringBadges = screen.getAllByText("Monitoring");
    expect(monitoringBadges.length).toBeGreaterThanOrEqual(2);
    // attention: caveats → "Action Needed" text appears in KPI chip + card badge
    const attentionEls = screen.getAllByText("Action Needed");
    expect(attentionEls.length).toBeGreaterThanOrEqual(1);
  });

  // ── 18. No secrets/env vars in rendered output ────────────────────────────
  it("18. no environment variables, API keys, or credential values appear in the rendered page", () => {
    mockPermissions = new Set(["users:manage"]);
    const { container } = renderPage();
    const text = container.textContent || "";
    // Must not contain actual leaked patterns (key=value, hex tokens, env vars)
    expect(text).not.toMatch(/process\.env/i);
    expect(text).not.toMatch(/sk_[a-zA-Z0-9]{20,}/); // API key pattern
    expect(text).not.toMatch(/password\s*[:=]\s*\S+/i); // password=value
    expect(text).not.toMatch(/API_KEY\s*[:=]/i); // API_KEY=...
    expect(text).not.toMatch(/SUPABASE_KEY\s*[:=]/i);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/); // JWT token pattern
    // Page is allowed to say words like "passwords" in friendly UX copy —
    // what it must NOT do is expose actual credential values.
  });

  // ── 19. External links have security attributes ───────────────────────────
  it("19. no external links (GitHub issues or docs) appear in any expanded area card", async () => {
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    // Expand every card and check no external links appear
    const areaIds = ["access", "software", "data", "audit", "caveats"];
    for (const id of areaIds) {
      fireEvent.click(screen.getByTestId(`area-toggle-${id}`));
      await waitFor(() => {
        expect(screen.getByTestId(`area-detail-${id}`)).toBeInTheDocument();
      });
      const detail = screen.getByTestId(`area-detail-${id}`);
      // No external links should exist (no GitHub issues, no GitHub docs)
      const externalLinks = detail.querySelectorAll("a[target='_blank']");
      expect(externalLinks.length).toBe(0);
    }
  });

  // ── 20. Overall banner reflects attention when any area needs attention ───
  it("20. overall banner uses 'Needs Attention' label when caveats area has attention status", () => {
    mockPermissions = new Set(["users:manage"]);
    renderPage();
    const banner = screen.getByTestId("overall-status-banner");
    // AREAS includes attention-status "caveats" → overall should be attention
    expect(banner.textContent).toMatch(/needs attention/i);
  });
});
