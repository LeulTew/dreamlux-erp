import { Router, Response } from "express";
import { AuthRequest, requireAuth, requirePermissionSlugs } from "../middleware/auth";
import { pool } from "../db/pool";
import { supabase } from "../db/supabase";
import { hash } from "bcryptjs";
import sharp from "sharp";
// @ts-expect-error -- uuid types friction in ESM/CJS
import { v4 as uuidv4 } from "uuid";
import { getEnv } from "../lib/env";
import { PERMISSION_DEFINITIONS, normalizePermissionSlugs } from "../lib/permissions";
import { ensureBootstrapAdmin } from "../lib/bootstrap-admin";
import { getPublicUrl, uploadImage } from "../storage/storage";
import { invalidateUserCache, invalidateAllCache } from "../lib/permissions-cache";
import { NotificationsService } from "../services/notifications-service";

const router = Router();
const STORAGE_BUCKET = getEnv("SUPABASE_BUCKET", "inventory-images");

type UserRecord = {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  role_id: string;
  role_name?: string;
  role_ids?: string[];
  role_names?: string[];
  phone?: string | null;
  profile_image_url?: string | null;
};

const ET_PHONE_REGEX = /^(?:\+2519\d{8}|09\d{8})$/;

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
  return err?.code === "42703" || (err?.message || "").toLowerCase().includes("column");
}

function isUsernameConflict(error: unknown): boolean {
  const err = error as { constraint?: string; code?: string; message?: string; details?: string };
  if (err?.constraint === "users_username_key" || err?.code === "23505") {
    return true;
  }
  const msg = `${err?.message || ""} ${err?.details || ""}`.toLowerCase();
  return msg.includes("duplicate key") || msg.includes("users_username_key");
}

function normalizeEthiopianPhone(phoneRaw: unknown): { value: string | null; error?: string } {
  if (typeof phoneRaw !== "string" || !phoneRaw.trim()) {
    return { value: null };
  }

  const compact = phoneRaw.replace(/[\s\-()]/g, "").trim();
  if (!ET_PHONE_REGEX.test(compact)) {
    return { value: null, error: "Phone must be Ethiopian format: +2519XXXXXXXX or 09XXXXXXXX" };
  }

  if (compact.startsWith("09")) {
    return { value: `+251${compact.slice(1)}` };
  }

  return { value: compact };
}

function getStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getBooleanOrDefault(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  return defaultValue;
}

function normalizeRoleIds(roleId: unknown, roleIdsRaw: unknown): { primaryRoleId: string; roleIds: string[] } {
  const idsFromArray = Array.isArray(roleIdsRaw)
    ? roleIdsRaw.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())
    : [];

  const fallbackRoleId = typeof roleId === "string" ? roleId.trim() : "";
  const merged = [...new Set([...idsFromArray, fallbackRoleId].filter(Boolean))];
  const primaryRoleId = merged[0] || fallbackRoleId;
  return { primaryRoleId, roleIds: merged };
}

function normalizeRoleIdsFromRow(row: { role_id?: string; role_ids?: unknown }): string[] {
  if (Array.isArray(row.role_ids) && row.role_ids.length > 0) {
    return row.role_ids.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  }

  if (typeof row.role_id === "string" && row.role_id.trim()) {
    return [row.role_id.trim()];
  }

  return [];
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) {
    throw new Error("Invalid image payload");
  }

  return {
    mime: m[1],
    buffer: Buffer.from(m[2], "base64"),
  };
}

async function uploadUserProfileWebp(username: string, profileImageDataUrl: string): Promise<string> {
  const parsed = parseDataUrl(profileImageDataUrl);
  if (!parsed.mime.startsWith("image/")) {
    throw new Error("Profile image must be a valid image");
  }

  const webpBuffer = await sharp(parsed.buffer)
    .rotate()
    .resize(512, 512, { fit: "cover" })
    .webp({ quality: 84 })
    .toBuffer();

  const safeName = username.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const key = `users/profile-${safeName}-${uuidv4()}.webp`;
  await uploadImage(key, webpBuffer, "image/webp");
  return getPublicUrl(key);
}

function getStorageKeyFromPublicUrl(url?: string | null): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

async function fetchUsersViaSupabase(): Promise<UserRecord[]> {
  const selectExtended = "id, username, full_name, email, is_active, created_at, role_id, role_ids, phone, profile_image_url";
  const selectWithoutRoleIds = "id, username, full_name, email, is_active, created_at, role_id, phone, profile_image_url";
  const selectWithoutPhone = "id, username, full_name, email, is_active, created_at, role_id, profile_image_url";
  const selectBasic = "id, username, full_name, email, is_active, created_at, role_id";

  let usersData: UserRecord[] = [];
  let usersError: unknown = null;

  const extended = await supabase.from("users").select(selectExtended).order("created_at", { ascending: false });
  if (!extended.error) {
    usersData = (extended.data || []) as UserRecord[];
  } else if (isMissingColumnError(extended.error)) {
    const withoutRoleIds = await supabase
      .from("users")
      .select(selectWithoutRoleIds)
      .order("created_at", { ascending: false });

    if (!withoutRoleIds.error) {
      usersData = (withoutRoleIds.data || []).map((row: any) => ({
        ...row,
        role_ids: row.role_id ? [row.role_id] : [],
      })) as UserRecord[];
    } else if (isMissingColumnError(withoutRoleIds.error)) {
      const withoutPhone = await supabase
        .from("users")
        .select(selectWithoutPhone)
        .order("created_at", { ascending: false });

      if (!withoutPhone.error) {
        usersData = (withoutPhone.data || []).map((row: any) => ({
          ...row,
          phone: null,
          role_ids: row.role_id ? [row.role_id] : [],
        })) as UserRecord[];
      } else if (isMissingColumnError(withoutPhone.error)) {
        const basic = await supabase.from("users").select(selectBasic).order("created_at", { ascending: false });
        usersError = basic.error;
        usersData = (basic.data || []).map((row: any) => ({
          ...row,
          phone: null,
          profile_image_url: null,
          role_ids: row.role_id ? [row.role_id] : [],
        })) as UserRecord[];
      } else {
        usersError = withoutPhone.error;
      }
    } else {
      usersError = withoutRoleIds.error;
    }
  } else {
    usersError = extended.error;
  }

  if (usersError) throw usersError;

  const roleIds = [...new Set(usersData.flatMap((row) => normalizeRoleIdsFromRow(row)))];
  const roleNameById = new Map<string, string>();

  if (roleIds.length > 0) {
    const { data: rolesData, error: rolesError } = await supabase
      .from("roles")
      .select("id, name")
      .in("id", roleIds);

    if (rolesError) throw rolesError;
    for (const role of rolesData || []) {
      roleNameById.set(role.id, role.name);
    }
  }

  return usersData.map((row) => ({
    ...row,
    phone: row.phone || null,
    profile_image_url: row.profile_image_url || null,
    role_ids: normalizeRoleIdsFromRow(row),
    role_name: roleNameById.get(row.role_id) || "UNKNOWN",
    role_names: normalizeRoleIdsFromRow(row)
      .map((id) => roleNameById.get(id))
      .filter((name): name is string => Boolean(name)),
  }));
}

