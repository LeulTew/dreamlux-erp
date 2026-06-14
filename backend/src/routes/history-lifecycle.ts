import { supabase } from "../db/supabase";

export type HistoryView = "active" | "trash";
export const HISTORY_CLEAR_MARKER_PREFIX = "__history_clear_marker__:";
const HISTORY_CLEAR_SETTINGS_ID = 9999;
const HISTORY_CLEAR_SETTINGS_PREFIX = "__history_clear_cutoff__:";
const LEGACY_TRASH_SETTINGS_ID = 9997;
const LEGACY_DELETED_SETTINGS_ID = 9998;
const LEGACY_AUDIT_RUNS_SETTINGS_ID = 9996;
const LEGACY_TRASH_SETTINGS_PREFIX = "__legacy_trash_ids__:";
const LEGACY_DELETED_SETTINGS_PREFIX = "__legacy_deleted_ids__:";
const LEGACY_AUDIT_RUNS_SETTINGS_PREFIX = "__legacy_audit_runs__:";

type MissingTableErrorCheck = (error: unknown, tableName?: string) => boolean;
type MissingColumnErrorCheck = (error: unknown, columnName?: string) => boolean;

async function selectMaybeSingleCompat(query: any): Promise<{ data: any; error: unknown }> {
  if (query && typeof query.maybeSingle === "function") {
    return query.maybeSingle();
  }

  const fallback = await query.limit(1);
  if (fallback.error) {
    return { data: null, error: fallback.error };
  }

  const rows = Array.isArray(fallback.data) ? fallback.data : [];
  return { data: rows[0] ?? null, error: null };
}

export interface LegacyAuditRunItem {
  id: string;
  item_id: string;
  item_name: string;
  previous_quantity: number;
  counted_quantity: number;
  delta: number;
  counted_at: string;
  counted_by?: string | null;
  counted_by_name?: string | null;
}

export interface LegacyAuditRunRecord {
  run_id: string;
  started_at: string;
  completed_at: string;
  item_count: number;
  notes: string | null;
  store_id?: string | null;
  store_name?: string | null;
  initiated_by?: string | null;
  initiated_by_name?: string | null;
  primary_item_name?: string | null;
  total_delta?: number;
  discrepancy_count?: number;
  items: LegacyAuditRunItem[];
}

async function readLegacyStateFromSettings(
  id: number,
  prefix: string,
  options: { isMissingTableError: MissingTableErrorCheck }
): Promise<Set<string>> {
  const { isMissingTableError } = options;
  const state = new Set<string>();

  const query = supabase
    .from("app_settings")
    .select("employee_id_prefix")
    .eq("id", id);

  const result = await selectMaybeSingleCompat(query);

  if (result.error) {
    if (isMissingTableError(result.error, "app_settings")) {
      return state;
    }
    throw result.error;
  }

  const raw = result.data?.employee_id_prefix;
  if (typeof raw !== "string" || !raw.startsWith(prefix)) {
    return state;
  }

  const encoded = raw.slice(prefix.length);
  try {
    const parsed = JSON.parse(encoded) as unknown;
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (typeof entry === "string" && entry.length > 0) {
          state.add(entry);
        }
      }
    }
  } catch {
    return state;
  }

  return state;
}

async function writeLegacyStateToSettings(
  id: number,
  prefix: string,
  state: Set<string>,
  options: { isMissingTableError: MissingTableErrorCheck }
): Promise<void> {
  const { isMissingTableError } = options;

  const sorted = [...state].sort();
  const encoded = `${prefix}${JSON.stringify(sorted)}`;
  const writeResult = await supabase.from("app_settings").upsert({
    id,
    employee_id_prefix: encoded,
    updated_at: new Date().toISOString(),
  });

  if (!writeResult.error) {
    return;
  }

  if (isMissingTableError(writeResult.error, "app_settings")) {
    return;
  }

  throw writeResult.error;
}

