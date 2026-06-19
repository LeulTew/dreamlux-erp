"use client";

import { useQuery } from "@tanstack/react-query";
import { api, getEffectivePermissions } from "@/lib/api";
import { User } from "@/lib/types";
import { useEffect, useState } from "react";

interface AuthResponse {
  user: User;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Read from localStorage once mounted
    const stored = localStorage.getItem("token");
    if (stored) {
      // Defer to avoid "synchronous setState in effect" lint error
      Promise.resolve().then(() => setToken(stored));
    }
  }, []);

  const { data, isLoading, error } = useQuery<AuthResponse>({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await api.get<AuthResponse>("/auth/me");
      return data;
    },
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: permissionsData, isLoading: permissionsLoading } = useQuery({
    queryKey: ["permissions"],
    queryFn: getEffectivePermissions,
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const user = data?.user;
  const permissionSlugs = permissionsData?.permission_slugs || [];
  const isSuperuser = !!permissionsData?.is_superuser;

  const hasPermission = (slug: string) => {
    if (isSuperuser) return true;
    if (permissionSlugs.includes("*")) return true;
    if (permissionSlugs.includes(slug)) return true;

    const moduleName = slug.split(":")[0];
    if (moduleName && permissionSlugs.includes(`${moduleName}:*`)) return true;

    return false;
  };

  const hasAnyPermission = (slugs: string[]) => {
    return slugs.some((slug) => hasPermission(slug));
  };

  const isAdmin = isSuperuser || hasPermission("users:manage") || hasPermission("settings:write");
  const isInventoryController = isAdmin || hasPermission("assets:read") || hasPermission("assets:write") || hasPermission("assets:reconcile");

  return {
    user,
    permissionSlugs,
    isSuperuser,
    isLoading: isLoading || permissionsLoading || (!!token && !data && !error),
    isAuthenticated: !!user,
    isAdmin,
    isInventoryController,
    hasPermission,
    hasAnyPermission,
    error,
  };
}

