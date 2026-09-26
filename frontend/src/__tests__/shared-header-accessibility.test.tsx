import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthLayout from "@/components/AuthLayout";
import ResponsiveDrawer from "@/components/ui/ResponsiveDrawer";

const { push, replace, getEmployees, getEvents, getItems, getPayrollRuns, apiPost } = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), getEmployees: vi.fn(), getEvents: vi.fn(), getItems: vi.fn(),
  getPayrollRuns: vi.fn(), apiPost: vi.fn(),
}));
let permissions = ["hr:read", "settings:write"];
const hasPermission = (permission: string) => permissions.includes(permission);
const hasAnyPermission = (requested: string[]) => requested.some(hasPermission);
const clients: QueryClient[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/events",
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: true, isSessionResolved: true, isLoading: false, isPreviewActive: false,
    user: { id: "synthetic-header-286", full_name: "Synthetic Operator 00286", role_name: "Event Manager" },
    hasPermission, hasAnyPermission,
  }),
}));
vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ dark: false, toggle: vi.fn() }) }));
vi.mock("@/components/app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/components/PayrollReminder", () => ({ default: () => null }));
vi.mock("@/components/PwaLifecycle", () => ({ default: () => null }));
vi.mock("@/components/NotificationInbox", () => ({
  default: () => <button className="h-12 w-12">Notifications</button>,
}));
vi.mock("@/lib/api", () => ({
  api: { post: apiPost },
  getEmployees, getEvents, getItems, getPayrollRuns, getSalaryLevels: vi.fn(),
}));
vi.mock("framer-motion", async (original) => ({
  ...await original<typeof import("framer-motion")>(),
  useReducedMotion: () => true,
}));

function renderShell(children: React.ReactNode = <button>Page action</button>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AuthLayout>{children}</AuthLayout></QueryClientProvider>);
}

function click(element: HTMLElement) {
  act(() => element.focus());
  fireEvent.click(element);
}

function escape() {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement)) throw new Error("Missing focused keyboard target");
  fireEvent.keyDown(focused, { key: "Escape", code: "Escape" });
}

const copy = {
  en: { search: "Search", close: "Close search", profile: "Profile menu", theme: "Theme Light",
    width: "Page Width Full Canvas", settings: "Profile Settings", about: "About ERP",
    aboutTitle: "About Dream Lux ERP", closeAbout: "Close", signOut: "Sign Out", breadcrumb: "Breadcrumb" },
  am: { search: "ፈልግ", close: "ፍለጋውን ዝጋ", profile: "የመገለጫ ምናሌ", theme: "ገጽታ ብርሃን",
    width: "የገጽ ስፋት ሙሉ ስፋት", settings: "የመገለጫ ቅንብሮች", about: "ስለ ሲስተሙ",
    aboutTitle: "ስለ ድሪም ላክስ ERP", closeAbout: "ዝጋ", signOut: "ውጣ", breadcrumb: "የገጽ መንገድ" },
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("user", JSON.stringify({ id: "synthetic-header-286" }));
  permissions = ["hr:read", "settings:write"];
  getEmployees.mockResolvedValue({ employees: [], total: 0, page: 1, limit: 5 });
  getEvents.mockResolvedValue({ events: [], total: 0, page: 1, limit: 5 });
  getItems.mockResolvedValue({ items: [], total: 0, page: 1, limit: 5 });
  getPayrollRuns.mockResolvedValue({ runs: [] });
  apiPost.mockResolvedValue({ data: {} });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});