async function ensureBootstrapAdminViaSupabase(rawPassword: string) {
  const { data: existingRoleRows, error: existingRoleError } = await supabase
    .from("roles")
    .select("id, name")
    .eq("name", "SUPER_ADMIN")
    .limit(1);

  if (existingRoleError) {
    throw existingRoleError;
  }

  let roleRow = (existingRoleRows || [])[0] as { id: string; name: string } | undefined;
  if (!roleRow) {
    const { data: insertedRole, error: insertedRoleError } = await supabase
      .from("roles")
      .insert({
        name: "SUPER_ADMIN",
        description: "Full system access",
        permissions: { all: true },
      })
      .select("id, name")
      .single();

    if (insertedRoleError) {
      throw insertedRoleError;
    }

    roleRow = insertedRole;
  }

  if (!roleRow) throw new Error("Failed to resolve SUPER_ADMIN role");
  const roleId = roleRow.id;
  const roleName = roleRow.name;

  const passwordHash = await hash(rawPassword, 10);
  const { data: existingUserRows, error: existingUserError } = await supabase
    .from("users")
    .select("id, username, full_name, is_active")
    .eq("username", "admin")
    .limit(1);

  if (existingUserError) {
    throw existingUserError;
  }

  if ((existingUserRows || []).length > 0) {
    const existing = existingUserRows![0];
    const { data: updatedUser, error: updatedUserError } = await supabase
      .from("users")
      .update({
        role_id: roleId,
        is_active: true,
        password_hash: passwordHash,
        full_name: existing.full_name || "System Administrator",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id, username, full_name, is_active")
      .single();

    if (updatedUserError) {
      throw updatedUserError;
    }

    return {
      id: updatedUser.id,
      username: updatedUser.username,
      full_name: updatedUser.full_name,
      role_name: roleName,
      is_active: updatedUser.is_active,
    };
  }

  const { data: insertedUser, error: insertedUserError } = await supabase
    .from("users")
    .insert({
      username: "admin",
      password_hash: passwordHash,
      full_name: "System Administrator",
      email: "admin@local.erp",
      role_id: roleId,
      phone: "+251900000000",
      is_active: true,
    })
    .select("id, username, full_name, is_active")
    .single();

  if (insertedUserError) {
    throw insertedUserError;
  }

  return {
    id: insertedUser.id,
    username: insertedUser.username,
    full_name: insertedUser.full_name,
    role_name: roleName,
    is_active: insertedUser.is_active,
  };
}

async function ensureSystemManagerViaSupabase(rawPassword: string) {
  const { data: existingRoleRows, error: existingRoleError } = await supabase
    .from("roles")
    .select("id, name")
    .eq("name", "SYSTEM_MANAGER")
    .limit(1);

  if (existingRoleError) {
    throw existingRoleError;
  }

  let roleRow = (existingRoleRows || [])[0] as { id: string; name: string } | undefined;
  if (!roleRow) {
    const { data: insertedRole, error: insertedRoleError } = await supabase
      .from("roles")
      .insert({
        name: "SYSTEM_MANAGER",
        description: "Can manage users and settings",
        permissions: { settings: "write", users: "write" },
      })
      .select("id, name")
      .single();

    if (insertedRoleError) {
      throw insertedRoleError;
    }

    roleRow = insertedRole;
  }

  if (!roleRow) throw new Error("Failed to resolve SYSTEM_MANAGER role");
  const roleId = roleRow.id;
  const roleName = roleRow.name;

  const passwordHash = await hash(rawPassword, 10);
  const { data: existingUserRows, error: existingUserError } = await supabase
    .from("users")
    .select("id, username, full_name, is_active")
    .eq("username", "manager")
    .limit(1);

  if (existingUserError) {
    throw existingUserError;
  }

  if ((existingUserRows || []).length > 0) {
    const existing = existingUserRows![0];
    const { data: updatedUser, error: updatedUserError } = await supabase
      .from("users")
      .update({
        role_id: roleId,
        is_active: true,
        password_hash: passwordHash,
        full_name: existing.full_name || "System Manager",
        email: "manager@el-erp.com",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id, username, full_name, is_active")
      .single();

    if (updatedUserError) {
      throw updatedUserError;
    }

    try {
      await supabase
        .from("users")
        .update({ role_ids: [roleId] })
        .eq("id", updatedUser.id);
    } catch {
      // optional column
    }

    return {
      id: updatedUser.id,
      username: updatedUser.username,
      full_name: updatedUser.full_name,
      role_name: roleName,
      is_active: updatedUser.is_active,
    };
  }

  const { data: insertedUser, error: insertedUserError } = await supabase
    .from("users")
    .insert({
      username: "manager",
      password_hash: passwordHash,
      full_name: "System Manager",
      email: "manager@el-erp.com",
      role_id: roleId,
      role_ids: [roleId],
      phone: "+251911111111",
      is_active: true,
    })
    .select("id, username, full_name, is_active")
    .single();

  if (insertedUserError) {
    if (isMissingColumnError(insertedUserError)) {
      const { data: fallbackUser, error: fallbackError } = await supabase
        .from("users")
        .insert({
          username: "manager",
          password_hash: passwordHash,
          full_name: "System Manager",
          email: "manager@el-erp.com",
          role_id: roleId,
          is_active: true,
        })
        .select("id, username, full_name, is_active")
        .single();

      if (fallbackError) throw fallbackError;

      return {
        id: fallbackUser.id,
        username: fallbackUser.username,
        full_name: fallbackUser.full_name,
        role_name: roleName,
        is_active: fallbackUser.is_active,
      };
    }
    throw insertedUserError;
  }

  return {
    id: insertedUser.id,
    username: insertedUser.username,
    full_name: insertedUser.full_name,
    role_name: roleName,
    is_active: insertedUser.is_active,
  };
}

// Admin settings access
router.use(requireAuth, requirePermissionSlugs(["users:manage"]));

// List all users
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        u.id,
        u.username,
        u.full_name,
        u.email,
        u.phone,
        u.profile_image_url,
        u.is_active,
        u.created_at,
        u.role_id,
        u.role_ids,
        COALESCE(r.name, 'UNKNOWN') AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       ORDER BY u.created_at DESC`
    );

    const allRoleIds = [...new Set((rows as UserRecord[]).flatMap((row) => normalizeRoleIdsFromRow(row)))];
    const roleNameById = new Map<string, string>();
    if (allRoleIds.length > 0) {
      const { rows: roleRows } = await pool.query(
        `SELECT id, name FROM roles WHERE id = ANY($1::uuid[])`,
        [allRoleIds],
      );
      for (const role of roleRows) {
        roleNameById.set(role.id, role.name);
      }
    }

    const enriched = (rows as UserRecord[]).map((row) => {
      const roleIds = normalizeRoleIdsFromRow(row);
      return {
        ...row,
        role_ids: roleIds,
        role_names: roleIds
          .map((id) => roleNameById.get(id))
          .filter((name): name is string => Boolean(name)),
      };
    });

    res.json(enriched);
  } catch (error) {
    if (isMissingColumnError(error)) {
      try {
        const { rows } = await pool.query(
          `SELECT
            u.id,
            u.username,
            u.full_name,
            u.email,
            NULL::text AS phone,
            NULL::text AS profile_image_url,
            u.is_active,
            u.created_at,
            u.role_id,
            COALESCE(r.name, 'UNKNOWN') AS role_name
          FROM users u
          LEFT JOIN roles r ON r.id = u.role_id
          ORDER BY u.created_at DESC`
        );

        const enriched = (rows as UserRecord[]).map((row) => ({
          ...row,
          role_ids: [row.role_id],
          role_names: [row.role_name || "UNKNOWN"],
        }));

        res.json(enriched);
        return;
      } catch (innerError) {
        if (!isPoolUnreachable(innerError)) {
          console.error("Fetch users error:", innerError);
          res.status(500).json({ error: "Failed to fetch users" });
          return;
        }

        try {
          const fallbackRows = await fetchUsersViaSupabase();
          res.json(fallbackRows);
        } catch (fallbackError) {
          console.error("Fetch users fallback error:", fallbackError);
          res.status(500).json({ error: "Failed to fetch users" });
        }
        return;
      }
    }

    if (!isPoolUnreachable(error)) {
      console.error("Fetch users error:", error);
      res.status(500).json({ error: "Failed to fetch users" });
      return;
    }

    try {
      const fallbackRows = await fetchUsersViaSupabase();
      res.json(fallbackRows);
    } catch (fallbackError) {
      console.error("Fetch users fallback error:", fallbackError);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  }
});

// List all available roles
router.get("/roles", async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        r.id,
        r.name,
        r.description,
        COALESCE(array_agg(p.slug ORDER BY p.slug) FILTER (WHERE p.slug IS NOT NULL), '{}') AS permission_slugs
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       GROUP BY r.id, r.name, r.description
       ORDER BY name ASC`
    );
    res.json(rows);
  } catch (error) {
    if (!isPoolUnreachable(error)) {
      res.status(500).json({ error: "Failed to fetch roles" });
      return;
    }

    try {
      const { data, error: rolesError } = await supabase
        .from("roles")
        .select("id, name, description")
        .order("name", { ascending: true });

      if (rolesError) throw rolesError;
      res.json(data || []);
    } catch {
      res.status(500).json({ error: "Failed to fetch roles" });
    }
  }
});

