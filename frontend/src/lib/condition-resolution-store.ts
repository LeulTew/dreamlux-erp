import {
  ConditionContractError, matchesConditionResolution, parseConditionIntent, parseConditionResolution,
  type ConditionIntent, type ConditionResolution,
} from "./condition-stock";

export type ConditionFailure = "offline" | "access" | "admission" | "missing" | "rejected" | "conflict" | "unknown" | "mismatch" | "storage" | "read" | "noRecord";
type Phase = "loading" | "idle" | "pending" | "unknown" | "conflict" | "rejected" | "acknowledged" | "blocked";
export type ConditionWriteState = {
  phase: Phase; intent: ConditionIntent | null; receipt: ConditionResolution | null;
  failure: ConditionFailure | null; storageWarning: boolean;
};
export const emptyConditionWriteState: ConditionWriteState = {
  phase: "loading", intent: null, receipt: null, failure: null, storageWarning: false,
};
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Journal = {
  version: 1; intent: ConditionIntent; status: "unknown" | "conflict" | "rejected" | "acknowledged";
  receipt: ConditionResolution | null;
};
export type ConditionAttempt = Readonly<{ intent: ConditionIntent; uncertain: boolean; token: symbol }>;
export const conditionStorageKey = (actorId: string) => `dreamlux-erp:condition-resolution:v1:${actorId}`;

export function createConditionResolutionStore(actorId: string, storage: () => StoragePort) {
  const key = conditionStorageKey(actorId);
  const listeners = new Set<() => void>();
  let state = emptyConditionWriteState;
  let stored: string | null | undefined;
  let flight: ConditionAttempt | null = null;
  const publish = (next: ConditionWriteState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const logStorage = (error: unknown) => console.error("[ConditionStock] Recovery storage unavailable", {
    actorId, errorType: error instanceof Error ? error.name : typeof error,
  });
  const persist = (entry: Journal | null) => {
    try {
      const target = storage();
      if (stored === undefined || target.getItem(key) !== stored) throw new Error("Recovery journal ownership changed");
      const next = entry === null ? null : JSON.stringify({ ...entry, revision: crypto.randomUUID() });
      if (next === null) target.removeItem(key);
      else target.setItem(key, next);
      if (target.getItem(key) !== next) throw new Error("Recovery journal was not retained");
      stored = next;
      return true;
    } catch (error) {
      logStorage(error);
      return false;
    }
  };
  const owns = (attempt: ConditionAttempt) => flight === attempt && state.intent === attempt.intent;
  const savedEntry = (intent: ConditionIntent, status: Journal["status"], receipt: ConditionResolution | null = null): Journal =>
    ({ version: 1, intent, status, receipt });
  return {
    snapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load(force = false) {
      if (flight || (!force && state.phase !== "loading")) return;
      try {
        const raw = storage().getItem(key);
        if (raw === null) {
          stored = raw;
          if (state.intent) {
            const phase = state.phase === "acknowledged" || state.phase === "rejected" || state.phase === "conflict" ? state.phase : "unknown";
            if (!persist(savedEntry(state.intent, phase, state.receipt))) throw new Error("Retained recovery could not be restored");
            publish({ ...state, phase, storageWarning: false });
            return;
          }
          publish({ ...emptyConditionWriteState, phase: "idle" });
          return;
        }
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1
          || !("intent" in parsed) || !("status" in parsed) || !("receipt" in parsed)) throw new ConditionContractError();
        const intent = parseConditionIntent(parsed.intent, actorId);
        if (state.intent && JSON.stringify(state.intent) !== JSON.stringify(intent)) {
          throw new Error("A different retained operation cannot replace the current request");
        }
        if (parsed.status !== "unknown" && parsed.status !== "conflict" && parsed.status !== "rejected" && parsed.status !== "acknowledged") {
          throw new ConditionContractError();
        }
        const receipt = parsed.receipt === null ? null : parseConditionResolution(parsed.receipt);
        if ((parsed.status === "acknowledged") !== Boolean(receipt) || (receipt && !matchesConditionResolution(intent, receipt))) {
          throw new ConditionContractError();
        }
        stored = raw;
        publish({ phase: parsed.status, intent, receipt, storageWarning: false,
          failure: parsed.status === "unknown" ? "unknown" : parsed.status === "conflict" ? "mismatch"
            : parsed.status === "rejected" ? "rejected" : null });
      } catch (error) {
        logStorage(error);
        publish({ ...state, phase: "blocked", failure: "storage", storageWarning: true });
      }
    },
    begin(intent?: ConditionIntent): ConditionAttempt | null {
      if (flight || state.storageWarning || stored === undefined) return null;
      const retry = !intent;
      if (retry ? state.phase !== "unknown" : state.phase !== "idle") return null;
      const submitted = intent ?? state.intent;
      if (!submitted || submitted.actor_id !== actorId) return null;
      if (!persist(savedEntry(submitted, "unknown"))) {
        publish({ ...state, phase: "blocked", failure: "storage", storageWarning: true });
        return null;
      }
      flight = Object.freeze({ intent: submitted, uncertain: retry, token: Symbol() });
      publish({ phase: "pending", intent: submitted, receipt: null, failure: null, storageWarning: false });
      return flight;
    },
    acknowledge(attempt: ConditionAttempt, receipt: ConditionResolution) {
      if (!owns(attempt) || !matchesConditionResolution(attempt.intent, receipt)) return false;
      const retained = persist(savedEntry(attempt.intent, "acknowledged", receipt));
      flight = null;
      publish({ phase: "acknowledged", intent: attempt.intent, receipt, failure: null, storageWarning: !retained });
      return true;
    },
    fail(attempt: ConditionAttempt, failure: ConditionFailure, knownRejection: boolean) {
      if (!owns(attempt)) return false;
      // A rejection of a later attempt cannot settle an earlier uncertain commit.
      const phase = failure === "mismatch" ? "conflict" : attempt.uncertain || !knownRejection ? "unknown" : "rejected";
      const retained = persist(savedEntry(attempt.intent, phase));
      flight = null;
      publish({ phase, intent: attempt.intent, receipt: null, failure, storageWarning: !retained });
      return true;
    },
    inspect(expectedKey: string, receipt: ConditionResolution | null) {
      const intent = state.intent;
      if (flight || !intent || intent.payload.idempotency_key !== expectedKey) return false;
      if (receipt === null) {
        publish({ ...state, failure: "noRecord" });
        return false;
      }
      const matches = matchesConditionResolution(intent, receipt);
      const phase = matches ? "acknowledged" : "conflict";
      const retained = persist(savedEntry(intent, phase, matches ? receipt : null));
      publish({ phase, intent, receipt: matches ? receipt : null,
        failure: matches ? null : "mismatch", storageWarning: !retained });
      return matches;
    },
    release(expectedKey: string) {
      if (flight || state.intent?.payload.idempotency_key !== expectedKey
        || (state.phase !== "acknowledged" && state.phase !== "rejected")) return false;
      if (!persist(null)) {
        publish({ ...state, storageWarning: true, failure: "storage" });
        return false;
      }
      publish({ ...emptyConditionWriteState, phase: "idle" });
      return true;
    },
  };
}
