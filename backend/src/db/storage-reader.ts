import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type StorageReader = {
  from(bucket: string): ReturnType<SupabaseClient["storage"]["from"]>;
  getBucket(bucket: string, signal: AbortSignal): ReturnType<SupabaseClient["storage"]["getBucket"]>;
};

export function createStorageReader(
  url: string,
  key: string,
  headers: Record<string, string> = {},
  fetcher: typeof fetch = globalThis.fetch,
): StorageReader {
  const storage = (operationSignal?: AbortSignal) => createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      headers,
      fetch: Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const signals = [AbortSignal.timeout(30_000)];
        if (operationSignal) signals.push(operationSignal);
        if (init?.signal) signals.push(init.signal);
        if (input instanceof Request) signals.push(input.signal);
        return fetcher(input, { ...init, signal: AbortSignal.any(signals) });
      }, { preconnect: () => { throw new Error("Storage backup does not use speculative preconnections"); } }),
    },
  }).storage;
  const client = storage();
  return {
    from: (bucket) => client.from(bucket),
    // The pinned SDK's getBucket has no per-call fetch parameters.
    getBucket: (bucket, signal) => storage(signal).getBucket(bucket),
  };
}
