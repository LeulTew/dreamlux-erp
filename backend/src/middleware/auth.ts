import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getEnv } from "../lib/env";
import {
  hasPermissionSlug,
  normalizePermissionMap,
  normalizeRoleName,
  normalizePermissionSlugs,
  permissionMapToSlugs,
  roleNamesToPermissionSlugs,
} from "../lib/permissions";

export interface AuthRequest extends Request {
  user?: {
    id?: string;
    username: string;
    role: string;
    roles?: string[];
    permissions?: Record<string, unknown>;
    permission_slugs?: string[];
  };
  admin?: boolean; // legacy flag
}

export function getEffectivePermissionSlugsFromUser(user: AuthRequest["user"]): string[] {
  if (!user) return [];

  const explicit = normalizePermissionSlugs(user.permission_slugs);
  const mapDerived = permissionMapToSlugs(normalizePermissionMap(user.permissions));
  const roleDerived = roleNamesToPermissionSlugs([user.role, ...(user.roles || [])]);
  return [...new Set([...explicit, ...mapDerived, ...roleDerived])];
}

function getEffectivePermissionSlugs(req: AuthRequest): string[] {
  return getEffectivePermissionSlugsFromUser(req.user);
}

function requestHasPermission(req: AuthRequest, requiredSlug: string): boolean {
  if (!req.user) {
    return false;
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
    req.admin = getEffectivePermissionSlugsFromUser(payload).includes("*");
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (requestHasPermission(req, "users:manage")) {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden: Administrator privileges required" });
  });
}

export function requireRole(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(403).json({ error: "Forbidden: Insufficient privileges" });
      return;
    }

    const userRoles = [req.user.role, ...(req.user.roles || [])].map(normalizeRoleName);
    const requestedRoles = roles.map(normalizeRoleName);
    const roleMatch = requestedRoles.some((roleName) => userRoles.includes(roleName));
    if (roleMatch && requestHasPermission(req, "*")) {
      next();
      return;
    }

    const mappedSlugs = roleNamesToPermissionSlugs(roles);

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


