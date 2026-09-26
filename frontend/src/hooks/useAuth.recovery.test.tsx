import React from "react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "./useAuth";
import { currentPermissionQueryKey, readCurrentAuthority } from "@/lib/auth-authority";

const { me, permissions } = vi.hoisted(() => ({ me: vi.fn(), permissions: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: me }, getEffectivePermissions: permissions }));
const user = { id: "actor-301-a", username: "minimal-a", role: "OPERATOR", roles: ["OPERATOR"] };
const grants = (id: string | null = user.id, slugs = ["events:write", "hr:write"]) => ({
  user_id: id, role: "OPERATOR", roles: ["OPERATOR"], permission_slugs: slugs, is_superuser: slugs.includes("*"), catalog: [],
});
const clients: QueryClient[] = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(hook.result.current.isSessionResolved).toBe(true));
  return { ...hook, client };
}
beforeEach(() => {
  me.mockReset();
  permissions.mockReset();
  localStorage.clear();
  onlineManager.setOnline(true);
  me.mockResolvedValue({ data: { user } });
  permissions.mockResolvedValue(grants());
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network allowed in auth source tests"); }));
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("canonical authentication read-proof review", () => {
  it.each(["me", "permissions"] as const)("does not trust cached success restored by canceling a current %s fetch", async (kind) => {
    const { result, client } = await mount();
    const pendingMe = deferred<{ data: { user: typeof user } }>();
    const pendingPermissions = deferred<ReturnType<typeof grants>>();
    if (kind === "me") me.mockReturnValueOnce(pendingMe.promise);
    else permissions.mockReturnValueOnce(pendingPermissions.promise);
    let request!: Promise<void>;
    act(() => { request = client.refetchQueries({ queryKey: [kind] }); });
    try {
      await waitFor(() => expect(client.isFetching({ queryKey: [kind] })).toBe(1));
      await act(async () => { await client.cancelQueries({ queryKey: [kind] }); });
      const key = kind === "me" ? ["me"] : currentPermissionQueryKey(client);
      expect(client.getQueryState(key)).toMatchObject({ status: "success", fetchStatus: "idle" });
      expect(readCurrentAuthority(client).phase).not.toBe("ready");
      await waitFor(() => expect(result.current.hasPermission("events:write")).toBe(false));
      await act(async () => {
        if (kind === "me") pendingMe.resolve({ data: { user } });
        else pendingPermissions.resolve(grants());
        await request;
      });
      expect(result.current.hasPermission("events:write")).toBe(false);
    } finally {
      await act(async () => {
        pendingMe.resolve({ data: { user } });
        pendingPermissions.resolve(grants());
        await request;
      });
    }
  });

  it.each(["me", "permissions"] as const)("does not treat a manual %s cache replacement at the same timestamp as proof", async (kind) => {
    const { result, client } = await mount();
    const key = kind === "me" ? ["me"] : currentPermissionQueryKey(client);
    const previous = client.getQueryState(key)!;
    act(() => client.setQueryData(key, previous.data, { updatedAt: previous.dataUpdatedAt }));
    expect(client.getQueryState(key)).toMatchObject({ status: "success", fetchStatus: "idle", dataUpdatedAt: previous.dataUpdatedAt });
    expect(readCurrentAuthority(client).phase).not.toBe("ready");
    await waitFor(() => expect(result.current.hasPermission("events:write")).toBe(false));
  });

  it("keeps retry ME-first when the new identity fetch is paused before the request function runs", async () => {
    const { result, client } = await mount();
    const key = currentPermissionQueryKey(client);
    const meCalls = me.mock.calls.length, permissionCalls = permissions.mock.calls.length;
    onlineManager.setOnline(false);
    await act(async () => { await result.current.retryCurrent(); });
    expect(client.getQueryState(["me"])?.fetchStatus).toBe("paused");
    expect(me).toHaveBeenCalledTimes(meCalls);
    expect(permissions).toHaveBeenCalledTimes(permissionCalls);
    expect(client.getQueryState(key)?.fetchStatus).toBe("idle");
    expect(readCurrentAuthority(client).phase).not.toBe("ready");
  });

  it("does not start permissions after a retry's identity request was canceled back to old success", async () => {
    const { result, client } = await mount();
    const pending = deferred<{ data: { user: typeof user } }>();
    me.mockReturnValueOnce(pending.promise);
    const permissionCalls = permissions.mock.calls.length;
    let retry!: Promise<void>;
    act(() => { retry = result.current.retryCurrent(); });
    try {
      await waitFor(() => expect(client.isFetching({ queryKey: ["me"] })).toBe(1));
      await act(async () => { await client.cancelQueries({ queryKey: ["me"] }); await retry; });
      expect(client.getQueryState(["me"])).toMatchObject({ status: "success", fetchStatus: "idle" });
      expect(permissions).toHaveBeenCalledTimes(permissionCalls);
      expect(readCurrentAuthority(client).phase).not.toBe("ready");
    } finally {
      await act(async () => {
        pending.resolve({ data: { user } });
        await retry;
      });
    }
  });

  it("does not let a retired query instance execute or verify against a replacement cache entry", async () => {
    const { unmount, client } = await mount();
    const previous = client.getQueryCache().find({ queryKey: ["me"], exact: true })!;
    const data = previous.state.data;
    unmount();
    client.removeQueries({ queryKey: ["me"], exact: true });
    client.setQueryData(["me"], data);
    expect(client.getQueryCache().find({ queryKey: ["me"], exact: true })).not.toBe(previous);
    const calls = me.mock.calls.length;
    await expect(previous.fetch()).rejects.toThrow();
    expect(me).toHaveBeenCalledTimes(calls);
    expect(readCurrentAuthority(client).phase).not.toBe("ready");
  });

  it("accepts a real new canonical identity and permission success even when the clock does not advance", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2000000000000);
    const { result, client } = await mount();
    const first = client.getQueryState(["me"])!.dataUpdatedAt;
    await act(async () => { await result.current.retryCurrent(); });
    await waitFor(() => {
      expect(permissions.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(client.isFetching()).toBe(0);
      expect(result.current.isCurrent).toBe(true);
      expect(result.current.hasPermission("events:write")).toBe(true);
    });
    expect(client.getQueryState(["me"])!.dataUpdatedAt).toBe(first);
    expect(me).toHaveBeenCalledTimes(2);
    expect(permissions.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.current.hasPermission("events:write")).toBe(true);
  });
});

describe("current authority during private-draft recovery", () => {
  it("accepts the actual minimal me DTO without profile or database-user fields", async () => {
    const { result } = await mount();
    expect(result.current.user?.id).toBe(user.id);
    expect(result.current.hasPermission("events:write")).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("preserves current authorized identifier-less bootstrap behavior", async () => {
    me.mockResolvedValue({ data: { user: { username: "admin", role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"] } } });
    permissions.mockResolvedValue(grants(null, ["*"]));
    const { result } = await mount();
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.hasPermission("users:manage")).toBe(true);
  });

  it.each(["me", "permissions"] as const)("denies cached write predicates while a same-actor %s recheck is pending", async (kind) => {
    const { result, client } = await mount();
    const pendingMe = deferred<{ data: { user: typeof user } }>();
    const pendingPermissions = deferred<ReturnType<typeof grants>>();
    if (kind === "me") me.mockReturnValueOnce(pendingMe.promise);
    else permissions.mockReturnValueOnce(pendingPermissions.promise);
    let request!: Promise<void>;
    act(() => { request = client.refetchQueries({ queryKey: [kind] }); });
    await waitFor(() => expect(client.isFetching({ queryKey: [kind] })).toBe(1));
    await waitFor(() => expect(result.current.hasPermission("events:write")).toBe(false));
    expect(result.current.isSessionResolved).toBe(false);
    await act(async () => {
      if (kind === "me") pendingMe.resolve({ data: { user } });
      else pendingPermissions.resolve(grants());
      await request;
    });
    await waitFor(() => expect(result.current.hasPermission("events:write")).toBe(true));
  });

  it("fetches authority bound to a changed identified actor instead of reusing the other actor's cache", async () => {
    const { result, client } = await mount();
    const changed = { ...user, id: "actor-301-b", username: "minimal-b" };
    const next = deferred<ReturnType<typeof grants>>();
    permissions.mockReturnValueOnce(next.promise);
    me.mockResolvedValue({ data: { user: changed } });
    await act(async () => { await client.refetchQueries({ queryKey: ["me"], exact: true }); });
    await waitFor(() => expect(permissions).toHaveBeenCalledTimes(2));
    expect(result.current.hasPermission("events:write")).toBe(false);
    await act(async () => { next.resolve(grants(changed.id, ["hr:read"])); });
    await waitFor(() => expect(result.current.hasPermission("hr:read")).toBe(true));
    expect(result.current.hasPermission("events:write")).toBe(false);
    expect(result.current.user?.id).toBe(changed.id);
  });

  it("does not treat fresh verified empty grants as an authority transport error", async () => {
    permissions.mockResolvedValue(grants(user.id, []));
    const { result } = await mount();
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.hasPermission("events:write")).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("requires a new permission response after a successful same-actor identity recheck", async () => {
    const { result, client } = await mount();
    const freshPermissions = deferred<ReturnType<typeof grants>>();
    permissions.mockReturnValueOnce(freshPermissions.promise);
    await act(async () => { await client.refetchQueries({ queryKey: ["me"] }); });
    await waitFor(() => expect(permissions).toHaveBeenCalledTimes(2));
    expect(result.current.hasPermission("events:write")).toBe(false);
    expect(result.current.isSessionResolved).toBe(false);
    await act(async () => { freshPermissions.resolve(grants(user.id, [])); });
    await waitFor(() => expect(result.current.isSessionResolved).toBe(true));
    expect(result.current.hasPermission("events:write")).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("keeps a legitimate narrowed preview through a successful authority recheck without granting while pending", async () => {
    permissions.mockResolvedValue(grants(user.id, ["users:manage", "events:*"]));
    localStorage.setItem("previewRole", "NARROW");
    localStorage.setItem("previewPermissionSlugs", JSON.stringify(["events:write"]));
    const { result, client } = await mount();
    expect(result.current.isPreviewActive).toBe(true);
    const fresh = deferred<ReturnType<typeof grants>>();
    permissions.mockReturnValueOnce(fresh.promise);
    let pending!: Promise<void>;
    act(() => { pending = client.refetchQueries({ queryKey: ["permissions"] }); });
    await waitFor(() => expect(result.current.hasPermission("events:write")).toBe(false));
    expect(localStorage.getItem("previewRole")).toBe("NARROW");
    await act(async () => { fresh.resolve(grants(user.id, ["users:manage", "events:*"])); await pending; });
    await waitFor(() => expect(result.current.isPreviewActive).toBe(true));
    expect(result.current.hasPermission("events:write")).toBe(true);
    expect(result.current.hasPermission("users:manage")).toBe(false);
  });
});
