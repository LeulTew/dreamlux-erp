import axios, { AxiosRequestConfig } from "axios";
import {
  User,
  Role,
  InventoryStats,
  Store,
  ItemsResponse,
  Item,
  ReconcileSummary,
  ReconcileRunDetail,
  ReconcileRun,
  EventWorkspace,
  EventChecklistItem,
} from "./types";

export type CreateUserPayload = {
  username: string;
  rawPassword: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  roleId: string;
  roleIds?: string[];
  profileImageDataUrl?: string;
};

export type UpdateUserPayload = {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  roleId: string;
  roleIds?: string[];
  isActive: boolean;
  rawPassword?: string;
  profileImageDataUrl?: string;
  removeProfileImage?: boolean;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : "");

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

const LOCAL_HISTORY_TRASH_IDS_KEY = "inventory_history_local_trash_ids";
const LOCAL_HISTORY_DELETED_IDS_KEY = "inventory_history_local_deleted_ids";
const LOCAL_RECONCILE_FALLBACK_RUNS_KEY = "inventory_reconcile_local_runs_v1";

type LocalFallbackRunItem = {
  id: string;
  item_id: string;
  item_name: string;
  previous_quantity: number;
  counted_quantity: number;
  delta: number;
  counted_at: string;
  counted_by_name: string;
};

type LocalFallbackRun = {
  id: string;
  started_at: string;
  completed_at: string;
  initiated_by_name?: string;
  store_id: string | null;
  store_name?: string | null;
  notes: string | null;
  item_count: number;
  primary_item_name?: string | null;
  total_delta: number;
  discrepancy_count: number;
  first_prev?: number;
  first_delta?: number;
  items: LocalFallbackRunItem[];
};

function readLocalFallbackRuns(): LocalFallbackRun[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(LOCAL_RECONCILE_FALLBACK_RUNS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is LocalFallbackRun => {
      if (!entry || typeof entry !== "object") {
        return false;
      }

      const maybe = entry as Partial<LocalFallbackRun>;
      return (
        typeof maybe.id === "string" &&
        typeof maybe.started_at === "string" &&
        typeof maybe.completed_at === "string" &&
        Array.isArray(maybe.items)
      );
    });
  } catch {
    return [];
  }
}

function writeLocalFallbackRuns(runs: LocalFallbackRun[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    LOCAL_RECONCILE_FALLBACK_RUNS_KEY,
    JSON.stringify(runs.slice(0, 500))
  );
}

function removeLocalFallbackRuns(runIds: string[]): void {
  if (runIds.length === 0) {
    return;
  }

  const idSet = new Set(runIds);
  const runs = readLocalFallbackRuns();
  writeLocalFallbackRuns(runs.filter((run) => !idSet.has(run.id)));
}

function toReconcileRunFromLocal(run: LocalFallbackRun): ReconcileRun {
  return {
    id: run.id,
    started_at: run.started_at,
    completed_at: run.completed_at,
    initiated_by: {
      id: "local",
      full_name: run.initiated_by_name || "Current User",
    },
    initiated_by_name: run.initiated_by_name || "Current User",
    store_id: run.store_id,
    store: run.store_id
      ? {
          id: run.store_id,
          name: run.store_name ?? null,
        }
      : null,
    store_name: run.store_name ?? undefined,
    status: "completed",
    notes: run.notes,
    item_count: Number(run.item_count || run.items.length),
    primary_item_name: run.primary_item_name || run.items[0]?.item_name || null,
    total_delta: Number(run.total_delta || 0),
    discrepancy_count: Number(run.discrepancy_count || 0),
    first_prev: run.first_prev,
    first_delta: run.first_delta,
    trashed_at: null,
  };
}

function toReconcileRunDetailFromLocal(run: LocalFallbackRun): ReconcileRunDetail {
  return {
    ...toReconcileRunFromLocal(run),
    items: run.items.map((item) => ({
      id: item.id,
      item_id: item.item_id,
      item_name: item.item_name,
      previous_quantity: Number(item.previous_quantity || 0),
      counted_quantity: Number(item.counted_quantity || 0),
      delta: Number(item.delta || 0),
      counted_by_name: item.counted_by_name || run.initiated_by_name || "Current User",
      counted_at: item.counted_at || run.started_at,
    })),
  };
}

function runTimestampMillis(run: ReconcileRun): number {
  const value = new Date(run.completed_at || run.started_at).getTime();
  return Number.isFinite(value) ? value : 0;
}

