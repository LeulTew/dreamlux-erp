import axios, { type AxiosRequestConfig } from "axios";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { api } from "./api";
import { readCurrentAuthority } from "./auth-authority";
import { createPermissionMatcher } from "./permission-matcher";

let nextOwner = 0;
export class PrivateDraftAdmissionError extends Error {
  constructor() { super("Current access must be verified before this request can be sent."); }
}

export interface PrivateDraftScope {
  readonly key: string;
  alive(): boolean;
  ready(): boolean;
  queryKey(key: QueryKey): QueryKey;
  request(required?: readonly string[]): AxiosRequestConfig;
  settle(callback: () => void): void;
  beforeDispose(callback: () => void): () => void;
  activate(): void;
  suspend(): void;
  dispose(): void;
}

export function createPrivateDraftOwner(
  client: QueryClient,
  principalId: string | null,
  required: readonly string[],
  previewAllows: (permission: string) => boolean,
) {
  const key = `private-draft-${++nextOwner}`;
  const admittedAuthority = readCurrentAuthority(client);
  const initialGrants = admittedAuthority.permissionSlugs;
  const initialRoles = admittedAuthority.verifiedRoleIdentity;
  let live = true;
  let attached = true;
  let ended = false;
  let lifetime = 0;
  let preview = previewAllows;
  const listeners = new Set<() => void>();
  const scopes = new Set<{ check(): void; flush(): void; retire(): void; dispose(): void }>();
  const matches = (permissions: readonly string[]) => {
    const current = readCurrentAuthority(client);
    const actual = createPermissionMatcher(current.permissionSlugs);
    return current.phase === "ready" && current.principalId === principalId
      && current.verifiedRoleIdentity === initialRoles
      && permissions.some((permission) => actual(permission) && preview(permission));
  };
  const interceptor = api.interceptors.request.use((config) => {
    if (/^\/auth\/(?:me|permissions|login|logout)(?:\?|$)/.test(config.url ?? "")) return config;
    const adapter = axios.getAdapter(config.adapter ?? api.defaults.adapter);
    config.adapter = (request) => {
      if (!live || !attached || !matches(required)) {
        console.warn("[Private draft] Blocked private transport while access is unresolved");
        return Promise.reject(new PrivateDraftAdmissionError());
      }
      return adapter(request);
    };
    return config;
  }, undefined, { synchronous: true });
  const invalidate = () => {
    const wasLive = live;
    const current = readCurrentAuthority(client);
    const currentPermission = createPermissionMatcher(current.permissionSlugs);
    if (current.phase === "unauthenticated" || current.principalId !== principalId
      || (current.verifiedRoleIdentity !== null && current.verifiedRoleIdentity !== initialRoles)
      || (current.phase === "ready" && !matches(required))
      || (current.phase === "ready" && initialGrants.some((permission) => !currentPermission(permission)))
      || (principalId === null && current.phase !== "ready")) live = false;
    for (const scope of scopes) scope.check();
    if (!live) for (const scope of scopes) scope.dispose();
    else if (current.phase === "ready") queueMicrotask(() => { for (const scope of scopes) scope.flush(); });
    if (wasLive !== live) listeners.forEach((notify) => notify());
  };
  const unsubscribe = client.getQueryCache().subscribe(invalidate);
  const createScope = (permissions: readonly string[] = required): PrivateDraftScope => {
    let active = true;
    let scopeAttached = true;
    let scopeLifetime = 0;
    const pending = new Set<() => void>();
    const retiring = new Set<() => void>();
    const alive = () => active && live && attached && scopeAttached;
    const ready = () => alive() && attached && scopeAttached && matches(permissions);
    const observer = {
      check() {
        if (!live || (readCurrentAuthority(client).phase === "ready" && !matches(permissions))) active = false;
        if (!active) pending.clear();
      },
      flush() {
        if (!ready()) return;
        const callbacks = [...pending];
        pending.clear();
        for (const callback of callbacks) if (ready()) callback();
      },
      retire() {
        const callbacks = [...retiring];
        retiring.clear();
        if (ready()) for (const callback of callbacks) callback();
      },
      dispose() { observer.retire(); active = false; pending.clear(); scopes.delete(observer); },
    };
    scopes.add(observer);
    return {
      key, alive, ready,
      queryKey: (queryKey) => [...queryKey, { privateDraftOwner: key }],
      request: (requested = permissions) => ({
        adapter: (config) => {
          if (!ready() || !matches(requested)) {
            console.warn("[Private draft] Blocked request pending current access");
            return Promise.reject(new PrivateDraftAdmissionError());
          }
          const adapter = axios.getAdapter(api.defaults.adapter);
          return adapter(config).then((response) => {
            // A wire-admitted write settles once; its owner gates UI callbacks separately.
            if (["get", "head"].includes(config.method ?? "get") && !ready()) {
              throw new PrivateDraftAdmissionError();
            }
            return response;
          });
        },
      }),
      settle(callback) {
        if (!alive()) return;
        if (ready()) callback();
        else pending.add(callback);
      },
      beforeDispose(callback) { retiring.add(callback); return () => { retiring.delete(callback); }; },
      activate() { if (active && live) { scopeLifetime += 1; scopeAttached = true; } },
      suspend() {
        observer.retire();
        // Block admission now; defer final disposal only for StrictMode reattachment.
        scopeAttached = false;
        const released = scopeLifetime;
        queueMicrotask(() => {
          if (!scopeAttached && scopeLifetime === released) observer.dispose();
        });
      },
      dispose: observer.dispose,
    };
  };
  const dispose = () => {
    const wasLive = live;
    for (const scope of scopes) scope.retire();
    live = false;
    unsubscribe();
    api.interceptors.request.eject(interceptor);
    for (const scope of scopes) scope.dispose();
    void client.cancelQueries({ predicate: (query) => query.queryKey.some((part) =>
      typeof part === "object" && part !== null && "privateDraftOwner" in part && part.privateDraftOwner === key) });
    client.removeQueries({ predicate: (query) => query.queryKey.some((part) =>
      typeof part === "object" && part !== null && "privateDraftOwner" in part && part.privateDraftOwner === key) });
    const current = readCurrentAuthority(client);
    if (current.principalId !== principalId || current.phase === "unauthenticated") {
      void client.cancelQueries({ predicate: (query) => !["me", "permissions"].includes(String(query.queryKey[0])) });
      client.removeQueries({ predicate: (query) => !["me", "permissions"].includes(String(query.queryKey[0])) });
    }
    if (wasLive) listeners.forEach((notify) => notify());
  };
  return {
    key, principalId, createScope,
    alive: () => live,
    ended: () => ended,
    terminate() {
      ended = true;
      live = false;
      attached = false;
      for (const scope of scopes) scope.dispose();
      listeners.forEach((notify) => notify());
    },
    ready: () => live && attached && matches(required),
    activate() { if (live) { lifetime += 1; attached = true; } },
    suspend() {
      attached = false;
      const released = lifetime;
      queueMicrotask(() => { if (!attached && lifetime === released) dispose(); });
    },
    subscribe(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify); }; },
    updatePreview(check: (permission: string) => boolean) { preview = check; invalidate(); },
    dispose,
  };
}
export type PrivateDraftOwner = ReturnType<typeof createPrivateDraftOwner>;
