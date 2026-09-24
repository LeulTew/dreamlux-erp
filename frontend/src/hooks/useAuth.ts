"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getEffectivePermissions } from "@/lib/api";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPermissionMatcher, hasAnyPermission as matchAnyPermission } from "@/lib/permission-matcher";
import {
  authReadReceipt, authorityProofRevision, canonicalAuthQuery, currentPermissionQueryKey,
  normalizePermissionSlugs, permissionQueryKey, readCanonicalAuth, readCurrentAuthority, subscribeAuthorityProof,
  type CurrentPermissions, type SessionResponse,
} from "@/lib/auth-authority";

type RolePreview = { role: string; slugs: string[] };
type StoredPreview = { storage: Storage; role: string | null; encodedSlugs: string | null };
const PREVIEW_CLEARED_EVENT = "dreamlux:role-preview-cleared";
let lastStoredPreview: StoredPreview | null = null;
let rejectedStoredPreview: StoredPreview | null = null;
let verificationSequence = 0;
const noServerProof = () => 0;

function readPreviewStorage(): StoredPreview {
  const storage = localStorage;
  const snapshot = {
    storage,
    role: storage.getItem("previewRole"),
    encodedSlugs: storage.getItem("previewPermissionSlugs"),
  };
  lastStoredPreview = snapshot;
  return snapshot;
}

function discardStoredPreview() {
  let snapshot = lastStoredPreview;
  try {
    snapshot = readPreviewStorage();
  } catch (error) {
    console.warn("[useAuth] Could not inspect stored role preview before clearing", error);
  }
  try {
    localStorage.removeItem("previewRole");
    localStorage.removeItem("previewPermissionSlugs");
    rejectedStoredPreview = null;
    lastStoredPreview = null;
  } catch (error) {
    // Pending hydration and future consumers must not revive this same snapshot.
    rejectedStoredPreview = snapshot;
    console.warn("[useAuth] Could not clear stored role preview", error);
  }
  window.dispatchEvent(new Event(PREVIEW_CLEARED_EVENT));
}

