import { Pool, PoolClient } from "pg";

export type EventServiceScopeRow = {
  id: string;
  code: string;
  name_en: string;
  name_am: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
};

export type ServiceScopeSummary = {
  id: string;
  code: string;
  name_en: string;
  name_am: string;
};

/**
 * Get all active service scopes from catalog (ordered by display_order ASC)
 */
export async function getActiveServiceScopes(client: PoolClient | Pool): Promise<EventServiceScopeRow[]> {
  const result = await client.query<EventServiceScopeRow>(
    `SELECT id, code, name_en, name_am, description, display_order, is_active
     FROM event_service_scopes
     WHERE is_active = TRUE
     ORDER BY display_order ASC`,
  );
  return result.rows;
}

/**
 * Validate an array of scope IDs, codes, or bilingual names against the catalog.
 * Throws actionable validation error if any scope is invalid.
 */
export async function validateAndResolveServiceScopes(
  client: PoolClient | Pool,
  inputScopes: string[] | string | null | undefined,
): Promise<string[]> {
  if (!inputScopes) return [];
  let scopeItems: string[] = [];
  if (typeof inputScopes === "string") {
    scopeItems = inputScopes.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  } else if (Array.isArray(inputScopes)) {
    scopeItems = inputScopes.map((s) => String(s).trim()).filter(Boolean);
  }
  if (scopeItems.length === 0) return [];

  const catalog = await getActiveServiceScopes(client);
  const idMap = new Map<string, string>();

  for (const item of catalog) {
    idMap.set(item.id.toLowerCase(), item.id);
    idMap.set(item.code.toLowerCase(), item.id);
    idMap.set(item.name_en.toLowerCase(), item.id);
    idMap.set(item.name_am.toLowerCase(), item.id);
  }

  const resolvedIds: string[] = [];
  const seen = new Set<string>();

  for (const input of scopeItems) {
    if (typeof input !== "string") {
      throw new Error(`Invalid service scope value: expected string`);
    }
    const clean = input.trim().toLowerCase();
    if (!clean) continue;

    const matchedId = idMap.get(clean);
    if (!matchedId) {
      throw new Error(`Unknown or invalid service scope: "${input}"`);
    }

    if (!seen.has(matchedId)) {
      seen.add(matchedId);
      resolvedIds.push(matchedId);
    }
  }

  return resolvedIds;
}

/**
 * Batch fetch proposal service scopes to prevent N+1 queries.
 */
export async function fetchProposalServiceScopes(
  client: PoolClient | Pool,
  proposalIds: string[],
): Promise<Map<string, ServiceScopeSummary[]>> {
  const map = new Map<string, ServiceScopeSummary[]>();
  if (proposalIds.length === 0) return map;

  const result = await client.query<{
    proposal_id: string;
    id: string;
    code: string;
    name_en: string;
    name_am: string;
  }>(
    `SELECT pss.proposal_id, ess.id, ess.code, ess.name_en, ess.name_am
     FROM proposal_service_scopes pss
     JOIN event_service_scopes ess ON ess.id = pss.service_scope_id
     WHERE pss.proposal_id = ANY($1::uuid[])
     ORDER BY ess.display_order ASC`,
    [proposalIds],
  );

  for (const row of result.rows) {
    const list = map.get(row.proposal_id) || [];
    list.push({
      id: row.id,
      code: row.code,
      name_en: row.name_en,
      name_am: row.name_am,
    });
    map.set(row.proposal_id, list);
  }

  return map;
}

/**
 * Batch fetch event service scopes to prevent N+1 queries.
 */
export async function fetchEventServiceScopes(
  client: PoolClient | Pool,
  eventIds: string[],
): Promise<Map<string, ServiceScopeSummary[]>> {
  const map = new Map<string, ServiceScopeSummary[]>();
  if (eventIds.length === 0) return map;

  const result = await client.query<{
    event_id: string;
    id: string;
    code: string;
    name_en: string;
    name_am: string;
  }>(
    `SELECT essl.event_id, ess.id, ess.code, ess.name_en, ess.name_am
     FROM event_service_scope_links essl
     JOIN event_service_scopes ess ON ess.id = essl.service_scope_id
     WHERE essl.event_id = ANY($1::uuid[])
     ORDER BY ess.display_order ASC`,
    [eventIds],
  );

  for (const row of result.rows) {
    const list = map.get(row.event_id) || [];
    list.push({
      id: row.id,
      code: row.code,
      name_en: row.name_en,
      name_am: row.name_am,
    });
    map.set(row.event_id, list);
  }

  return map;
}

/**
 * Replace proposal service scopes transactionally.
 */
export async function setProposalServiceScopes(
  client: PoolClient | Pool,
  proposalId: string,
  scopeIds: string[],
): Promise<void> {
  await client.query(`DELETE FROM proposal_service_scopes WHERE proposal_id = $1`, [proposalId]);
  for (const scopeId of scopeIds) {
    await client.query(
      `INSERT INTO proposal_service_scopes (proposal_id, service_scope_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [proposalId, scopeId],
    );
  }
}

/**
 * Replace event service scopes transactionally.
 */
export async function setEventServiceScopes(
  client: PoolClient | Pool,
  eventId: string,
  scopeIds: string[],
): Promise<void> {
  await client.query(`DELETE FROM event_service_scope_links WHERE event_id = $1`, [eventId]);
  for (const scopeId of scopeIds) {
    await client.query(
      `INSERT INTO event_service_scope_links (event_id, service_scope_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [eventId, scopeId],
    );
  }
}

/**
 * Copy proposal service scopes to event atomically during conversion.
 */
export async function copyProposalServiceScopesToEvent(
  client: PoolClient | Pool,
  proposalId: string,
  eventId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO event_service_scope_links (event_id, service_scope_id)
     SELECT $1, service_scope_id FROM proposal_service_scopes WHERE proposal_id = $2
     ON CONFLICT DO NOTHING`,
    [eventId, proposalId],
  );
}