export async function addLegacyRunsToTrashFallback(
  runIds: string[],
  options: { isMissingTableError: MissingTableErrorCheck }
): Promise<void> {
  if (runIds.length === 0) {
    return;
  }

  const state = await readLegacyStateFromSettings(LEGACY_TRASH_SETTINGS_ID, LEGACY_TRASH_SETTINGS_PREFIX, options);
  for (const runId of runIds) {
    state.add(runId);
  }
  await writeLegacyStateToSettings(LEGACY_TRASH_SETTINGS_ID, LEGACY_TRASH_SETTINGS_PREFIX, state, options);
}

export async function removeLegacyRunsFromTrashFallback(
  runIds: string[],
  options: { isMissingTableError: MissingTableErrorCheck }
): Promise<void> {
  if (runIds.length === 0) {
    return;
  }

  const state = await readLegacyStateFromSettings(LEGACY_TRASH_SETTINGS_ID, LEGACY_TRASH_SETTINGS_PREFIX, options);
  for (const runId of runIds) {
    state.delete(runId);
  }
  await writeLegacyStateToSettings(LEGACY_TRASH_SETTINGS_ID, LEGACY_TRASH_SETTINGS_PREFIX, state, options);
}

export async function addLegacyRunsToDeletedFallback(
  runIds: string[],
  options: { isMissingTableError: MissingTableErrorCheck }
): Promise<void> {
  if (runIds.length === 0) {
    return;
  }

  const state = await readLegacyStateFromSettings(LEGACY_DELETED_SETTINGS_ID, LEGACY_DELETED_SETTINGS_PREFIX, options);
  for (const runId of runIds) {
    state.add(runId);
  }
  await writeLegacyStateToSettings(LEGACY_DELETED_SETTINGS_ID, LEGACY_DELETED_SETTINGS_PREFIX, state, options);
}

export async function removeLegacyRunsFromDeletedFallback(
  runIds: string[],
  options: { isMissingTableError: MissingTableErrorCheck }
): Promise<void> {
  if (runIds.length === 0) {
    return;
  }

  const state = await readLegacyStateFromSettings(LEGACY_DELETED_SETTINGS_ID, LEGACY_DELETED_SETTINGS_PREFIX, options);
  for (const runId of runIds) {
    state.delete(runId);
  }
  await writeLegacyStateToSettings(LEGACY_DELETED_SETTINGS_ID, LEGACY_DELETED_SETTINGS_PREFIX, state, options);
}

export function makeLegacyRunId(itemId: string, countedAt: string, source: "counted" | "updated"): string {
  const millis = Number.isFinite(new Date(countedAt).getTime())
    ? new Date(countedAt).getTime()
    : Date.now();
  return `legacy_item_${source}_${itemId}_${millis}`;
}

export function parseLegacyRunId(
  runId: string
): { source: "counted" | "updated"; itemId: string; millis: number } | null {
  const match = /^legacy_item_(counted|updated)_([0-9a-fA-F-]{36})_(\d+)$/.exec(runId);
  if (!match) {
    return null;
  }

  return {
    source: match[1] as "counted" | "updated",
    itemId: match[2],
    millis: Number.parseInt(match[3], 10),
  };
}

export function parseHistoryView(rawView: unknown): HistoryView {
  const normalized = typeof rawView === "string" ? rawView.toLowerCase() : "active";
  return normalized === "trash" ? "trash" : "active";
}

export function isHistoryClearMarkerNote(notes: unknown): boolean {
  return typeof notes === "string" && notes.startsWith(HISTORY_CLEAR_MARKER_PREFIX);
}

