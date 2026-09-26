import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import "@testing-library/jest-dom";
import ForbiddenState from "../components/ForbiddenState";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock hooks
let mockLang = "en";
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: mockLang,
  }),
}));

const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
const user = { id: "actor-304", username: "operator-304", role: "admin", roles: ["admin"] };
let grants = ["hr:read"];
let meGate: Promise<void> | null = null;
let meUnavailable = false;
let reads: string[] = [];
const forbiddenFetch = vi.fn(() => { throw new Error("Network is forbidden in the landing component tests"); });
function response(config: InternalAxiosRequestConfig, data: unknown, status = 200) {
  return { config, data, status, statusText: status === 200 ? "OK" : "Unavailable", headers: new AxiosHeaders() };
}
const adapter: AxiosAdapter = async (config) => {
  const url = config.url ?? "";
  reads.push(url);
  if (config.method === "get" && url === "/auth/me") {
    if (meGate) await meGate;
    if (meUnavailable) throw new AxiosError("Synthetic unavailable", "ERR_BAD_RESPONSE", config, undefined, response(config, {}, 503));
    return response(config, { user });
  }
  if (config.method === "get" && url === "/auth/permissions") {
    return response(config, { user_id: user.id, role: user.role, roles: user.roles, permission_slugs: grants, is_superuser: grants.includes("*"), catalog: [] });
  }
  throw new Error(`Unexpected landing test request: ${config.method} ${url}`);
};
function AuthorityProbe() {
  const auth = useAuth();
  return <span hidden data-testid="authority-phase">{auth.phase}</span>;
}
function renderSurface(props: React.ComponentProps<typeof ForbiddenState> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><AuthorityProbe /><ForbiddenState {...props} /></QueryClientProvider>);
  return { client, ...view };
}
async function renderReady(props: React.ComponentProps<typeof ForbiddenState> = {}) {
  const view = renderSurface(props);
  await waitFor(() => expect(screen.getByTestId("authority-phase")).toHaveTextContent("ready"));
  return view;
}

