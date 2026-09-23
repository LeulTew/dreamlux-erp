"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  ConditionAccessChanged, ConditionIntentConflict, conditionQuantity, createConditionIntent,
  type ConditionDraft, type ConditionStockItem,
} from "@/lib/condition-stock";
import {
  createConditionResolutionStore, emptyConditionWriteState, type ConditionAttempt, type ConditionFailure,
} from "@/lib/condition-resolution-store";
import { assertConditionActor, getConditionItem, submitConditionResolution } from "@/lib/condition-stock-api";
import { extractPayrollHttpError } from "@/lib/payroll-error";
import { invalidateInventoryState } from "@/lib/inventory-cache";

const responseStatus = (error: unknown) => extractPayrollHttpError(error).status ?? undefined;
const stores = new WeakMap<QueryClient, Map<string, ReturnType<typeof createConditionResolutionStore>>>();
const serverSnapshot = () => emptyConditionWriteState;
const noSubscription = () => () => {};
class OfflineAdmission extends Error {}

function storeFor(client: QueryClient, actorId: string) {
  let actors = stores.get(client);
  if (!actors) { actors = new Map(); stores.set(client, actors); }
  let store = actors.get(actorId);
  if (!store) {
    store = createConditionResolutionStore(actorId, () => window.sessionStorage);
    actors.set(actorId, store);
  }
  return store;
}

export function useConditionResolution(actorId: string | undefined, canRead: boolean, canWrite: boolean) {
  const client = useQueryClient();
  const store = useMemo(() => actorId ? storeFor(client, actorId) : null, [client, actorId]);
  const state = useSyncExternalStore(store?.subscribe ?? noSubscription, store?.snapshot ?? serverSnapshot, serverSnapshot);
  const owner = useMemo(() => ({ actorId, canRead, canWrite, active: false, checking: false, operation: Symbol() }), [actorId, canRead, canWrite]);
  const [notice, setNotice] = useState<{ owner: typeof owner; failure: ConditionFailure } | null>(null);
  const [checking, setChecking] = useState<typeof owner | null>(null);
  const [refreshFailed, setRefreshFailed] = useState<typeof owner | null>(null);
  useEffect(() => {
    owner.active = canRead;
    if (canRead) store?.load();
    return () => { owner.active = false; };
  }, [owner, canRead, store]);

  const report = (failure: ConditionFailure) => { if (owner.active) setNotice({ owner, failure }); };
  const refresh = () => {
    if (!owner.active) return;
    // This is advisory only. Its promise is never a mutation acknowledgement,
    // and cannot hold an acknowledged request or another draft open.
    void invalidateInventoryState(client).catch((error: unknown) => {
      console.warn("[ConditionStock] Acknowledged stock refresh failed", { actorId, status: responseStatus(error) });
      if (owner.active) setRefreshFailed(owner);
    });
  };
  const dispatch = async (attempt: ConditionAttempt) => {
    let sent = false;
    try {
      await assertConditionActor(attempt.intent.actor_id);
      if (!owner.active || !canWrite) throw new ConditionAccessChanged();
      if (!navigator.onLine) throw new OfflineAdmission();
      sent = true;
      const receipt = await submitConditionResolution(attempt.intent);
      if (store?.acknowledge(attempt, receipt)) refresh();
    } catch (error: unknown) {
      const status = responseStatus(error);
      const failure: ConditionFailure = error instanceof OfflineAdmission ? "offline"
        : error instanceof ConditionAccessChanged || status === 401 || status === 403 ? "access"
          : !sent ? "admission"
          : error instanceof ConditionIntentConflict ? "mismatch"
            : status === 404 ? "missing" : status === 409 ? "conflict"
              : status === 400 || status === 422 || status === 429 ? "rejected" : "unknown";
      const response = error && typeof error === "object" && "response" in error ? error.response : undefined;
      const data = response && typeof response === "object" && "data" in response ? response.data : undefined;
      const uncertain = data && typeof data === "object" && "outcome_uncertain" in data && data.outcome_uncertain === true;
      const known = !sent || (!uncertain && [400, 401, 403, 404, 409, 422, 429].includes(status ?? 0));
      console.warn("[ConditionStock] Resolution not acknowledged", {
        actorId: attempt.intent.actor_id, itemId: attempt.intent.item_id, failure, status, sent,
      });
      store?.fail(attempt, failure, known);
    }
  };
  const submit = (item: ConditionStockItem, draft: ConditionDraft) => {
    if (!owner.active || !actorId || !canWrite) { report("access"); return; }
    if (!navigator.onLine) { report("offline"); return; }
    const quantity = conditionQuantity(draft.quantity);
    const balance = draft.source_condition === "damaged" ? item.unavailable_damaged_quantity : item.unavailable_repair_quantity;
    if (!quantity || quantity > balance || item.deleted_at || draft.notes.length > 1000) { report("rejected"); return; }
    try {
      const intent = createConditionIntent(actorId, item.id, crypto.randomUUID(), draft);
      const attempt = store?.begin(intent);
      if (attempt) { setNotice(null); void dispatch(attempt); }
    } catch (error) {
      console.error("[ConditionStock] Could not protect the request", { errorType: error instanceof Error ? error.name : typeof error });
      report("storage");
    }
  };
  const retry = () => {
    if (!owner.active || !canWrite) { report("access"); return; }
    if (!navigator.onLine) { report("offline"); return; }
    const attempt = store?.begin();
    if (attempt) { setNotice(null); void dispatch(attempt); }
  };
  const check = async () => {
    const intent = store?.snapshot().intent;
    if (!owner.active || !canRead || !intent || owner.checking || state.phase === "pending") return;
    if (!navigator.onLine) { report("offline"); return; }
    owner.checking = true;
    const operation = Symbol();
    owner.operation = operation;
    setChecking(owner);
    setNotice(null);
    try {
      const detail = await getConditionItem(intent.actor_id, intent.item_id, { key: intent.payload.idempotency_key });
      if (owner.active && owner.operation === operation && store?.inspect(intent.payload.idempotency_key, detail.recovery)) refresh();
    } catch (error) {
      console.warn("[ConditionStock] Recovery read unavailable", { actorId, status: responseStatus(error) });
      if (owner.operation === operation) report([401, 403].includes(responseStatus(error) ?? 0) ? "access" : "read");
    } finally {
      owner.checking = false;
      if (owner.active && owner.operation === operation) setChecking(null);
    }
  };
  return {
    state, submit, retry, check,
    checking: checking === owner,
    notice: notice?.owner === owner ? notice.failure : null,
    refreshFailed: refreshFailed === owner,
    release: (key: string) => {
      if (!owner.active) return false;
      owner.operation = Symbol();
      setNotice(null);
      return store?.release(key) ?? false;
    },
    reloadStorage: () => { if (owner.active) store?.load(true); },
  };
}
