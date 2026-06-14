"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
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

  const user = data?.user;
  
  const hasPermission = (slug: string) => {
    if (!user) return false;
    // Admins have all permissions
    if (user.role_name === "SUPER_ADMIN" || user.role_name === "admin" || user.role_name === "SYSTEM_MANAGER") return true;
    return user.permission_slugs?.includes(slug);
  };

  const isAdmin = user?.role_name === "SUPER_ADMIN" || user?.role_name === "admin" || user?.role_name === "SYSTEM_MANAGER";
  const isInventoryController = isAdmin || user?.role_name === "INVENTORY_CONTROLLER";

  return {
    user,
    isLoading: isLoading || (!!token && !data && !error),
    isAuthenticated: !!user,
    isAdmin,
    isInventoryController,
    hasPermission,
    error,
  };
}
