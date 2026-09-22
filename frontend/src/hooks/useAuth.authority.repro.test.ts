import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "./useAuth";

const { getMe, getPermissions } = vi.hoisted(() => ({
  getMe: vi.fn(),
  getPermissions: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get: getMe },
  getEffectivePermissions: getPermissions,
}));

const actualUser = {
  id: "synthetic-issue278-user",
  username: "synthetic-user",
  full_name: "Synthetic User",
  role: "SYNTHETIC_CURRENT",
  roles: ["SYNTHETIC_CURRENT"],
  role_name: "SYNTHETIC_CURRENT",
  role_names: ["SYNTHETIC_CURRENT"],
};
const clients: QueryClient[] = [];
const forbiddenNetwork = vi.fn(() => {
  throw new Error("Network access is forbidden in the isolated hook reproducer");
});

function authority(slugs: string[] = ["events:read"], isSuperuser = false) {
  return {
    user_id: actualUser.id,
    role: actualUser.role,
    roles: actualUser.roles,
    permission_slugs: slugs,
    is_superuser: isSuperuser,
    catalog: [],
  };
}

function setPreview(role: string, encodedSlugs: string) {
  localStorage.setItem("previewRole", role);
  localStorage.setItem("previewPermissionSlugs", encodedSlugs);
}

