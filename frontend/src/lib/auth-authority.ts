import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";
import type { User } from "./types";

export type SessionUser = Pick<User, "username"> & Partial<Omit<User, "username">> & {
  role?: string;
  roles?: string[];
};
export interface SessionResponse {
  user?: SessionUser | null;
  /** Client-cache revision, never a server grant or persisted identity. */
  verification?: number;
}
export interface CurrentPermissions {
  user_id: string | null;
  role: string | null;
  roles: string[];
  permission_slugs: string[];
  is_superuser: boolean;
  catalog: { slug: string; description: string }[];
}
export type AuthorityPhase = "checking" | "rechecking" | "unavailable" | "unauthenticated" | "ready";
type ProofQuery = Pick<Query, "queryHash" | "queryKey" | "state" | "promise">;
type ReadReceipt = {
  token: object;
  state: ProofQuery["state"];
  data: unknown;
  fingerprint: string;
  session?: object;
};
type ReadAttempt = {
  eligible: boolean;
  started: boolean;
  completed: boolean;
  promise?: Promise<unknown>;
  session?: object;
  detach?: () => void;
};
type QueryProof = {
  sawFetch: boolean;
  attempt?: ReadAttempt;
  blockedPromise?: Promise<unknown>;
  receipt?: ReadReceipt;
};
type ProofStore = {
  revision: number;
  records: WeakMap<ProofQuery, QueryProof>;
  listeners: Set<() => void>;
};
const proofStores = new WeakMap<QueryClient, ProofStore>();

function isAuthQuery(query: ProofQuery) {
  return (query.queryKey.length === 1 && query.queryKey[0] === "me")
    || (query.queryKey.length === 3 && query.queryKey[0] === "permissions");
}
function publishProof(store: ProofStore) {
  store.revision += 1;
  store.listeners.forEach((notify) => notify());
}
function invalidateProof(record: QueryProof, query: ProofQuery) {
  record.receipt = undefined;
  if (record.attempt) {
    record.attempt.eligible = false;
    record.attempt.detach?.();
  }
  record.blockedPromise = query.promise;
}
function installProofStore(client: QueryClient): ProofStore {
  const existing = proofStores.get(client);
  if (existing) return existing;
  const store: ProofStore = { revision: 0, records: new WeakMap(), listeners: new Set() };
  proofStores.set(client, store);
  const cache = client.getQueryCache();
  // One observer per QueryClient keeps proof invalidations visible between mounted consumers.
  cache.subscribe((event) => {
    const query = event.query;
    if (!isAuthQuery(query)) return;
    if (event.type === "removed") {
      const old = store.records.get(query);
      if (old) invalidateProof(old, query);
      store.records.delete(query);
      publishProof(store);
      return;
    }
    if (event.type !== "updated" || cache.get(query.queryHash) !== query) return;
    const record = store.records.get(query) ?? { sawFetch: false };
    store.records.set(query, record);
    const action = event.action;
    if (action.type === "fetch") {
      invalidateProof(record, query);
      record.sawFetch = true;
      record.blockedPromise = undefined;
      record.attempt = { eligible: true, started: false, completed: false };
    } else if (action.type === "success" && !action.manual) {
      const attempt = record.attempt;
      record.receipt = undefined;
      if (attempt?.eligible && attempt.started && attempt.completed && attempt.promise === query.promise) {
        const fingerprint = JSON.stringify(query.state.data);
        if (fingerprint !== undefined) record.receipt = {
          token: {}, state: query.state, data: query.state.data, fingerprint, session: attempt.session,
        };
      }
      attempt?.detach?.();
      if (attempt) attempt.eligible = false;
    } else if (action.type !== "pause" && action.type !== "continue") {
      invalidateProof(record, query);
    }
    publishProof(store);
  });
  return store;
}

export function subscribeAuthorityProof(client: QueryClient, notify: () => void) {
  const store = installProofStore(client);
  store.listeners.add(notify);
  return () => { store.listeners.delete(notify); };
}
export const authorityProofRevision = (client: QueryClient) => proofStores.get(client)?.revision ?? 0;

export function canonicalAuthQuery<T>(client: QueryClient, queryKey: QueryKey) {
  return client.getQueryCache().build<T>(client, client.defaultQueryOptions<T>({ queryKey }));
}

export function authReadReceipt(client: QueryClient, query: ProofQuery | undefined): ReadReceipt | undefined {
  if (!query || client.getQueryCache().get(query.queryHash) !== query) return;
  const receipt = proofStores.get(client)?.records.get(query)?.receipt;
  // The state seal also rejects a manual update before QueryCache listeners receive its action.
  if (!receipt || receipt.state !== query.state || receipt.data !== query.state.data
    || query.state.status !== "success" || query.state.fetchStatus !== "idle"
    || receipt.fingerprint !== JSON.stringify(query.state.data)) return;
  if (query.queryKey[0] === "permissions") {
    const session = client.getQueryCache().find({ queryKey: ["me"], exact: true });
    const sessionReceipt = authReadReceipt(client, session);
    if (!sessionReceipt || receipt.session !== sessionReceipt.token) return;
  }
  return receipt;
}

