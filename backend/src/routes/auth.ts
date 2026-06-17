import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { compare } from "bcryptjs";
import { getEnv } from "../lib/env";
import { pool } from "../db/pool";
import { supabase } from "../db/supabase";
import { ensureBootstrapAdmin } from "../lib/bootstrap-admin";
import { AuthRequest, requireAuth } from "../middleware/auth";
import {
  normalizePermissionMap,
  normalizePermissionSlugs,
  permissionMapToSlugs,
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

function resolvePermissionSlugs(rawSlugs: unknown, rawMap: unknown): string[] {
  const explicit = normalizePermissionSlugs(rawSlugs);
  const mapDerived = permissionMapToSlugs(normalizePermissionMap(rawMap));
  return [...new Set([...explicit, ...mapDerived])];
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
          r.name as role_name,
          r.permissions,
          COALESCE(array_agg(p.slug) FILTER (WHERE p.slug IS NOT NULL), '{}') AS permission_slugs
         FROM users u
         JOIN roles r ON u.role_id = r.id
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id
         WHERE u.username = $1 AND u.password_hash = crypt($2, u.password_hash)
         GROUP BY u.id, u.username, u.full_name, u.profile_image_url, u.is_active, r.name, r.permissions`,
        [queryUsername, queryPassword]
      );
      rows = queryResult?.rows || [];
    } catch (queryError) {
      if (!isMissingColumnError(queryError) && !isMissingRelationError(queryError)) {
        throw queryError;
      }

      const queryResult = await pool.query(
        `SELECT u.id, u.username, u.full_name, NULL::text as profile_image_url, u.is_active, r.name as role_name, r.permissions
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
              permission_slugs: resolvePermissionSlugs(undefined, adminUser.permissions),
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

    const permissionSlugs = resolvePermissionSlugs(user.permission_slugs, user.permissions);

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role_name,
        permissions: user.permissions,
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
        role: user.role_name,
        profile_image_url: user.profile_image_url || null,
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
            const permissionSlugs = resolvePermissionSlugs(undefined, permissions);

            const token = jwt.sign(
              {
                id: candidate.id,
                username: candidate.username,
                role: roleName,
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
                profile_image_url: candidate.profile_image_url || null,
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
  res.json({
    user: {
      id: req.user?.id,
      username: req.user?.username,
      role: req.user?.role,
      permissions: req.user?.permissions,
      permission_slugs: req.user?.permission_slugs || [],
    },
  });
});

export default router;
