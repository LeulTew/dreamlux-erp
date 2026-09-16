import { useSyncExternalStore } from "react";
import { getPayrollMutationFailure, type PayrollMutationFailure } from "@/lib/payroll-error";

type WriteState = { pending: boolean; failure: PayrollMutationFailure | null };
const idle: WriteState = { pending: false, failure: null };
let state = idle;
const listeners = new Set<() => void>();
const snapshot = () => state;
const serverSnapshot = () => idle;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

function update(next: WriteState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function begin() {
  // Shared across client-side navigation; changing pages is not a reload/acknowledgement.
  if (state.pending || state.failure?.needsReload) return false;
  update({ pending: true, failure: null });
  return true;
}

function complete() {
  update(idle);
}

function fail(error: unknown, fallback: string) {
  update({ pending: false, failure: getPayrollMutationFailure(error, fallback) });
}

export function usePayrollMutationGuard() {
  const { pending, failure } = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { begin, complete, fail, pending, failure, needsReload: failure?.needsReload ?? false };
}
