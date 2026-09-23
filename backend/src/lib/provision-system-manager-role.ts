import type { PoolClient } from "pg";
import { pool } from "../db/pool";
import { ActivityService } from "../services/activity-service";

export class ManagerRoleProvisioningError extends Error {
  constructor(readonly uncertain = false) {
    super(uncertain
      ? "Manager role provisioning could not be confirmed. Review current roles before retrying."
      : "Manager role provisioning is unavailable. No new manager account was created.");
    this.name = "ManagerRoleProvisioningError";
  }
}

export async function provisionSystemManagerRole(actorId: string | null): Promise<{ id: string; name: string }> {
  let client: PoolClient | undefined;
  let began = false;
  let committing = false;
  let discard = false;
  try {
    client = await pool.connect();
    began = true;
    if ((await client.query("BEGIN")).command !== "BEGIN") throw new ManagerRoleProvisioningError();
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dreamlux-system-manager-provisioning'))");
    const existing = await client.query<{ id: string; name: string }>(
      "SELECT id,name FROM roles WHERE name='SYSTEM_MANAGER' FOR UPDATE",
    );
    let role = existing.rows[0];
    if (!role) {
      const created = await client.query<{ id: string; name: string }>(
        `INSERT INTO roles(name,description,permissions)
         VALUES ('SYSTEM_MANAGER','Can manage users and settings','{"settings":"write","users":"write"}'::jsonb)
         RETURNING id,name`,
      );
      if (created.rowCount !== 1 || !created.rows[0]?.id) throw new ManagerRoleProvisioningError();
      role = created.rows[0];
      await client.query(
        `INSERT INTO permissions(slug,description) VALUES
           ('settings:write','Manage system settings'),
           ('users:manage','Manage users and role assignments')
         ON CONFLICT(slug) DO NOTHING`,
      );
      const assigned = await client.query(
        `INSERT INTO role_permissions(role_id,permission_id)
         SELECT $1,id FROM permissions WHERE slug=ANY($2::text[])
         RETURNING permission_id`,
        [role.id, ["settings:write", "users:manage"]],
      );
      if (assigned.rowCount !== 2) throw new ManagerRoleProvisioningError();
      await ActivityService.writeActivity(client, {
        entity_type: "role", entity_id: role.id, user_id: actorId, action: "create_role",
        note: "Configured system manager role provisioning",
      });
    }
    committing = true;
    if ((await client.query("COMMIT")).command !== "COMMIT") throw new ManagerRoleProvisioningError(true);
    return role;
  } catch (error) {
    if (client && began) {
      try {
        discard = (await client.query("ROLLBACK")).command !== "ROLLBACK";
      } catch {
        discard = true;
      }
    }
    console.error("[ManagerRoleProvisioning] Failed", { outcomeUncertain: committing, connectionDiscarded: discard });
    if (error instanceof ManagerRoleProvisioningError && !committing) throw error;
    throw new ManagerRoleProvisioningError(committing);
  } finally {
    client?.release(discard);
  }
}