async function mountAuth() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const rendered = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(rendered.result.current.isSessionResolved).toBe(true));
  return { ...rendered, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getMe.mockImplementation(async (path: string) => {
    if (path !== "/auth/me") throw new Error(`Unexpected synthetic API call: ${path}`);
    return { data: { user: actualUser } };
  });
  getPermissions.mockResolvedValue(authority());
  vi.stubGlobal("fetch", forbiddenNetwork);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  expect(forbiddenNetwork).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("phase-one controls: real user and intended preview", () => {
  it("keeps the authenticated user's current access without a preview", async () => {
    const { result } = await mountAuth();
    expect(result.current.user?.id).toBe(actualUser.id);
    expect(result.current.hasPermission("events:read")).toBe(true);
    expect(result.current.hasPermission("payroll:write")).toBe(false);
    expect(result.current.isPreviewActive).toBe(false);
  });

  it("preserves explicit actual administrator authority", async () => {
    getPermissions.mockResolvedValue(authority(["*"], true));
    const { result } = await mountAuth();
    expect(result.current.isSuperuser).toBe(true);
    expect(result.current.hasPermission("payroll:write")).toBe(true);
  });

  it("allows an actual administrator to preview a smaller permission set", async () => {
    getPermissions.mockResolvedValue(authority(["*"], true));
    setPreview("DRIVER", JSON.stringify(["events:read"]));
    const { result } = await mountAuth();
    expect(result.current.isPreviewActive).toBe(true);
    expect(result.current.hasPermission("events:read")).toBe(true);
    expect(result.current.hasPermission("payroll:write")).toBe(false);
  });

  it("recovers actual access after syntactically invalid preview JSON", async () => {
    setPreview("SYNTHETIC_PREVIEW", "{not-json");
    const { result } = await mountAuth();
    expect(result.current.isPreviewActive).toBe(false);
    expect(result.current.hasPermission("events:read")).toBe(true);
    expect(result.current.user?.username).toBe(actualUser.username);
  });
});

describe("phase-one red evidence: preview is not an authority source", () => {
  it("does not grant a non-administrator authority from a stored OWNER preview", async () => {
    setPreview("OWNER", JSON.stringify(["*"]));
    const { result } = await mountAuth();
    expect(result.current.hasPermission("payroll:write")).toBe(false);
    expect(result.current.isPreviewActive).toBe(false);
  });

  it("does not let an authorized permission editor preview rights they do not currently hold", async () => {
    getPermissions.mockResolvedValue(authority(["users:manage", "events:read"]));
    setPreview("SYNTHETIC_TARGET", JSON.stringify(["events:read", "payroll:write"]));
    const { result } = await mountAuth();
    expect(result.current.hasPermission("events:read")).toBe(true);
    expect(result.current.hasPermission("payroll:write")).toBe(false);
  });

  it("does not derive preview superuser authority from a local role label", async () => {
    getPermissions.mockResolvedValue(authority(["*"], true));
    setPreview("OWNER", JSON.stringify(["events:read"]));
    const { result } = await mountAuth();
    expect(result.current.hasPermission("payroll:write")).toBe(false);
    expect(result.current.isSuperuser).toBe(false);
  });

  it.each([
    { label: "non-array string", encoded: JSON.stringify("*") },
    { label: "mixed-type array", encoded: JSON.stringify(["events:read", 42]) },
    { label: "object", encoded: JSON.stringify({ all: true }) },
    { label: "null", encoded: "null" },
  ])("recovers the real user's access after a $label preview payload", async ({ encoded }) => {
    getPermissions.mockResolvedValue(authority(["users:manage", "events:read"]));
    setPreview("SYNTHETIC_TARGET", encoded);
    const { result } = await mountAuth();
    expect(result.current.isPreviewActive).toBe(false);
    expect(result.current.hasPermission("events:read")).toBe(true);
    expect(result.current.hasPermission("payroll:write")).toBe(false);
  });

  it("does not let stale preview storage survive revocation of actual administrator authority", async () => {
    getPermissions.mockResolvedValue(authority(["*"], true));
    setPreview("SYNTHETIC_TARGET", JSON.stringify(["*"]));
    const { result, client } = await mountAuth();
    act(() => { client.setQueryData(["permissions"], authority()); });
    await waitFor(() => expect(result.current.rawIsAdmin).toBe(false));
    expect(result.current.hasPermission("payroll:write")).toBe(false);
    expect(result.current.hasPermission("events:read")).toBe(true);
  });

  it("does not substitute preview grants when current authority lookup fails", async () => {
    getPermissions.mockRejectedValue(new Error("Synthetic authority unavailable"));
    setPreview("SYNTHETIC_TARGET", JSON.stringify(["*"]));
    const { result } = await mountAuth();
    expect(result.current.hasPermission("payroll:write")).toBe(false);
    expect(result.current.permissionSlugs).toEqual([]);
  });
});

describe("approved narrowing and recovery regressions", () => {
  it.each([
    { actual: ["users:manage", "events:*"], preview: ["events:read"], expected: ["events:read"] },
    { actual: ["users:manage", "events:read"], preview: ["events:*"], expected: ["events:read"] },
    { actual: ["settings:*", "assets:*"], preview: ["assets:read", "assets:write"], expected: ["assets:read", "assets:write"] },
    { actual: ["users:manage", "events:read"], preview: ["*"], expected: ["users:manage", "events:read"] },
  ])("intersects actual $actual with draft $preview without widening either side", async ({ actual, preview, expected }) => {
    getPermissions.mockResolvedValue(authority(actual));
    setPreview("SYNTHETIC_DRAFT", JSON.stringify(preview));
    const { result } = await mountAuth();
    expect(result.current.isPreviewActive).toBe(true);
    expect(result.current.permissionSlugs).toEqual(expected);
    expect(result.current.hasPermission("payroll:write")).toBe(false);
    expect(result.current.hasPermission("events:delete")).toBe(false);
  });

  it("keeps an intentionally empty unsaved draft empty", async () => {
    getPermissions.mockResolvedValue(authority(["*"], true));
    setPreview("SYNTHETIC_DRAFT", "[]");
    const { result } = await mountAuth();
    expect(result.current.isPreviewActive).toBe(true);
    expect(result.current.permissionSlugs).toEqual([]);
    expect(result.current.isSuperuser).toBe(false);
    expect(result.current.hasPermission("events:read")).toBe(false);
  });

  it("normalizes valid preview slugs without trusting the display role", async () => {
    getPermissions.mockResolvedValue(authority(["users:manage", "events:*"]));
    setPreview(" OWNER ", JSON.stringify([" EVENTS:READ ", "events:read"]));
    const { result } = await mountAuth();
    expect(result.current.previewRoleName).toBe("OWNER");
    expect(result.current.permissionSlugs).toEqual(["events:read"]);
    expect(result.current.isSuperuser).toBe(false);
  });

  it("does not forge user role metadata that a role-label consumer might treat as authority", async () => {
    getPermissions.mockResolvedValue(authority(["*"], true));
    setPreview("OWNER", JSON.stringify(["events:read"]));
    const { result } = await mountAuth();
    expect(result.current.user).toMatchObject({
      id: actualUser.id,
      role: actualUser.role,
      roles: actualUser.roles,
      role_name: actualUser.role_name,
      role_names: actualUser.role_names,
    });
    expect(result.current.previewRoleName).toBe("OWNER");
    expect(result.current.hasPermission("users:manage")).toBe(false);
  });

  it("clears preview across mounted consumers without reloading the real session", async () => {
    getPermissions.mockResolvedValue(authority(["*"], true));
    setPreview("SYNTHETIC_DRAFT", JSON.stringify(["events:read"]));
    const first = await mountAuth();
    const second = await mountAuth();
    act(() => { first.result.current.clearPreview(); });
    expect(first.result.current.isPreviewActive).toBe(false);
    expect(second.result.current.isPreviewActive).toBe(false);
    expect(first.result.current.hasPermission("payroll:write")).toBe(true);
    expect(second.result.current.hasPermission("payroll:write")).toBe(true);
    expect(localStorage.getItem("previewRole")).toBeNull();
    expect(localStorage.getItem("previewPermissionSlugs")).toBeNull();
  });

  it("retains actual access and reports blocked storage instead of throwing during mount", async () => {
    const blocked = () => { throw new DOMException("Synthetic blocked storage", "SecurityError"); };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
    const { result } = await mountAuth();
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isPreviewActive).toBe(false);
    expect(result.current.hasPermission("events:read")).toBe(true);
    expect(console.warn).toHaveBeenCalled();
  });

  it("recovers actual access across consumers even when stored preview removal is blocked", async () => {
    getPermissions.mockResolvedValue(authority(["*"], true));
    setPreview("SYNTHETIC_DRAFT", JSON.stringify(["events:read"]));
    const originalStorage = localStorage;
    vi.stubGlobal("localStorage", {
      getItem: originalStorage.getItem.bind(originalStorage),
      setItem: originalStorage.setItem.bind(originalStorage),
      removeItem: () => { throw new DOMException("Synthetic blocked removal", "SecurityError"); },
    });
    const first = await mountAuth();
    const second = await mountAuth();
    act(() => { first.result.current.clearPreview(); });
    expect(first.result.current.isPreviewActive).toBe(false);
    expect(second.result.current.isPreviewActive).toBe(false);
    expect(first.result.current.hasPermission("payroll:write")).toBe(true);
    expect(second.result.current.hasPermission("payroll:write")).toBe(true);
    expect(console.warn).toHaveBeenCalled();
  });

  it.each([false, true])("does not revive a cleared read-only snapshot in a new consumer (pending hydration=%s)", async (pendingHydration) => {
    getPermissions.mockResolvedValue(authority(["*"], true));
    setPreview("SYNTHETIC_OLD_DRAFT", JSON.stringify(["events:read"]));
    const originalStorage = localStorage;
    const blocked = () => { throw new DOMException("Synthetic read-only storage", "SecurityError"); };
    vi.stubGlobal("localStorage", {
      getItem: originalStorage.getItem.bind(originalStorage),
      setItem: blocked,
      removeItem: blocked,
    });
    const first = await mountAuth();
    const pending = pendingHydration ? mountAuth() : null;
    act(() => { first.result.current.clearPreview(); });
    const next = pending ? await pending : await mountAuth();
    expect(first.result.current.isPreviewActive).toBe(false);
    expect(next.result.current.isPreviewActive).toBe(false);
    expect(next.result.current.hasPermission("payroll:write")).toBe(true);
    expect(next.result.current.user).toMatchObject({ id: actualUser.id, role: actualUser.role });
    expect(originalStorage.getItem("previewRole")).toBe("SYNTHETIC_OLD_DRAFT");

    originalStorage.setItem("previewRole", "SYNTHETIC_NEW_DRAFT");
    originalStorage.setItem("previewPermissionSlugs", JSON.stringify(["payroll:read"]));
    const fresh = await mountAuth();
    expect(fresh.result.current.isPreviewActive).toBe(true);
    expect(fresh.result.current.previewRoleName).toBe("SYNTHETIC_NEW_DRAFT");
    expect(fresh.result.current.hasPermission("payroll:read")).toBe(true);
    expect(fresh.result.current.hasPermission("users:manage")).toBe(false);
  });

  it("does not revive cached grants while a current-authority refetch has failed", async () => {
    getPermissions.mockResolvedValue(authority(["*"], true));
    setPreview("SYNTHETIC_DRAFT", JSON.stringify(["events:read"]));
    const { result, client } = await mountAuth();
    getPermissions.mockRejectedValue(new Error("Synthetic refetch unavailable"));
    await act(async () => { await client.invalidateQueries({ queryKey: ["permissions"] }); });
    await waitFor(() => expect(result.current.error?.message).toBe("Synthetic refetch unavailable"));
    expect(result.current.permissionSlugs).toEqual([]);
    expect(result.current.hasPermission("events:read")).toBe(false);
    expect(localStorage.getItem("previewRole")).toBeNull();
    getPermissions.mockResolvedValue(authority());
    await act(async () => { await client.invalidateQueries({ queryKey: ["permissions"] }); });
    await waitFor(() => expect(result.current.hasPermission("events:read")).toBe(true));
    expect(result.current.isPreviewActive).toBe(false);
  });

  it("rejects permission metadata cached for a different user", async () => {
    getPermissions.mockResolvedValue({ ...authority(["*"], true), user_id: "different-synthetic-user" });
    setPreview("OWNER", JSON.stringify(["*"]));
    const { result } = await mountAuth();
    expect(result.current.hasPermission("payroll:write")).toBe(false);
    expect(result.current.isPreviewActive).toBe(false);
    expect(result.current.error?.message).toBe("Invalid current permission response");
    expect(console.error).toHaveBeenCalled();
  });

  it("does not let a contradictory superuser flag override explicit current slugs", async () => {
    getPermissions.mockResolvedValue(authority(["events:read"], true));
    const { result } = await mountAuth();
    expect(result.current.isSuperuser).toBe(false);
    expect(result.current.hasPermission("payroll:write")).toBe(false);
    expect(result.current.hasPermission("events:read")).toBe(true);
  });

  it("preserves explicit authority for the existing identifier-less bootstrap session", async () => {
    getMe.mockResolvedValue({ data: { user: { username: "admin", role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"] } } });
    getPermissions.mockResolvedValue({ ...authority(["*"], true), user_id: null });
    const { result } = await mountAuth();
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isSuperuser).toBe(true);
    expect(result.current.hasPermission("users:manage")).toBe(true);
  });
});
