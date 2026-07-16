import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getEnv } from "../lib/env";
import {
  hasPermissionSlug,
  normalizePermissionMap,
  normalizePermissionSlugs,
  permissionMapToSlugs,
  roleNamesToPermissionSlugs,
} from "../lib/permissions";
import { getCachedUserPermissions, setCachedUserPermissions } from "../lib/permissions-cache";
import { fetchUserRoleContext } from "../lib/permissions-db";

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
  permissionLookupFailed?: boolean;
}

export function getEffectivePermissionSlugsFromUser(user: AuthRequest["user"]): string[] {
  if (!user) return [];

  const explicit = normalizePermissionSlugs(user.permission_slugs);
  const mapDerived = permissionMapToSlugs(normalizePermissionMap(user.permissions));
  if (explicit.length > 0 || mapDerived.length > 0) {
    return [...new Set([...explicit, ...mapDerived])];
  }

  const roleDerived = roleNamesToPermissionSlugs([user.role, ...(user.roles || [])]);
  return [...new Set(roleDerived)];
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

function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split("=");
    if (key) {
      cookies[key.trim()] = valueParts.join("=").trim();
    }
  }
  return cookies;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  // Allow OPTIONS (preflight) requests
  if (req.method === "OPTIONS") {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const secret = getEnv("JWT_SECRET", "dev-secret");

  let token: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies.token;
  }

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as any;

    if (payload && payload.id) {
      let cached = getCachedUserPermissions(payload.id);
      const shouldQueryDB = process.env.NODE_ENV !== "test" || (typeof payload.id === "string" && payload.id.startsWith("verify-db-"));
      if (!cached && shouldQueryDB) {
        try {
          const roleContext = await fetchUserRoleContext(payload.id);
          if (roleContext.userExists === false) {
            // Valid signature but the user row is gone (e.g. re-seeded DB).
            // Without this, JWT-embedded slugs pass authorization and writes
            // blow up with created_by FK violations / 500s (issue #182).
            res.status(401).json({ error: "Your session is no longer valid. Please sign in again." });
            return;
          }
          if (roleContext.roleNames.length > 0) {
            cached = {
              permissionSlugs: roleContext.permissionSlugs,
              roleNames: roleContext.roleNames,
            };
            setCachedUserPermissions(payload.id, cached);
          }
        } catch (dbError) {
          console.error("[AuthMiddleware] DB permission lookup failed:", dbError);
          req.permissionLookupFailed = true;
        }
      }

      if (cached) {
        payload.roles = cached.roleNames;
        payload.role = cached.roleNames[0] || payload.role;
        payload.permission_slugs = cached.permissionSlugs;
      }
    }

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

    if (requestHasPermission(req, "*")) {
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
    if (req.permissionLookupFailed) {
      res.status(503).json({ error: "Permission lookup unavailable" });
      return;
    }

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
    if (req.permissionLookupFailed) {
      res.status(503).json({ error: "Permission lookup unavailable" });
      return;
    }

    const requiredSlug = `${module}:${action}`;
    if (requestHasPermission(req, requiredSlug)) {
      next();
      return;
    }

    res.status(403).json({ error: "Forbidden: Missing required permission" });
  };
}
