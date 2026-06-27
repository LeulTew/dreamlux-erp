export type SyncQueueStatus = "idle" | "offline" | "syncing" | "warning";

export type QueuedMutation = {
  id: string;
  endpoint: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  createdAt: string;
  retryCount: number;
  lastError?: string;
};

export type SyncQueueSnapshot = {
  status: SyncQueueStatus;
  pendingCount: number;
  isOnline: boolean;
  lastError?: string;
};

const DB_NAME = "dreamlux-offline-sync";
const DB_VERSION = 1;
const STORE_NAME = "queued-mutations";
const WARNING_THRESHOLD = 10;

let cachedSnapshot: SyncQueueSnapshot = {
  status: "idle",
  pendingCount: 0,
  isOnline: true,
};

const listeners = new Set<() => void>();
let dbPromise: Promise<IDBDatabase> | null = null;
let flushInProgress = false;

function getBrowserOnlineState(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openQueueDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open sync queue database"));
    });
  }

  return dbPromise;
}

function withStore<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openQueueDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = callback(tx.objectStore(STORE_NAME));

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Sync queue operation failed"));
        tx.onerror = () => reject(tx.error ?? new Error("Sync queue transaction failed"));
      })
  );
}

function computeStatus(pendingCount: number, isOnline: boolean, lastError?: string, forceSyncing = false): SyncQueueStatus {
  if (!isOnline) return "offline";
  if (forceSyncing) return "syncing";
  if (lastError || pendingCount >= WARNING_THRESHOLD) return "warning";
  return "idle";
}

function publish(next: Partial<SyncQueueSnapshot>) {
  cachedSnapshot = { ...cachedSnapshot, ...next };
  cachedSnapshot.status = computeStatus(
    cachedSnapshot.pendingCount,
    cachedSnapshot.isOnline,
    cachedSnapshot.lastError,
    next.status === "syncing"
  );
  listeners.forEach((listener) => listener());
}

export function getSyncQueueSnapshot(): SyncQueueSnapshot {
  return cachedSnapshot;
}

export function subscribeSyncQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refreshSyncQueueSnapshot(): Promise<SyncQueueSnapshot> {
  try {
    const pending = await listQueuedMutations();
    publish({
      pendingCount: pending.length,
      isOnline: getBrowserOnlineState(),
      lastError: pending.find((item) => item.lastError)?.lastError,
    });
  } catch (error) {
    publish({
      isOnline: getBrowserOnlineState(),
      lastError: error instanceof Error ? error.message : "Failed to inspect sync queue",
    });
  }

  return cachedSnapshot;
}

export async function enqueueMutation(mutation: Omit<QueuedMutation, "id" | "createdAt" | "retryCount">): Promise<QueuedMutation> {
  const queued: QueuedMutation = {
    ...mutation,
    id: createId(),
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };

  await withStore("readwrite", (store) => store.add(queued));
  await refreshSyncQueueSnapshot();
  return queued;
}

export async function listQueuedMutations(): Promise<QueuedMutation[]> {
  return withStore<QueuedMutation[]>("readonly", (store) => store.getAll());
}

async function updateQueuedMutation(mutation: QueuedMutation): Promise<void> {
  await withStore("readwrite", (store) => store.put(mutation));
}

async function removeQueuedMutation(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function flushSyncQueue(fetcher: typeof fetch = fetch): Promise<SyncQueueSnapshot> {
  if (flushInProgress || !getBrowserOnlineState()) {
    await refreshSyncQueueSnapshot();
    return cachedSnapshot;
  }

  flushInProgress = true;
  publish({ status: "syncing", isOnline: true, lastError: undefined });

  try {
    const queued = await listQueuedMutations();

    for (const mutation of queued) {
      try {
        const response = await fetcher(mutation.endpoint, {
          method: mutation.method,
          headers: {
            "Content-Type": "application/json",
            ...mutation.headers,
          },
          body: mutation.body === undefined ? undefined : JSON.stringify(mutation.body),
        });

        if (!response.ok) {
          throw new Error(`Sync failed with HTTP ${response.status}`);
        }

        await removeQueuedMutation(mutation.id);
      } catch (error) {
        await updateQueuedMutation({
          ...mutation,
          retryCount: mutation.retryCount + 1,
          lastError: error instanceof Error ? error.message : "Sync failed",
        });
      }
    }
  } finally {
    flushInProgress = false;
    await refreshSyncQueueSnapshot();
  }

  return cachedSnapshot;
}

export function registerSyncQueueOnlineListeners(): () => void {
  if (typeof window === "undefined") return () => {};

  const refresh = () => {
    void refreshSyncQueueSnapshot();
  };
  const flush = () => {
    void flushSyncQueue();
  };

  window.addEventListener("online", flush);
  window.addEventListener("offline", refresh);
  void refreshSyncQueueSnapshot();

  return () => {
    window.removeEventListener("online", flush);
    window.removeEventListener("offline", refresh);
  };
}
