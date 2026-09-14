import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createPermissionMatcher } from "@/lib/permission-matcher";
import { sidebarPreferencesKey, type SidebarSectionPreferences } from "@/lib/sidebar-preferences";

const fixture = vi.hoisted(() => ({
  userId: "navigation-user",
  pathname: "/settings/departments",
  permissions: ["*"],
  lang: "en",
  mobile: false,
  finePointer: true,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: fixture.userId },
    hasPermission: createPermissionMatcher(fixture.permissions),
  }),
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: fixture.lang }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => fixture.mobile }));
vi.mock("next/navigation", () => ({ usePathname: () => fixture.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, onClick, ...props }: React.ComponentProps<"a">) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
        if (href) fixture.pathname = href;
      }}
    />
  ),
}));

function Navigation() {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <SidebarTrigger />
          <button type="button">Content control</button>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function save(sections: SidebarSectionPreferences, userId = fixture.userId) {
  localStorage.setItem(sidebarPreferencesKey(userId), JSON.stringify({ version: 1, sections }));
}

function read(userId = fixture.userId) {
  return JSON.parse(localStorage.getItem(sidebarPreferencesKey(userId)) || "null");
}

function emitStorage(key: string, newValue: string | null, storageArea = window.localStorage) {
  const event = new StorageEvent("storage", { key, newValue });
  // The repository's storage mock is not a jsdom Storage instance.
  Object.defineProperty(event, "storageArea", { value: storageArea });
  act(() => window.dispatchEvent(event));
}

function pointer(target: Element, type: string, x: number, y: number, pointerType = "touch") {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: pointerType },
    isPrimary: { value: true },
  });
  fireEvent(target, event);
}

let userSequence = 0;

