import React, { StrictMode, useLayoutEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivateDraftBoundary, { usePrivateDraftAccess } from "@/components/PrivateDraftBoundary";
import AuthLayout from "@/components/AuthLayout";
import EditEventSheet from "@/components/EditEventSheet";
import EditEmployeeSheet from "@/components/EditEmployeeSheet";
import ResponsiveDrawer from "@/components/ui/ResponsiveDrawer";
import { TooltipProvider } from "@/components/ui/tooltip";
import LoginPage from "@/app/login/page";
import EmployeesPage from "@/app/page";
import EventsPage from "@/app/events/page";
import InsertEmployeePage from "@/app/insert/page";
import { api } from "@/lib/api";
import { currentPermissionQueryKey } from "@/lib/auth-authority";
import type { PrivateDraftScope } from "@/lib/private-draft";
import { PrivateDraftAdmissionError } from "@/lib/private-draft";
import { useRecordListPreferences } from "@/hooks/useRecordListPreferences";
import type { Employee, Event as EventRecord } from "@/lib/types";

const { replace, notify, navigation } = vi.hoisted(() => ({ replace: vi.fn(), notify: vi.fn(), navigation: { actual: false } }));
const router = { replace, push: vi.fn() };
let routePath = "/";
let routeParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => router, usePathname: () => routePath, useSearchParams: () => routeParams,
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "en", toggle: vi.fn() }) }));
vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ dark: false, toggle: vi.fn() }) }));
vi.mock("@/components/app-sidebar", async (original) => {
  const actual = await original<typeof import("@/components/app-sidebar")>();
  return { ...actual, AppSidebar: () => navigation.actual ? <actual.AppSidebar /> : <aside>Private sidebar</aside> };
});
vi.mock("@/components/ui/sidebar", async (original) => {
  const actual = await original<typeof import("@/components/ui/sidebar")>();
  return {
    ...actual,
    SidebarProvider: (props: React.ComponentProps<typeof actual.SidebarProvider>) => navigation.actual
      ? <actual.SidebarProvider {...props} /> : <div>{props.children}</div>,
    SidebarInset: (props: React.ComponentProps<typeof actual.SidebarInset>) => navigation.actual
      ? <actual.SidebarInset {...props} /> : <div>{props.children}</div>,
    SidebarTrigger: () => navigation.actual ? <actual.SidebarTrigger /> : <button>Sidebar</button>,
  };
});
vi.mock("@/components/Breadcrumbs", () => ({ default: () => <nav>Breadcrumb</nav> }));
vi.mock("@/components/NotificationInbox", () => ({ default: () => null }));
vi.mock("@/components/PayrollReminder", () => ({ default: () => null }));
vi.mock("@/components/PwaLifecycle", () => ({ default: () => null }));
vi.mock("@/lib/toast", () => ({ default: { success: notify, error: notify }, notify: { success: notify, error: notify } }));
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => React.createElement("img", { src, alt }) }));
vi.mock("framer-motion", async (original) => ({
  ...await original<typeof import("framer-motion")>(), useReducedMotion: () => true,
}));

const actorA = { id: "actor-301-a", username: "operator-a", role: "OPERATOR", roles: ["OPERATOR"] };
const actorB = { ...actorA, id: "actor-301-b", username: "operator-b" };
const allGrants = ["events:read", "events:write", "hr:read", "hr:write"];
const event: EventRecord = {
  id: "event-301", name: "Original event", client_name: "Original client", client_phone: null, event_type_id: "type-301",
  start_date: "2026-09-24", end_date: "2026-09-25", start_time: "10:00", end_time: "18:00",
  venue_location: "Original venue", contract_price: 100, service_scope_ids: [], status: "Planned",
  created_by: null, created_at: "2026-09-24", updated_at: "2026-09-24", deleted_at: null,
};
const employee: Employee = {
  id: "employee-301", full_name: "Original employee", employee_id: "EMP-00301", department: null, department_id: null,
  position: null, phone: "0911111111", email: null, salary_level: null, commission: null, commission_type: null,
  id_card_front_url: null, id_card_back_url: null, profile_photo_url: null, office_id: null, office: null, event_prices: {},
  gender: null, employment_type: null, compensation_mode: "commission_only", group_name: null, bank_name: null,
  bank_account: null, hire_date: null, contract_status: null, created_at: "2026-09-24", updated_at: "2026-09-24",
};
type Identity = Omit<typeof actorA, "id"> & { id?: string };
const clients: QueryClient[] = [];
const originalAdapter = api.defaults.adapter;
let identity: Identity = actorA;
let slugs = [...allGrants];
let meFailure = false;
let permissionsFailure = false;
let meGate: Promise<void> | null = null;
let permissionsGate: Promise<void> | null = null;
let writeGate: Promise<void> | null = null;
let logoutGate: Promise<void> | null = null;
let terminalSession = false;
let roleSensitiveEvents = false;
let redactedEventResponses = 0;
let currentScope: PrivateDraftScope | null = null;
let wire: Array<{ method: string; url: string; data: unknown }> = [];
let unexpectedWire: string[] = [];
const forbiddenFetch = vi.fn(() => { throw new Error("Real network forbidden in private draft tests"); });
const closed = vi.fn();
const restoreTestDom: Array<() => void> = [];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function response(config: InternalAxiosRequestConfig, data: unknown, status = 200) {
  return { config, data, status, statusText: status === 200 ? "OK" : "Unavailable", headers: new AxiosHeaders() };
}
const adapter: AxiosAdapter = async (config) => {
  const url = config.url ?? "";
  wire.push({ method: config.method ?? "get", url, data: config.data });
  if (url === "/auth/me") {
    if (meGate) await meGate;
    if (meFailure) throw new AxiosError("Synthetic session unavailable", "ERR_BAD_RESPONSE", config, undefined, response(config, {}, 503));
    return response(config, { user: terminalSession ? null : identity });
  }
  if (url === "/auth/permissions") {
    const principal = identity.id ?? null;
    if (permissionsGate) await permissionsGate;
    if (permissionsFailure) throw new AxiosError("Synthetic permissions unavailable", "ERR_BAD_RESPONSE", config, undefined, response(config, {}, 503));
    return response(config, { user_id: principal, role: identity.role, roles: identity.roles, permission_slugs: slugs, is_superuser: slugs.includes("*"), catalog: [] });
  }
  if (url === "/auth/logout" && config.method === "post") {
    if (logoutGate) await logoutGate;
    terminalSession = true;
    return response(config, { success: true });
  }
  if (config.method === "get" && ["/departments", "/offices", "/salary-levels"].includes(url)) return response(config, []);
  if (config.method === "get" && url === "/event-types") return response(config, [{ id: "type-301", event_name: "Synthetic type" }]);
  if (config.method === "get" && url === "/service-scopes") return response(config, { service_scopes: [] });
  if (config.method === "get" && ["/api/preferences/record-list/events", "/api/preferences/record-list/employees"].includes(url)) {
    return response(config, { preference: { record_type: url.split("/").at(-1), sort: null, filters: {}, page_size: null, visible_columns: [], density: null, active_tab: null, updated_at: null } });
  }
  if (config.method === "put" && ["/api/preferences/record-list/events", "/api/preferences/record-list/employees"].includes(url)) {
    return response(config, { preference: JSON.parse(config.data) });
  }
  if (config.method === "get" && url === "/employees") return response(config, {
    employees: [employee, { ...employee, id: "employee-second", full_name: "Second employee" }], total: 2, page: 1, limit: 10,
  });
  if (config.method === "get" && url === "/employees/employee-301") return response(config, employee);
  if (config.method === "get" && url === "/employees/employee-second") return response(config, { ...employee, id: "employee-second", full_name: "Second employee" });
  if (config.method === "get" && url === "/employees/next-id") return response(config, { nextId: "EMP-00302" });
  if (config.method === "get" && url === "/events") {
    const hidePrice = roleSensitiveEvents && [identity.role, ...identity.roles].includes("PRICE_REDACTED");
    if (hidePrice) redactedEventResponses += 1;
    const rows = [event, { ...event, id: "event-second", name: "Second event" }];
    return response(config, {
      events: hidePrice ? rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "contract_price"))) : rows,
      total: 2, page: 1, limit: 10,
    });
  }
  if (config.method === "get" && url === "/events/saved-views") return response(config, { savedViews: [] });
  if (["put", "patch"].includes(config.method ?? "") && ["/events/event-301", "/employees/employee-301"].includes(url)) {
    if (writeGate) await writeGate;
    return response(config, url.startsWith("/events") ? { ...event, name: "Retained event" } : { ...employee, full_name: "Retained employee" });
  }
  if (config.method === "post" && url === "/employees") {
    if (writeGate) await writeGate;
    return response(config, { ...employee, id: "employee-303-created" });
  }
  if (url === "/probe" || url === "/probe-write") return response(config, { synthetic: true });
  unexpectedWire.push(`${config.method} ${url}`);
  throw new Error(`Unexpected isolated request: ${config.method} ${url}`);
};