describe("Dream shared header controls", () => {
  it("review: exposes the active search result through its named combobox", async () => {
    renderShell();
    click(await screen.findByRole("button", { name: "Search" }));
    const dialog = await screen.findByRole("dialog", { name: "Search" });
    const input = within(dialog).getByRole("combobox", { name: "Search" });
    const listbox = within(dialog).getByRole("listbox");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    const first = within(listbox).getAllByRole("option")[0];
    expect(first.id).toBeTruthy();
    expect(input).toHaveAttribute("aria-activedescendant", first.id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const next = within(listbox).getAllByRole("option")[1];
    expect(input).toHaveAttribute("aria-activedescendant", next.id);
    expect(next).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it("review: scrolls overflowing twelve-result search in both directions before Enter", async () => {
    permissions = ["hr:read", "hr:write", "events:read", "events:write", "payroll:read", "expenses:approve",
      "salary-levels:manage", "assets:read", "assets:write", "assets:reconcile", "settings:write"];
    renderShell();
    click(await screen.findByRole("button", { name: "Search" }));
    const dialog = await screen.findByRole("dialog", { name: "Search" });
    // Read the existing input/buttons too, so the old model reproduces its missing scroll.
    const input = dialog.querySelector("input")!;
    const viewport = dialog.querySelector<HTMLElement>(".overflow-y-auto")!;
    const results = [...viewport.querySelectorAll<HTMLButtonElement>("button")];
    expect(results).toHaveLength(12);
    vi.spyOn(viewport, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 100, 300, 168));
    results.forEach((result, index) => {
      vi.spyOn(result, "getBoundingClientRect")
        .mockImplementation(() => new DOMRect(0, 100 + index * 56 - viewport.scrollTop, 300, 48));
    });
    const expectVisible = (index: number) => {
      const bounds = results[index].getBoundingClientRect();
      expect(bounds.top).toBeGreaterThanOrEqual(100);
      expect(bounds.bottom).toBeLessThanOrEqual(268);
    };
    act(() => input.focus());
    for (let index = 1; index < 12; index += 1) {
      fireEvent.keyDown(input, { key: "ArrowDown" });
      expectVisible(index);
    }
    expect(viewport.scrollTop).toBeGreaterThan(0);
    for (let index = 10; index >= 0; index -= 1) {
      fireEvent.keyDown(input, { key: "ArrowUp" });
      expectVisible(index);
    }
    expect(viewport.scrollTop).toBe(0);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expectVisible(11);
    expect(input).toHaveAttribute("aria-activedescendant", results[11].id);
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledExactlyOnceWith("/assets/history");
  });

  it("preserves search candidate identity when asynchronous records precede its page option", async () => {
    permissions = ["events:read", "events:write"];
    let finish: ((response: { events: Array<{ id: string; name: string }> }) => void) | undefined;
    getEvents.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderShell();
    click(await screen.findByRole("button", { name: "Search" }));
    const input = await screen.findByRole("combobox", { name: "Search" });
    fireEvent.change(input, { target: { value: "events" } });
    await waitFor(() => expect(getEvents).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const selected = screen.getByRole("option", { name: /Event Types Settings/ });
    expect(input).toHaveAttribute("aria-activedescendant", selected.id);
    await act(async () => { finish?.({ events: [{ id: "event-286", name: "Synthetic Events Record" }] }); });
    expect(screen.getByRole("option", { name: /Synthetic Events Record/ })).toBeVisible();
    expect(input).toHaveAttribute("aria-activedescendant", selected.id);
    expect(selected).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledExactlyOnceWith("/hr/event-types");
  });

  it("preserves native query editing and pointer activation in the search combobox", async () => {
    renderShell();
    click(await screen.findByRole("button", { name: "Search" }));
    const input = await screen.findByRole("combobox", { name: "Search" });
    for (const key of ["Home", "End", "ArrowLeft", "ArrowRight"]) {
      expect(fireEvent.keyDown(input, { key })).toBe(true);
    }
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(push).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "Employees" } });
    fireEvent.click(await screen.findByRole("option", { name: /^Employees List/ }));
    expect(push).toHaveBeenCalledExactlyOnceWith("/");
  });

  it.each(["en", "am"] as const)("uses saved %s names and preserves current-permission profile settings", async (lang) => {
    localStorage.setItem("lang", lang);
    renderShell();
    const t = copy[lang];
    const profile = await screen.findByRole("button", { name: `${t.profile}: Synthetic Operator 00286` });
    expect(screen.getByRole("button", { name: t.search })).toBeVisible();
    expect(screen.getByRole("navigation", { name: t.breadcrumb })).toBeVisible();
    click(profile);
    const popup = await screen.findByRole("dialog", { name: t.profile });
    expect(within(popup).getByText("Synthetic Operator 00286", { exact: true })).toBeVisible();
    expect(within(popup).getByText("Event Manager", { exact: true })).toBeVisible();
    expect(within(popup).getByRole("link", { name: t.settings })).toHaveAttribute("href", "/settings");
    expect(within(popup).getByRole("button", { name: t.theme })).toBeVisible();
    expect(within(popup).getByRole("button", { name: t.width })).toBeVisible();
    escape();
    await waitFor(() => expect(profile).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("changes open profile names through the existing language store without changing record content", async () => {
    renderShell();
    click(await screen.findByRole("button", { name: "Profile menu: Synthetic Operator 00286" }));
    click(screen.getByRole("button", { name: /Language/ }));
    expect(localStorage.getItem("lang")).toBe("am");
    expect(screen.getByRole("dialog", { name: copy.am.profile })).toBeVisible();
    expect(screen.getByText("Synthetic Operator 00286", { exact: true })).toBeVisible();
    click(screen.getByRole("button", { name: /ቋንቋ/ }));
    expect(localStorage.getItem("lang")).toBe("en");
  });

  it("preserves read-only profile controls without exposing settings", async () => {
    permissions = ["hr:read"];
    renderShell();
    click(await screen.findByRole("button", { name: "Profile menu: Synthetic Operator 00286" }));
    expect(screen.queryByRole("link", { name: "Profile Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Language/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeEnabled();
  });

  it.each(["en", "am"] as const)("owns search focus and returns it to its %s trigger", async (lang) => {
    localStorage.setItem("lang", lang);
    renderShell();
    const trigger = await screen.findByRole("button", { name: copy[lang].search });
    click(trigger);
    const dialog = await screen.findByRole("dialog", { name: copy[lang].search });
    const input = within(dialog).getByRole("combobox");
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAccessibleName(copy[lang].search);
    const last = within(dialog).getAllByRole("button").at(-1)!;
    act(() => last.focus());
    fireEvent.keyDown(last, { key: "Tab" });
    expect(input).toHaveFocus();
    click(within(dialog).getByRole("button", { name: copy[lang].close }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(push).not.toHaveBeenCalled();
  });

  it("limits result navigation keys to the input rather than hijacking close-button Enter", async () => {
    getEmployees.mockResolvedValue({ employees: [{
      id: "employee-00286", full_name: "Synthetic Employee 00286", employee_id: "EMP-00000286",
    }], total: 1, page: 1, limit: 5 });
    renderShell();
    click(await screen.findByRole("button", { name: "Search" }));
    const input = await screen.findByRole("combobox", { name: "Search" });
    fireEvent.change(input, { target: { value: "Synthetic" } });
    expect(await screen.findByRole("option", { name: /Synthetic Employee 00286/ })).toHaveTextContent("EMP-00000286");
    const close = screen.getByRole("button", { name: "Close search" });
    act(() => close.focus());
    fireEvent.keyDown(close, { key: "Enter" });
    expect(push).not.toHaveBeenCalled();
    act(() => input.focus());
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/?edit=employee-00286");
  });

  it("removes already-loaded records when the current source permission is withdrawn", async () => {
    getEmployees.mockResolvedValue({ employees: [{
      id: "employee-00286", full_name: "Synthetic Employee 00286", employee_id: "EMP-00000286",
    }], total: 1, page: 1, limit: 5 });
    const view = renderShell();
    click(await screen.findByRole("button", { name: "Search" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Search" }), { target: { value: "Synthetic" } });
    expect(await screen.findByRole("option", { name: /Synthetic Employee 00286/ })).toBeVisible();
    permissions = ["settings:write"];
    await act(async () => {
      view.rerender(<QueryClientProvider client={clients[0]}><AuthLayout><button>Page action</button></AuthLayout></QueryClientProvider>);
    });
    expect(screen.queryByRole("option", { name: /Synthetic Employee 00286/ })).not.toBeInTheDocument();
    expect(getEmployees).toHaveBeenCalledTimes(1);
  });

  it.each(["en", "am"] as const)("localizes generated %s copy without shortening record identifiers or refetching", async (lang) => {
    permissions = ["assets:read", "payroll:read"];
    localStorage.setItem("lang", lang);
    getItems.mockResolvedValue({ items: [{
      id: "asset-286", name: "Finance stock 00286", quantity: "42.1251", store: { name: "Store 00286" },
    }], total: 1, page: 1, limit: 5 });
    getPayrollRuns.mockResolvedValue({ runs: [{
      id: "RUN-000002860001", year: 2026, month: 9, status: "Draft",
      period_start: "", period_end: "", total_payroll_value: 286,
    }] });
    renderShell();
    click(await screen.findByRole("button", { name: copy[lang].search }));
    fireEvent.change(await screen.findByRole("combobox", { name: copy[lang].search }), { target: { value: "286" } });
    const item = await screen.findByRole("option", { name: /Finance stock 00286/ });
    expect(item).toHaveTextContent(`Store 00286 · ${lang === "en" ? "Qty" : "ብዛት"} 42.1251`);
    expect(await screen.findByRole("option", { name: /RUN-000002860001/ })).toHaveTextContent("ETB 286");
    act(() => {
      localStorage.setItem("lang", lang === "en" ? "am" : "en");
      window.dispatchEvent(new Event("lang-change"));
    });
    expect(item).toHaveTextContent(`Store 00286 · ${lang === "en" ? "ብዛት" : "Qty"} 42.1251`);
    expect(getItems).toHaveBeenCalledTimes(1);
    expect(getPayrollRuns).toHaveBeenCalledTimes(1);
  });

  it.each(["ctrlKey", "metaKey"] as const)("returns %s search to its original page control", async (modifier) => {
    renderShell();
    const opener = await screen.findByRole("button", { name: "Page action" });
    act(() => opener.focus());
    fireEvent.keyDown(opener, { key: "k", [modifier]: true });
    await screen.findByRole("dialog", { name: "Search" });
    escape();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("returns to the header if the original keyboard opener was replaced", async () => {
    const view = renderShell(<button key="before">Original action</button>);
    const opener = await screen.findByRole("button", { name: "Original action" });
    act(() => opener.focus());
    fireEvent.keyDown(opener, { key: "k", ctrlKey: true });
    await screen.findByRole("dialog", { name: "Search" });
    view.rerender(<QueryClientProvider client={clients[0]}>
      <AuthLayout><button key="after">Replacement action</button></AuthLayout>
    </QueryClientProvider>);
    expect(opener.isConnected).toBe(false);
    escape();
    await waitFor(() => expect(screen.getByRole("button", { name: "Search" })).toHaveFocus());
  });

  it("reopens shortcut search with a fresh query", async () => {
    renderShell();
    const opener = await screen.findByRole("button", { name: "Page action" });
    act(() => opener.focus());
    fireEvent.keyDown(opener, { key: "k", ctrlKey: true });
    const input = await screen.findByRole("combobox", { name: "Search" });
    fireEvent.change(input, { target: { value: "Not retained" } });
    fireEvent.keyDown(input, { key: "k", metaKey: true });
    await waitFor(() => expect(opener).toHaveFocus());
    fireEvent.keyDown(opener, { key: "k", ctrlKey: true });
    expect(await screen.findByRole("combobox", { name: "Search" })).toHaveValue("");
  });

  it.each(["about", "signOut"] as const)("hands profile focus to %s then restores the header trigger", async (destination) => {
    localStorage.setItem("lang", "am");
    renderShell();
    const profile = await screen.findByRole("button", { name: `${copy.am.profile}: Synthetic Operator 00286` });
    click(profile);
    click(screen.getByRole("button", { name: copy.am[destination] }));
    const dialog = await screen.findByRole("dialog", { name: destination === "about" ? copy.am.aboutTitle : copy.am.signOut });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    escape();
    await waitFor(() => expect(profile).toHaveFocus());
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(["en", "am"] as const)("shows truthful %s About copy, not invented connection/build claims", async (lang) => {
    localStorage.setItem("lang", lang);
    renderShell();
    const profile = await screen.findByRole("button", { name: `${copy[lang].profile}: Synthetic Operator 00286` });
    click(profile);
    click(screen.getByRole("button", { name: copy[lang].about }));
    const dialog = await screen.findByRole("dialog", { name: copy[lang].aboutTitle });
    expect(dialog).toHaveAccessibleDescription();
    expect(dialog).not.toHaveTextContent(/Database Connected|ዳታቤዝ ተገናኝቷል|Gold Release|1\.0\.0|oklch\(/);
    click(within(dialog).getByRole("button", { name: copy[lang].closeAbout }));
    await waitFor(() => expect(profile).toHaveFocus());
    expect(getEmployees).not.toHaveBeenCalled();
    expect(getItems).not.toHaveBeenCalled();
  });

  it.each(["ctrlKey", "metaKey"] as const)("consumes %s without stealing an open drawer's focus", async (modifier) => {
    function Draft() {
      const [open, setOpen] = useState(false);
      return <>
        <button onClick={() => setOpen(true)}>Open draft</button>
        <ResponsiveDrawer isOpen={open} dismissDisabled onClose={() => setOpen(false)} title="Protected draft">
          <input aria-label="Working draft" defaultValue="Keep record 00000286" />
        </ResponsiveDrawer>
      </>;
    }
    renderShell(<Draft />);
    click(await screen.findByRole("button", { name: "Open draft" }));
    const input = await screen.findByRole("textbox", { name: "Working draft" });
    act(() => input.focus());
    const event = createEvent.keyDown(input, { key: "k", [modifier]: true, cancelable: true });
    fireEvent(input, event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search pages, tools or settings...")).not.toBeInTheDocument();
    expect(input).toHaveFocus();
    escape();
    expect(screen.getByRole("button", { name: "Close drawer" })).toBeDisabled();
    expect(input).toHaveValue("Keep record 00000286");
  });
});