export async function readCanonicalAuth<T>(
  client: QueryClient, query: ProofQuery, signal: AbortSignal, request: () => Promise<T>,
): Promise<T> {
  const store = proofStores.get(client);
  const record = store?.records.get(query);
  if (!store || !record?.sawFetch || client.getQueryCache().get(query.queryHash) !== query
    || query.state.fetchStatus !== "fetching" || !query.promise || signal.aborted) {
    throw new Error("Authentication query is no longer a current verification");
  }
  let attempt = record.attempt;
  if (!attempt?.eligible) {
    // A silent cancel can replace the retryer without a second fetch action.
    if (query.promise === record.blockedPromise) throw new Error("Authentication verification was interrupted");
    attempt = { eligible: true, started: false, completed: false };
    record.attempt = attempt;
  }
  if (attempt.started) throw new Error("Authentication verification already started");
  if (query.queryKey[0] === "permissions") {
    const session = client.getQueryCache().find({ queryKey: ["me"], exact: true });
    const receipt = authReadReceipt(client, session);
    if (!receipt) throw new Error("A current identity verification is required before permissions");
    attempt.session = receipt.token;
  }
  attempt.started = true;
  attempt.promise = query.promise;
  const abort = () => {
    if (record.attempt === attempt && attempt.eligible) {
      invalidateProof(record, query);
      publishProof(store);
    }
  };
  signal.addEventListener("abort", abort, { once: true });
  attempt.detach = () => signal.removeEventListener("abort", abort);
  try {
    const data = await request();
    if (signal.aborted || record.attempt !== attempt || !attempt.eligible
      || query.promise !== attempt.promise || client.getQueryCache().get(query.queryHash) !== query) {
      throw new Error("Authentication verification was retired before completion");
    }
    attempt.completed = true;
    return data;
  } catch (error) {
    abort();
    throw error;
  }
}

export const permissionQueryKey = (principalId: string | null | undefined, verification: number) =>
  ["permissions", principalId || null, verification] as const;
export function currentPermissionQueryKey(client: QueryClient) {
  const session = client.getQueryState<SessionResponse>(["me"]);
  return permissionQueryKey(session?.data?.user?.id, session?.data?.verification ?? session?.dataUpdatedAt ?? 0);
}

export function normalizePermissionSlugs(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((slug) => typeof slug !== "string" || !slug.trim())) return null;
  return [...new Set(value.map((slug: string) => slug.trim().toLowerCase()))];
}

export function isUnauthorized(error: unknown): boolean {
  return typeof error === "object" && error !== null && "response" in error
    && typeof error.response === "object" && error.response !== null && "status" in error.response
    && error.response.status === 401;
}

function normalizedRoleIdentity(user: SessionUser | undefined) {
  if (!user || (user.role != null && typeof user.role !== "string")
    || (user.roles != null && (!Array.isArray(user.roles) || user.roles.some((role) => typeof role !== "string")))) return null;
  const primary = user.role || null;
  const roles = [...new Set([...(primary ? [primary] : []), ...(user.roles ?? [])].filter(Boolean))].sort();
  return JSON.stringify({ primary, roles });
}

export function readCurrentAuthority(client: QueryClient) {
  const sessionQuery = client.getQueryCache().find({ queryKey: ["me"], exact: true });
  const sessionReceipt = authReadReceipt(client, sessionQuery);
  const session = client.getQueryState<SessionResponse>(["me"]);
  const user = session?.data?.user ?? undefined;
  const principalId = typeof user?.id === "string" && user.id ? user.id : null;
  const permissions = client.getQueryState<CurrentPermissions>(currentPermissionQueryKey(client));
  const permissionQuery = client.getQueryCache().find({ queryKey: currentPermissionQueryKey(client), exact: true });
  const permissionReceipt = authReadReceipt(client, permissionQuery);
  const verifiedRoleIdentity = sessionReceipt ? normalizedRoleIdentity(user) : null;
  const normalized = normalizePermissionSlugs(permissions?.data?.permission_slugs);
  const invalidAuthority = Boolean(user && permissions?.status === "success"
    && (normalized === null || permissions.data?.user_id !== principalId));
  const invalidRoles = Boolean(sessionReceipt && user && verifiedRoleIdentity === null);
  const error = session?.error || permissions?.error
    || (invalidAuthority ? new Error("Invalid current permission response") : null)
    || (invalidRoles ? new Error("Invalid verified role identity") : null)
    || (session?.status === "success" && session.fetchStatus === "idle" && !sessionReceipt
      ? new Error("Identity verification is not current. Retry access.") : null)
    || (permissions?.status === "success" && permissions.fetchStatus === "idle" && !permissionReceipt
      ? new Error("Permission verification is not current. Retry access.") : null);
  let phase: AuthorityPhase;
  if (isUnauthorized(session?.error) || isUnauthorized(permissions?.error)) phase = "unauthenticated";
  else if (!session || session.status === "pending") phase = "checking";
  else if (session.fetchStatus !== "idle") phase = user ? "rechecking" : "checking";
  else if (session.error) phase = "unavailable";
  else if (!sessionReceipt || invalidRoles) phase = "unavailable";
  else if (!user) phase = "unauthenticated";
  else if (!permissions || permissions.status === "pending" || permissions.fetchStatus !== "idle") phase = "rechecking";
  else if (permissions.error || invalidAuthority || !permissionReceipt) phase = "unavailable";
  else phase = "ready";
  return {
    phase, user, principalId, invalidAuthority, error, verifiedRoleIdentity,
    permissionSlugs: phase === "ready" ? normalized ?? [] : [],
  };
}
