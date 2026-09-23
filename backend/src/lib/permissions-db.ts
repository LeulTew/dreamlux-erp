import { pool } from "../db/pool";
import { supabase } from "../db/supabase";
import {
  normalizePermissionMap,
  normalizePermissionSlugs,
  normalizeRoleName,
  permissionMapToSlugs,
} from "./permissions";

export type PermissionSource = "current" | "legacy";

type UserRoleRow = {
  role_id: string | null;
  role_ids?: unknown;
};

type RolePermissionRow = {
  name: string;
  permissions: unknown;
  permission_slugs?: unknown;
};

type SupabaseRoleRow = RolePermissionRow & { id: string };
type RolePermissionLink = { role_id: string; permission_id: string };
type PermissionRow = { id: string; slug: string };
type SupabaseRows<T> = { data: T[] | null; error: unknown };

function isPoolUnreachable(error: unknown): boolean {
  const err = error as { code?: string; errno?: number };
  return (
    err?.code === "ENOTFOUND" ||
    err?.code === "ECONNREFUSED" ||
    err?.code === "ETIMEDOUT"
  );
}

export function isMissingColumnError(error: unknown, column: "role_ids" | "profile_image_url"): boolean {
  const err = error as { code?: string; message?: string };
  const message = (err?.message || "").toLowerCase();
  return err?.code === "42703" && new RegExp(`\\b${column}\\b`).test(message);
}

export function isMissingPermissionRelation(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  const message = (err?.message || "").toLowerCase();
  return err?.code === "42P01"
    && /relation ["'](?:public\.)?(?:role_permissions|permissions)["'] does not exist/.test(message);
}

export function resolvePermissionSlugs(
  rawSlugs: unknown,
  rawMap: unknown,
  source: PermissionSource = "current",
): string[] {
  return source === "legacy"
    ? permissionMapToSlugs(normalizePermissionMap(rawMap))
    : normalizePermissionSlugs(rawSlugs);
}

export function resolveEffectivePermissionSlugs(
  rawSlugs: unknown,
  rawMap: unknown,
  currentRoleNames: string[],
  source: PermissionSource = "current",
): string[] {
  const slugs = resolvePermissionSlugs(rawSlugs, rawMap, source);
  const names = currentRoleNames.map(normalizeRoleName);
  if (names.some((name) => ["super_admin", "admin", "owner"].includes(name))) {
    return [...new Set([...slugs, "*"])];
  }
  return slugs;
}

export function normalizeRoleIds(roleId: unknown, roleIdsRaw: unknown): string[] {
  const ids = Array.isArray(roleIdsRaw)
    ? roleIdsRaw.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())
    : [];
  if (typeof roleId === "string" && roleId.trim()) ids.push(roleId.trim());
  return [...new Set(ids)];
}