function runDedupSignature(run: ReconcileRun): string {
  const storeId = run.store_id || (typeof run.store === "object" ? run.store?.id : null) || "none";
  const primary = (run.primary_item_name || "").trim().toLowerCase();
  const itemCount = Number(run.item_count || 0);
  const prev = Number(run.first_prev ?? Number.NaN);
  const delta = Number(run.first_delta ?? Number.NaN);
  const totalDelta = Number(run.total_delta ?? Number.NaN);
  return [storeId, primary, itemCount, prev, delta, totalDelta].join("|");
}

function isLocalDuplicateOfServer(localRun: ReconcileRun, serverRun: ReconcileRun): boolean {
  if (!localRun.id.startsWith("local_audit_")) {
    return false;
  }

  if (runDedupSignature(localRun) !== runDedupSignature(serverRun)) {
    return false;
  }

  const localTime = runTimestampMillis(localRun);
  const serverTime = runTimestampMillis(serverRun);
  if (localTime === 0 || serverTime === 0) {
    return false;
  }

  // Allow a short time window because local fallback runs are created client-side.
  return Math.abs(localTime - serverTime) <= 10 * 60 * 1000;
}

function mergeWithLocalFallbackHistory(
  payload: { runs: ReconcileRun[]; total: number; page: number; limit: number },
  requestedView: "active" | "trash",
  requestedPage?: number,
  requestedLimit?: number
) {
  const serverRuns = payload.runs || [];
  const localRuns = readLocalFallbackRuns()
    .map(toReconcileRunFromLocal)
    .filter((localRun) => !serverRuns.some((serverRun) => isLocalDuplicateOfServer(localRun, serverRun)));
  const merged = new Map<string, ReconcileRun>();

  for (const run of localRuns) {
    merged.set(run.id, run);
  }

  for (const run of serverRuns) {
    if (!merged.has(run.id)) {
      merged.set(run.id, run);
    }
  }

  const sortedRuns = [...merged.values()].sort((a, b) => {
    const aTime = new Date(a.completed_at || a.started_at).getTime();
    const bTime = new Date(b.completed_at || b.started_at).getTime();
    if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
    if (!Number.isFinite(aTime)) return 1;
    if (!Number.isFinite(bTime)) return -1;
    return bTime - aTime;
  });

  const lifecycle = applyLocalLifecycleView(
    {
      runs: sortedRuns,
      total: sortedRuns.length,
      page: 1,
      limit: sortedRuns.length || 1,
    },
    requestedView
  );

  const limit = Math.max(1, Number(requestedLimit || payload.limit || 50));
  const page = Math.max(1, Number(requestedPage || payload.page || 1));
  const start = (page - 1) * limit;

  return {
    runs: lifecycle.runs.slice(start, start + limit),
    total: lifecycle.runs.length,
    page,
    limit,
  };
}

export function saveLocalReconcileFallbackRun(run: LocalFallbackRun): void {
  const existing = readLocalFallbackRuns();
  const next = [run, ...existing.filter((entry) => entry.id !== run.id)];
  writeLocalFallbackRuns(next);
}

function findLocalFallbackRun(runId: string): LocalFallbackRun | null {
  return readLocalFallbackRuns().find((run) => run.id === runId) || null;
}

function readLocalRunIdSet(storageKey: string): Set<string> {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(parsed.filter((value): value is string => typeof value === "string" && value.length > 0));
  } catch {
    return new Set<string>();
  }
}

function writeLocalRunIdSet(storageKey: string, values: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify([...values]));
}

function addLocalTrashIds(runIds: string[]): void {
  const trashSet = readLocalRunIdSet(LOCAL_HISTORY_TRASH_IDS_KEY);
  const deletedSet = readLocalRunIdSet(LOCAL_HISTORY_DELETED_IDS_KEY);

  for (const runId of runIds) {
    trashSet.add(runId);
    deletedSet.delete(runId);
  }

  writeLocalRunIdSet(LOCAL_HISTORY_TRASH_IDS_KEY, trashSet);
  writeLocalRunIdSet(LOCAL_HISTORY_DELETED_IDS_KEY, deletedSet);
}

function removeLocalTrashIds(runIds: string[]): void {
  const trashSet = readLocalRunIdSet(LOCAL_HISTORY_TRASH_IDS_KEY);
  for (const runId of runIds) {
    trashSet.delete(runId);
  }
  writeLocalRunIdSet(LOCAL_HISTORY_TRASH_IDS_KEY, trashSet);
}

