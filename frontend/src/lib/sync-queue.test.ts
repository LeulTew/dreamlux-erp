import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  enqueueMutation,
  flushSyncQueue,
  listQueuedMutations,
  type QueuedMutation,
  registerSyncQueueOnlineListeners,
  subscribeSyncQueue,
} from "./sync-queue";

type MockRequest<T> = Pick<IDBRequest<T>, "onsuccess" | "onerror" | "result">;

type MockStore = {
  add: ReturnType<typeof vi.fn<(item: QueuedMutation) => MockRequest<string>>>;
  getAll: ReturnType<typeof vi.fn<() => MockRequest<QueuedMutation[]>>>;
  put: ReturnType<typeof vi.fn<(item: QueuedMutation) => MockRequest<string>>>;
  delete: ReturnType<typeof vi.fn<(id: string) => MockRequest<string>>>;
};

const mockStoreMap = new Map<string, QueuedMutation>();

// Helper to create a request that triggers onsuccess asynchronously
function createMockRequest<T>(result: T): MockRequest<T> {
  const req: MockRequest<T> = {
    onsuccess: null,
    onerror: null,
    result,
  };
  setTimeout(() => {
    req.onsuccess?.call(req as IDBRequest<T>, new Event("success"));
  }, 0);
  return req;
}

const mockStore: MockStore = {
  add: vi.fn((item: QueuedMutation) => {
    mockStoreMap.set(item.id, item);
    return createMockRequest(item.id);
  }),
  getAll: vi.fn(() => {
    return createMockRequest(Array.from(mockStoreMap.values()));
  }),
  put: vi.fn((item: QueuedMutation) => {
    mockStoreMap.set(item.id, item);
    return createMockRequest(item.id);
  }),
  delete: vi.fn((id: string) => {
    mockStoreMap.delete(id);
    return createMockRequest(id);
  }),
};

const mockTransaction = {
  objectStore: () => mockStore,
  onerror: null as IDBTransaction["onerror"],
};

const mockDb = {
  transaction: () => mockTransaction,
  objectStoreNames: {
    contains: () => true,
  },
};

describe("sync-queue library", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        const req: MockRequest<typeof mockDb> & Pick<IDBOpenDBRequest, "onupgradeneeded"> = {
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
          result: mockDb,
        };
        setTimeout(() => {
          req.onsuccess?.call(req as IDBRequest<typeof mockDb>, new Event("success"));
        }, 0);
        return req;
      },
    });

    mockStoreMap.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("handles basic subscription and publishes updates when mutations are enqueued", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSyncQueue(listener);

    const mutation = await enqueueMutation({
      endpoint: "/api/test",
      method: "POST",
      body: { data: "test" },
    });

    expect(mutation.id).toBeDefined();
    expect(mutation.retryCount).toBe(0);
    expect(listener).toHaveBeenCalled();

    unsubscribe();
  });

  it("flushes successful queued items with custom fetcher", async () => {
    await enqueueMutation({
      endpoint: "/api/success",
      method: "POST",
      body: { data: "success" },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const snapshot = await flushSyncQueue(mockFetch as typeof fetch);

    expect(mockFetch).toHaveBeenCalledWith("/api/success", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ data: "success" }),
    }));
    expect(snapshot.pendingCount).toBe(0);
  });

  it("increments retryCount on fetch errors and flags status as warning", async () => {
    await enqueueMutation({
      endpoint: "/api/fail",
      method: "PUT",
      body: { data: "fail" },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const snapshot = await flushSyncQueue(mockFetch as typeof fetch);

    expect(snapshot.pendingCount).toBe(1);
    expect(snapshot.status).toBe("warning");

    const items = await listQueuedMutations();
    expect(items[0].retryCount).toBe(1);
    expect(items[0].lastError).toContain("500");
  });

  it("registers and deregisters online/offline window listeners correctly", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const cleanup = registerSyncQueueOnlineListeners();

    expect(addSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith("offline", expect.any(Function));

    cleanup();

    expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));
  });
});