function ScopeProbe() {
  const draft = usePrivateDraftAccess();
  useLayoutEffect(() => { currentScope = draft?.scope ?? null; }, [draft]);
  return null;
}
function PreferenceProbe() {
  const { isLoaded, isReady, markApplied, save } = useRecordListPreferences("events", { debounceMs: 25 });
  useLayoutEffect(() => {
    if (isLoaded) markApplied();
  }, [isLoaded, markApplied]);
  return <button disabled={!isReady} onClick={() => save({ pageSize: 20 })}>Change preference</button>;
}
function Fixture({ kind, record = "first", preferences = false }: { kind: "event" | "employee"; record?: string; preferences?: boolean }) {
  return <PrivateDraftBoundary permissions={kind === "event" ? ["events:read", "events:write"] : ["hr:read", "hr:write"]}>
    <AuthLayout>
      <ScopeProbe />
      {preferences && <PreferenceProbe />}
      {kind === "event"
        ? <EditEventSheet event={{ ...event, id: record === "first" ? event.id : "event-second" }} onClose={closed} />
        : <EditEmployeeSheet employee={{ ...employee, id: record === "first" ? employee.id : "employee-second" }} onClose={closed} />}
    </AuthLayout>
  </PrivateDraftBoundary>;
}
async function mount(kind: "event" | "employee", options: { strict?: boolean; preferences?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const tree = (record = "first") => <QueryClientProvider client={client}>
    {options.strict ? <StrictMode><Fixture kind={kind} record={record} preferences={options.preferences} /></StrictMode>
      : <Fixture kind={kind} record={record} preferences={options.preferences} />}
  </QueryClientProvider>;
  const view = render(tree());
  await screen.findByRole("dialog", { name: kind === "event" ? "Edit Event" : "Edit Employee" });
  return { client, ...view, record: (key: string) => view.rerender(tree(key)) };
}
function privateRequests() { return wire.filter((entry) => !entry.url.startsWith("/auth/")); }
async function pauseAuth(client: QueryClient, kind: "me" | "permissions" = "me") {
  const gate = deferred();
  if (kind === "me") meGate = gate.promise;
  else permissionsGate = gate.promise;
  let request!: Promise<void>;
  act(() => { request = client.refetchQueries({ queryKey: [kind] }); });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("heading", { name: "Verify your access" })).toBeVisible());
  return {
    fail: async () => {
      if (kind === "me") meFailure = true;
      else permissionsFailure = true;
      await act(async () => { gate.resolve(); await request; });
      await screen.findByRole("alert");
    },
    resume: async () => {
      await act(async () => { gate.resolve(); await request; });
      meGate = null;
      permissionsGate = null;
    },
  };
}
async function mountCreateFocus() {
  routePath = "/insert";
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const tree = (outside: React.ReactNode = null, mounted = true) => <QueryClientProvider client={client}>
    {mounted && <InsertEmployeePage />}
    {outside}
  </QueryClientProvider>;
  const view = render(tree());
  const name = await screen.findByPlaceholderText("e.g. John Doe");
  if (!(name instanceof HTMLInputElement)) throw new Error("Missing actual Employee-create name input");
  await screen.findByDisplayValue("EMP-00302");
  await waitFor(() => expect(client.isFetching()).toBe(0));
  fireEvent.change(name, { target: { value: "Authored focus draft" } });
  name.focus();
  name.setSelectionRange(9, 14, "backward");
  expect(name).toHaveFocus();
  return { client, name, ...view, outside: (content: React.ReactNode) => view.rerender(tree(content)),
    leave: () => view.rerender(tree(<button>Other route</button>, false)) };
}
type PrimaryActionKind = "event" | "employee" | "employee-create";
async function mountPrimaryAction(kind: PrimaryActionKind) {
  if (kind === "employee-create") {
    await mountCreateFocus();
    const phone = document.querySelector('input[type="tel"]');
    if (!phone) throw new Error("Missing actual Employee-create phone input");
    fireEvent.change(phone, { target: { value: "0911111111" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Regular (salary + commission)" }));
    fireEvent.click(screen.getByRole("option", { name: "Commission only" }));
  } else await mount(kind);
  const button = screen.getByRole("button", { name: kind === "employee-create" ? "Create Employee Record" : "Save Changes" });
  if (!(button instanceof HTMLButtonElement)) throw new Error("Missing real primary submit button");
  return button;
}
function primaryWrites() {
  return wire.filter((entry) => ["post", "put", "patch"].includes(entry.method)
    && ["/events/event-301", "/employees/employee-301", "/employees"].includes(entry.url));
}
function expectPrimaryFootprint(button: HTMLButtonElement) {
  expect(button).toHaveClass("min-h-12", "min-w-12", "active:scale-100");
  expect(button).not.toHaveClass("active:scale-[0.98]");
}
beforeEach(() => {
  navigation.actual = false;
  identity = actorA;
  slugs = [...allGrants];
  meFailure = false;
  permissionsFailure = false;
  meGate = null;
  permissionsGate = null;
  writeGate = null;
  logoutGate = null;
  terminalSession = false;
  roleSensitiveEvents = false;
  redactedEventResponses = 0;
  currentScope = null;
  routePath = "/";
  routeParams = new URLSearchParams();
  wire = [];
  unexpectedWire = [];
  forbiddenFetch.mockClear();
  closed.mockClear();
  notify.mockClear();
  replace.mockClear();
  localStorage.clear();
  api.defaults.adapter = adapter;
  vi.stubGlobal("fetch", forbiddenFetch);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  clients.splice(0).forEach((client) => client.clear());
  expect(unexpectedWire).toEqual([]);
  expect(forbiddenFetch).not.toHaveBeenCalled();
  api.defaults.adapter = originalAdapter;
  restoreTestDom.splice(0).forEach((restore) => restore());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("owned Event and Employee private drafts", () => {
  it.each(["event", "employee"] as const)("normally opens the real %s editor using only the minimal identity DTO", async (kind) => {
    await mount(kind);
    expect(screen.getByDisplayValue(kind === "event" ? "Original event" : "Original employee")).toBeVisible();
    expect(wire.filter((entry) => entry.url === "/auth/me")).toHaveLength(1);
    expect(wire.filter((entry) => entry.url === "/auth/permissions")).toHaveLength(1);
  });

  it.each(["event", "employee", "employee-create"] as const)("primary target #303 gives %s normal and loading states a nonshrinking 48px minimum", async (kind) => {
    const button = await mountPrimaryAction(kind);
    expectPrimaryFootprint(button);
    const pending = deferred();
    writeGate = pending.promise;
    fireEvent.click(button);
    await waitFor(() => expect(primaryWrites()).toHaveLength(1));
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.getByRole("button", { name: kind === "employee-create" ? "Saving..." : "Save Changes" })).toBe(button);
    expectPrimaryFootprint(button);
    await act(async () => { pending.resolve(); });
    await waitFor(() => expect(button).toBeEnabled());
    expectPrimaryFootprint(button);
  });

  it.each(["event", "employee", "employee-create"] as const)("primary target #303 preserves %s submit identity payload and one settled success", async (kind) => {
    const button = await mountPrimaryAction(kind);
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveClass("text-xs", "bg-indigo-600", "text-white", "dark:bg-indigo-500");
    expect(button).toHaveClass(kind === "employee-create" ? "py-3.5" : "px-6");
    const pending = deferred();
    writeGate = pending.promise;
    fireEvent.click(button);
    await waitFor(() => expect(primaryWrites()).toHaveLength(1));
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.getByRole("button", { name: kind === "employee-create" ? "Saving..." : "Save Changes" })).toBe(button);
    expect(closed).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    const sent = primaryWrites()[0];
    if (kind === "event") {
      expect(sent).toMatchObject({ method: "put", url: "/events/event-301" });
      if (typeof sent.data !== "string") throw new Error("Expected the real serialized event payload");
      expect(JSON.parse(sent.data)).toEqual({
        name: "Original event", client_name: "Original client", client_phone: null, event_type_id: "type-301",
        service_scope_ids: [], start_date: "2026-09-24", end_date: "2026-09-25", start_time: "10:00", end_time: "18:00",
        venue_location: "Original venue", contract_price: 100, status: "Planned",
      });
    } else {
      expect(sent).toMatchObject({ method: kind === "employee-create" ? "post" : "patch",
        url: kind === "employee-create" ? "/employees" : "/employees/employee-301" });
      if (!(sent.data instanceof FormData)) throw new Error("Expected the real Employee FormData");
      expect(Object.fromEntries(sent.data.entries())).toEqual({
        event_prices: "{}", full_name: kind === "employee-create" ? "Authored focus draft" : "Original employee",
        employee_id: kind === "employee-create" ? "EMP-00302" : "EMP-00301", phone: "0911111111", compensation_mode: "commission_only",
      });
    }
    await act(async () => { pending.resolve(); });
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    if (kind === "employee-create") {
      expect(closed).not.toHaveBeenCalled();
      expect(screen.getByPlaceholderText("e.g. John Doe")).toHaveValue("");
    } else expect(closed).toHaveBeenCalledTimes(1);
    expect(primaryWrites()).toHaveLength(1);
    expect(screen.getByRole("button", { name: kind === "employee-create" ? "Create Employee Record" : "Save Changes" })).toBe(button);
  });

  it.each(["event", "employee"] as const)("retains the %s draft privately through same-actor pending and 503, then explicit recovery", async (kind) => {
    const { client } = await mount(kind);
    fireEvent.change(screen.getByDisplayValue(kind === "event" ? "Original event" : "Original employee"), {
      target: { value: kind === "event" ? "Retained event" : "Retained employee" },
    });
    const before = privateRequests().length;
    const recovery = await pauseAuth(client);
    expect(document.querySelector("[data-drawer-panel]")).toBeNull();
    expect(screen.queryByDisplayValue(kind === "event" ? "Retained event" : "Retained employee")).not.toBeInTheDocument();
    await expect(api.get("/probe")).rejects.toBeInstanceOf(PrivateDraftAdmissionError);
    await expect(api.post("/probe-write", {})).rejects.toBeInstanceOf(PrivateDraftAdmissionError);
    expect(privateRequests()).toHaveLength(before);
    await recovery.fail();
    expect(screen.getByRole("button", { name: "Retry access" })).toHaveFocus();
    expect(privateRequests()).toHaveLength(before);
    meFailure = false;
    meGate = null;
    fireEvent.click(screen.getByRole("button", { name: "Retry access" }));
    await screen.findByRole("dialog", { name: kind === "event" ? "Edit Event" : "Edit Employee" });
    expect(screen.getByDisplayValue(kind === "event" ? "Retained event" : "Retained employee")).toBeVisible();
    expect(closed).not.toHaveBeenCalled();
  });

  it("also holds a same-actor current-permission recheck instead of exposing stale write access", async () => {
    const { client } = await mount("event");
    fireEvent.change(screen.getByDisplayValue("Original event"), { target: { value: "Permission draft" } });
    const before = privateRequests().length;
    const recovery = await pauseAuth(client, "permissions");
    await expect(api.put("/probe-write", {})).rejects.toBeInstanceOf(PrivateDraftAdmissionError);
    expect(privateRequests()).toHaveLength(before);
    await recovery.resume();
    expect(await screen.findByDisplayValue("Permission draft")).toBeVisible();
  });

  it("does not mount a private editor or lookup before a cold identity request settles", async () => {
    const gate = deferred();
    meGate = gate.promise;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><Fixture kind="event" /></QueryClientProvider>);
    await waitFor(() => expect(wire.some((entry) => entry.url === "/auth/me")).toBe(true));
    expect(privateRequests()).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => { gate.resolve(); });
    await screen.findByRole("dialog", { name: "Edit Event" });
  });

  it("destroys the old record owner when the route-selected record changes", async () => {
    const view = await mount("event");
    fireEvent.change(screen.getByDisplayValue("Original event"), { target: { value: "Record one only" } });
    view.record("second");
    expect(await screen.findByDisplayValue("Original event")).toBeVisible();
    expect(screen.queryByDisplayValue("Record one only")).toBeNull();
  });

  it("does not resurrect the old actor's fields or callbacks after another verified principal arrives", async () => {
    const { client } = await mount("employee");
    fireEvent.change(screen.getByDisplayValue("Original employee"), { target: { value: "Actor A only" } });
    const oldScope = currentScope!;
    identity = actorB;
    await act(async () => { await client.refetchQueries({ queryKey: ["me"] }); });
    await screen.findByRole("dialog", { name: "Edit Employee" });
    expect(screen.queryByDisplayValue("Actor A only")).toBeNull();
    const callback = vi.fn();
    oldScope.settle(callback);
    expect(callback).not.toHaveBeenCalled();
    await expect(api.patch("/probe-write", {}, oldScope.request(["hr:write"]))).rejects.toBeInstanceOf(PrivateDraftAdmissionError);
  });

  it("fresh empty grants are forbidden and do not revive the previous draft on later regrant", async () => {
    const { client } = await mount("event");
    fireEvent.change(screen.getByDisplayValue("Original event"), { target: { value: "Revoked draft" } });
    slugs = [];
    await act(async () => { await client.refetchQueries({ queryKey: ["permissions"] }); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Retry access" })).toBeNull();
    slugs = [...allGrants];
    await act(async () => { await client.refetchQueries({ queryKey: ["permissions"] }); });
    expect(await screen.findByDisplayValue("Original event")).toBeVisible();
    expect(screen.queryByDisplayValue("Revoked draft")).toBeNull();
  });

  it("preserves authorized ID-less bootstrap use without retaining its draft across unverifiable continuation", async () => {
    identity = { username: "admin", role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"] };
    slugs = ["*"];
    const { client } = await mount("event");
    fireEvent.change(screen.getByDisplayValue("Original event"), { target: { value: "Unbound draft" } });
    const recovery = await pauseAuth(client);
    await recovery.resume();
    expect(await screen.findByDisplayValue("Original event")).toBeVisible();
    expect(screen.queryByDisplayValue("Unbound draft")).toBeNull();
  });

  it("does not issue extra private auth queries on the public login page", () => {
    const client = new QueryClient();
    clients.push(client);
    render(<QueryClientProvider client={client}><LoginPage /></QueryClientProvider>);
    expect(screen.getByRole("button", { name: "Access System" })).toBeVisible();
    expect(wire).toEqual([]);
  });

  it("discards a private owner on a confirmed 401 query outcome despite retained user data", async () => {
    const { client } = await mount("event");
    fireEvent.change(screen.getByDisplayValue("Original event"), { target: { value: "Expired draft" } });
    const previous = currentScope!;
    terminalSession = true;
    const query = client.getQueryCache().find({ queryKey: ["me"], exact: true });
    if (!query) throw new Error("Missing actual session query");
    act(() => query.setState({
      status: "error", fetchStatus: "idle",
      error: Object.assign(new Error("Confirmed expired session"), { response: { status: 401 } }),
    }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByDisplayValue("Expired draft")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    const callback = vi.fn();
    previous.settle(callback);
    expect(callback).not.toHaveBeenCalled();
    await expect(api.put("/probe-write", {}, previous.request())).rejects.toBeInstanceOf(PrivateDraftAdmissionError);
  });

  it("keeps confirmed logout storage/cache clearing and discards the old private scope", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}>
      <PrivateDraftBoundary permissions={["events:read"]}><AuthLayout><ScopeProbe /><p>Private view</p></AuthLayout></PrivateDraftBoundary>
    </QueryClientProvider>);
    await screen.findByText("Private view");
    const previous = currentScope!;
    localStorage.setItem("token", "synthetic-token");
    fireEvent.click(screen.getByRole("button", { name: "Profile menu: operator-a" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Sign Out" }).at(-1)!);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    await waitFor(() => expect(localStorage.getItem("user")).toBeNull());
    expect(localStorage.getItem("token")).toBeNull();
    await waitFor(() => expect(screen.queryByText("Private view")).toBeNull());
    const callback = vi.fn();
    previous.settle(callback);
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not flush a pending list preference while current access is unavailable or on unmount", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const { unmount } = render(<QueryClientProvider client={client}>
      <PrivateDraftBoundary permissions={["events:read"]}><AuthLayout><PreferenceProbe /></AuthLayout></PrivateDraftBoundary>
    </QueryClientProvider>);
    const preference = await screen.findByRole("button", { name: "Change preference" });
    await waitFor(() => expect(preference).toBeEnabled());
    fireEvent.click(preference);
    const recovery = await pauseAuth(client);
    await recovery.fail();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
    unmount();
    await act(async () => { await Promise.resolve(); });
    expect(wire.filter((entry) => entry.method === "put" && entry.url.includes("preferences"))).toEqual([]);
  });

  it("preserves the normal same-owner preference flush on navigation", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const { unmount } = render(<QueryClientProvider client={client}>
      <PrivateDraftBoundary permissions={["events:read"]}><AuthLayout><PreferenceProbe /></AuthLayout></PrivateDraftBoundary>
    </QueryClientProvider>);
    const control = await screen.findByRole("button", { name: "Change preference" });
    await waitFor(() => expect(control).toBeEnabled());
    fireEvent.click(control);
    unmount();
    await waitFor(() => expect(wire.filter((entry) => entry.method === "put" && entry.url.includes("preferences"))).toHaveLength(1));
    expect(JSON.parse(String(wire.find((entry) => entry.method === "put" && entry.url.includes("preferences"))!.data))).toEqual({ pageSize: 20 });
  });

  it("does not flush a queued preference after logout intent while its acknowledgement is still pending", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const { unmount } = render(<QueryClientProvider client={client}>
      <PrivateDraftBoundary permissions={["events:read"]}><AuthLayout><PreferenceProbe /></AuthLayout></PrivateDraftBoundary>
    </QueryClientProvider>);
    const control = await screen.findByRole("button", { name: "Change preference" });
    await waitFor(() => expect(control).toBeEnabled());
    const logout = deferred();
    logoutGate = logout.promise;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(control);
      fireEvent.click(screen.getByRole("button", { name: "Profile menu: operator-a" }));
      fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
      fireEvent.click(screen.getAllByRole("button", { name: "Sign Out" }).at(-1)!);
      expect(replace).toHaveBeenCalledWith("/login");
      unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(60); });
      expect(wire.filter((entry) => entry.method === "put" && entry.url.includes("preferences"))).toEqual([]);
    } finally {
      await act(async () => { logout.resolve(); });
    }
  });

  it("rechecks an already-queued write at adapter admission after access becomes unavailable", async () => {
    const { client } = await mount("event");
    const originalScope = currentScope!;
    const queued = deferred();
    const interceptor = api.interceptors.request.use(async (config) => {
      if (config.url === "/probe-write") await queued.promise;
      return config;
    });
    try {
      const request = api.post("/probe-write", {}, originalScope.request(["events:write"]));
      const outcome = request.then(() => "admitted", (error: unknown) => error);
      const recovery = await pauseAuth(client);
      queued.resolve();
      expect(await outcome).toBeInstanceOf(PrivateDraftAdmissionError);
      expect(wire.filter((entry) => entry.url === "/probe-write")).toEqual([]);
      await recovery.resume();
    } finally {
      api.interceptors.request.eject(interceptor);
    }
  });

  it("settles one wire-admitted event acknowledgement privately, without another write on retry", async () => {
    const { client } = await mount("event");
    fireEvent.change(screen.getByDisplayValue("Original event"), { target: { value: "Retained event" } });
    const gate = deferred();
    writeGate = gate.promise;
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(wire.filter((entry) => entry.method === "put" && entry.url === "/events/event-301")).toHaveLength(1));
    const recovery = await pauseAuth(client);
    await act(async () => { gate.resolve(); });
    expect(closed).not.toHaveBeenCalled();
    await recovery.resume();
    await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
    expect(wire.filter((entry) => entry.method === "put" && entry.url === "/events/event-301")).toHaveLength(1);
  });

  it("retains an editor normally under React StrictMode effect replay", async () => {
    const { client } = await mount("event", { strict: true });
    fireEvent.change(screen.getByDisplayValue("Original event"), { target: { value: "Strict draft" } });
    const recovery = await pauseAuth(client);
    await recovery.resume();
    expect(await screen.findByDisplayValue("Strict draft")).toBeVisible();
  });

  it("drops a wire-admitted old actor's UI acknowledgement after the principal changes", async () => {
    const { client } = await mount("event");
    const pending = deferred();
    writeGate = pending.promise;
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(wire.some((entry) => entry.method === "put" && entry.url === "/events/event-301")).toBe(true));
    identity = actorB;
    await act(async () => { await client.refetchQueries({ queryKey: ["me"] }); });
    await screen.findByRole("dialog", { name: "Edit Event" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Close drawer" })).toHaveFocus());
    const newFocus = document.activeElement;
    await act(async () => { pending.resolve(); await Promise.resolve(); });
    expect(closed).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(newFocus);
    expect(wire.filter((entry) => entry.method === "put" && entry.url === "/events/event-301")).toHaveLength(1);
  });

  it("destroys an owned draft on actual write-grant revocation even when read access remains", async () => {
    const { client } = await mount("event");
    fireEvent.change(screen.getByDisplayValue("Original event"), { target: { value: "Previously writable draft" } });
    const previousScope = currentScope!;
    slugs = ["events:read"];
    await act(async () => { await client.refetchQueries({ queryKey: ["permissions"] }); });
    expect(await screen.findByDisplayValue("Original event")).toBeVisible();
    expect(screen.queryByDisplayValue("Previously writable draft")).toBeNull();
    const callback = vi.fn();
    previousScope.settle(callback);
    expect(callback).not.toHaveBeenCalled();
    await expect(api.put("/probe-write", {}, currentScope!.request(["events:write"]))).rejects.toBeInstanceOf(PrivateDraftAdmissionError);
    expect(wire.filter((entry) => entry.url === "/probe-write")).toEqual([]);
  });

  it("preserves the editor's civil dates, scope ID and price fields through private recovery", async () => {
    const { client } = await mount("event");
    const form = document.getElementById("edit-event-form")!;
    const dates = form.querySelectorAll<HTMLInputElement>('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: "2026-10-01" } });
    fireEvent.change(dates[1], { target: { value: "2026-10-02" } });
    fireEvent.change(screen.getByDisplayValue("Original venue"), { target: { value: "Retained venue" } });
    const amount = form.querySelector<HTMLInputElement>('input[type="number"]')!;
    fireEvent.change(amount, { target: { value: "125" } });
    const recovery = await pauseAuth(client);
    await recovery.resume();
    await screen.findByRole("dialog", { name: "Edit Event" });
    const restored = document.getElementById("edit-event-form")!;
    expect([...restored.querySelectorAll<HTMLInputElement>('input[type="date"]')].map((input) => input.value)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(screen.getByDisplayValue("Retained venue")).toBeVisible();
    expect(restored.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe("125");
    expect(screen.getByRole("combobox", { name: "Synthetic type" })).toBeVisible();
  });

  it("keeps the employee's selected File, generated preview, identifier and price JSON across a private hold", async () => {
    const { client } = await mount("employee");
    class FixtureURL extends URL {
      static createObjectURL() { return "blob:synthetic-301-image"; }
      static revokeObjectURL() {}
    }
    vi.stubGlobal("URL", FixtureURL);
    const getContextDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
    if (!getContextDescriptor) throw new Error("Missing canvas context descriptor");
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true, value: () => ({ drawImage: vi.fn() }),
    });
    restoreTestDom.push(() => Object.defineProperty(HTMLCanvasElement.prototype, "getContext", getContextDescriptor));
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["synthetic-compressed-image"], { type: "image/webp" }));
    });
    const create = document.createElement.bind(document);
    const fileInputs: HTMLInputElement[] = [];
    vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
      const element = create(tag, options);
      if (element instanceof HTMLInputElement) fileInputs.push(element);
      if (element instanceof HTMLImageElement) {
        element.width = 32;
        element.height = 32;
        queueMicrotask(() => element.dispatchEvent(new Event("load")));
      }
      return element;
    });
    const read = FileReader.prototype.readAsDataURL;
    const chosen: Blob[] = [];
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader, blob) {
      chosen.push(blob);
      read.call(this, blob);
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    const input = fileInputs.find((element) => element.type === "file");
    expect(input).toBeDefined();
    fireEvent.change(input!, { target: { files: [new File(["synthetic-original"], "profile.png", { type: "image/png" })] } });
    const image = await screen.findByRole("img", { name: "Profile" });
    const preview = image.getAttribute("src");
    expect(preview).toMatch(/^data:image\/webp/);
    fireEvent.change(screen.getByDisplayValue("Original employee"), { target: { value: "Retained employee" } });
    const recovery = await pauseAuth(client);
    expect(screen.queryByRole("img", { name: "Profile" })).toBeNull();
    await recovery.resume();
    expect(await screen.findByDisplayValue("Retained employee")).toBeVisible();
    expect(screen.getByRole("img", { name: "Profile" })).toHaveAttribute("src", preview);
    expect(screen.getByDisplayValue("EMP-00301")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(wire.some((entry) => entry.method === "patch" && entry.url === "/employees/employee-301")).toBe(true));
    const payload = wire.find((entry) => entry.method === "patch" && entry.url === "/employees/employee-301")!.data;
    expect(payload).toBeInstanceOf(FormData);
    if (!(payload instanceof FormData)) throw new Error("Expected the actual editor's FormData");
    expect(payload.get("profile_photo")).toBe(chosen[0]);
    expect(payload.get("employee_id")).toBe("EMP-00301");
    expect(payload.get("event_prices")).toBe("{}");
    await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
  });

  it("keeps permission cache data bound to the current identity rather than a generic authority slot", async () => {
    const { client } = await mount("event");
    expect(currentPermissionQueryKey(client).slice(0, 2)).toEqual(["permissions", actorA.id]);
    expect(client.getQueryData(currentPermissionQueryKey(client))).toMatchObject({ user_id: actorA.id });
    expect(client.getQueryData(["permissions"])).toBeUndefined();
  });

  it.each(["event", "employee"] as const)("retains the %s draft through the actual page's RBAC and shell gates", async (kind) => {
    routePath = kind === "event" ? "/events" : "/";
    routeParams = new URLSearchParams(`edit=${kind === "event" ? event.id : employee.id}`);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}>{kind === "event" ? <EventsPage /> : <EmployeesPage />}</QueryClientProvider>);
    await screen.findByRole("dialog", { name: kind === "event" ? "Edit Event" : "Edit Employee" });
    fireEvent.change(screen.getByDisplayValue(kind === "event" ? "Original event" : "Original employee"), {
      target: { value: "Page-owned draft" },
    });
    const recovery = await pauseAuth(client);
    const admitted = privateRequests().length;
    await recovery.fail();
    expect(privateRequests()).toHaveLength(admitted);
    expect(document.querySelector("[data-drawer-panel]")).toBeNull();
    meFailure = false;
    meGate = null;
    fireEvent.click(screen.getByRole("button", { name: "Retry access" }));
    expect(await screen.findByDisplayValue("Page-owned draft")).toBeVisible();
    expect(client.getQueryData(["auth-permissions"])).toBeUndefined();
  });

  it("retains the existing employee-create sibling privately without changing its generated identifier", async () => {
    routePath = "/insert";
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><InsertEmployeePage /></QueryClientProvider>);
    const name = await screen.findByPlaceholderText("e.g. John Doe");
    await screen.findByDisplayValue("EMP-00302");
    fireEvent.change(name, { target: { value: "New employee draft" } });
    const recovery = await pauseAuth(client);
    expect(name).not.toBeVisible();
    await recovery.resume();
    await waitFor(() => expect(screen.getByDisplayValue("New employee draft")).toBeVisible());
    expect(screen.getByDisplayValue("EMP-00302")).toBeVisible();
  });

  it.each([
    ["assets:read", "List Items", "/assets"],
    ["events:read", "List Events", "/events"],
  ])("current non-HR root denial preserves the real sidebar escape for %s without mounting employee state", async (permission, label, href) => {
    navigation.actual = true;
    slugs = [permission];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><TooltipProvider><EmployeesPage /></TooltipProvider></QueryClientProvider>);
    await screen.findByText("Forbidden: Insufficient privileges");
    const expand = await screen.findByRole("button", { name: "Expand all sections" });
    fireEvent.click(expand);
    expect(await screen.findByRole("link", { name: label })).toHaveAttribute("href", href);
    expect(screen.queryByRole("link", { name: "List Employees" })).toBeNull();
    expect(screen.queryByText("Original employee")).toBeNull();
    expect(document.querySelector("[data-private-draft-owner]")).toBeNull();
    expect(privateRequests()).toEqual([]);
  });

  it.each(["me", "permissions"] as const)("private focus restores the same Employee-create field and selection after %s pending-503-retry", async (kind) => {
    const { client, name } = await mountCreateFocus();
    const owner = name.closest("[data-private-draft-owner]");
    const recovery = await pauseAuth(client, kind);
    expect(name.isConnected).toBe(true);
    expect(owner).toHaveAttribute("hidden");
    expect(owner).toHaveAttribute("inert");
    const admitted = privateRequests().length;
    await recovery.fail();
    expect(screen.getByRole("button", { name: "Retry access" })).toHaveFocus();
    expect(privateRequests()).toHaveLength(admitted);
    meFailure = false;
    permissionsFailure = false;
    meGate = null;
    permissionsGate = null;
    fireEvent.click(screen.getByRole("button", { name: "Retry access" }));
    await waitFor(() => expect(name).toBeVisible());
    expect(screen.getByPlaceholderText("e.g. John Doe")).toBe(name);
    expect(name.closest("[data-private-draft-owner]")).toBe(owner);
    expect(name).toHaveValue("Authored focus draft");
    expect(screen.getByDisplayValue("EMP-00302")).toBeVisible();
    expect([name.selectionStart, name.selectionEnd, name.selectionDirection]).toEqual([9, 14, "backward"]);
    expect(name).toHaveFocus();
  });

  it("private focus freezes the pre-hide field across ME, permission failure and another failed retry", async () => {
    const { client, name } = await mountCreateFocus();
    const snapshots: Array<{ hidden: boolean; inert: boolean }> = [];
    const selectionStart = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "selectionStart")?.get;
    if (!selectionStart) throw new Error("Input selection getter is unavailable");
    vi.spyOn(name, "selectionStart", "get").mockImplementation(() => {
      const owner = name.closest("[data-private-draft-owner]");
      snapshots.push({ hidden: Boolean(owner?.hasAttribute("hidden")), inert: Boolean(owner?.hasAttribute("inert")) });
      return selectionStart.call(name);
    });
    const me = deferred();
    meGate = me.promise;
    let request!: Promise<void>;
    act(() => { request = client.refetchQueries({ queryKey: ["me"] }); });
    await screen.findByRole("heading", { name: "Verify your access" });
    expect(snapshots).toContainEqual({ hidden: false, inert: false });
    const permissions = deferred();
    permissionsGate = permissions.promise;
    const beforePermissions = wire.filter((entry) => entry.url === "/auth/permissions").length;
    await act(async () => { me.resolve(); await request; });
    meGate = null;
    await waitFor(() => expect(wire.filter((entry) => entry.url === "/auth/permissions")).toHaveLength(beforePermissions + 1));
    permissionsFailure = true;
    await act(async () => { permissions.resolve(); });
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Retry access" })).toHaveFocus();
    permissionsGate = null;
    permissionsFailure = false;
    meFailure = true;
    const beforeRetry = wire.filter((entry) => entry.url === "/auth/me").length;
    fireEvent.click(screen.getByRole("button", { name: "Retry access" }));
    await waitFor(() => expect(wire.filter((entry) => entry.url === "/auth/me")).toHaveLength(beforeRetry + 1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry access" })).toBeEnabled());
    expect(name).not.toBeVisible();
    meFailure = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry access" }));
    await waitFor(() => expect(name).toBeVisible());
    expect(name).toHaveFocus();
    expect([name.selectionStart, name.selectionEnd, name.selectionDirection]).toEqual([9, 14, "backward"]);
    expect(snapshots.every((snapshot) => !snapshot.hidden && !snapshot.inert)).toBe(true);
  });

  it("private focus never falls back to a field when recovery began without an owned target", async () => {
    const { client, name, outside } = await mountCreateFocus();
    outside(<button>New destination</button>);
    const destination = screen.getByRole("button", { name: "New destination" });
    destination.focus();
    const focus = vi.spyOn(name, "focus");
    const recovery = await pauseAuth(client, "permissions");
    await recovery.resume();
    await waitFor(() => expect(name).toBeVisible());
    expect(focus).not.toHaveBeenCalled();
    expect(name).not.toHaveFocus();
  });

  it.each(["focus", "pointer"] as const)("private focus cancels after a later outside %s intent even if Retry retakes focus", async (intent) => {
    const { client, name, outside } = await mountCreateFocus();
    const recovery = await pauseAuth(client, "permissions");
    outside(<button>New destination</button>);
    const destination = screen.getByRole("button", { name: "New destination" });
    if (intent === "focus") destination.focus();
    else fireEvent.pointerDown(destination);
    const focus = vi.spyOn(name, "focus");
    await recovery.fail();
    expect(screen.getByRole("button", { name: "Retry access" })).toHaveFocus();
    permissionsGate = null;
    permissionsFailure = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry access" }));
    await waitFor(() => expect(name).toBeVisible());
    expect(focus).not.toHaveBeenCalled();
    expect(name).not.toHaveFocus();
  });

  it("private focus does not take focus from a newly opened independent dialog", async () => {
    const { client, name, outside } = await mountCreateFocus();
    const recovery = await pauseAuth(client, "permissions");
    outside(<ResponsiveDrawer isOpen title="New independent dialog" onClose={() => {}}>
      <button>Independent action</button>
    </ResponsiveDrawer>);
    const action = await screen.findByRole("button", { name: "Independent action" });
    action.focus();
    const focus = vi.spyOn(name, "focus");
    await recovery.resume();
    await waitFor(() => expect(name).toBeVisible());
    expect(focus).not.toHaveBeenCalled();
    expect(action).toHaveFocus();
  });

  it.each(["inactive", "blurred-and-returned", "hidden-and-returned"] as const)("private focus skips an %s document", async (condition) => {
    const { client, name } = await mountCreateFocus();
    const recovery = await pauseAuth(client, "permissions");
    const focus = vi.spyOn(name, "focus");
    if (condition === "inactive") vi.spyOn(document, "hasFocus").mockReturnValue(false);
    else if (condition === "blurred-and-returned") {
      fireEvent(window, new Event("blur"));
      fireEvent(window, new Event("focus"));
    } else {
      const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      fireEvent(document, new Event("visibilitychange"));
      visibility.mockReturnValue("visible");
      fireEvent(document, new Event("visibilitychange"));
    }
    await recovery.resume();
    await waitFor(() => expect(name).toBeVisible());
    expect(focus).not.toHaveBeenCalled();
    expect(name).not.toHaveFocus();
  });

  it.each(["disabled", "hidden", "removed"] as const)("private focus does not restore the original target after it is %s", async (condition) => {
    const { client, name } = await mountCreateFocus();
    const recovery = await pauseAuth(client, "permissions");
    const focus = vi.spyOn(name, "focus");
    if (condition === "disabled") name.disabled = true;
    else if (condition === "hidden") name.hidden = true;
    else name.remove();
    await recovery.resume();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Verify your access" })).toBeNull());
    expect(focus).not.toHaveBeenCalled();
    expect(name).not.toHaveFocus();
  });

  it("private focus restores an owned non-text input without attempting text selection", async () => {
    const { client } = await mountCreateFocus();
    const amount = document.querySelector('input[type="number"]');
    if (!(amount instanceof HTMLInputElement)) throw new Error("Missing actual Employee-create event rate");
    fireEvent.change(amount, { target: { value: "125" } });
    amount.focus();
    expect(amount.selectionStart).toBeNull();
    const setSelection = vi.spyOn(amount, "setSelectionRange");
    const recovery = await pauseAuth(client, "permissions");
    await recovery.resume();
    await waitFor(() => expect(amount).toBeVisible());
    expect(amount).toHaveFocus();
    expect(setSelection).not.toHaveBeenCalled();
  });

  it.each(["principal", "role", "grant", "logout"] as const)("private focus cannot revive an owner retired by %s", async (reason) => {
    const { client, name } = await mountCreateFocus();
    const recovery = await pauseAuth(client);
    const focus = vi.spyOn(name, "focus");
    if (reason === "principal") identity = actorB;
    else if (reason === "role") identity = { ...actorA, role: "OTHER_OPERATOR", roles: ["OTHER_OPERATOR"] };
    else if (reason === "grant") slugs = ["hr:write"];
    else terminalSession = true;
    await recovery.resume();
    await waitFor(() => expect(name.isConnected).toBe(false));
    if (reason !== "logout") await screen.findByPlaceholderText("e.g. John Doe");
    expect(focus).not.toHaveBeenCalled();
  });

  it("private focus discards the target when its actual create page leaves the route", async () => {
    const { client, name, leave } = await mountCreateFocus();
    const recovery = await pauseAuth(client);
    const focus = vi.spyOn(name, "focus");
    leave();
    const destination = screen.getByRole("button", { name: "Other route" });
    destination.focus();
    await recovery.resume();
    expect(name.isConnected).toBe(false);
    expect(focus).not.toHaveBeenCalled();
    expect(destination).toHaveFocus();
  });

  it("private focus leaves modal-remount autofocus to the existing Event drawer", async () => {
    const { client } = await mount("event");
    const name = screen.getByDisplayValue("Original event");
    name.focus();
    const recovery = await pauseAuth(client, "permissions");
    const focus = vi.spyOn(name, "focus");
    await recovery.resume();
    await screen.findByRole("dialog", { name: "Edit Event" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Close drawer" })).toHaveFocus());
    expect(name.isConnected).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it.each(["event", "employee"] as const)("retires the actual %s page owner when the route edit identity changes", async (kind) => {
    routePath = kind === "event" ? "/events" : "/";
    routeParams = new URLSearchParams(`edit=${kind === "event" ? event.id : employee.id}`);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(client);
    const tree = () => <QueryClientProvider client={client}>{kind === "event" ? <EventsPage /> : <EmployeesPage />}</QueryClientProvider>;
    const view = render(tree());
    await screen.findByRole("dialog", { name: kind === "event" ? "Edit Event" : "Edit Employee" });
    fireEvent.change(screen.getByDisplayValue(kind === "event" ? "Original event" : "Original employee"), {
      target: { value: "Previous route draft" },
    });
    routeParams = new URLSearchParams(`edit=${kind}-second`);
    view.rerender(tree());
    await waitFor(() => expect(screen.queryByDisplayValue("Previous route draft")).toBeNull());
    expect(await screen.findByDisplayValue(kind === "event" ? "Second event" : "Second employee")).toBeVisible();
  });

  it.each([
    { change: "role set", lateAck: false },
    { change: "primary role", lateAck: true },
  ])("retires a same-actor same-grant event draft after a verified $change change redacts its price", async ({ change, lateAck }) => {
    identity = { ...actorA, role: "PRICE_VISIBLE", roles: ["PRICE_VISIBLE", "EVENT_OPERATOR"] };
    slugs = [...allGrants, "reports:profit:read"];
    roleSensitiveEvents = true;
    routePath = "/events";
    routeParams = new URLSearchParams(`edit=${event.id}`);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><EventsPage /></QueryClientProvider>);
    await screen.findByRole("dialog", { name: "Edit Event" });
    const priorOwner = document.querySelector("[data-private-draft-owner]")!.getAttribute("data-private-draft-owner");
    const amount = document.querySelector<HTMLInputElement>('#edit-event-form input[type="number"]')!;
    expect(amount.value).toBe("100");
    fireEvent.change(amount, { target: { value: "125" } });
    const acknowledgement = deferred();
    try {
      if (lateAck) {
        writeGate = acknowledgement.promise;
        fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
        await waitFor(() => expect(wire.filter((entry) => entry.method === "put" && entry.url === "/events/event-301")).toHaveLength(1));
      }
      identity = change === "role set"
        ? { ...identity, roles: ["PRICE_REDACTED", "EVENT_OPERATOR"] }
        : { ...identity, role: "PRICE_REDACTED" };
      await act(async () => { await client.refetchQueries({ queryKey: ["me"] }); });
      await waitFor(() => expect(redactedEventResponses).toBeGreaterThan(0));
      await screen.findByRole("dialog", { name: "Edit Event" });
      expect(document.querySelector("[data-private-draft-owner]")!.getAttribute("data-private-draft-owner")).not.toBe(priorOwner);
      expect(document.querySelector<HTMLInputElement>('#edit-event-form input[type="number"]')!.value).toBe("");
      expect(screen.queryByDisplayValue("125")).toBeNull();
      expect(slugs).toEqual([...allGrants, "reports:profit:read"]);
      if (lateAck) {
        await waitFor(() => expect(screen.getByRole("button", { name: "Close drawer" })).toHaveFocus());
        const focus = document.activeElement;
        await act(async () => { acknowledgement.resolve(); await Promise.resolve(); });
        expect(screen.queryByDisplayValue("125")).toBeNull();
        expect(notify).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(focus);
        expect(wire.filter((entry) => entry.method === "put" && entry.url === "/events/event-301")).toHaveLength(1);
      }
    } finally {
      await act(async () => { acknowledgement.resolve(); });
    }
  });

  it("retains the price draft when verified roles only reorder or repeat with the same primary role", async () => {
    identity = { ...actorA, role: "PRICE_VISIBLE", roles: ["PRICE_VISIBLE", "EVENT_OPERATOR"] };
    slugs = [...allGrants, "reports:profit:read"];
    const { client } = await mount("event");
    const priorOwner = document.querySelector("[data-private-draft-owner]")!.getAttribute("data-private-draft-owner");
    fireEvent.change(document.querySelector<HTMLInputElement>('#edit-event-form input[type="number"]')!, { target: { value: "125" } });
    identity = { ...identity, roles: ["EVENT_OPERATOR", "PRICE_VISIBLE", "EVENT_OPERATOR"] };
    await act(async () => { await client.refetchQueries({ queryKey: ["me"] }); });
    await waitFor(() => {
      expect(client.isFetching()).toBe(0);
      expect(screen.getByDisplayValue("125")).toBeVisible();
    });
    expect(document.querySelector("[data-private-draft-owner]")!.getAttribute("data-private-draft-owner")).toBe(priorOwner);
    expect(notify).not.toHaveBeenCalled();
  });
});