function addLocalDeletedIds(runIds: string[]): void {
  const trashSet = readLocalRunIdSet(LOCAL_HISTORY_TRASH_IDS_KEY);
  const deletedSet = readLocalRunIdSet(LOCAL_HISTORY_DELETED_IDS_KEY);

  for (const runId of runIds) {
    deletedSet.add(runId);
    trashSet.delete(runId);
  }

  writeLocalRunIdSet(LOCAL_HISTORY_TRASH_IDS_KEY, trashSet);
  writeLocalRunIdSet(LOCAL_HISTORY_DELETED_IDS_KEY, deletedSet);
}

function applyLocalLifecycleView(
  payload: { runs: ReconcileRun[]; total: number; page: number; limit: number },
  requestedView: "active" | "trash"
) {
  const trashSet = readLocalRunIdSet(LOCAL_HISTORY_TRASH_IDS_KEY);
  const deletedSet = readLocalRunIdSet(LOCAL_HISTORY_DELETED_IDS_KEY);

  const filteredRuns = (payload.runs || []).filter((run) => {
    if (deletedSet.has(run.id)) {
      return false;
    }

    const isLocallyTrashed = trashSet.has(run.id);
    const isServerTrashed = typeof run.trashed_at === "string" && run.trashed_at.length > 0;
    return requestedView === "trash" ? isLocallyTrashed || isServerTrashed : !isLocallyTrashed && !isServerTrashed;
  });

  return {
    ...payload,
    runs: filteredRuns,
    total: filteredRuns.length,
  };
}

export default api;

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

function toLegacyItemsAlias(path: string): string {
  if (path === "/assets") {
    return "/items";
  }
  if (path.startsWith("/assets/")) {
    return `/items/${path.slice("/assets/".length)}`;
  }
  if (path.startsWith("/offices")) {
    return "/stores";
  }
  return path;
}

async function getWithAliasFallback<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  try {
    const response = await api.get<T>(path, config);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      const aliasPath = toLegacyItemsAlias(path);
      if (aliasPath !== path) {
        const fallbackResponse = await api.get<T>(aliasPath, config);
        return fallbackResponse.data;
      }
    }
    throw error;
  }
}

async function postWithAliasFallback<T>(path: string, body: unknown, config?: AxiosRequestConfig): Promise<T> {
  try {
    const response = await api.post<T>(path, body, config);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      const aliasPath = toLegacyItemsAlias(path);
      if (aliasPath !== path) {
        const fallbackResponse = await api.post<T>(aliasPath, body, config);
        return fallbackResponse.data;
      }
    }
    throw error;
  }
}

// Auth
export const login = (username: string, password: string) =>
  api.post("/auth/login", { username, password }).then((r) => r.data);

// Assets
export const getInventoryStats = (): Promise<InventoryStats> =>
  getWithAliasFallback<InventoryStats>("/assets/stats");

export const getItems = (
  page: number = 1,
  limit: number = 20,
  search?: string,
  store?: string,
  showTrash: boolean = false,
  status?: string,
  filter?: string,
  from?: string,
  to?: string,
) =>
{
  const resolvedStatus = status ?? (showTrash ? "trash" : undefined);

  return getWithAliasFallback<ItemsResponse>("/assets", {
    params: { page, limit, search, store, trash: showTrash, status: resolvedStatus, filter, from, to },
  });
};

export const bulkDeleteItems = (ids: string[]) =>
  api.delete("/assets/bulk", { data: { ids } }).then((r) => r.data);

export const recoverItem = (id: string, quantity: number) =>
  api.post(`/assets/${id}/recover`, { quantity }).then((r) => r.data);

export const createItem = (formData: FormData) =>
  api
    .post("/assets", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);

