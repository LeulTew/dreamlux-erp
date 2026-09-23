import { api } from "./api";
import { createPermissionMatcher } from "./permission-matcher";
import {
  ConditionAccessChanged, conditionId, parseConditionAcknowledgement, parseConditionDetail, parseConditionList,
  type ConditionHistoryCursor, type ConditionIntent,
} from "./condition-stock";

export async function getConditionStock(actorId: string, options: {
  search?: string; after?: string; includeArchived?: boolean; signal?: AbortSignal;
} = {}) {
  const response = await api.get<unknown>("/events/returns/condition-stock", {
    params: { search: options.search, after: options.after, include_archived: String(options.includeArchived ?? false), limit: 25 },
    headers: { "X-Condition-Actor": actorId }, signal: options.signal, timeout: 15_000,
  });
  return parseConditionList(response.data);
}

export async function getConditionItem(actorId: string, itemId: string, options: {
  cursor?: ConditionHistoryCursor; key?: string; signal?: AbortSignal;
} = {}) {
  const canonicalId = conditionId(itemId).toLowerCase();
  const response = await api.get<unknown>(`/events/returns/items/${canonicalId}/condition-stock`, {
    params: {
      limit: 10, before_id: options.cursor?.id,
      before_time: options.cursor ? options.cursor.created_at ?? "null" : undefined,
      idempotency_key: options.key,
    },
    headers: { "X-Condition-Actor": actorId }, signal: options.signal, timeout: 15_000,
  });
  return parseConditionDetail(response.data, canonicalId, options.key);
}

export async function assertConditionActor(actorId: string) {
  const authority = await getConditionAuthority(actorId);
  if (!authority.canResolve) throw new ConditionAccessChanged();
}

export async function getConditionAuthority(expectedActorId?: string, signal?: AbortSignal) {
  const response = await api.get<{ user_id?: unknown; permission_slugs?: unknown }>("/auth/permissions", { timeout: 10_000, signal });
  const authority = response.data;
  if (!authority || typeof authority.user_id !== "string" || !Array.isArray(authority.permission_slugs)
    || !authority.permission_slugs.every((slug): slug is string => typeof slug === "string" && slug.trim().length > 0)) {
    throw new ConditionAccessChanged();
  }
  const actorId = conditionId(authority.user_id);
  if (expectedActorId !== undefined && actorId !== conditionId(expectedActorId)) throw new ConditionAccessChanged();
  const hasPermission = createPermissionMatcher(authority.permission_slugs);
  return {
    actorId,
    canRead: hasPermission("assets:read") || hasPermission("assets:reconcile"),
    canResolve: hasPermission("assets:reconcile"),
    canReadMovements: hasPermission("assets:read"),
  };
}

export async function submitConditionResolution(intent: ConditionIntent) {
  const response = await api.post<unknown>(`/events/returns/items/${intent.item_id}/condition-resolutions`, intent.payload, {
    headers: { "X-Condition-Actor": intent.actor_id }, timeout: 20_000,
  });
  return parseConditionAcknowledgement(response.data, intent);
}
