"use client";

import { useQuery } from "@tanstack/react-query";
import { api, getEffectivePermissions } from "@/lib/api";
import { User } from "@/lib/types";
import { useEffect, useState } from "react";
import { createPermissionMatcher, hasAnyPermission as matchAnyPermission } from "@/lib/permission-matcher";

interface AuthResponse {
  user: User;
}

export function useAuth() {
  const [hasMounted, setHasMounted] = useState(false);
  const [previewRole, setPreviewRole] = useState<string | null>(null);
  const [previewSlugs, setPreviewSlugs] = useState<string[] | null>(null);

  useEffect(() => {
    setHasMounted(true);
    const pRole = localStorage.getItem("previewRole");
    const pSlugs = localStorage.getItem("previewPermissionSlugs");
    if (pRole && pSlugs) {
      setPreviewRole(pRole);
      try {
        setPreviewSlugs(JSON.parse(pSlugs));
      } catch {
        // ignore
      }
    }
  }, []);

  const { data, isLoading, error, isError } = useQuery<AuthResponse>({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await api.get<AuthResponse>("/auth/me");
      return data;
    },
    enabled: hasMounted,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: permissionsData, isLoading: permissionsLoading } = useQuery({
    queryKey: ["permissions"],
    queryFn: getEffectivePermissions,
    enabled: hasMounted && !!data?.user,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const user = data?.user;

  useEffect(() => {
    if (user && typeof window !== "undefined") {
      localStorage.setItem("user", JSON.stringify(user));
    }
  }, [user]);

  const rawPermissionSlugs = permissionsData?.permission_slugs || [];

  const isPreviewActive = !!previewRole && !!previewSlugs;
  const permissionSlugs = isPreviewActive ? previewSlugs! : rawPermissionSlugs;
  const isSuperuser = isPreviewActive
    ? (previewRole!.toUpperCase() === "SUPER_ADMIN" || previewRole!.toUpperCase() === "OWNER" || previewRole!.toUpperCase() === "ADMIN" || previewSlugs!.includes("*"))
    : !!permissionsData?.is_superuser;

  const displayUser = isPreviewActive && user ? {
    ...user,
    role: previewRole!,
    roles: [previewRole!],
    username: `${user.username} (Preview: ${previewRole})`,
  } : user;

  const hasPermission = createPermissionMatcher(permissionSlugs, isSuperuser);

  const hasAnyPermission = (slugs: string[]) => {
    return matchAnyPermission(hasPermission, slugs);
  };

  const clearPreview = () => {
    localStorage.removeItem("previewRole");
    localStorage.removeItem("previewPermissionSlugs");
    window.location.reload();
  };

  const rawIsAdmin = !!permissionsData?.is_superuser || rawPermissionSlugs.includes("users:manage") || rawPermissionSlugs.includes("settings:write");
  const isAdmin = isPreviewActive
    ? (isSuperuser || permissionSlugs.includes("users:manage") || permissionSlugs.includes("settings:write"))
    : (isSuperuser || permissionSlugs.includes("users:manage") || permissionSlugs.includes("settings:write"));

  const isInventoryController = isPreviewActive
    ? (isSuperuser || permissionSlugs.includes("assets:read") || permissionSlugs.includes("assets:write") || permissionSlugs.includes("assets:reconcile"))
    : (isSuperuser || permissionSlugs.includes("assets:read") || permissionSlugs.includes("assets:write") || permissionSlugs.includes("assets:reconcile"));

  return {
    user: displayUser,
    permissionSlugs,
    isSuperuser,
    isLoading: !hasMounted || isLoading || (!!data?.user && permissionsLoading),
    isSessionResolved: hasMounted && (!isLoading && (!data?.user || !permissionsLoading)),
    isAuthenticated: !!user,
    isAdmin,
    isInventoryController,
    hasPermission,
    hasAnyPermission,
    error,
    isPreviewActive,
    previewRoleName: previewRole,
    clearPreview,
    rawIsAdmin,
  };
}
