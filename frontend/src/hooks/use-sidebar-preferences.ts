"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  getSidebarPreferencesStore,
  type SidebarSectionId,
  type SidebarSectionPreferences,
} from "@/lib/sidebar-preferences";

export function useSidebarPreferences(userId: string | undefined) {
  const store = useMemo(() => getSidebarPreferencesStore(userId), [userId]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  return {
    ...snapshot,
    setSection: (id: SidebarSectionId, open: boolean) => store.update({ [id]: open }),
    setSections: (ids: SidebarSectionId[], open: boolean) => {
      const patch: SidebarSectionPreferences = {};
      for (const id of ids) patch[id] = open;
      store.update(patch);
    },
  };
}