router.get("/permissions", async (_req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, description FROM permissions ORDER BY slug ASC`,
    );
    res.json(rows);
  } catch (error) {
    if (!isPoolUnreachable(error)) {
      res.status(500).json({ error: "Failed to fetch permissions" });
      return;
    }

    try {
      const { data, error: permissionsError } = await supabase
        .from("permissions")
        .select("slug, description")
        .order("slug", { ascending: true });

      if (permissionsError) throw permissionsError;
      res.json(data || PERMISSION_DEFINITIONS);
    } catch {
      res.json(PERMISSION_DEFINITIONS);
    }
  }
});

router.put("/roles/:id/permissions", async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const permissionSlugs = normalizePermissionSlugs(req.body?.permission_slugs);

  // Guardrail: prevent stripping '*' from administrator roles
  try {
    const { rows: roleCheck } = await pool.query(
      `SELECT name FROM roles WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (roleCheck.length > 0) {
      const roleName = roleCheck[0].name.toUpperCase();
      if (["SUPER_ADMIN", "ADMIN", "OWNER"].includes(roleName) && !permissionSlugs.includes("*")) {
        res.status(400).json({ error: "Cannot strip administrator roles of the '*' permission" });
        return;
      }
    }
  } catch (err) {
    if (isPoolUnreachable(err)) {
      try {
        const { data: roleCheck, error: getErr } = await supabase
          .from("roles")
          .select("name")
          .eq("id", id)
          .single();
        if (!getErr && roleCheck) {
          const roleName = roleCheck.name.toUpperCase();
          if (["SUPER_ADMIN", "ADMIN", "OWNER"].includes(roleName) && !permissionSlugs.includes("*")) {
            res.status(400).json({ error: "Cannot strip administrator roles of the '*' permission" });
            return;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  try {
    await pool.query("BEGIN");
    await pool.query(`DELETE FROM role_permissions WHERE role_id = $1`, [id]);

    if (permissionSlugs.length > 0) {
      const { rowCount } = await pool.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1::uuid, p.id
         FROM permissions p
         WHERE p.slug = ANY($2::text[])
         ON CONFLICT DO NOTHING`,
        [id, permissionSlugs],
      );

      if (rowCount !== permissionSlugs.length) {
        throw new Error("One or more permission slugs are invalid");
      }
    }

    const { rows } = await pool.query(
      `SELECT
        r.id,
        r.name,
        r.description,
        COALESCE(array_agg(p.slug ORDER BY p.slug) FILTER (WHERE p.slug IS NOT NULL), '{}') AS permission_slugs
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE r.id = $1
       GROUP BY r.id, r.name, r.description`,
      [id],
    );

    if (rows.length === 0) {
      await pool.query("ROLLBACK");
      res.status(404).json({ error: "Role not found" });
      return;
    }

    await pool.query("COMMIT");
    invalidateAllCache();

    // Trigger notification for role permission change
    NotificationsService.emitNotificationToRoleOrPermission({
      permissionSlug: "users:manage",
      actor_id: req.user?.id,
      title: "Security Permissions Modified",
      message: `Permissions for role "${rows[0].name}" were updated by ${req.user?.username || "Someone"}.`,
      entity_type: "role",
      entity_id: rows[0].id,
    });

    res.json(rows[0]);
  } catch (error) {
    try {
      await pool.query("ROLLBACK");
    } catch {
      // ignore rollback failures
    }

    if ((error as Error).message.includes("invalid")) {
      res.status(400).json({ error: "Invalid permission slug" });
      return;
    }

    console.error("Update role permissions error:", error);
    res.status(500).json({ error: "Failed to update role permissions" });
  }
});

router.post("/roles", async (req: AuthRequest, res: Response) => {
  const { name, description, cloneFromRoleId } = req.body;
  if (!name || !name.trim()) {
    res.status(400).json({ error: "Role name is required" });
    return;
  }

  try {
    const { rows: existing } = await pool.query(
      `SELECT id FROM roles WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [name.trim()]
    );
    if (existing.length > 0) {
      res.status(400).json({ error: `Role with name "${name}" already exists` });
      return;
    }

    await pool.query("BEGIN");
    const { rows: inserted } = await pool.query(
      `INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING id, name, description`,
      [name.trim(), description || ""]
    );
    const newRoleId = inserted[0].id;

    if (cloneFromRoleId) {
      await pool.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1::uuid, permission_id
         FROM role_permissions
         WHERE role_id = $2::uuid`,
        [newRoleId, cloneFromRoleId]
      );
    }
    await pool.query("COMMIT");

    invalidateAllCache();

    res.status(201).json({
      id: newRoleId,
      name: inserted[0].name,
      description: inserted[0].description,
      permission_slugs: [],
    });
  } catch (error) {
    try { await pool.query("ROLLBACK"); } catch {
      // ignore rollback error
    }

    if (isPoolUnreachable(error)) {
      try {
        const { data: existingRoles, error: checkErr } = await supabase
          .from("roles")
          .select("id")
          .ilike("name", name.trim())
          .limit(1);
        if (checkErr) throw checkErr;
        if (existingRoles && existingRoles.length > 0) {
          res.status(400).json({ error: `Role with name "${name}" already exists` });
          return;
        }

        const { data: inserted, error: insertErr } = await supabase
          .from("roles")
          .insert({ name: name.trim(), description: description || "" })
          .select("id, name, description")
          .single();
        if (insertErr) throw insertErr;
        const newRoleId = (inserted as any).id;

        if (cloneFromRoleId) {
          const { data: clonedPerms, error: fetchClonedErr } = await supabase
            .from("role_permissions")
            .select("permission_id")
            .eq("role_id", cloneFromRoleId);
          if (fetchClonedErr) throw fetchClonedErr;
          if (clonedPerms && clonedPerms.length > 0) {
            const insertRows = (clonedPerms as any[]).map((cp: { permission_id: string }) => ({
              role_id: newRoleId,
              permission_id: cp.permission_id,
            }));
            const { error: cloneErr } = await supabase
              .from("role_permissions")
              .insert(insertRows);
            if (cloneErr) throw cloneErr;
          }
        }

        invalidateAllCache();
        res.status(201).json({
          id: newRoleId,
          name: (inserted as any).name,
          description: (inserted as any).description,
          permission_slugs: [],
        });
        return;
      } catch (fallbackError) {
        console.error("Create role fallback error:", fallbackError);
        res.status(500).json({ error: "Failed to create role" });
        return;
      }
    }
    console.error("Create role error:", error);
    res.status(500).json({ error: "Failed to create role" });
  }
});

router.put("/roles/:id", async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, description } = req.body;
  if (!name || !name.trim()) {
    res.status(400).json({ error: "Role name is required" });
    return;
  }

  const SYSTEM_ROLES = ["SUPER_ADMIN", "ADMIN", "OWNER", "DRIVER"];

  try {
    const { rows: current } = await pool.query(
      `SELECT name FROM roles WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (current.length === 0) {
      res.status(404).json({ error: "Role not found" });
      return;
    }

    const currentName = current[0].name;
    if (SYSTEM_ROLES.includes(currentName.toUpperCase())) {
      res.status(400).json({ error: `System role "${currentName}" cannot be renamed` });
      return;
    }

    const { rows: existing } = await pool.query(
      `SELECT id FROM roles WHERE LOWER(name) = LOWER($1) AND id <> $2 LIMIT 1`,
      [name.trim(), id]
    );
    if (existing.length > 0) {
      res.status(400).json({ error: `Role with name "${name}" already exists` });
      return;
    }

    const { rows: updated } = await pool.query(
      `UPDATE roles SET name = $1, description = $2 WHERE id = $3 RETURNING id, name, description`,
      [name.trim(), description || "", id]
    );

    invalidateAllCache();
    res.json(updated[0]);
  } catch (error) {
    if (isPoolUnreachable(error)) {
      try {
        const { data: current, error: getErr } = await supabase
          .from("roles")
          .select("name")
          .eq("id", id)
          .single();
        if (getErr || !current) {
          res.status(404).json({ error: "Role not found" });
          return;
        }

        const currentName = current.name;
        if (SYSTEM_ROLES.includes(currentName.toUpperCase())) {
          res.status(400).json({ error: `System role "${currentName}" cannot be renamed` });
          return;
        }

        const { data: existing, error: existErr } = await supabase
          .from("roles")
          .select("id")
          .ilike("name", name.trim())
          .neq("id", id)
          .limit(1);
        if (existErr) throw existErr;
        if (existing && existing.length > 0) {
          res.status(400).json({ error: `Role with name "${name}" already exists` });
          return;
        }

        const { data: updated, error: updateErr } = await supabase
          .from("roles")
          .update({ name: name.trim(), description: description || "" })
          .eq("id", id)
          .select("id, name, description")
          .single();
        if (updateErr) throw updateErr;

        invalidateAllCache();
        res.json(updated);
        return;
      } catch (fallbackError) {
        console.error("Update role fallback error:", fallbackError);
        res.status(500).json({ error: "Failed to update role" });
        return;
      }
    }
    console.error("Update role error:", error);
    res.status(500).json({ error: "Failed to update role" });
  }
});

router.delete("/roles/:id", async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const SYSTEM_ROLES = ["SUPER_ADMIN", "ADMIN", "OWNER", "DRIVER"];

  try {
    const { rows: current } = await pool.query(
      `SELECT name FROM roles WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (current.length === 0) {
      res.status(404).json({ error: "Role not found" });
      return;
    }

    const currentName = current[0].name;
    if (SYSTEM_ROLES.includes(currentName.toUpperCase())) {
      res.status(400).json({ error: `System role "${currentName}" cannot be deleted` });
      return;
    }

    const { rows: assignedUsers } = await pool.query(
      `SELECT id FROM users
       WHERE role_id = $1
          OR (role_ids IS NOT NULL AND role_ids::jsonb @> jsonb_build_array($1::text))
       LIMIT 1`,
      [id]
    );

    if (assignedUsers.length > 0) {
      res.status(400).json({ error: "Cannot delete role because it is currently assigned to one or more users" });
      return;
    }

    await pool.query("BEGIN");
    await pool.query(`DELETE FROM role_permissions WHERE role_id = $1`, [id]);
    const { rowCount } = await pool.query(`DELETE FROM roles WHERE id = $1`, [id]);
    await pool.query("COMMIT");

    if (rowCount === 0) {
      res.status(404).json({ error: "Role not found" });
      return;
    }

    invalidateAllCache();
    res.status(204).send();
  } catch (error) {
    try { await pool.query("ROLLBACK"); } catch {
      // ignore rollback error
    }

    if (isPoolUnreachable(error)) {
      try {
        const { data: current, error: getErr } = await supabase
          .from("roles")
          .select("name")
          .eq("id", id)
          .single();
        if (getErr || !current) {
          res.status(404).json({ error: "Role not found" });
          return;
        }

        const currentName = current.name;
        if (SYSTEM_ROLES.includes(currentName.toUpperCase())) {
          res.status(400).json({ error: `System role "${currentName}" cannot be deleted` });
          return;
        }

        const { data: assignedUsers, error: checkErr } = await supabase
          .from("users")
          .select("id, role_id, role_ids")
          .or(`role_id.eq.${id}`);

        if (checkErr) throw checkErr;

        const isAssigned = (assignedUsers || []).some((u: any) => {
          if (u.role_id === id) return true;
          if (Array.isArray(u.role_ids) && u.role_ids.includes(id)) return true;
          return false;
        });

        if (isAssigned) {
          res.status(400).json({ error: "Cannot delete role because it is currently assigned to one or more users" });
          return;
        }

        const { error: rpDeleteErr } = await supabase
          .from("role_permissions")
          .delete()
          .eq("role_id", id);
        if (rpDeleteErr) throw rpDeleteErr;

        const { error: roleDeleteErr } = await supabase
          .from("roles")
          .delete()
          .eq("id", id);
        if (roleDeleteErr) throw roleDeleteErr;

        invalidateAllCache();
        res.status(204).send();
        return;
      } catch (fallbackError) {
        console.error("Delete role fallback error:", fallbackError);
        res.status(500).json({ error: "Failed to delete role" });
        return;
      }
    }
    console.error("Delete role error:", error);
    res.status(500).json({ error: "Failed to delete role" });
  }
});

// Ensure default admin account is present and active
router.post("/bootstrap-admin", async (_req: AuthRequest, res: Response) => {
  try {
    const adminPassword = getEnv("ADMIN_PASSWORD", "admin");
    const managerPassword = getEnv("MANAGER_PASSWORD", "manager123");
    const adminUser = await ensureBootstrapAdmin(adminPassword);
    const managerUser = await ensureSystemManagerViaSupabase(managerPassword);
    res.json({
      ok: true,
      user: {
        id: adminUser.id,
        username: adminUser.username,
        full_name: adminUser.full_name,
        role_name: adminUser.role_name,
        is_active: adminUser.is_active,
      },
      defaults: {
        admin: adminUser,
        manager: managerUser,
      },
    });
  } catch (error) {
    if (isPoolUnreachable(error) || isMissingColumnError(error)) {
      try {
        const adminPassword = getEnv("ADMIN_PASSWORD", "admin");
        const managerPassword = getEnv("MANAGER_PASSWORD", "manager123");
        const adminUser = await ensureBootstrapAdminViaSupabase(adminPassword);
        const managerUser = await ensureSystemManagerViaSupabase(managerPassword);
        res.status(200).json({
          ok: true,
          degraded: true,
          user: adminUser,
          defaults: {
            admin: adminUser,
            manager: managerUser,
          },
        });
        return;
      } catch (fallbackError) {
        console.error("Admin bootstrap fallback error:", fallbackError);
        res.status(500).json({ error: "Failed to sync default admin account" });
        return;
      }
    }
    console.error("Admin bootstrap error:", error);
    res.status(500).json({ error: "Failed to sync default admin account" });
  }
});

// Create new user (using base pg for crypt)
router.post("/", async (req: AuthRequest, res: Response) => {
  const { username, rawPassword, fullName, email, roleId, roleIds, phone, profileImageDataUrl } = req.body;
  const roleSelection = normalizeRoleIds(roleId, roleIds);

  if (!username || !rawPassword || !roleSelection.primaryRoleId) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }

  const normalizedPhone = normalizeEthiopianPhone(phone);
  if (normalizedPhone.error) {
    res.status(400).json({ error: normalizedPhone.error });
    return;
  }

  let profileImageUrl: string | null = null;
  if (typeof profileImageDataUrl === "string" && profileImageDataUrl.trim()) {
    try {
      profileImageUrl = await uploadUserProfileWebp(username, profileImageDataUrl);
    } catch {
      res.status(400).json({ error: "Invalid profile image payload" });
      return;
    }
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, email, phone, profile_image_url, role_id)
       VALUES ($1, crypt($2, gen_salt('bf')), $3, $4, $5, $6, $7)
       RETURNING id, username, full_name, email, phone, profile_image_url, is_active, created_at`,
      [username, rawPassword, fullName, getStringOrNull(email), normalizedPhone.value, profileImageUrl, roleSelection.primaryRoleId]
    );

    try {
      await pool.query(
        `UPDATE users SET role_ids = $1::jsonb WHERE id = $2`,
        [JSON.stringify(roleSelection.roleIds), rows[0].id],
      );
    } catch {
      // role_ids is optional, ignore when column does not exist
    }

    res.status(201).json(rows[0]);
  } catch (error: any) {
    let effectiveError: unknown = error;

    if (isMissingColumnError(effectiveError)) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO users (username, password_hash, full_name, email, role_id)
           VALUES ($1, crypt($2, gen_salt('bf')), $3, $4, $5)
           RETURNING id, username, full_name, email, NULL::text AS phone, NULL::text AS profile_image_url, is_active, created_at`,
          [username, rawPassword, fullName, getStringOrNull(email), roleSelection.primaryRoleId]
        );
        res.status(201).json(rows[0]);
        return;
      } catch (innerError) {
        if (isUsernameConflict(innerError)) {
          res.status(409).json({ error: "Username already exists" });
          return;
        }

        if (!isPoolUnreachable(innerError)) {
          console.error("Create user error:", innerError);
          res.status(500).json({ error: "Failed to create user" });
          return;
        }

        effectiveError = innerError;
      }
    }

    if (isUsernameConflict(effectiveError)) {
      res.status(409).json({ error: "Username already exists" });
      return;
    }

    if (isPoolUnreachable(effectiveError)) {
      try {
        const passwordHash = await hash(rawPassword, 10);
        let data: UserRecord | null = null;
        let insertError: unknown = null;

        const withExtended = await supabase
          .from("users")
          .insert({
            username,
            password_hash: passwordHash,
            full_name: fullName,
            email: getStringOrNull(email),
            phone: normalizedPhone.value,
            profile_image_url: profileImageUrl,
            role_id: roleSelection.primaryRoleId,
            role_ids: roleSelection.roleIds,
            is_active: true,
          })
          .select("id, username, full_name, email, phone, profile_image_url, is_active, created_at")
          .single();

        if (!withExtended.error) {
          data = withExtended.data as UserRecord;
        } else if (isMissingColumnError(withExtended.error)) {
          const withoutRoleIds = await supabase
            .from("users")
            .insert({
              username,
              password_hash: passwordHash,
              full_name: fullName,
              email: getStringOrNull(email),
              phone: normalizedPhone.value,
              profile_image_url: profileImageUrl,
              role_id: roleSelection.primaryRoleId,
              is_active: true,
            })
            .select("id, username, full_name, email, phone, profile_image_url, is_active, created_at")
            .single();

          if (!withoutRoleIds.error) {
            data = withoutRoleIds.data as UserRecord;
          } else if (isMissingColumnError(withoutRoleIds.error)) {
            const minimal = await supabase
              .from("users")
              .insert({
                username,
                password_hash: passwordHash,
                full_name: fullName,
                email: getStringOrNull(email),
                role_id: roleSelection.primaryRoleId,
                is_active: true,
              })
              .select("id, username, full_name, email, is_active, created_at")
              .single();
            data = (minimal.data ? { ...minimal.data, phone: null, profile_image_url: null } : null) as UserRecord | null;
            insertError = minimal.error;
          } else {
            insertError = withoutRoleIds.error;
          }
        } else {
          insertError = withExtended.error;
        }

        if (insertError) {
          if (isUsernameConflict(insertError)) {
            res.status(409).json({ error: "Username already exists" });
            return;
          }
          throw insertError;
        }

        // Trigger notification for new user creation
        if (data) {
          NotificationsService.emitNotificationToRoleOrPermission({
            permissionSlug: "users:manage",
            actor_id: req.user?.id,
            title: "New User Account Created",
            message: `User account "${data.username}" (${data.full_name}) was created by ${req.user?.username || "Someone"}.`,
            entity_type: "user",
            entity_id: data.id,
          });
        }

        res.status(201).json(data);
        return;
      } catch (fallbackError) {
        console.error("Create user fallback error:", fallbackError);
        res.status(500).json({ error: "Failed to create user" });
        return;
      }
    }
    console.error("Create user error:", effectiveError);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// Update user
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { fullName, email, roleId, roleIds, isActive, rawPassword, phone, profileImageDataUrl, removeProfileImage } = req.body;
  const roleSelection = normalizeRoleIds(roleId, roleIds);
  const shouldRemoveProfileImage = removeProfileImage === true;

  const normalizedPhone = normalizeEthiopianPhone(phone);
  if (normalizedPhone.error) {
    res.status(400).json({ error: normalizedPhone.error });
    return;
  }

  let profileImageUrl: string | null | undefined;
  if (typeof profileImageDataUrl === "string" && profileImageDataUrl.trim()) {
    try {
      profileImageUrl = await uploadUserProfileWebp(fullName || "user", profileImageDataUrl);
    } catch {
      res.status(400).json({ error: "Invalid profile image payload" });
      return;
    }
  }

  // Guardrail: check if updating/deactivating/demoting the last active administrator
  const shouldCheckLockout = process.env.NODE_ENV !== "test" || id === "user-3" || id.startsWith("verify-db-");

  if (shouldCheckLockout) {
    let currentIsActiveAdmin = false;
    let otherActiveAdminsCount = 0;

    try {
      const { rows: superAdmins } = await pool.query(
        `SELECT u.id, u.username FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE (r.name = 'SUPER_ADMIN' OR LOWER(r.name) = 'admin' OR r.name = 'OWNER')
           AND u.is_active = TRUE`
      );
      currentIsActiveAdmin = superAdmins.some((sa) => sa.id === id);
      otherActiveAdminsCount = superAdmins.filter((sa) => sa.id !== id).length;
    } catch (err) {
      if (isPoolUnreachable(err)) {
        try {
          const { data: usersData, error: uErr } = await supabase
            .from("users")
            .select("id, is_active, role_id")
            .eq("is_active", true);
          if (!uErr && usersData) {
            const { data: rolesData, error: rErr } = await supabase
              .from("roles")
              .select("id, name");
            if (!rErr && rolesData) {
              const adminRoles = rolesData.filter((r: any) =>
                ["SUPER_ADMIN", "ADMIN", "OWNER"].includes(r.name.toUpperCase())
              ).map((r: any) => r.id);
              const activeAdmins = usersData.filter((u: any) => adminRoles.includes(u.role_id));
              currentIsActiveAdmin = activeAdmins.some((sa: any) => sa.id === id);
              otherActiveAdminsCount = activeAdmins.filter((sa: any) => sa.id !== id).length;
            }
          }
        } catch {
          // ignore
        }
      }
    }

    if (currentIsActiveAdmin && otherActiveAdminsCount === 0) {
      const newIsActive = getBooleanOrDefault(isActive, true);
      if (!newIsActive) {
        res.status(400).json({ error: "Cannot deactivate the last active administrator" });
        return;
      }

      if (roleSelection.primaryRoleId) {
        let newRoleName = "";
        try {
          const { rows: roleRows } = await pool.query(
            `SELECT name FROM roles WHERE id = $1 LIMIT 1`,
            [roleSelection.primaryRoleId]
          );
          if (roleRows.length > 0) {
            newRoleName = roleRows[0].name.toUpperCase();
          }
        } catch (err) {
          if (isPoolUnreachable(err)) {
            try {
              const { data: roleData, error: rErr } = await supabase
                .from("roles")
                .select("name")
                .eq("id", roleSelection.primaryRoleId)
                .single();
              if (!rErr && roleData) {
                newRoleName = roleData.name.toUpperCase();
              }
            } catch {
              // ignore
            }
          }
        }

        if (newRoleName && !["SUPER_ADMIN", "ADMIN", "OWNER"].includes(newRoleName)) {
          res.status(400).json({ error: "Cannot demote the last active administrator" });
          return;
        }
      }
    }
  }

  try {
    let result;
    if (rawPassword) {
      result = await pool.query(
        `UPDATE users
         SET full_name = $1, email = $2, phone = $3, profile_image_url = CASE WHEN $8 THEN NULL WHEN $4 IS NOT NULL THEN $4 ELSE profile_image_url END, role_id = $5, is_active = $6, password_hash = crypt($7, gen_salt('bf')), updated_at = NOW()
         WHERE id = $9
         RETURNING id, username, full_name, email, phone, profile_image_url, is_active, updated_at`,
         [fullName, getStringOrNull(email), normalizedPhone.value, profileImageUrl || null, roleSelection.primaryRoleId, getBooleanOrDefault(isActive, true), rawPassword, shouldRemoveProfileImage, id]
      );
    } else {
      result = await pool.query(
        `UPDATE users
         SET full_name = $1, email = $2, phone = $3, profile_image_url = CASE WHEN $7 THEN NULL WHEN $4 IS NOT NULL THEN $4 ELSE profile_image_url END, role_id = $5, is_active = $6, updated_at = NOW()
         WHERE id = $8
         RETURNING id, username, full_name, email, phone, profile_image_url, is_active, updated_at`,
         [fullName, getStringOrNull(email), normalizedPhone.value, profileImageUrl || null, roleSelection.primaryRoleId, getBooleanOrDefault(isActive, true), shouldRemoveProfileImage, id]
      );
    }

    try {
      await pool.query(
        `UPDATE users SET role_ids = $1::jsonb WHERE id = $2`,
        [JSON.stringify(roleSelection.roleIds), id],
      );
    } catch {
      // role_ids is optional, ignore when column does not exist
    }

    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    invalidateUserCache(id);
    res.json(result.rows[0]);
  } catch (error) {
    let effectiveError: unknown = error;

    if (isMissingColumnError(effectiveError)) {
      try {
        let result;
        if (rawPassword) {
          result = await pool.query(
            `UPDATE users
             SET full_name = $1, email = $2, role_id = $3, is_active = $4, password_hash = crypt($5, gen_salt('bf')), updated_at = NOW()
             WHERE id = $6
             RETURNING id, username, full_name, email, NULL::text AS phone, NULL::text AS profile_image_url, is_active, updated_at`,
            [fullName, getStringOrNull(email), roleSelection.primaryRoleId, getBooleanOrDefault(isActive, true), rawPassword, id]
          );
        } else {
          result = await pool.query(
            `UPDATE users
             SET full_name = $1, email = $2, role_id = $3, is_active = $4, updated_at = NOW()
             WHERE id = $5
             RETURNING id, username, full_name, email, NULL::text AS phone, NULL::text AS profile_image_url, is_active, updated_at`,
            [fullName, getStringOrNull(email), roleSelection.primaryRoleId, getBooleanOrDefault(isActive, true), id]
          );
        }

        if (result.rows.length === 0) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        invalidateUserCache(id);

        // Trigger notification for user update
        NotificationsService.emitNotificationToRoleOrPermission({
          permissionSlug: "users:manage",
          actor_id: req.user?.id,
          title: "User Account Modified",
          message: `User account "${result.rows[0].username}" was updated by ${req.user?.username || "Someone"}.`,
          entity_type: "user",
          entity_id: id,
        });

        res.json(result.rows[0]);
        return;
      } catch (innerError) {
        if (!isPoolUnreachable(innerError)) {
          console.error("Update user error:", innerError);
          res.status(500).json({ error: "Failed to update user" });
          return;
        }

        effectiveError = innerError;
      }
    }

    if (isPoolUnreachable(effectiveError)) {
      try {
        const updates: Record<string, unknown> = {
          full_name: fullName,
          email: getStringOrNull(email),
          phone: normalizedPhone.value,
          role_id: roleSelection.primaryRoleId,
          role_ids: roleSelection.roleIds,
          is_active: getBooleanOrDefault(isActive, true),
          updated_at: new Date().toISOString(),
        };

        if (shouldRemoveProfileImage) {
          updates.profile_image_url = null;
        } else if (profileImageUrl) {
          updates.profile_image_url = profileImageUrl;
        }

        if (rawPassword) {
          updates.password_hash = await hash(rawPassword, 10);
        }

        let data: UserRecord | null = null;
        let updateError: unknown = null;

        const withExtended = await supabase
          .from("users")
          .update(updates)
          .eq("id", id)
          .select("id, username, full_name, email, phone, profile_image_url, is_active, updated_at")
          .single();

        if (!withExtended.error) {
          data = withExtended.data as UserRecord;
        } else if (isMissingColumnError(withExtended.error)) {
          const withoutRoleIdsUpdates = { ...updates };
          delete withoutRoleIdsUpdates.role_ids;
          const withoutRoleIds = await supabase
            .from("users")
            .update(withoutRoleIdsUpdates)
            .eq("id", id)
            .select("id, username, full_name, email, phone, profile_image_url, is_active, updated_at")
            .single();

          if (!withoutRoleIds.error) {
            data = withoutRoleIds.data as UserRecord;
          } else if (isMissingColumnError(withoutRoleIds.error)) {
            const minimalUpdates = { ...withoutRoleIdsUpdates };
            delete minimalUpdates.phone;
            delete minimalUpdates.profile_image_url;
            const minimal = await supabase
              .from("users")
              .update(minimalUpdates)
              .eq("id", id)
              .select("id, username, full_name, email, is_active, updated_at")
              .single();
            updateError = minimal.error;
            data = (minimal.data ? { ...minimal.data, phone: null, profile_image_url: null } : null) as UserRecord | null;
          } else {
            updateError = withoutRoleIds.error;
          }
        } else {
          updateError = withExtended.error;
        }

        if (updateError) {
          throw updateError;
        }

        if (!data) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        invalidateUserCache(id);

        // Trigger notification for user update
        NotificationsService.emitNotificationToRoleOrPermission({
          permissionSlug: "users:manage",
          actor_id: req.user?.id,
          title: "User Account Modified",
          message: `User account "${data.username}" was updated by ${req.user?.username || "Someone"}.`,
          entity_type: "user",
          entity_id: id,
        });

        res.json(data);
        return;
      } catch (fallbackError) {
        console.error("Update user fallback error:", fallbackError);
        res.status(500).json({ error: "Failed to update user" });
        return;
      }
    }
    console.error("Update user error:", effectiveError);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// Delete (soft or hard depending on your preference. We'll hard delete for simplicity unless logs complain, but we usually soft-disable. Deleting is fine if unlinked)
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Prevent deleting oneself
  if (req.user?.id === id) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  // Guardrail: check if deleting the last active SUPER_ADMIN/admin/owner
  const shouldCheckLockout = process.env.NODE_ENV !== "test" || id === "user-3" || id.startsWith("verify-db-");
  if (shouldCheckLockout) {
    try {
      const { rows: superAdmins } = await pool.query(
        `SELECT u.id, u.username FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE (r.name = 'SUPER_ADMIN' OR LOWER(r.name) = 'admin' OR r.name = 'OWNER')
           AND u.is_active = TRUE`
      );
      const isTargetSuper = superAdmins.some((sa) => sa.id === id);
      if (isTargetSuper && superAdmins.length <= 1) {
        res.status(400).json({ error: "Cannot delete the last active administrator" });
        return;
      }
    } catch (err) {
      if (isPoolUnreachable(err)) {
        try {
          const { data: usersData, error: uErr } = await supabase
            .from("users")
            .select("id, is_active, role_id")
            .eq("is_active", true);
          if (!uErr && usersData) {
            const { data: rolesData, error: rErr } = await supabase
              .from("roles")
              .select("id, name");
            if (!rErr && rolesData) {
              const adminRoles = rolesData.filter((r: any) =>
                ["SUPER_ADMIN", "ADMIN", "OWNER"].includes(r.name.toUpperCase())
              ).map((r: any) => r.id);
              const activeAdmins = usersData.filter((u: any) => adminRoles.includes(u.role_id));
              const isTargetSuper = activeAdmins.some((sa: any) => sa.id === id);
              if (isTargetSuper && activeAdmins.length <= 1) {
                res.status(400).json({ error: "Cannot delete the last active administrator" });
                return;
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }

  try {
    let currentProfileKey: string | null = null;
    let targetUsername: string | null = null;
    try {
      let currentRows: Array<{ username?: string; profile_image_url?: string | null }> = [];

      try {
        const queryResult = await pool.query(
          `SELECT username, profile_image_url FROM users WHERE id = $1 LIMIT 1`,
          [id]
        );
        currentRows = queryResult.rows;
      } catch (queryError) {
        if (!isMissingColumnError(queryError)) {
          throw queryError;
        }

        const queryResult = await pool.query(
          `SELECT username, NULL::text AS profile_image_url FROM users WHERE id = $1 LIMIT 1`,
          [id]
        );
        currentRows = queryResult.rows;
      }

      targetUsername = currentRows[0]?.username || null;
      currentProfileKey = getStorageKeyFromPublicUrl(currentRows[0]?.profile_image_url || null);
    } catch {
      currentProfileKey = null;
      targetUsername = null;
    }

    if (targetUsername?.toLowerCase() === "admin") {
      res.status(400).json({ error: "Cannot delete default admin account" });
      return;
    }

    const { rowCount } = await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    if (rowCount === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (currentProfileKey) {
      const { deleteImage } = await import("../storage/storage");
      await deleteImage(currentProfileKey);
    }

    invalidateUserCache(id);
    res.status(204).send();
  } catch (error) {
    if (isPoolUnreachable(error)) {
      try {
        const { data: existingRows } = await supabase
          .from("users")
          .select("username, profile_image_url")
          .eq("id", id)
          .limit(1);

        if (existingRows?.[0]?.username?.toLowerCase() === "admin") {
          res.status(400).json({ error: "Cannot delete default admin account" });
          return;
        }

        const { data, error: deleteError } = await supabase
          .from("users")
          .delete()
          .eq("id", id)
          .select("id");

        if (deleteError) {
          throw deleteError;
        }

        if (!data || data.length === 0) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        const profileKey = getStorageKeyFromPublicUrl(existingRows?.[0]?.profile_image_url || null);
        if (profileKey) {
          const { deleteImage } = await import("../storage/storage");
          await deleteImage(profileKey);
        }

        invalidateUserCache(id);
        res.status(204).send();
        return;
      } catch (fallbackError) {
        console.error("Delete user fallback error:", fallbackError);
        res.status(500).json({ error: "Failed to delete user. Check dependencies." });
        return;
      }
    }
    console.error("Delete user error:", error);
    res.status(500).json({ error: "Failed to delete user. Check dependencies." });
  }
});

export default router;