export const updateItem = (id: string, data: FormData | Record<string, unknown>) => {
  if (data instanceof FormData) {
    return api
      .patch(`/assets/${id}`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  }
  return api.patch(`/assets/${id}`, data).then((r) => r.data);
};

export const deleteItem = (id: string) =>
  api.delete(`/assets/${id}`).then((r) => r.data);

export const permanentlyDeleteItem = (id: string) =>
  api.delete(`/assets/${id}/permanent`).then((r) => r.data);

// Reconcile
export const getReconcilePreview = (params: { 
  store?: string; 
  page?: number; 
  limit?: number; 
  filter?: string;
  search?: string;
} = {}) => 
  getWithAliasFallback<{ items: Item[]; total: number; page: number; limit: number }>("/assets/reconcile/preview", { params });

export const submitReconcile = (data: { 
  items: Array<{
    id: string;
    quantity: number;
    expected_current_quantity?: number;
    source_run_id?: string;
  }>; 
  store_id?: string | null; 
  notes?: string;
}) => 
  postWithAliasFallback<ReconcileSummary>("/assets/reconcile", data);

export const undoReconcileHistoryItem = (params: { 
  runId: string;
  itemId: string;
  quantity: number;
  expectedCurrentQuantity: number;
  itemName?: string;
  store_id?: string | null;
}) =>
  submitReconcile({
    items: [
      {
        id: params.itemId,
        quantity: params.quantity,
      },
    ],
    store_id: params.store_id ?? null,
    notes: `Undo audit adjustment from run ${params.runId}`,
  }).then((result) => {
    if (!result.run_id) {
      const nowIso = new Date().toISOString();
      const localRunId = `local_audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const previousQuantity = Number(params.expectedCurrentQuantity || 0);
      const countedQuantity = Number(params.quantity || 0);

      saveLocalReconcileFallbackRun({
        id: localRunId,
        started_at: nowIso,
        completed_at: nowIso,
        initiated_by_name: "Current User",
        store_id: params.store_id ?? null,
        store_name: null,
        notes: `Undo audit adjustment from run ${params.runId}`,
        item_count: 1,
        primary_item_name: params.itemName || "Item",
        total_delta: countedQuantity - previousQuantity,
        discrepancy_count: countedQuantity === previousQuantity ? 0 : 1,
        first_prev: previousQuantity,
        first_delta: countedQuantity - previousQuantity,
        items: [
          {
            id: `${localRunId}_line_1`,
            item_id: params.itemId,
            item_name: params.itemName || "Item",
            previous_quantity: previousQuantity,
            counted_quantity: countedQuantity,
            delta: countedQuantity - previousQuantity,
            counted_at: nowIso,
            counted_by_name: "Current User",
          },
        ],
      });

      return {
        ...result,
        run_id: localRunId,
      };
    }

    return result;
  });

export const undoReconcileHistoryRun = async (runId: string): Promise<ReconcileSummary> => {
  const runDetail = await getReconcileRunDetail(runId);
  const items = runDetail.items
    .filter((item) => item.delta !== 0)
    .map((item) => ({
      id: item.item_id,
      quantity: item.previous_quantity,
    }));

  if (items.length === 0) {
    throw new Error("This run has no reversible discrepancies.");
  }

  const result = await submitReconcile({
    items,
    store_id: runDetail.store_id ?? null,
    notes: `Undo audit run ${runId}`,
  });

  if (!result.run_id) {
    const nowIso = new Date().toISOString();
    const localRunId = `local_audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const reversedItems = runDetail.items
      .filter((item) => item.delta !== 0)
      .map((item, index) => {
        const previousQuantity = Number(item.counted_quantity || 0);
        const countedQuantity = Number(item.previous_quantity || 0);
        return {
          id: `${localRunId}_line_${index + 1}`,
          item_id: item.item_id,
          item_name: item.item_name || "Item",
          previous_quantity: previousQuantity,
          counted_quantity: countedQuantity,
          delta: countedQuantity - previousQuantity,
          counted_at: nowIso,
          counted_by_name: "Current User",
        };
      });

    saveLocalReconcileFallbackRun({
      id: localRunId,
      started_at: nowIso,
      completed_at: nowIso,
      initiated_by_name: "Current User",
      store_id: runDetail.store_id ?? null,
      store_name: (typeof runDetail.store === "object" ? runDetail.store?.name : null) || runDetail.store_name || null,
      notes: `Undo audit run ${runId}`,
      item_count: reversedItems.length,
      primary_item_name: reversedItems[0]?.item_name || runDetail.primary_item_name || null,
      total_delta: reversedItems.reduce((sum, item) => sum + Number(item.delta || 0), 0),
      discrepancy_count: reversedItems.filter((item) => Number(item.delta || 0) !== 0).length,
      first_prev: reversedItems[0]?.previous_quantity,
      first_delta: reversedItems[0]?.delta,
      items: reversedItems,
    });

    return {
      ...result,
      run_id: localRunId,
    };
  }

  return result;
};

export const getReconcileHistory = (params: { 
  page?: number; 
  limit?: number; 
  store?: string;
  startDate?: string;
  endDate?: string;
  view?: "active" | "trash";
} = {}) => {
  const requestedView = params.view || "active";
  const includeLegacy = readLocalFallbackRuns().length === 0 ? "1" : "0";
  const queryParams = {
    ...params,
    view: requestedView,
    includeLegacy,
  };
  if (queryParams.store === 'all') delete queryParams.store;

  if (requestedView === "trash") {
    return Promise.all([
      api.get<{ runs: ReconcileRun[]; total: number; page: number; limit: number }>("/assets/history", {
        params: { ...queryParams, view: "trash" },
      }),
      api.get<{ runs: ReconcileRun[]; total: number; page: number; limit: number }>("/assets/history", {
        params: { ...queryParams, view: "active" },
      }),
    ]).then(([trashResponse, activeResponse]) => {
      const merged = new Map<string, ReconcileRun>();
      for (const run of trashResponse.data.runs || []) {
        merged.set(run.id, run);
      }
      for (const run of activeResponse.data.runs || []) {
        if (!merged.has(run.id)) {
          merged.set(run.id, run);
        }
      }

      return mergeWithLocalFallbackHistory(
        {
          runs: [...merged.values()],
          total: merged.size,
          page: trashResponse.data.page,
          limit: trashResponse.data.limit,
        },
        requestedView,
        params.page,
        params.limit
      );
    });
  }

  return api
    .get<{ runs: ReconcileRun[]; total: number; page: number; limit: number }>("/assets/history", {
      params: queryParams,
    })
    .then((response) =>
      mergeWithLocalFallbackHistory(response.data, requestedView, params.page, params.limit)
    );
};

export const trashAllReconcileHistory = () =>
  getReconcileHistory({ page: 1, limit: 5000, view: "active" }).then(async (snapshot) => {
    const runIds = (snapshot.runs || []).map((run) => run.id).filter((id) => typeof id === "string");
    addLocalTrashIds(runIds);

    try {
      await api.post<{ success: boolean; moved_runs: number; moved_legacy_runs: number }>("/assets/history/trash-all");
    } catch {
      // Keep local fallback behavior when backend lifecycle state is unavailable.
    }

    return {
      success: true,
      moved_runs: runIds.length,
      moved_legacy_runs: 0,
    };
  });

export const setReconcileHistoryTrash = (runId: string, trashed: boolean) =>
  runId.startsWith("local_audit_")
    ? Promise.resolve({
        success: true,
        run_id: runId,
        trashed,
      }).then((r) => {
        if (trashed) {
          addLocalTrashIds([runId]);
        } else {
          removeLocalTrashIds([runId]);
        }
        return r;
      })
    :
  api
    .patch<{ success: boolean; run_id: string; trashed: boolean }>(`/assets/history/${runId}/trash`, { trashed })
    .then((r) => {
      if (trashed) {
        addLocalTrashIds([runId]);
      } else {
        removeLocalTrashIds([runId]);
      }
      return r.data;
    });

export const deleteReconcileHistoryRun = (runId: string) =>
  runId.startsWith("local_audit_")
    ? Promise.resolve({
        success: true,
        run_id: runId,
        deleted: true,
      }).then((r) => {
        addLocalDeletedIds([runId]);
        removeLocalFallbackRuns([runId]);
        return r;
      })
    :
  api
    .delete<{ success: boolean; run_id: string; deleted: boolean }>(`/assets/history/${runId}`)
    .then((r) => {
      addLocalDeletedIds([runId]);
      removeLocalFallbackRuns([runId]);
      return r.data;
    });

export const clearReconcileHistory = () =>
  api
    .post<{ success: boolean; deleted_runs: number; deleted_legacy_runs: number }>("/assets/history/clear")
    .then((r) => {
      const trashSet = readLocalRunIdSet(LOCAL_HISTORY_TRASH_IDS_KEY);
      addLocalDeletedIds([...trashSet]);
      removeLocalFallbackRuns([...trashSet]);
      return r.data;
    });

type RawReconcileRunDetail =
  | ReconcileRunDetail
  | {
      run: Record<string, unknown>;
      items: Array<Record<string, unknown>>;
      notes?: string | null;
    };

function normalizeReconcileRunDetail(payload: RawReconcileRunDetail): ReconcileRunDetail {
  const wrapper = payload as {
    run?: Record<string, unknown>;
    items?: Array<Record<string, unknown>>;
    notes?: string | null;
  };
  const hasRunWrapper = !!wrapper.run;

  const run = (hasRunWrapper ? wrapper.run : (payload as unknown as Record<string, unknown>)) || {};
  const items = (hasRunWrapper
    ? wrapper.items
    : (payload as unknown as { items?: Array<Record<string, unknown>> }).items) || [];

  const startedAt = typeof run.started_at === "string" ? run.started_at : new Date().toISOString();
  const completedAt = typeof run.completed_at === "string" ? run.completed_at : null;
  const initiatedByRaw = run.initiated_by;
  const initiatedByUser = run.initiated_by_user as { id?: string; full_name?: string | null } | null | undefined;
  const initiatedByObject =
    typeof initiatedByRaw === "object" && initiatedByRaw !== null
      ? (initiatedByRaw as { id: string; full_name: string | null })
      : initiatedByUser
        ? {
            id: initiatedByUser.id || "",
            full_name: initiatedByUser.full_name ?? null,
          }
        : typeof initiatedByRaw === "string"
          ? initiatedByRaw
          : "";

  const storeObject = run.store as { id?: string; name?: string | null } | null | undefined;

  return {
    id: typeof run.id === "string" ? run.id : "",
    started_at: startedAt,
    completed_at: completedAt,
    initiated_by: initiatedByObject,
    initiated_by_name:
      typeof initiatedByObject === "object" && initiatedByObject !== null
        ? initiatedByObject.full_name || undefined
        : undefined,
    store_id: (typeof run.store_id === "string" ? run.store_id : null) ?? (storeObject?.id || null),
    store: storeObject
      ? {
          id: storeObject.id || "",
          name: storeObject.name ?? null,
        }
      : null,
    store_name: (typeof run.store_name === "string" ? run.store_name : undefined) || storeObject?.name || undefined,
    status: completedAt ? "completed" : "pending",
    notes:
      (typeof run.notes === "string" ? run.notes : null) ??
      (hasRunWrapper ? wrapper.notes ?? null : null),
    item_count: Number(typeof run.item_count === "number" ? run.item_count : items.length),
    items: items.map((item) => {
      const countedQuantity = Number(item.counted_quantity ?? 0);
      const rawPreviousQuantity = Number(item.previous_quantity);
      const hasPreviousQuantity = Number.isFinite(rawPreviousQuantity);
      const rawDelta = Number(item.delta);
      const hasDelta = Number.isFinite(rawDelta);
      const resolvedDelta = hasDelta ? rawDelta : countedQuantity - (hasPreviousQuantity ? rawPreviousQuantity : countedQuantity);
      const previousQuantity = hasPreviousQuantity ? rawPreviousQuantity : countedQuantity - resolvedDelta;
      const countedByUser = item.counted_by_user as { full_name?: string | null } | null | undefined;

      return {
        id: typeof item.id === "string" ? item.id : "",
        item_id: typeof item.item_id === "string" ? item.item_id : "",
        item_name: (typeof item.item_name === "string" ? item.item_name : null) || "Unknown Item",
        previous_quantity: previousQuantity,
        counted_quantity: countedQuantity,
        delta: resolvedDelta,
        counted_by_name:
          (typeof item.counted_by_name === "string" ? item.counted_by_name : null) ||
          countedByUser?.full_name ||
          "Unknown Operator",
        counted_at: (typeof item.counted_at === "string" ? item.counted_at : null) || startedAt,
      };
    }),
  };
}

export const getReconcileRunDetail = async (runId: string): Promise<ReconcileRunDetail> => {
  const localRun = findLocalFallbackRun(runId);
  if (localRun) {
    return toReconcileRunDetailFromLocal(localRun);
  }

  const payload = await getWithAliasFallback<RawReconcileRunDetail>(`/assets/history/${runId}`);
  return normalizeReconcileRunDetail(payload);
};

// Misc
export const getStores = (): Promise<Store[]> =>
  getWithAliasFallback<Store[]>("/offices");

export const rotateImage = (id: string) =>
  api.post(`/assets/${id}/rotate`).then((r) => r.data);

export const reconcileItems = (items: { id: string; quantity: number }[]) =>
  api.post("/assets/reconcile", { items }).then((r) => r.data);

// Employees
export const getEmployees = (
  page = 1,
  limit = 50,
  search?: string,
  status?: string,
  office_id?: string,
  department_id?: string,
  sortBy?: string,
  sortOrder?: string
) =>
  api
    .get("/employees", {
      params: { page, limit, search, status, office_id, department_id, sortBy, sortOrder },
    })
    .then((r) => r.data);

export const getEmployee = (id: string) =>
  api.get(`/employees/${id}`).then((r) => r.data);

export const recoverEmployee = (id: string) =>
  api.post(`/employees/${id}/recover`).then((r) => r.data);

export const createEmployee = (formData: FormData) =>
  api
    .post("/employees", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);

export const updateEmployee = (id: string, data: FormData | Record<string, unknown>) => {
  if (data instanceof FormData) {
    return api
      .patch(`/employees/${id}`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  }
  return api.patch(`/employees/${id}`, data).then((r) => r.data);
};

export const deleteEmployee = (id: string) =>
  api.delete(`/employees/${id}`).then((r) => r.data);

export const deleteEmployeePermanent = (id: string) =>
  api.delete(`/employees/${id}/permanent`).then((r) => r.data);

export const getNextEmployeeId = () =>
  api.get("/employees/next-id").then((r) => r.data);

// Departments
export const getDepartments = () =>
  api.get("/departments").then((r) => r.data);

export const createDepartment = (name: string) =>
  api.post("/departments", { name }).then((r) => r.data);

// Settings
export const getAppSettings = () =>
  api.get("/settings").then((r) => r.data);

export const updateAppSettings = (data: { employee_id_prefix: string }) =>
  api.patch("/settings", data).then((r) => r.data);

export const getBackendHealth = () =>
  api.get<{ status: string; timestamp: string }>("/health").then((r) => r.data);

export const bootstrapAdminUser = () =>
  api
    .post<{
      ok: boolean;
      degraded?: boolean;
      user: {
        id: string;
        username: string;
        full_name: string;
        role_name: string;
        is_active: boolean;
      };
    }>("/users/bootstrap-admin")
    .then((r) => r.data);

// Exports
export const exportPDF = (store?: string) =>
  api
    .get("/export/pdf", {
      params: { store: store || "all" },
      responseType: "blob",
    })
    .then((r) => {
      const url = window.URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "assets-report.pdf";
      a.click();
      window.URL.revokeObjectURL(url);
    });

export const exportExcel = (store?: string) =>
  api
    .get("/export/xlsx", {
      params: { store: store || "all" },
      responseType: "blob",
    })
    .then((r) => {
      const url = window.URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "assets-report.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
    });

export const exportCSV = (store?: string) =>
  api
    .get("/export/csv", {
      params: { store: store || "all" },
      responseType: "blob",
    })
    .then((r) => {
      const url = window.URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "assets-report.csv";
      a.click();
      window.URL.revokeObjectURL(url);
    });

// ------------------------------------------------------------------
// USER MANAGEMENT ENDPOINTS
// ------------------------------------------------------------------

export const getUsers = () => api.get<User[]>("/users").then((r) => r.data);

export const getRoles = () => api.get<Role[]>("/users/roles").then((r) => r.data);

export const createUser = (data: CreateUserPayload) =>
  api.post<User>("/users", data).then((r) => r.data);

export const updateUser = (id: string, data: UpdateUserPayload) =>
  api.put<User>(`/users/${id}`, data).then((r) => r.data);

export const deleteUser = (id: string) =>
  api.delete(`/users/${id}`).then((r) => r.data);


// ====================================================
// HR EXPORTS
// ====================================================

export const exportEmployeeExcel = (office?: string) =>
  api
    .get("/export/employees/xlsx", {
      params: { office: office || "all" },
      responseType: "blob",
    })
    .then((res) => {
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = "employees-report.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    });

export const exportEmployeeCSV = (office?: string) =>
  api
    .get("/export/employees/csv", {
      params: { office: office || "all" },
      responseType: "blob",
    })
    .then((res) => {
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "employees-report.csv";
      a.click();
      window.URL.revokeObjectURL(url);
    });

export const exportPayrollExcel = (runId: string) =>
  api
    .get(`/export/payroll/${runId}/xlsx`, {
      responseType: "blob",
    })
    .then((res) => {
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `payroll-run-${runId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    });

export const exportPayrollCSV = (runId: string) =>
  api
    .get(`/export/payroll/${runId}/csv`, {
      responseType: "blob",
    })
    .then((res) => {
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `payroll-run-${runId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    });

export const exportPayrollPDF = async (runId: string) => {
  // We'll implement this on the frontend using jspdf in a separate lib
  // For now, let's just use the print modal pattern or a specialized lib
  const { generatePayrollPDF } = await import("@/lib/pdf-payroll");
  const run = await getPayrollRun(runId);
  await generatePayrollPDF(run);
};


// ====================================================
// SALARY LEVELS
// ====================================================
export const getSalaryLevels = () => api.get("/salary-levels").then(res => res.data);
export const getSalaryLevel = (id: string) => api.get(`/salary-levels/${id}`).then(res => res.data);
export const getSalaryLevelDeleteImpact = (id: string) => api.get(`/salary-levels/${id}/delete-impact`).then(res => res.data as { salary_level_id: string; level_name: string; active_employee_count: number });
export const createSalaryLevel = (data: { level_name: string; base_salary: number }) => api.post("/salary-levels", data).then(res => res.data);
export const updateSalaryLevel = (id: string, data: { level_name?: string; base_salary?: number }) => api.put(`/salary-levels/${id}`, data).then(res => res.data);
export const deleteSalaryLevel = (id: string) => api.delete(`/salary-levels/${id}`).then(res => res.data);

export const deleteSalaryLevelPermanent = (id: string) => api.delete(`/salary-levels/${id}/permanent`).then(res => res.data);

// ====================================================
// EVENT TYPES
// ====================================================
export const getEventTypes = () => api.get("/event-types").then(res => res.data);
export const getEventType = (id: string) => api.get(`/event-types/${id}`).then(res => res.data);
export const createEventType = (data: { event_name: string; description?: string | null }) => api.post("/event-types", data).then(res => res.data);
export const updateEventType = (id: string, data: { event_name?: string; description?: string | null }) => api.put(`/event-types/${id}`, data).then(res => res.data);
export const deleteEventType = (id: string) => api.delete(`/event-types/${id}`).then(res => res.data);
export const deleteEventTypePermanent = (id: string) => api.delete(`/event-types/${id}/permanent`).then(res => res.data);
// ====================================================
// PAYROLL RUNS
// ====================================================
export const getPayrollRuns = (params?: { 
  view?: "active" | "trash",
  status?: string,
  year?: string,
  sortBy?: string,
  sortOrder?: string
}) =>
  api.get("/payroll/runs", { params }).then(res => res.data);
export const getPayrollRun = (id: string) => api.get(`/payroll/runs/${id}`).then(res => res.data);
export const updatePayrollRunStatus = (id: string, status: "DRAFT" | "FINALIZED" | "FLAGGED_WRONG" | "TRASH") =>
  api.patch(`/payroll/runs/${id}/status`, { status }).then(res => res.data);
export const deletePayrollRun = (id: string) => api.delete(`/payroll/runs/${id}`).then(res => res.data);
export const permanentlyDeletePayrollRun = (id: string) => api.delete(`/payroll/runs/${id}/permanent`).then(res => res.data);
export const previewPayrollRun = (data: Record<string, unknown>) => api.post("/payroll/preview", data).then(res => res.data);
export const savePayrollDraft = (data: Record<string, unknown>) => api.post("/payroll/drafts", data).then(res => res.data);
export const finalizePayrollRun = (data: Record<string, unknown>) => api.post("/payroll/runs", data).then(res => res.data);


export const getSalaryLevelsTrash = () => api.get("/salary-levels/trash/list").then(res => res.data);
export const restoreSalaryLevel = (id: string) => api.post(`/salary-levels/${id}/restore`).then(res => res.data);

export const getEventTypesTrash = () => api.get("/event-types/trash/list").then(res => res.data);
export const restoreEventType = (id: string) => api.post(`/event-types/${id}/restore`).then(res => res.data);

// ====================================================
// EVENTS LIFE CYCLE API
// ====================================================
export const getEvents = (
  page = 1,
  limit = 20,
  search?: string,
  status?: string,
  start_date?: string,
  end_date?: string
) =>
  api
    .get("/events", {
      params: { page, limit, search, status, start_date, end_date },
    })
    .then((r) => r.data);

export const getEvent = (id: string) =>
  api.get(`/events/${id}`).then((r) => r.data);

export const getEventWorkspace = (id: string): Promise<EventWorkspace> =>
  api.get(`/events/${id}/workspace`).then((r) => r.data);

export const createEvent = (data: Record<string, unknown>) =>
  api.post("/events", data).then((r) => r.data);

export const updateEvent = (id: string, data: Record<string, unknown>) =>
  api.put(`/events/${id}`, data).then((r) => r.data);

export const deleteEvent = (id: string) =>
  api.delete(`/events/${id}`).then((r) => r.data);

export const updateEventDesign = (
  id: string,
  data: { package_design_notes?: string | null; estimated_design_cost?: number | null }
) => api.patch(`/events/${id}/design`, data).then((r) => r.data);

export const createEventAllocation = (
  id: string,
  data: { item_id: string; quantity_allocated: number; notes?: string | null }
) => api.post(`/events/${id}/allocations`, data).then((r) => r.data);

export const deleteEventAllocation = (eventId: string, allocationId: string) =>
  api.delete(`/events/${eventId}/allocations/${allocationId}`).then((r) => r.data);

export const createEventChecklistItem = (
  id: string,
  data: { title: string; due_date?: string | null; owner_name?: string | null }
) => api.post(`/events/${id}/checklist`, data).then((r) => r.data);

export const updateEventChecklistItem = (
  eventId: string,
  itemId: string,
  data: Partial<Pick<EventChecklistItem, "title" | "status" | "due_date" | "owner_name">>
) => api.patch(`/events/${eventId}/checklist/${itemId}`, data).then((r) => r.data);