describe("ForbiddenState Component", () => {
  beforeEach(() => {
    mockLang = "en";
    grants = ["hr:read"];
    meGate = null;
    meUnavailable = false;
    reads = [];
    localStorage.clear();
    mockPush.mockClear();
    vi.clearAllMocks();
    api.defaults.adapter = adapter;
    vi.stubGlobal("fetch", forbiddenFetch);
  });

  afterEach(() => {
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
    api.defaults.adapter = originalAdapter;
    expect(forbiddenFetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("renders with default English titles when props are empty", async () => {
    await renderReady();
    expect(screen.getByText("Forbidden: Insufficient privileges")).toBeInTheDocument();
    expect(screen.getByText("You do not have the required permissions to view this content.")).toBeInTheDocument();
    expect(screen.getByText("Back to Dashboard")).toBeInTheDocument();
  });

  it("renders custom title and description when provided", async () => {
    await renderReady({
      title: "Custom Access Denied",
      description: "Custom description text details.",
      actionLabel: "Custom Go Back",
    });
    expect(screen.getByText("Custom Access Denied")).toBeInTheDocument();
    expect(screen.getByText("Custom description text details.")).toBeInTheDocument();
    expect(screen.getByText("Custom Go Back")).toBeInTheDocument();
  });

  it("renders localized text in Amharic", async () => {
    mockLang = "am";
    await renderReady();
    expect(screen.getByText("ክልክል ነው: በቂ ፈቃድ የለዎትም")).toBeInTheDocument();
    expect(screen.getByText("ይህንን ይዘት ለማየት የሚያስፈልግዎት ፈቃድ የለዎትም።")).toBeInTheDocument();
    expect(screen.getByText("ወደ ዳሽቦርድ ተመለስ")).toBeInTheDocument();
  });

  it("triggers router push to / by default when action button is clicked", async () => {
    await renderReady();
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("triggers custom callback when onAction prop is provided", () => {
    const customCallback = vi.fn();
    render(<ForbiddenState onAction={customCallback} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(customCallback).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(reads).toEqual([]);
  });

  it.each(["en", "am"])("uses defined theme tokens and a readable minimum target for the %s action", async (lang) => {
    mockLang = lang;
    await renderReady();
    const button = screen.getByRole("button");
    expect(button).toHaveClass("border-border", "bg-card", "text-foreground");
    expect(button).toHaveClass("min-h-12", "min-w-12", "text-sm", "font-semibold");
    expect(button.className).not.toMatch(/(?:text|bg|border)-gold|bg-neutral-950|text-\[10px\]/);
    expect(button).toHaveAccessibleName(lang === "am" ? "ወደ ዳሽቦርድ ተመለስ" : "Back to Dashboard");
  });

  it("keeps hover pointer-safe and supplies visible keyboard focus and reduced-motion behavior", async () => {
    await renderReady();
    const button = screen.getByRole("button");
    expect(button).toHaveClass(
      "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt",
      "focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-primary",
      "motion-reduce:transition-none",
    );
  });

  it("invokes only its callback without submitting an enclosing form", () => {
    const action = vi.fn();
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(<form onSubmit={submit}><ForbiddenState actionLabel="Return safely" onAction={action} /></form>);
    const button = screen.getByRole("button", { name: "Return safely" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each([
    { grants: ["events:read"], route: "/events", label: "List Events", lang: "en" },
    { grants: ["assets:read"], route: "/assets", label: "የዕቃዎች ዝርዝር", lang: "am" },
  ])("returns a verified $grants operator to $route instead of the HR denial loop", async (entry) => {
    grants = entry.grants;
    mockLang = entry.lang;
    await renderReady();
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(mockPush).toHaveBeenCalledExactlyOnceWith(entry.route);
    expect(button).toHaveAccessibleName(entry.label);
    expect(reads).toEqual(["/auth/me", "/auth/permissions"]);
  });

  it.each([{ permissions: ["hr:write"] }, { permissions: ["*"] }])("keeps the existing HR landing for verified $permissions authority", async ({ permissions }) => {
    grants = permissions;
    await renderReady();
    fireEvent.click(screen.getByRole("button"));
    expect(mockPush).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("does not invent a destination before cold identity verification completes", async () => {
    let release!: () => void;
    meGate = new Promise<void>((resolve) => { release = resolve; });
    renderSurface();
    await waitFor(() => expect(reads).toEqual(["/auth/me"]));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Checking current access");
    expect(mockPush).not.toHaveBeenCalled();
    await act(async () => { release(); });
    await waitFor(() => expect(screen.getByTestId("authority-phase")).toHaveTextContent("ready"));
  });

  it("rejects a stale click during recheck and uses the existing ME-first retry after503", async () => {
    grants = ["events:read"];
    const { client } = await renderReady();
    const originalButton = screen.getByRole("button");
    let release!: () => void;
    meGate = new Promise<void>((resolve) => { release = resolve; });
    let request!: Promise<void>;
    act(() => {
      request = client.refetchQueries({ queryKey: ["me"], exact: true });
      fireEvent.click(originalButton);
    });
    expect(mockPush).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("authority-phase")).toHaveTextContent("rechecking"));
    expect(screen.queryByRole("button")).toBeNull();
    meUnavailable = true;
    await act(async () => { release(); await request; });
    await waitFor(() => expect(screen.getByTestId("authority-phase")).toHaveTextContent("unavailable"));
    expect(screen.getByRole("alert")).toHaveTextContent("Access could not be verified");
    meUnavailable = false;
    meGate = null;
    fireEvent.click(screen.getByRole("button", { name: "Retry access" }));
    await waitFor(() => expect(screen.getByTestId("authority-phase")).toHaveTextContent("ready"));
    expect(reads.slice(-2)).toEqual(["/auth/me", "/auth/permissions"]);
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "List Events" }));
    expect(mockPush).toHaveBeenCalledExactlyOnceWith("/events");
  });

  it("leaves genuinely empty current grants denied despite role names and cached grants", async () => {
    grants = [];
    localStorage.setItem("user", JSON.stringify({ ...user, permission_slugs: ["*"] }));
    await renderReady();
    expect(screen.getByText("Forbidden: Insufficient privileges")).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
