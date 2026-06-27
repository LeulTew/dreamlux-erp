import type { PoolClient } from "pg";
import { pool } from "../db/pool";
import { invalidateAllCache, invalidateUserCache } from "./permissions-cache";

const PERMISSIONS_CHANGED_CHANNEL = "dreamlux_permissions_changed";

type PermissionChangePayload = {
  scope?: "user" | "all";
  userId?: string;
  reason?: string;
};

let listenerClient: PoolClient | null = null;
let listenerStarted = false;

function applyPermissionChangePayload(payload: string): void {
  let parsed: PermissionChangePayload;

  try {
    parsed = JSON.parse(payload) as PermissionChangePayload;
  } catch {
    invalidateAllCache();
    return;
  }

  if (parsed.scope === "user" && parsed.userId) {
    invalidateUserCache(parsed.userId);
    return;
  }

  invalidateAllCache();
}

export async function startPermissionCacheInvalidationListener(): Promise<void> {
  if (listenerStarted) return;
  listenerStarted = true;

  try {
    listenerClient = await pool.connect();
    await listenerClient.query(`LISTEN ${PERMISSIONS_CHANGED_CHANNEL}`);

    listenerClient.on("notification", (message) => {
      if (message.channel !== PERMISSIONS_CHANGED_CHANNEL || !message.payload) return;
      applyPermissionChangePayload(message.payload);
    });

    listenerClient.on("error", (error) => {
      listenerStarted = false;
      listenerClient = null;
      console.error("[PermissionsCache] LISTEN client error:", error);
    });

    console.log(`[PermissionsCache] Listening for ${PERMISSIONS_CHANGED_CHANNEL}`);
  } catch (error) {
    listenerStarted = false;
    listenerClient = null;
    console.error("[PermissionsCache] Failed to start invalidation listener:", error);
  }
}

export async function stopPermissionCacheInvalidationListener(): Promise<void> {
  if (!listenerClient) {
    listenerStarted = false;
    return;
  }

  const client = listenerClient;
  listenerClient = null;
  listenerStarted = false;

  try {
    await client.query(`UNLISTEN ${PERMISSIONS_CHANGED_CHANNEL}`);
  } finally {
    client.release();
  }
}