beforeEach(() => {
  fixture.userId = `navigation-user-${++userSequence}`;
  fixture.pathname = "/settings/departments";
  fixture.permissions = ["*"];
  fixture.lang = "en";
  fixture.mobile = false;
  fixture.finePointer = true;
  const storage = new Map<string, string>();
  vi.mocked(localStorage.getItem).mockImplementation((key) => storage.get(key) ?? null);
  vi.mocked(localStorage.setItem).mockImplementation((key, value) => { storage.set(key, String(value)); });
  vi.mocked(localStorage.removeItem).mockImplementation((key) => { storage.delete(key); });
  vi.mocked(localStorage.clear).mockImplementation(() => storage.clear());
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1024);
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(768);
  document.cookie = "sidebar_state=true; path=/";
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query.includes("hover") && fixture.finePointer,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppSidebar device preferences", () => {
  it("collapses active Reference Data and preserves explicit choices through navigation and remounts", () => {
    let view = render(<Navigation />);
    const reference = screen.getByRole("button", { name: "Reference Data" });
    expect(reference).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(reference.getAttribute("aria-controls")!)).toContainElement(
      screen.getByRole("link", { name: "Departments" }),
    );
    fireEvent.click(reference);
    fireEvent.click(screen.getByRole("button", { name: "Employees" }));
    expect(reference).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Departments" })).not.toBeInTheDocument();

    fixture.pathname = "/settings/positions";
    view.rerender(<Navigation />);
    expect(screen.getByRole("button", { name: "Reference Data" })).toHaveAttribute("aria-expanded", "false");
    view.unmount();
    view = render(<Navigation />);
    expect(screen.getByRole("button", { name: "Employees" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Reference Data" })).toHaveAttribute("aria-expanded", "false");
    expect(read()).toEqual({ version: 1, sections: { employees: false, "reference-data": false } });
    expect(sidebarPreferencesKey(fixture.userId)).toMatch(/^dreamlux:/);
    view.unmount();
  });

  it("merges only rendered section keys and keeps hidden preview sections and other users unchanged", () => {
    const original = { employees: false, events: true, finance: false, "reference-data": true, inventory: false };
    save(original);
    save({ events: false }, "another-user");
    fixture.permissions = ["positions:read", "vehicles:read"];
    const view = render(<Navigation />);
    expect(screen.queryByRole("button", { name: "Reference Data" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand all sections" }));
    expect(read().sections).toEqual({ ...original, inventory: true });

    fixture.permissions = ["events:read", "positions:read"];
    view.rerender(<Navigation />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse all sections" }));
    expect(read().sections).toEqual({ ...original, events: false, "reference-data": false, inventory: true });
    expect(read("another-user").sections).toEqual({ events: false });

    fixture.permissions = ["*"];
    view.rerender(<Navigation />);
    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Inventory" })).toHaveAttribute("aria-expanded", "true");
  });

  it("switches actual-user stores without transiently writing one user's state to another", () => {
    const firstUser = fixture.userId;
    save({ employees: false, finance: false });
    const view = render(<Navigation />);
    fixture.userId = "second-navigation-user";
    save({ events: false });
    view.rerender(<Navigation />);
    expect(screen.getByRole("button", { name: "Employees" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Events" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Collapse all sections" }));
    expect(read(firstUser).sections).toEqual({ employees: false, finance: false });
    fixture.userId = firstUser;
    view.rerender(<Navigation />);
    expect(screen.getByRole("button", { name: "Events" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute("aria-expanded", "false");
  });

  it("refreshes device changes that arrived while navigation was unmounted", () => {
    const view = render(<Navigation />);
    view.unmount();
    save({ employees: false });
    render(<Navigation />);
    expect(screen.getByRole("button", { name: "Employees" })).toHaveAttribute("aria-expanded", "false");
  });

  it.each([
    "{broken",
    "null",
    "[]",
    '{"version":2,"sections":{"employees":false}}',
    '{"version":1,"sections":{"employees":"false"}}',
  ])("diagnoses malformed storage and retains usable session-only choices: %s", (raw) => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(sidebarPreferencesKey(fixture.userId), raw);
    const view = render(<Navigation />);
    fireEvent.click(screen.getByRole("button", { name: "Employees" }));
    view.unmount();
    render(<Navigation />);
    expect(screen.getByRole("button", { name: "Employees" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("status")).toHaveTextContent("session only");
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("session-only"), expect.objectContaining({ operation: "read" }));
    expect(localStorage.getItem(sidebarPreferencesKey(fixture.userId))).toBe(raw);
  });

  it.each(["read", "write"] as const)("diagnoses blocked %s without losing session-only state on remount", (operation) => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    if (operation === "read") {
      vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    } else {
      vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    }
    const view = render(<Navigation />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse all sections" }));
    view.unmount();
    render(<Navigation />);
    expect(screen.getByRole("button", { name: "Employees" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Reference Data" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("status")).toHaveTextContent("session only");
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("session-only"), expect.objectContaining({ operation }));
  });

  it("syncs only this user's localStorage key, including deletion, without echo writes", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<Navigation />);
    const key = sidebarPreferencesKey(fixture.userId);
    const raw = JSON.stringify({ version: 1, sections: { employees: false } });
    const writes = vi.spyOn(localStorage, "setItem");
    emitStorage(sidebarPreferencesKey("other-user"), raw);
    emitStorage(key, raw, window.sessionStorage);
    expect(screen.getByRole("button", { name: "Employees" })).toHaveAttribute("aria-expanded", "true");
    localStorage.setItem(key, raw);
    writes.mockClear();
    emitStorage(key, raw);
    expect(screen.getByRole("button", { name: "Employees" })).toHaveAttribute("aria-expanded", "false");
    expect(writes).not.toHaveBeenCalled();
    emitStorage(key, "{broken");
    expect(screen.getByRole("button", { name: "Employees" })).toHaveAttribute("aria-expanded", "false");
    expect(warning).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ operation: "sync" }));
    localStorage.removeItem(key);
    emitStorage(key, null);
    expect(screen.getByRole("button", { name: "Employees" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("AppSidebar authorized route controls", () => {
  it("retains all Dream-Lux routes, seven finance entries and the settings/reference distinction", () => {
    render(<Navigation />);
    fireEvent.click(screen.getByRole("button", { name: "Expand all sections" }));
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href")).sort()).toEqual([
      "/", "/hr", "/insert", "/events", "/events/proposals", "/hr/event-types",
      "/hr/payments", "/hr/salary-levels", "/hr/finance/hisab", "/hr/expenses/approve",
      "/hr/reports/profit", "/hr/finance/overheads", "/hr/finance/investments",
      "/settings/departments", "/settings/positions", "/settings/offices",
      "/assets/dashboard", "/assets", "/assets/insert", "/fleet", "/assets/dispatch",
      "/assets/returns", "/assets/reconcile", "/assets/history", "/assets/reports", "/settings",
    ].sort());
    const finance = screen.getByRole("button", { name: "Finance" });
    expect(within(document.getElementById(finance.getAttribute("aria-controls")!)!).getAllByRole("link")).toHaveLength(7);
    expect(screen.getByRole("link", { name: "Departments" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
  });

  it.each([
    { permissions: [], routes: [] },
    { permissions: ["events:*"], routes: ["/events", "/events/proposals", "/hr/event-types"] },
    { permissions: ["positions:read"], routes: [] },
    { permissions: ["assets:reconcile"], routes: [] },
    { permissions: ["vehicles:read"], routes: ["/fleet"] },
    { permissions: ["assets:write"], routes: ["/assets/insert", "/assets/returns"] },
    { permissions: ["event_allocations:dispatch"], routes: ["/assets/dispatch"] },
    { permissions: ["event_allocations:write"], routes: ["/assets/returns"] },
    { permissions: ["users:manage"], routes: ["/settings"] },
    { permissions: ["finance:hisab:read"], routes: ["/hr/finance/hisab"] },
    { permissions: ["departments:manage"], routes: ["/settings/departments"] },
  ])("preserves parent and child guards for $permissions", ({ permissions, routes }) => {
    fixture.permissions = permissions;
    render(<Navigation />);
    const expand = screen.queryByRole("button", { name: "Expand all sections" });
    if (expand) fireEvent.click(expand);
    expect(screen.queryAllByRole("link").map((link) => link.getAttribute("href")).sort()).toEqual(routes.sort());
  });
});

describe("AppSidebar popovers and mobile interactions", () => {
  it("portals collapsed groups and preserves Radix link-only focus entry, Escape and outside dismissal", async () => {
    document.cookie = "sidebar_state=false; path=/";
    render(<Navigation />);
    const trigger = screen.getByRole("button", { name: "Finance" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 48, 48));
    act(() => trigger.focus());
    fireEvent.click(trigger, { detail: 0 });
    const dialog = await screen.findByRole("dialog", { name: "Finance" });
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(dialog.closest('[data-sidebar="content"]')).toBeNull();
    expect(within(dialog).getAllByRole("link")).toHaveLength(7);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "Finance" });
    act(() => screen.getByRole("button", { name: "Content control" }).focus());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens on fine-pointer hover without stealing focus, not on touch, and names standalone links", async () => {
    document.cookie = "sidebar_state=false; path=/";
    render(<Navigation />);
    const outside = screen.getByRole("button", { name: "Content control" });
    act(() => outside.focus());
    const trigger = screen.getByRole("button", { name: "Finance" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 48, 48));
    pointer(trigger, "pointerover", 20, 20, "touch");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    pointer(trigger, "pointerout", 20, 20, "touch");
    pointer(trigger, "pointerover", 20, 20, "mouse");
    await screen.findByRole("dialog", { name: "Finance" });
    expect(outside).toHaveFocus();
    pointer(trigger, "pointerout", 100, 20, "mouse");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Dispatch" })).toHaveAttribute("aria-label", "Dispatch");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-label", "Settings");
  });

  it("shows full mobile labels despite the collapsed desktop cookie and restores each opening control", async () => {
    fixture.mobile = true;
    document.cookie = "sidebar_state=false; path=/";
    render(<Navigation />);
    const entry = screen.getByRole("button", { name: "Navigation" });
    const outside = screen.getByRole("button", { name: "Content control" });
    fireEvent.click(entry);
    let dialog = await screen.findByRole("dialog", { name: "Dream Lux" });
    expect(entry).toHaveAttribute("aria-controls", dialog.id);
    expect(within(dialog).getByRole("button", { name: "Finance" })).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByRole("link", { name: "Capital Register" })).toBeVisible();
    expect(dialog).toHaveAttribute("data-side", "bottom");
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(entry).toHaveFocus());

    act(() => outside.focus());
    fireEvent.keyDown(window, { ctrlKey: true, key: "b" });
    dialog = await screen.findByRole("dialog", { name: "Dream Lux" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(outside).toHaveFocus());
    expect(document.cookie).toContain("sidebar_state=false");

    fireEvent.click(entry);
    dialog = await screen.findByRole("dialog", { name: "Dream Lux" });
    fireEvent.click(within(dialog).getByRole("link", { name: "Positions" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(entry).toHaveFocus());
    expect(fixture.pathname).toBe("/settings/positions");
  });

  it("dismisses only a deliberate downward handle gesture and retains labelled Amharic controls", async () => {
    fixture.mobile = true;
    fixture.lang = "am";
    render(<Navigation />);
    fireEvent.click(screen.getByRole("button", { name: "ምናሌ" }));
    const dialog = await screen.findByRole("dialog", { name: "Dream Lux" });
    expect(within(dialog).getByRole("button", { name: "ምናሌውን ዝጋ" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "ተጠናቋል" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "ሰራተኞች" })).toBeVisible();
    const content = dialog.querySelector('[data-sidebar="content"]')!;
    pointer(content, "pointerdown", 100, 100);
    pointer(content, "pointerup", 100, 240);
    expect(dialog).toBeInTheDocument();
    const handle = dialog.querySelector('[data-sidebar="drag-handle"]')!;
    Object.defineProperty(handle, "setPointerCapture", { value: vi.fn() });
    pointer(handle, "pointerdown", 100, 100);
    pointer(handle, "pointerup", 240, 180);
    expect(dialog).toBeInTheDocument();
    pointer(handle, "pointerdown", 100, 100);
    pointer(handle, "pointercancel", 100, 180);
    pointer(handle, "pointerup", 100, 240);
    expect(dialog).toBeInTheDocument();
    pointer(handle, "pointerdown", 100, 100);
    pointer(handle, "pointerup", 100, 180);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
