export const SIDEBAR_SECTION_IDS = [
  "employees",
  "events",
  "finance",
  "reference-data",
  "inventory",
] as const;

export type SidebarSectionId = (typeof SIDEBAR_SECTION_IDS)[number];
export type SidebarSectionPreferences = Partial<Record<SidebarSectionId, boolean>>;

type Snapshot = {
  sections: SidebarSectionPreferences;
  persistence: "device" | "session";
};

const SERVER_SNAPSHOT: Snapshot = { sections: {}, persistence: "device" };

export function sidebarPreferencesKey(userId: string) {
  return `dreamlux:sidebar-sections:v1:${encodeURIComponent(userId)}`;
}

function parsePreferences(raw: string | null): SidebarSectionPreferences {
  if (raw === null) return {};
  const value: unknown = JSON.parse(raw);
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    !("version" in value) || value.version !== 1 ||
    !("sections" in value) || typeof value.sections !== "object" ||
    value.sections === null || Array.isArray(value.sections)
  ) {
    throw new Error("Invalid sidebar preference format");
  }

  const sections: SidebarSectionPreferences = {};
  for (const id of SIDEBAR_SECTION_IDS) {
    if (Object.prototype.hasOwnProperty.call(value.sections, id)) {
      const open = Reflect.get(value.sections, id);
      if (typeof open !== "boolean") {
        throw new Error("Invalid sidebar section preference");
      }
      sections[id] = open;
    }
  }
  return sections;
}

function createStore(key: string | null) {
  let snapshot = SERVER_SNAPSHOT;
  let lastRaw: string | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const fail = (operation: "read" | "write" | "sync", error: unknown) => {
    console.warn("[Dream Lux navigation] Device preferences unavailable; using session-only choices.", {
      operation,
      reason: error instanceof Error ? error.name : "UnknownError",
    });
    snapshot = { ...snapshot, persistence: "session" };
  };

  const refresh = () => {
    if (!key || snapshot.persistence === "session") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== lastRaw) {
        const sections = parsePreferences(raw);
        snapshot = { sections, persistence: "device" };
        lastRaw = raw;
      }
    } catch (error) {
      fail("read", error);
    }
  };

  const onStorage = (event: StorageEvent) => {
    if (!key || event.key !== key) return;
    try {
      if (event.storageArea !== window.localStorage) return;
      const sections = parsePreferences(event.newValue);
      snapshot = { sections, persistence: "device" };
      lastRaw = event.newValue;
    } catch (error) {
      fail("sync", error);
    }
    notify();
  };

  if (typeof window !== "undefined") refresh();

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => SERVER_SNAPSHOT,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1 && key) {
        window.addEventListener("storage", onStorage);
        const before = snapshot;
        refresh();
        if (snapshot !== before) notify();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener("storage", onStorage);
      };
    },
    update: (patch: SidebarSectionPreferences) => {
      if (!key) return;
      // Merge against the latest device value so a bulk action cannot reset hidden sections.
      refresh();
      snapshot = { ...snapshot, sections: { ...snapshot.sections, ...patch } };
      if (snapshot.persistence === "device") {
        try {
          const raw = JSON.stringify({ version: 1, sections: snapshot.sections });
          window.localStorage.setItem(key, raw);
          lastRaw = raw;
        } catch (error) {
          fail("write", error);
        }
      }
      notify();
    },
  };
}

// Retain session-only choices across AuthLayout remounts, but never cache user state on the server.
const browserStores = new Map<string, ReturnType<typeof createStore>>();

export function getSidebarPreferencesStore(userId: string | undefined) {
  if (typeof window === "undefined" || !userId) return createStore(null);
  const key = sidebarPreferencesKey(userId);
  let store = browserStores.get(key);
  if (!store) {
    store = createStore(key);
    browserStores.set(key, store);
  }
  return store;
}
