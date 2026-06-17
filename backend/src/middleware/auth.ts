import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getEnv } from "../lib/env";
import {
  hasPermissionSlug,
  normalizePermissionMap,
  normalizePermissionSlugs,
  permissionMapToSlugs,
} from "../lib/permissions";

export interface AuthRequest extends Request {
  user?: {
    id?: string;
    username: string;
    role: string;
    permissions?: Record<string, unknown>;
    permission_slugs?: string[];
  };
  admin?: boolean; // legacy flag
}

const ROLE_PERMISSION_FALLBACK: Record<string, string[]> = {
  super_admin: ["*"],
  admin: ["*"],
  system_manager: ["users:manage", "settings:write"],
  inventory_controller: ["assets:read", "assets:write", "assets:reconcile", "assets:delete"],
  viewer: ["assets:read"],
  sales_rep: ["assets:read"],
  hr_manager: ["hr:read", "hr:write"],
};

function getEffectivePermissionSlugs(req: AuthRequest): string[] {
  const explicit = normalizePermissionSlugs(req.user?.permission_slugs);
  const mapDerived = permissionMapToSlugs(normalizePermissionMap(req.user?.permissions));
  const roleKey = req.user?.role?.toLowerCase?.() || "";
  const roleDerived = ROLE_PERMISSION_FALLBACK[roleKey] || [];
  return [...new Set([...explicit, ...mapDerived, ...roleDerived])];
}

function requestHasPermission(req: AuthRequest, requiredSlug: string): boolean {
  if (!req.user) {
    return false;
  }

  if (req.user.role === "SUPER_ADMIN" || req.user.role === "admin") {
    return true;
  }

  return hasPermissionSlug(getEffectivePermissionSlugs(req), requiredSlug);
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  // Allow OPTIONS (preflight) requests
  if (req.method === "OPTIONS") {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const secret = getEnv("JWT_SECRET", "dev-secret");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, secret) as any;
    req.user = payload;
    req.admin = payload.role === "SUPER_ADMIN" || payload.role === "admin";
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// Alias for backward compatibility
export const requireAdmin = requireAuth;

export function requireRole(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(403).json({ error: "Forbidden: Insufficient privileges" });
      return;
    }

    const roleMatch = roles.includes(req.user.role) || req.user.role === "SUPER_ADMIN";
    if (roleMatch) {
      next();
      return;
    }

    const mappedSlugs = roles.flatMap((roleName) => {
      const key = roleName.toLowerCase();
      return ROLE_PERMISSION_FALLBACK[key] || [];
    });

    if (mappedSlugs.some((slug) => requestHasPermission(req, slug))) {
      next();
      return;
    }

    res.status(403).json({ error: "Forbidden: Insufficient privileges" });
  };
}

export function requirePermissionSlugs(slugs: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const allowed = slugs.some((slug) => requestHasPermission(req, slug));
    if (!allowed) {
      res.status(403).json({ error: "Forbidden: Missing required permission" });
      return;
    }
    next();
  };
}

export function requirePermissions(module: string, action: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const requiredSlug = `${module}:${action}`;
    if (requestHasPermission(req, requiredSlug)) {
      next();
      return;
    }

    res.status(403).json({ error: "Forbidden: Missing required permission" });
  };
}


