"use client";

import { useQuery } from "@tanstack/react-query";
import { api, getEffectivePermissions } from "@/lib/api";
import type { User } from "@/lib/types";
import { useEffect, useState } from "react";
import { createPermissionMatcher, hasAnyPermission as matchAnyPermission } from "@/lib/permission-matcher";

interface AuthResponse {
  user: User;
}

type RolePreview = { role: string; slugs: string[] };
type StoredPreview = { storage: Storage; role: string | null; encodedSlugs: string | null };
const PREVIEW_CLEARED_EVENT = "dreamlux:role-preview-cleared";
let lastStoredPreview: StoredPreview | null = null;
let rejectedStoredPreview: StoredPreview | null = null;

function normalizeSlugs(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((slug) => typeof slug !== "string" || !slug.trim())) {
    return null;
  }
  return [...new Set(value.map((slug: string) => slug.trim().toLowerCase()))];
}

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
    const slugs = encodedSlugs === null ? null : normalizeSlugs(JSON.parse(encodedSlugs));
    if (role?.trim() && slugs !== null) return { role: role.trim(), slugs };
    console.warn("[useAuth] Ignoring invalid role preview");
  } catch (error) {
    console.warn("[useAuth] Could not read stored role preview", error);
  }
  discardStoredPreview();
  return null;
}

export function useAuth() {
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

  const { data, isLoading, isFetching, error } = useQuery<AuthResponse>({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await api.get<AuthResponse>("/auth/me");
      return data;
    },
    enabled: hasMounted,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: permissionsData, isLoading: permissionsLoading, error: permissionsError } = useQuery({
    queryKey: ["permissions"],
    queryFn: getEffectivePermissions,
    enabled: hasMounted && !!data?.user,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const user = data?.user;

  useEffect(() => {
    if (user && typeof window !== "undefined") {
      try {
        localStorage.setItem("user", JSON.stringify(user));
      } catch (error) {
        console.warn("[useAuth] Could not store the user display snapshot", error);
      }
    }
  }, [user]);

  const normalizedSlugs = normalizeSlugs(permissionsData?.permission_slugs);
  const invalidAuthority = Boolean(user && permissionsData && (
    normalizedSlugs === null || permissionsData.user_id !== (user.id || null)
  ));
  const authorityReady = Boolean(user && !error && permissionsData && !permissionsError && !invalidAuthority);
  const rawPermissionSlugs = authorityReady ? normalizedSlugs || [] : [];
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
    const authoritySettled = !permissionsLoading && Boolean(permissionsData || permissionsError);
    if (preview && sessionSettled && (
      !user || (authoritySettled && (!authorityReady || !rawIsAdmin))
    )) {
      discardStoredPreview();
    }
  }, [preview, hasMounted, isLoading, isFetching, user, permissionsLoading,
    permissionsData, permissionsError, authorityReady, rawIsAdmin]);

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

  return {
    user: displayUser,
    permissionSlugs,
    isSuperuser,
    isLoading: !hasMounted || isLoading || isFetching || (!!data?.user && permissionsLoading),
    isSessionResolved: hasMounted && (!isLoading && !isFetching && (!data?.user || !permissionsLoading)),
    isAuthenticated: !!user,
    isAdmin,
    isInventoryController,
    hasPermission,
    hasAnyPermission,
    error: error || permissionsError || (invalidAuthority ? new Error("Invalid current permission response") : null),
    isPreviewActive,
    previewRoleName: isPreviewActive ? preview?.role || null : null,
    clearPreview,
    rawIsAdmin,
  };
}
