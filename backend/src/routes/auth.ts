import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { compare } from "bcryptjs";
import { getEnv } from "../lib/env";
import { pool } from "../db/pool";
import { supabase } from "../db/supabase";
import { ensureBootstrapAdmin } from "../lib/bootstrap-admin";
import { AuthRequest, requireAuth } from "../middleware/auth";
import {
  PERMISSION_DEFINITIONS,
  normalizePermissionMap,
  normalizeRoleName,
} from "../lib/permissions";

const router = Router();

function isPoolUnreachable(error: unknown): boolean {
  const err = error as { code?: string };
  return err?.code === "ENOTFOUND" || err?.code === "ECONNREFUSED" || err?.code === "ETIMEDOUT";
}

function isMissingColumnError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  return err?.code === "42703" || (err?.message || "").toLowerCase().includes("column");
}

function isMissingRelationError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  return err?.code === "42P01" || (err?.message || "").toLowerCase().includes("relation") && (err?.message || "").toLowerCase().includes("does not exist");
}

import {
  fetchUserRoleContext,
  resolveEffectivePermissionSlugs,
} from "../lib/permissions-db";

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  const jwtSecret = getEnv("JWT_SECRET", "dev-secret");

  // Fallback to 'admin' username if the frontend only sends a password field (transitional)
  const queryUsername = username || 'admin';
  const queryPassword = password;

  if (!queryPassword) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  try {
    let rows: Array<{
      id: string;
      username: string;
      full_name: string;
      is_active: boolean;
      role_name: string;
      permissions: Record<string, unknown>;
      permission_slugs?: string[];
      profile_image_url?: string | null;
    }> = [];

    try {
      const queryResult = await pool.query(
        `SELECT
          u.id,
          u.username,
          u.full_name,
          u.profile_image_url,
          u.is_active,
          u.role_id,
          r.name as role_name,
          r.permissions,
          COALESCE(array_agg(p.slug) FILTER (WHERE p.slug IS NOT NULL), '{}') AS permission_slugs
         FROM users u
         JOIN roles r ON u.role_id = r.id
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id
         WHERE u.username = $1 AND u.password_hash = crypt($2, u.password_hash)
         GROUP BY u.id, u.username, u.full_name, u.profile_image_url, u.is_active, u.role_id, r.name, r.permissions`,
        [queryUsername, queryPassword]
      );
      rows = queryResult?.rows || [];
    } catch (queryError) {
      if (!isMissingColumnError(queryError) && !isMissingRelationError(queryError)) {
        throw queryError;
      }

      const queryResult = await pool.query(
        `SELECT u.id, u.username, u.full_name, NULL::text as profile_image_url, u.is_active, u.role_id, r.name as role_name, r.permissions
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.username = $1 AND u.password_hash = crypt($2, u.password_hash)`,
        [queryUsername, queryPassword]
      );
      rows = queryResult?.rows || [];
    }

    if (rows.length === 0) {
      // Legacy fallback
      const adminPassword = getEnv("ADMIN_PASSWORD", "admin");
      if (queryUsername === 'admin' && queryPassword === adminPassword) {
        try {
          const adminUser = await ensureBootstrapAdmin(adminPassword);
          const token = jwt.sign(
            {
              id: adminUser.id,
              username: adminUser.username,
              role: adminUser.role_name,
              permissions: adminUser.permissions,
              roles: [adminUser.role_name],
              permission_slugs: resolveEffectivePermissionSlugs(undefined, adminUser.permissions, [adminUser.role_name]),
            },
            jwtSecret,
            { expiresIn: '7d' },
          );
          res.json({
            token,
            user: {
              id: adminUser.id,
              username: adminUser.username,
              full_name: adminUser.full_name,
              role: adminUser.role_name,
              profile_image_url: null,
            },
          });
        } catch {
          const token = jwt.sign({ username: 'admin', role: 'SUPER_ADMIN', permissions: { all: true }, permission_slugs: ['*'] }, jwtSecret, { expiresIn: '7d' });
          res.json({ token, user: { username: 'admin', role: 'SUPER_ADMIN', profile_image_url: null } });
        }
        return;
      }
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const user = rows[0];

    if (!user.is_active) {
      res.status(403).json({ error: "Account is disabled" });
      return;
    }

    let roleNames = [user.role_name];
    let permissions = user.permissions;
    let permissionSlugs = resolveEffectivePermissionSlugs(user.permission_slugs, user.permissions, roleNames);

    try {
      const roleContext = await fetchUserRoleContext(user.id, (user as any).role_id);
      if (roleContext.roleNames.length > 0) {
        roleNames = roleContext.roleNames;
        permissions = roleContext.permissions;
        permissionSlugs = roleContext.permissionSlugs;
      }
    } catch (roleContextError) {
      if (!isMissingColumnError(roleContextError) && !isMissingRelationError(roleContextError)) {
        throw roleContextError;
      }
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: roleNames[0] || user.role_name,
        roles: roleNames,
        permissions,
        permission_slugs: permissionSlugs,
      },
      jwtSecret,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: roleNames[0] || user.role_name,
        roles: roleNames,
        profile_image_url: user.profile_image_url || null,
        permission_slugs: permissionSlugs,
      },
    });

  } catch (error) {
    console.error('Login error:', error);

    if (isPoolUnreachable(error)) {
      try {
        let userRows: Array<{
          id: string;
          username: string;
          full_name: string;
          profile_image_url?: string | null;
          is_active: boolean;
          role_id: string;
          password_hash: string;
        }> = [];
        let userError: unknown = null;

        const extended = await supabase
          .from("users")
          .select("id, username, full_name, profile_image_url, is_active, role_id, password_hash")
          .eq("username", queryUsername)
          .limit(1);

        if (!extended.error) {
          userRows = extended.data || [];
        } else if (isMissingColumnError(extended.error)) {
          const basic = await supabase
            .from("users")
            .select("id, username, full_name, is_active, role_id, password_hash")
            .eq("username", queryUsername)
            .limit(1);
          userError = basic.error;
          userRows = (basic.data || []).map((row: any) => ({ ...row, profile_image_url: null }));
        } else {
          userError = extended.error;
        }

        if (!userError && (userRows || []).length > 0) {
          const candidate = userRows[0];

          const passOk = candidate.password_hash ? await compare(queryPassword, candidate.password_hash) : false;

          if (passOk) {
            if (!candidate.is_active) {
              res.status(403).json({ error: "Account is disabled" });
              return;
            }

            const { data: roleRows } = await supabase
              .from("roles")
              .select("name, permissions")
              .eq("id", candidate.role_id)
              .limit(1);

            const roleName = roleRows?.[0]?.name || "UNKNOWN";
            const permissions = normalizePermissionMap(roleRows?.[0]?.permissions);
            const roleNames = [roleName];
            const permissionSlugs = resolveEffectivePermissionSlugs(undefined, permissions, roleNames);

            const token = jwt.sign(
              {
                id: candidate.id,
                username: candidate.username,
                role: roleName,
                roles: roleNames,
                permissions,
                permission_slugs: permissionSlugs,
              },
              jwtSecret,
              { expiresIn: "7d" }
            );

            res.json({
              token,
              user: {
                id: candidate.id,
                username: candidate.username,
                full_name: candidate.full_name,
                role: roleName,
                roles: roleNames,
                profile_image_url: candidate.profile_image_url || null,
                permission_slugs: permissionSlugs,
              },
            });
            return;
          }
        }
      } catch (fallbackError) {
        console.error("Supabase login fallback error:", fallbackError);
      }
    }

    const adminPassword = getEnv("ADMIN_PASSWORD", "admin");
    if (queryUsername === 'admin' && queryPassword === adminPassword) {
      const token = jwt.sign({ username: 'admin', role: 'SUPER_ADMIN', permissions: { all: true }, permission_slugs: ['*'] }, jwtSecret, { expiresIn: '7d' });
      res.json({ token, user: { username: 'admin', role: 'SUPER_ADMIN', profile_image_url: null } });
      return;
    }
    res.status(500).json({ error: "Authentication service unavailable" });
  }
});