export async function fetchUserRoleContext(userId: string, _primaryRoleId?: string) {
  let rows: UserRoleRow[];
  try {
    const res = await pool.query<UserRoleRow>(
      `SELECT role_ids, role_id FROM users WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL LIMIT 1`,
      [userId],
    );
    rows = res.rows;
  } catch (error) {
    if (isMissingColumnError(error, "role_ids")) {
      const res = await pool.query<UserRoleRow>(
        `SELECT role_id FROM users WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL LIMIT 1`,
        [userId],
      );
      rows = res.rows.map((row) => ({ ...row, role_ids: [] }));
    } else if (isPoolUnreachable(error)) {
      const { data, error: sbError }: SupabaseRows<UserRoleRow> = await supabase
        .from("users")
        .select("role_id, role_ids")
        .eq("id", userId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .limit(1);

      if (sbError && isMissingColumnError(sbError, "role_ids")) {
        const { data: legacyData, error: legacyError }: SupabaseRows<UserRoleRow> = await supabase
          .from("users")
          .select("role_id")
          .eq("id", userId)
          .eq("is_active", true)
          .is("deleted_at", null)
          .limit(1);
        if (legacyError) throw legacyError;
        rows = (legacyData || []).map((row) => ({ ...row, role_ids: [] }));
      } else {
        if (sbError) throw sbError;
        rows = data || [];
      }
    } else {
      throw error;
    }
  }

  if (rows.length === 0) {
    // Missing, inactive and deleted accounts are invalid sessions, not
    // empty-permission users whose token snapshot can remain authoritative.
    return { userExists: false, roleNames: [] as string[], permissions: {} as Record<string, unknown>, permissionSlugs: [] as string[] };
  }

  const roleIds = normalizeRoleIds(rows[0]?.role_id, rows[0]?.role_ids);

  if (roleIds.length === 0) {
    return { userExists: true, roleNames: [] as string[], permissions: {} as Record<string, unknown>, permissionSlugs: [] as string[] };
  }

  let roleRows: RolePermissionRow[];
  let permissionSource: PermissionSource = "current";
  try {
    const res = await pool.query<RolePermissionRow>(
      `SELECT
       r.name,
       r.permissions,
       COALESCE(array_agg(p.slug) FILTER (WHERE p.slug IS NOT NULL), '{}') AS permission_slugs
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     WHERE r.id = ANY($1::uuid[])
     GROUP BY r.id, r.name, r.permissions`,
      [roleIds],
    );
    roleRows = res.rows;
  } catch (error) {
    if (isMissingPermissionRelation(error)) {
      const res = await pool.query<RolePermissionRow>(
        `SELECT name, permissions
         FROM roles
         WHERE id = ANY($1::uuid[])`,
        [roleIds],
      );
      roleRows = res.rows;
      permissionSource = "legacy";
    } else if (isPoolUnreachable(error)) {
      const { data: rolesData, error: rolesError }: SupabaseRows<SupabaseRoleRow> = await supabase
        .from("roles")
        .select("id, name, permissions")
        .in("id", roleIds);
      if (rolesError) throw rolesError;

      const roles = rolesData || [];
      roleRows = roles.map((role) => ({ ...role, permission_slugs: [] }));
      if (roles.length > 0) {
        const { data: rpData, error: rpError }: SupabaseRows<RolePermissionLink> = await supabase
          .from("role_permissions")
          .select("role_id, permission_id")
          .in("role_id", roles.map((role) => role.id));

        if (rpError) {
          if (!isMissingPermissionRelation(rpError)) throw rpError;
          permissionSource = "legacy";
        } else if (rpData && rpData.length > 0) {
          const permIds = [...new Set(rpData.map((link) => link.permission_id))];
          const { data: permsData, error: permsError }: SupabaseRows<PermissionRow> = await supabase
            .from("permissions")
            .select("id, slug")
            .in("id", permIds);

          if (permsError) {
            if (!isMissingPermissionRelation(permsError)) throw permsError;
            permissionSource = "legacy";
          } else {
            const slugById = new Map((permsData || []).map((permission) => [permission.id, permission.slug]));
            const slugsByRole = new Map<string, string[]>();
            for (const link of rpData) {
              const slug = slugById.get(link.permission_id);
              if (!slug) continue;
              const roleSlugs = slugsByRole.get(link.role_id) || [];
              roleSlugs.push(slug);
              slugsByRole.set(link.role_id, roleSlugs);
            }
            roleRows = roles.map((role) => ({
              ...role,
              permission_slugs: slugsByRole.get(role.id) || [],
            }));
          }
        }
      }
    } else {
      throw error;
    }
  }

  const roleNames = roleRows.map((row) => row.name);
  const permissionSlugs = roleRows.flatMap((row) =>
    resolveEffectivePermissionSlugs(row.permission_slugs, row.permissions, [row.name], permissionSource));

  return {
    userExists: true,
    roleNames,
    permissions: normalizePermissionMap(roleRows[0]?.permissions),
    permissionSlugs: [...new Set(permissionSlugs)],
  };
}

export async function fetchHiddenFieldsForRoles(roleNames: string[], moduleName: string): Promise<string[]> {
  if (roleNames.length === 0) {
    return [];
  }

  let rows: any[];
  try {
    const res = await pool.query(
      `SELECT fp.field_name
       FROM field_permissions fp
       JOIN roles r ON r.id = fp.role_id
       WHERE LOWER(r.name) = ANY($1::text[])
         AND fp.module = $2
         AND fp.is_visible = FALSE`,
      [roleNames.map((name) => name.toLowerCase()), moduleName],
    );
    rows = res.rows;
  } catch (error) {
    if (isPoolUnreachable(error)) {
      const { data: rolesData, error: rolesError } = await supabase
        .from("roles")
        .select("id, name")
        .in("name", roleNames);

      if (rolesError) throw rolesError;
      const roleIds = (rolesData || []).map((role: any) => role.id);
      if (roleIds.length === 0) return [];

      const { data, error: fieldError } = await supabase
        .from("field_permissions")
        .select("field_name")
        .in("role_id", roleIds)
        .eq("module", moduleName)
        .eq("is_visible", false);

      if (fieldError) throw fieldError;
      rows = data || [];
    } else {
      throw error;
    }
  }

  return [...new Set(rows.map((row) => row.field_name).filter((field): field is string => typeof field === "string"))];
}
