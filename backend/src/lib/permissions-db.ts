import { pool } from "../db/pool";
import { supabase } from "../db/supabase";
import {
  normalizePermissionMap,
  normalizePermissionSlugs,
  permissionMapToSlugs,
  roleNamesToPermissionSlugs,
} from "./permissions";

function isPoolUnreachable(error: unknown): boolean {
  const err = error as { code?: string; errno?: number };
  return (
    err?.code === "ENOTFOUND" ||
    err?.code === "ECONNREFUSED" ||
    err?.code === "ETIMEDOUT"
  );
}

function isMissingColumnError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  const message = (err?.message || "").toLowerCase();
  return err?.code === "42703" || message.includes("column");
}

function isMissingRelationError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  const message = (err?.message || "").toLowerCase();
  return err?.code === "42P01" || (message.includes("relation") && message.includes("does not exist"));
}

export function resolvePermissionSlugs(rawSlugs: unknown, rawMap: unknown): string[] {
  const explicit = normalizePermissionSlugs(rawSlugs);
  const mapDerived = permissionMapToSlugs(normalizePermissionMap(rawMap));
  return [...new Set([...explicit, ...mapDerived])];
}

export function resolveEffectivePermissionSlugs(rawSlugs: unknown, rawMap: unknown, roleNames: string[]): string[] {
  return [...new Set([...resolvePermissionSlugs(rawSlugs, rawMap), ...roleNamesToPermissionSlugs(roleNames)])];
}

export function normalizeRoleIds(roleId: unknown, roleIdsRaw: unknown): string[] {
  const ids = Array.isArray(roleIdsRaw)
    ? roleIdsRaw.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())
    : [];
  if (typeof roleId === "string" && roleId.trim()) ids.push(roleId.trim());
  return [...new Set(ids)];
}

export async function fetchUserRoleContext(userId: string, primaryRoleId?: string) {
  let rows: any[];
  try {
    const res = await pool.query(
      `SELECT role_ids, role_id FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    rows = res.rows;
  } catch (error) {
    if (isMissingColumnError(error)) {
      const res = await pool.query(
        `SELECT role_id FROM users WHERE id = $1 LIMIT 1`,
        [userId],
      );
      rows = res.rows.map((row) => ({ ...row, role_ids: [] }));
    } else if (isPoolUnreachable(error)) {
      const { data, error: sbError } = await supabase
        .from("users")
        .select("role_id, role_ids")
        .eq("id", userId)
        .limit(1);

      if (sbError && isMissingColumnError(sbError)) {
        const { data: legacyData, error: legacyError } = await supabase
          .from("users")
          .select("role_id")
          .eq("id", userId)
          .limit(1);
        if (legacyError) throw legacyError;
        rows = (legacyData || []).map((row: { role_id?: string | null }) => ({ ...row, role_ids: [] }));
      } else {
        if (sbError) throw sbError;
        rows = data || [];
      }
    } else {
      throw error;
    }
  }

  if (rows.length === 0) {
    return { roleNames: [] as string[], permissions: {} as Record<string, unknown>, permissionSlugs: [] as string[] };
  }

  const roleIds = normalizeRoleIds(rows[0]?.role_id || primaryRoleId, rows[0]?.role_ids);

  if (roleIds.length === 0) {
    return { roleNames: [] as string[], permissions: {} as Record<string, unknown>, permissionSlugs: [] as string[] };
  }

  let roleRows: any[] = [];
  try {
    const res = await pool.query(
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
    if (isMissingRelationError(error)) {
      const res = await pool.query(
        `SELECT name, permissions, '{}'::text[] AS permission_slugs
         FROM roles
         WHERE id = ANY($1::uuid[])`,
        [roleIds],
      );
      roleRows = res.rows;
    } else if (isPoolUnreachable(error)) {
      // 1. Fetch roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("roles")
        .select("id, name, permissions")
        .in("id", roleIds);
      if (rolesError) throw rolesError;

      // 2. Fetch role_permissions join
      const { data: rpData, error: rpError } = await supabase
        .from("role_permissions")
        .select("role_id, permission_id")
        .in("role_id", roleIds);

      if (!rpError && rpData && rpData.length > 0) {
        const permIds = rpData.map((rp: any) => rp.permission_id);
        const { data: permsData, error: permsError } = await supabase
          .from("permissions")
          .select("id, slug")
          .in("id", permIds);

        if (!permsError && permsData) {
          const slugById = new Map<string, string>();
          for (const p of permsData) {
            slugById.set(p.id, p.slug);
          }
          roleRows = (rolesData || []).map((r: any) => {
            const rolePermIds = rpData.filter((rp: any) => rp.role_id === r.id).map((rp: any) => rp.permission_id);
            const slugs = rolePermIds.map((pid: string) => slugById.get(pid)).filter((s: string | undefined): s is string => Boolean(s));
            return {
              name: r.name,
              permissions: r.permissions,
              permission_slugs: slugs,
            };
          });
        }
      }

      if (roleRows.length === 0) {
        roleRows = (rolesData || []).map((r: any) => ({
          name: r.name,
          permissions: r.permissions,
          permission_slugs: [],
        }));
      }
    } else {
      throw error;
    }
  }

  const roleNames = roleRows.map((row) => row.name as string);
  const permissionSlugs = roleRows.flatMap((row) => resolveEffectivePermissionSlugs(row.permission_slugs, row.permissions, [row.name]));

  return {
    roleNames,
    permissions: roleRows[0]?.permissions || {},
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
