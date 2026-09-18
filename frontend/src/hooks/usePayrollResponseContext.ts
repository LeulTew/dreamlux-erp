import { useCallback, useLayoutEffect, useRef } from "react";

export type PayrollResponseOwner = () => boolean;

export function usePayrollResponseContext(contextKey: string, input?: unknown) {
  const current = useRef<object | null>(null);
  useLayoutEffect(() => {
    const generation = {};
    current.current = generation;
    return () => { if (current.current === generation) current.current = null; };
  }, [contextKey, input]);

  return useCallback((): PayrollResponseOwner => {
    const captured = current.current;
    // Returning to the same record or period does not revive an old request.
    return () => captured !== null && current.current === captured;
  }, []);
}