export async function getHistoryClearCutoff(options: {
  isMissingTableError: MissingTableErrorCheck;
}): Promise<string | null> {
  const { isMissingTableError } = options;

  const settingsCutoffQuery = supabase
    .from("app_settings")
    .select("employee_id_prefix, updated_at")
    .eq("id", HISTORY_CLEAR_SETTINGS_ID);

  const settingsCutoffResult = await selectMaybeSingleCompat(settingsCutoffQuery);

  if (!settingsCutoffResult.error) {
    const rawPrefix = settingsCutoffResult.data?.employee_id_prefix;
    const prefixValue =
      typeof rawPrefix === "string" && rawPrefix.startsWith(HISTORY_CLEAR_SETTINGS_PREFIX)
        ? rawPrefix.slice(HISTORY_CLEAR_SETTINGS_PREFIX.length)
        : null;
    const updatedAtValue = typeof settingsCutoffResult.data?.updated_at === "string" ? settingsCutoffResult.data.updated_at : null;
    const settingsCutoff = prefixValue || updatedAtValue;

    if (settingsCutoff) {
      const parsedSettingsCutoff = new Date(settingsCutoff);
      if (Number.isFinite(parsedSettingsCutoff.getTime())) {
        return parsedSettingsCutoff.toISOString();
      }
    }
  } else if (!isMissingTableError(settingsCutoffResult.error, "app_settings")) {
    throw settingsCutoffResult.error;
  }

  const stateQuery = supabase
    .from("inventory_reconciliation_history_state")
    .select("cleared_before")
    .eq("id", 1);

  const stateResult = await selectMaybeSingleCompat(stateQuery);

  if (!stateResult.error) {
    const stateCutoff = stateResult.data?.cleared_before as string | null | undefined;
    if (typeof stateCutoff === "string") {
      const parsed = new Date(stateCutoff);
      if (Number.isFinite(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  } else if (!isMissingTableError(stateResult.error, "inventory_reconciliation_history_state")) {
    throw stateResult.error;
  }

  const markerQuery = supabase
    .from("inventory_reconciliation_runs")
    .select("notes, started_at")
    .like("notes", `${HISTORY_CLEAR_MARKER_PREFIX}%`)
    .order("started_at", { ascending: false })
    .limit(1);

  const markerResult = await selectMaybeSingleCompat(markerQuery);

  if (markerResult.error) {
    if (isMissingTableError(markerResult.error, "inventory_reconciliation_runs")) {
      return null;
    }
    throw markerResult.error;
  }

  const markerNotes = markerResult.data?.notes;
  const noteCutoff =
    typeof markerNotes === "string" && markerNotes.startsWith(HISTORY_CLEAR_MARKER_PREFIX)
      ? markerNotes.slice(HISTORY_CLEAR_MARKER_PREFIX.length)
      : null;
  const startedAtCutoff = typeof markerResult.data?.started_at === "string" ? markerResult.data.started_at : null;
  const fallbackCutoff = noteCutoff || startedAtCutoff;

  if (!fallbackCutoff) {
    return null;
  }

  const parsedFallback = new Date(fallbackCutoff);
  if (!Number.isFinite(parsedFallback.getTime())) {
    return null;
  }

  return parsedFallback.toISOString();
}

export async function setHistoryClearCutoff(
  clearedBefore: string,
  options: { isMissingTableError: MissingTableErrorCheck }
): Promise<void> {
  const { isMissingTableError } = options;

  const settingsWrite = await supabase.from("app_settings").upsert({
    id: HISTORY_CLEAR_SETTINGS_ID,
    employee_id_prefix: `${HISTORY_CLEAR_SETTINGS_PREFIX}${clearedBefore}`,
    updated_at: new Date().toISOString(),
  });

  if (!settingsWrite.error) {
    return;
  }

  if (!isMissingTableError(settingsWrite.error, "app_settings")) {
    throw settingsWrite.error;
  }

  const stateWrite = await supabase
    .from("inventory_reconciliation_history_state")
    .upsert({ id: 1, cleared_before: clearedBefore, updated_at: new Date().toISOString() });

  if (!stateWrite.error) {
    return;
  }

  if (!isMissingTableError(stateWrite.error, "inventory_reconciliation_history_state")) {
    throw stateWrite.error;
  }

  const markerWrite = await supabase.from("inventory_reconciliation_runs").insert({
    started_at: clearedBefore,
    completed_at: clearedBefore,
    item_count: 0,
    notes: `${HISTORY_CLEAR_MARKER_PREFIX}${clearedBefore}`,
  });

  if (markerWrite.error && !isMissingTableError(markerWrite.error, "inventory_reconciliation_runs")) {
    throw markerWrite.error;
  }
}

export async function getLatestLegacyEventTimestamp(options: {
  isMissingColumnError: MissingColumnErrorCheck;
  isMissingTableError: MissingTableErrorCheck;
}): Promise<string | null> {
  const { isMissingColumnError, isMissingTableError } = options;
  const candidateFields: Array<"last_counted_at" | "updated_at"> = ["last_counted_at", "updated_at"];
  let latestIso: string | null = null;

  for (const field of candidateFields) {
    const query = supabase
      .from("items")
      .select(field)
      .not(field, "is", null)
      .order(field, { ascending: false })
      .limit(1);

    const result = await selectMaybeSingleCompat(query);

    if (result.error) {
      if (isMissingColumnError(result.error) || isMissingTableError(result.error, "items")) {
        continue;
      }
      throw result.error;
    }

    const rawValue = (result.data as Record<string, unknown> | null)?.[field];
    if (typeof rawValue !== "string") {
      continue;
    }

    const rawMillis = new Date(rawValue).getTime();
    if (!Number.isFinite(rawMillis)) {
      continue;
    }

    if (!latestIso) {
      latestIso = rawValue;
      continue;
    }

    const latestMillis = new Date(latestIso).getTime();
    if (rawMillis > latestMillis) {
      latestIso = rawValue;
    }
  }

  return latestIso;
}

export async function getLegacyRunStateSets(options: {
  isMissingTableError: MissingTableErrorCheck;
}): Promise<{ trashed: Set<string>; deleted: Set<string> }> {
  const { isMissingTableError } = options;
  const trashed = new Set<string>();
  const deleted = new Set<string>();

  const [trashFallback, deletedFallback] = await Promise.all([
    readLegacyStateFromSettings(LEGACY_TRASH_SETTINGS_ID, LEGACY_TRASH_SETTINGS_PREFIX, options),
    readLegacyStateFromSettings(LEGACY_DELETED_SETTINGS_ID, LEGACY_DELETED_SETTINGS_PREFIX, options),
  ]);

  for (const runId of trashFallback) {
    trashed.add(runId);
  }

  for (const runId of deletedFallback) {
    deleted.add(runId);
  }

  const [trashRes, deletedRes] = await Promise.all([
    supabase.from("inventory_reconciliation_legacy_trash").select("run_id"),
    supabase.from("inventory_reconciliation_legacy_deleted").select("run_id"),
  ]);

  if (trashRes.error && !isMissingTableError(trashRes.error, "inventory_reconciliation_legacy_trash")) {
    throw trashRes.error;
  }

  if (deletedRes.error && !isMissingTableError(deletedRes.error, "inventory_reconciliation_legacy_deleted")) {
    throw deletedRes.error;
  }

  for (const row of trashRes.data || []) {
    if (typeof row.run_id === "string") {
      trashed.add(row.run_id);
    }
  }

  for (const row of deletedRes.data || []) {
    if (typeof row.run_id === "string") {
      deleted.add(row.run_id);
    }
  }

  return { trashed, deleted };
}

async function readLegacyAuditRunsFromSettings(options: {
  isMissingTableError: MissingTableErrorCheck;
}): Promise<LegacyAuditRunRecord[]> {
  const { isMissingTableError } = options;

  const query = supabase
    .from("app_settings")
    .select("employee_id_prefix")
    .eq("id", LEGACY_AUDIT_RUNS_SETTINGS_ID);

  const result = await selectMaybeSingleCompat(query);

  if (result.error) {
    if (isMissingTableError(result.error, "app_settings")) {
      return [];
    }
    throw result.error;
  }

  const raw = result.data?.employee_id_prefix;
  if (typeof raw !== "string" || !raw.startsWith(LEGACY_AUDIT_RUNS_SETTINGS_PREFIX)) {
    return [];
  }

  const encoded = raw.slice(LEGACY_AUDIT_RUNS_SETTINGS_PREFIX.length);
  try {
    const parsed = JSON.parse(encoded) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is LegacyAuditRunRecord => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        const maybe = entry as Partial<LegacyAuditRunRecord>;
        return (
          typeof maybe.run_id === "string" &&
          typeof maybe.started_at === "string" &&
          Array.isArray(maybe.items)
        );
      })
      .map((entry) => ({
        ...entry,
        completed_at: entry.completed_at || entry.started_at,
        item_count: Number(entry.item_count ?? entry.items.length),
        total_delta: Number(entry.total_delta ?? 0),
        discrepancy_count: Number(entry.discrepancy_count ?? 0),
        notes: entry.notes ?? null,
        items: entry.items.map((item) => ({
          id: String(item.id || `${entry.run_id}_${item.item_id || "line"}`),
          item_id: String(item.item_id || ""),
          item_name: String(item.item_name || "Item"),
          previous_quantity: Number(item.previous_quantity ?? 0),
          counted_quantity: Number(item.counted_quantity ?? 0),
          delta: Number(item.delta ?? 0),
          counted_at: String(item.counted_at || entry.started_at),
          counted_by: item.counted_by ?? null,
          counted_by_name: item.counted_by_name ?? null,
        })),
      }));
  } catch {
    return [];
  }
}

async function writeLegacyAuditRunsToSettings(
  runs: LegacyAuditRunRecord[],
  options: { isMissingTableError: MissingTableErrorCheck }
): Promise<void> {
  const { isMissingTableError } = options;

  const encoded = `${LEGACY_AUDIT_RUNS_SETTINGS_PREFIX}${JSON.stringify(runs.slice(0, 500))}`;
  const writeResult = await supabase.from("app_settings").upsert({
    id: LEGACY_AUDIT_RUNS_SETTINGS_ID,
    employee_id_prefix: encoded,
    updated_at: new Date().toISOString(),
  });

  if (!writeResult.error) {
    return;
  }

  if (isMissingTableError(writeResult.error, "app_settings")) {
    return;
  }

  throw writeResult.error;
}

export async function appendLegacyAuditRunFallback(
  run: LegacyAuditRunRecord,
  options: { isMissingTableError: MissingTableErrorCheck }
): Promise<void> {
  const existing = await readLegacyAuditRunsFromSettings(options);
  const deduped = [run, ...existing.filter((entry) => entry.run_id !== run.run_id)];
  await writeLegacyAuditRunsToSettings(deduped, options);
}

export async function listLegacyAuditRunsFallback(options: {
  isMissingTableError: MissingTableErrorCheck;
}): Promise<LegacyAuditRunRecord[]> {
  const runs = await readLegacyAuditRunsFromSettings(options);
  return runs.sort((a, b) => {
    const aMs = new Date(a.started_at).getTime();
    const bMs = new Date(b.started_at).getTime();
    if (!Number.isFinite(aMs) && !Number.isFinite(bMs)) return 0;
    if (!Number.isFinite(aMs)) return 1;
    if (!Number.isFinite(bMs)) return -1;
    return bMs - aMs;
  });
}

export async function findLegacyAuditRunFallback(
  runId: string,
  options: { isMissingTableError: MissingTableErrorCheck }
): Promise<LegacyAuditRunRecord | null> {
  const runs = await readLegacyAuditRunsFromSettings(options);
  return runs.find((entry) => entry.run_id === runId) || null;
}
