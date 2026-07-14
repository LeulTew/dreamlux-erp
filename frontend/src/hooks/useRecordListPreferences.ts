"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getRecordListPreference,
  saveRecordListPreference,
  type RecordListPreference,
  type RecordListPreferencePayload,
} from "@/lib/api";

/**
 * Per-user record list state persistence (issue #155).
 *
 * Fetches the stored preference for a record type on mount, then debounce-saves
 * changes. Consumers apply the returned `preference` as their INITIAL grid state
 * before firing their data queries, so the default state never flashes.
 *
 * The hook is deliberately transport-only: it does not own the grid state, so a
 * page can hydrate from `preference` once `isLoaded` is true and call `save`
 * whenever the user changes sort/filters/tab/page size.
 */
export function useRecordListPreferences(
  recordType: string,
  options: { enabled?: boolean; debounceMs?: number } = {},
) {
  const { enabled = true, debounceMs = 600 } = options;
  const [preference, setPreference] = useState<RecordListPreference | null>(null);
  // When disabled we are trivially "loaded" (no fetch to wait for).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const isLoaded = !enabled || loadedFor === recordType;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPayload = useRef<RecordListPreferencePayload | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getRecordListPreference(recordType)
      .then((pref) => {
        if (!cancelled) setPreference(pref);
      })
      .catch(() => {
        // A missing/failed preference must never block the grid — fall back to
        // defaults silently.
        if (!cancelled) setPreference(null);
      })
      .finally(() => {
        if (!cancelled) setLoadedFor(recordType);
      });
    return () => {
      cancelled = true;
    };
  }, [recordType, enabled]);

  const flush = useCallback(() => {
    if (!enabled || !latestPayload.current) return;
    const payload = latestPayload.current;
    latestPayload.current = null;
    saveRecordListPreference(recordType, payload)
      .then((pref) => setPreference(pref))
      .catch(() => {
        // Persistence is best-effort; a failed save should not disrupt the UI.
      });
  }, [recordType, enabled]);

  const save = useCallback(
    (payload: RecordListPreferencePayload) => {
      if (!enabled) return;
      latestPayload.current = { ...(latestPayload.current ?? {}), ...payload };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, debounceMs);
    },
    [enabled, debounceMs, flush],
  );

  // Persist any pending change on unmount so navigation never drops the latest state.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      flush();
    };
  }, [flush]);

  return { preference, isLoaded, save };
}
