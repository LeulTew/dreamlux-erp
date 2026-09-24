"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getRecordListPreference,
  saveRecordListPreference,
  type RecordListPreference,
  type RecordListPreferencePayload,
} from "@/lib/api";
import { usePrivateDraftAccess } from "@/components/PrivateDraftBoundary";

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
  const privateDraft = usePrivateDraftAccess();
  const scope = privateDraft?.scope;
  const enabled = options.enabled !== false && (privateDraft?.active ?? true);
  const { debounceMs = 600 } = options;
  const [preference, setPreference] = useState<RecordListPreference | null>(null);
  // When disabled we are trivially "loaded" (no fetch to wait for).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const isLoaded = !enabled || loadedFor === recordType;
  const [appliedFor, setAppliedFor] = useState<string | null>(null);
  const isReady = !enabled || (isLoaded && appliedFor === recordType);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPayload = useRef<RecordListPreferencePayload | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setAppliedFor(null);
        setLoadError(null);
      }
    });
    getRecordListPreference(recordType, scope?.request())
      .then((pref) => {
        if (!cancelled && (!scope || scope.ready())) setPreference(pref);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPreference(null);
          setLoadError(error instanceof Error ? error : new Error("Failed to load list preferences"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadedFor(recordType);
      });
    return () => {
      cancelled = true;
    };
  }, [recordType, enabled, scope]);

  const markApplied = useCallback(() => setAppliedFor(recordType), [recordType]);

  const flush = useCallback(() => {
    if (!enabled || !latestPayload.current || (scope && !scope.ready())) return;
    const payload = latestPayload.current;
    latestPayload.current = null;
    setIsSaving(true);
    setSaveError(null);
    saveRecordListPreference(recordType, payload, scope?.request())
      .then((pref) => {
        if (scope) scope.settle(() => setPreference(pref));
        else setPreference(pref);
      })
      .catch((error: unknown) => {
        const report = () => setSaveError(error instanceof Error ? error : new Error("Failed to save list preferences"));
        if (scope) scope.settle(report);
        else report();
      })
      .finally(() => { if (!scope || scope.alive()) setIsSaving(false); });
  }, [recordType, enabled, scope]);

  const save = useCallback(
    (payload: RecordListPreferencePayload) => {
      if (!enabled || !isReady || (scope && !scope.ready())) return;
      latestPayload.current = { ...(latestPayload.current ?? {}), ...payload };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, debounceMs);
    },
    [enabled, isReady, debounceMs, flush, scope],
  );

  // Persist any pending change on unmount so navigation never drops the latest state.
  useEffect(() => {
    const unregister = scope?.beforeDispose(flush);
    return () => {
      unregister?.();
      if (timerRef.current) clearTimeout(timerRef.current);
      flush();
    };
  }, [flush, scope]);

  return { preference, isLoaded, isReady, markApplied, save, loadError, saveError, isSaving };
}