router.get("/me", requireAuth, (req: AuthRequest, res: Response) => {
  const permissionSlugs = resolveEffectivePermissionSlugs(
    req.user?.permission_slugs,
    req.user?.permissions,
    [req.user?.role, ...(req.user?.roles || [])].filter((role): role is string => Boolean(role)),
  );
  res.json({
    user: {
      id: req.user?.id,
      username: req.user?.username,
      role: req.user?.role,
      roles: req.user?.roles || (req.user?.role ? [req.user.role] : []),
      permissions: req.user?.permissions,
      permission_slugs: permissionSlugs,
    },
  });
});

router.get("/permissions", requireAuth, async (req: AuthRequest, res: Response) => {
  const tokenRoles = [req.user?.role, ...(req.user?.roles || [])].filter((role): role is string => Boolean(role));
  let roleNames = tokenRoles;
  let permissionSlugs = resolveEffectivePermissionSlugs(req.user?.permission_slugs, req.user?.permissions, tokenRoles);

  if (req.user?.id) {
    try {
      const roleContext = await fetchUserRoleContext(req.user.id);
      if (roleContext.roleNames.length > 0) {
        roleNames = roleContext.roleNames;
        permissionSlugs = roleContext.permissionSlugs;
      }
    } catch (error) {
      if (!isMissingColumnError(error) && !isMissingRelationError(error) && !isPoolUnreachable(error)) {
        console.error("Effective permissions error:", error);
        res.status(500).json({ error: "Failed to resolve effective permissions" });
        return;
      }
    }
  }

  res.json({
    user_id: req.user?.id || null,
    role: roleNames[0] || req.user?.role || null,
    roles: roleNames,
    permission_slugs: permissionSlugs,
    is_superuser: permissionSlugs.includes("*") || roleNames.some((role) => ["super_admin", "admin", "owner"].includes(normalizeRoleName(role))),
    catalog: PERMISSION_DEFINITIONS,
  });
});

export default router;
