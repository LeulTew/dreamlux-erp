import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { compare } from "bcryptjs";
import { getEnv } from "../lib/env";
import { pool } from "../db/pool";
import { supabase } from "../db/supabase";
import { ensureBootstrapAdmin } from "../lib/bootstrap-admin";
import { AuthRequest, getEffectivePermissionSlugsFromUser, requireAuth } from "../middleware/auth";
import { PERMISSION_DEFINITIONS } from "../lib/permissions";
import {
  fetchUserRoleContext,
  isMissingColumnError,
  isMissingPermissionRelation,
  resolveEffectivePermissionSlugs,
} from "../lib/permissions-db";

const router = Router();

function isPoolUnreachable(error: unknown): boolean {
  const err = error as { code?: string };
  return err?.code === "ENOTFOUND" || err?.code === "ECONNREFUSED" || err?.code === "ETIMEDOUT";
}

function setTokenCookie(res: Response, token: string) {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

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
      email?: string | null;
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
          u.email,
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
         GROUP BY u.id, u.username, u.email, u.full_name, u.profile_image_url, u.is_active, u.role_id, r.name, r.permissions`,
        [queryUsername, queryPassword]
      );
      rows = queryResult?.rows || [];
    } catch (queryError) {
      if (!isMissingColumnError(queryError, "profile_image_url") && !isMissingPermissionRelation(queryError)) {
        throw queryError;
      }

      const queryResult = await pool.query(
        `SELECT u.id, u.username, u.email, u.full_name, NULL::text as profile_image_url, u.is_active, u.role_id, r.name as role_name, r.permissions
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
              permission_slugs: resolveEffectivePermissionSlugs(undefined, adminUser.permissions, [adminUser.role_name], "legacy"),
            },
            jwtSecret,
            { expiresIn: '7d' },
          );
          setTokenCookie(res, token);
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
          setTokenCookie(res, token);
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

    const roleContext = await fetchUserRoleContext(user.id);
    if (!roleContext.userExists) {
      res.status(401).json({ error: "Account is unavailable" });
      return;
    }
    const { roleNames, permissions, permissionSlugs } = roleContext;

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: roleNames[0] || "",
        roles: roleNames,
        permissions,
        permission_slugs: permissionSlugs,
      },
      jwtSecret,
      { expiresIn: "7d" }
    );

    setTokenCookie(res, token);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: roleNames[0] || "",
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
          email?: string | null;
          full_name: string;
          profile_image_url?: string | null;
          is_active: boolean;
          role_id: string;
          password_hash: string;
        }> = [];
        let userError: unknown = null;

        const extended = await supabase
          .from("users")
          .select("id, username, email, full_name, profile_image_url, is_active, role_id, password_hash")
          .eq("username", queryUsername)
          .limit(1);

        if (!extended.error) {
          userRows = extended.data || [];
        } else if (isMissingColumnError(extended.error, "profile_image_url")) {
          const basic = await supabase
            .from("users")
            .select("id, username, email, full_name, is_active, role_id, password_hash")
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

            const roleContext = await fetchUserRoleContext(candidate.id);
            if (!roleContext.userExists) {
              res.status(401).json({ error: "Account is unavailable" });
              return;
            }
            const { roleNames, permissions, permissionSlugs } = roleContext;
            const roleName = roleNames[0] || "";

            const token = jwt.sign(
              {
                id: candidate.id,
                username: candidate.username,
                email: candidate.email,
                full_name: candidate.full_name,
                role: roleName,
                roles: roleNames,
                permissions,
                permission_slugs: permissionSlugs,
              },
              jwtSecret,
              { expiresIn: "7d" }
            );

            setTokenCookie(res, token);
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
      setTokenCookie(res, token);
      res.json({ token, user: { username: 'admin', role: 'SUPER_ADMIN', profile_image_url: null } });
      return;
    }
    res.status(500).json({ error: "Authentication service unavailable" });
  }
});

router.get("/me", requireAuth, (req: AuthRequest, res: Response) => {
  const permissionSlugs = getEffectivePermissionSlugsFromUser(req.user);
  res.json({
    user: {
      id: req.user?.id,
      username: req.user?.username,
      email: (req.user as any)?.email,
      full_name: (req.user as any)?.full_name,
      role: req.user?.role,
      roles: req.user?.roles || (req.user?.role ? [req.user.role] : []),
      permissions: req.user?.permissions,
      permission_slugs: permissionSlugs,
    },
  });
});

router.get("/permissions", requireAuth, (req: AuthRequest, res: Response) => {
  const roleNames = req.user?.roles || (req.user?.role ? [req.user.role] : []);
  const permissionSlugs = getEffectivePermissionSlugsFromUser(req.user);
  res.json({
    user_id: req.user?.id || null,
    role: roleNames[0] || req.user?.role || null,
    roles: roleNames,
    permission_slugs: permissionSlugs,
    is_superuser: permissionSlugs.includes("*"),
    catalog: PERMISSION_DEFINITIONS,
  });
});

router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.json({ message: "Successfully logged out" });
});

export default router;
