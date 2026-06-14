import { pool } from "../db/pool";

type BootstrapAdminRow = {
  id: string;
  username: string;
  full_name: string;
  is_active: boolean;
  role_name: string;
  permissions: Record<string, unknown>;
};

type RoleRow = {
  id: string;
  name: string;
  permissions: Record<string, unknown>;
};

function normalizePermissions(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return { all: true };
}

export async function ensureBootstrapAdmin(rawPassword: string): Promise<BootstrapAdminRow> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let role: RoleRow | null = null;
    const roleResult = await client.query(
      `SELECT id, name, permissions FROM roles WHERE name = 'SUPER_ADMIN' LIMIT 1`
    );

    if (roleResult.rows.length > 0) {
      role = {
        id: roleResult.rows[0].id,
        name: roleResult.rows[0].name,
        permissions: normalizePermissions(roleResult.rows[0].permissions),
      };
    } else {
      const insertedRole = await client.query(
        `INSERT INTO roles (name, description, permissions)
         VALUES ('SUPER_ADMIN', 'Full system access', $1::jsonb)
         RETURNING id, name, permissions`,
        [JSON.stringify({ all: true })],
      );
      role = {
        id: insertedRole.rows[0].id,
        name: insertedRole.rows[0].name,
        permissions: normalizePermissions(insertedRole.rows[0].permissions),
      };
    }

    const userResult = await client.query(
      `SELECT u.id, u.username, u.full_name, u.is_active, r.name AS role_name, r.permissions
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.username = 'admin'
       LIMIT 1`
    );

    let user: BootstrapAdminRow;

    if (userResult.rows.length === 0) {
      const insertedUser = await client.query(
        `INSERT INTO users (username, password_hash, full_name, email, role_id, is_active)
         VALUES ('admin', crypt($1, gen_salt('bf')), 'System Administrator', 'admin@local.erp', $2, TRUE)
         RETURNING id, username, full_name, is_active`,
        [rawPassword, role.id],
      );

      user = {
        id: insertedUser.rows[0].id,
        username: insertedUser.rows[0].username,
        full_name: insertedUser.rows[0].full_name,
        is_active: insertedUser.rows[0].is_active,
        role_name: role.name,
        permissions: role.permissions,
      };
    } else {
      const existing = userResult.rows[0];
      const mustSyncRole = existing.role_name !== "SUPER_ADMIN";
      const mustActivate = !existing.is_active;

      if (mustSyncRole || mustActivate) {
        const updated = await client.query(
          `UPDATE users
           SET role_id = $1, is_active = TRUE, updated_at = NOW()
           WHERE id = $2
           RETURNING id, username, full_name, is_active`,
          [role.id, existing.id],
        );

        user = {
          id: updated.rows[0].id,
          username: updated.rows[0].username,
          full_name: updated.rows[0].full_name,
          is_active: updated.rows[0].is_active,
          role_name: role.name,
          permissions: role.permissions,
        };
      } else {
        user = {
          id: existing.id,
          username: existing.username,
          full_name: existing.full_name,
          is_active: existing.is_active,
          role_name: existing.role_name,
          permissions: normalizePermissions(existing.permissions),
        };
      }
    }

    await client.query("COMMIT");
    return user;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}