function readStoredPreview(): RolePreview | null {
  try {
    const { storage, role, encodedSlugs } = readPreviewStorage();
    if (rejectedStoredPreview?.storage === storage
      && rejectedStoredPreview.role === role
      && rejectedStoredPreview.encodedSlugs === encodedSlugs) {
      return null;
    }
    rejectedStoredPreview = null;
    if (role === null && encodedSlugs === null) return null;
    const slugs = encodedSlugs === null ? null : normalizePermissionSlugs(JSON.parse(encodedSlugs));
    if (role?.trim() && slugs !== null) return { role: role.trim(), slugs };
    console.warn("[useAuth] Ignoring invalid role preview");
  } catch (error) {
    console.warn("[useAuth] Could not read stored role preview", error);
  }
  discardStoredPreview();
  return null;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const subscribeProof = useCallback((notify: () => void) => subscribeAuthorityProof(queryClient, notify), [queryClient]);
  const proofRevision = useCallback(() => authorityProofRevision(queryClient), [queryClient]);
  useSyncExternalStore(subscribeProof, proofRevision, noServerProof);
  const [hasMounted, setHasMounted] = useState(false);
  const [preview, setPreview] = useState<RolePreview | null>(null);

  useEffect(() => {
    const clearPreview = () => setPreview(null);
    window.addEventListener(PREVIEW_CLEARED_EVENT, clearPreview);
    const timer = setTimeout(() => {
      setHasMounted(true);
      setPreview(readStoredPreview());
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(PREVIEW_CLEARED_EVENT, clearPreview);
    };
  }, []);

  const sessionQuery = canonicalAuthQuery<SessionResponse>(queryClient, ["me"]);
  const { data, dataUpdatedAt, isLoading, isFetching, error } = useQuery<SessionResponse>({
    queryKey: ["me"],
    queryFn: ({ signal }) => readCanonicalAuth(queryClient, sessionQuery, signal, async () => {
      const { data } = await api.get<SessionResponse>("/auth/me", { signal });
      return { ...data, verification: ++verificationSequence };
    }),
    enabled: hasMounted,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const permissionsKey = permissionQueryKey(data?.user?.id, data?.verification ?? dataUpdatedAt);
  const permissionsQuery = canonicalAuthQuery<CurrentPermissions>(queryClient, permissionsKey);
  const { data: permissionsData, isLoading: permissionsLoading, isFetching: permissionsFetching, isSuccess: permissionsSucceeded, error: permissionsError } = useQuery({
    queryKey: permissionsKey,
    queryFn: ({ signal }) => readCanonicalAuth(queryClient, permissionsQuery, signal, () => getEffectivePermissions({ signal })),
    enabled: hasMounted && !!data?.user && Boolean(authReadReceipt(queryClient, sessionQuery)),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const user = data?.user ?? undefined;

  useEffect(() => {
    if (user && typeof window !== "undefined") {
      try {
        localStorage.setItem("user", JSON.stringify(user));
      } catch (error) {
        console.warn("[useAuth] Could not store the user display snapshot", error);
      }
    }
  }, [user]);

  const normalizedSlugs = normalizePermissionSlugs(permissionsData?.permission_slugs);
  const invalidAuthority = Boolean(user && permissionsSucceeded && (
    normalizedSlugs === null || permissionsData?.user_id !== (user.id || null)
  ));
  const current = readCurrentAuthority(queryClient);
  const authorityReady = hasMounted && current.phase === "ready";
  const rawPermissionSlugs = authorityReady ? current.permissionSlugs : [];
  const actualHasPermission = createPermissionMatcher(rawPermissionSlugs);
  const rawIsAdmin = actualHasPermission("users:manage") || actualHasPermission("settings:write");
  const isPreviewActive = Boolean(preview && authorityReady && rawIsAdmin);
  const previewHasPermission = createPermissionMatcher(preview?.slugs || []);
  const permissionSlugs = isPreviewActive
    ? [...new Set([...rawPermissionSlugs, ...(preview?.slugs || [])])]
      .filter((slug) => actualHasPermission(slug) && previewHasPermission(slug))
    : rawPermissionSlugs;
  const isSuperuser = permissionSlugs.includes("*");

  useEffect(() => {
    if (invalidAuthority) console.error("[useAuth] Invalid current permission response");
  }, [invalidAuthority]);

  useEffect(() => {
    const sessionSettled = hasMounted && !isLoading && !isFetching;
    const authoritySettled = !permissionsLoading && !permissionsFetching && (permissionsSucceeded || Boolean(permissionsError));
    if (preview && sessionSettled && (
      !user || (authoritySettled && (!authorityReady || !rawIsAdmin))
    )) {
      discardStoredPreview();
    }
  }, [preview, hasMounted, isLoading, isFetching, user, permissionsLoading, permissionsFetching,
    permissionsSucceeded, permissionsError, authorityReady, rawIsAdmin]);

  const displayUser = isPreviewActive && user ? {
    ...user,
    username: `${user.username} (Preview: ${preview?.role})`,
  } : user;

  const hasPermission = createPermissionMatcher(permissionSlugs, isSuperuser);

  const hasAnyPermission = (slugs: string[]) => {
    return matchAnyPermission(hasPermission, slugs);
  };

  const clearPreview = () => {
    discardStoredPreview();
  };

  const isAdmin = hasPermission("users:manage") || hasPermission("settings:write");

  const isInventoryController = hasAnyPermission(["assets:read", "assets:write", "assets:reconcile"]);

  const retryCurrent = async () => {
    const query = queryClient.getQueryCache().find({ queryKey: ["me"], exact: true });
    const previous = authReadReceipt(queryClient, query);
    await queryClient.refetchQueries({ queryKey: ["me"], exact: true, type: "active" });
    const currentQuery = queryClient.getQueryCache().find({ queryKey: ["me"], exact: true });
    const completed = authReadReceipt(queryClient, currentQuery);
    const session = queryClient.getQueryState<SessionResponse>(["me"]);
    if (currentQuery === query && completed && completed !== previous && !session?.error && session?.data?.user) {
      await queryClient.refetchQueries(
        { queryKey: currentPermissionQueryKey(queryClient), exact: true, type: "active" },
        { cancelRefetch: false },
      );
    }
  };

  return {
    user: displayUser,
    permissionSlugs,
    isSuperuser,
    isLoading: !hasMounted || isLoading || isFetching || (!!data?.user && (permissionsLoading || permissionsFetching)),
    isSessionResolved: hasMounted && (!isLoading && !isFetching && (!data?.user || (!permissionsLoading && !permissionsFetching))),
    phase: hasMounted ? current.phase : "checking" as const,
    principalId: current.principalId,
    isCurrent: hasMounted && current.phase === "ready",
    retryCurrent,
    isAuthenticated: !!user,
    isAdmin,
    isInventoryController,
    hasPermission,
    hasAnyPermission,
    error: error || permissionsError || (invalidAuthority ? new Error("Invalid current permission response") : current.error),
    isPreviewActive,
    previewRoleName: isPreviewActive ? preview?.role || null : null,
    clearPreview,
    rawIsAdmin,
  };
}
