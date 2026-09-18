import { createHash } from "node:crypto";
import { z } from "zod";
import { createStorageReader } from "../storage-reader";

export type FixtureObject = { bucket: string; key: string; bytes: Uint8Array; contentType: string; updatedAt?: string };
type Call = { operation: "bucket" | "list" | "download"; bucket: string; prefix?: string; offset?: number; key?: string };
export type StorageFixtureBehavior = {
  failListOffset?: number;
  failDownloadKey?: string;
  repeatPage?: boolean;
  malformedPage?: boolean;
  unsafeName?: string;
  changeAfterDownload?: boolean;
  wrongSize?: boolean;
  delayMs?: number;
  missingBucket?: boolean;
};
const listBodySchema = z.object({
  prefix: z.string(), limit: z.literal(100), offset: z.number().int().nonnegative(),
  sortBy: z.object({ column: z.literal("name"), order: z.literal("asc") }),
});

export function storageHttpFixture(objects: readonly FixtureObject[], buckets: readonly string[]) {
  const key = `sb_secret_${"q".repeat(40)}`;
  const files = objects.map((object) => ({ ...object, updatedAt: object.updatedAt ?? "2026-09-18T00:00:00.000Z" }));
  const calls: Call[] = [];
  const unexpected: string[] = [];
  const behavior: StorageFixtureBehavior = {};
  let changed = false;
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    async fetch(request) {
      if (request.headers.get("apikey") !== key || request.headers.get("authorization") !== `Bearer ${key}`) {
        unexpected.push("authentication");
        return Response.json({ error: "Unexpected synthetic fixture authentication" }, { status: 401 });
      }
      const parts = new URL(request.url).pathname.split("/");
      if (request.method === "GET" && parts.slice(0, 4).join("/") === "/storage/v1/bucket" && parts.length === 5) {
        const bucket = decodeURIComponent(parts[4]);
        calls.push({ operation: "bucket", bucket });
        if (behavior.delayMs) await Bun.sleep(behavior.delayMs);
        if (!buckets.includes(bucket) || behavior.missingBucket) return Response.json({ message: "Bucket not found" }, { status: 404 });
        return Response.json({ id: bucket, name: bucket, public: false, created_at: "2026-09-18T00:00:00.000Z", updated_at: "2026-09-18T00:00:00.000Z" });
      }
      if (parts.slice(0, 4).join("/") !== "/storage/v1/object") {
        unexpected.push("path");
        return Response.json({ error: "Unexpected synthetic fixture path" }, { status: 404 });
      }
      if (request.method === "POST" && parts[4] === "list" && parts.length === 6) {
        const bucket = decodeURIComponent(parts[5]);
        const parsed = listBodySchema.safeParse(await request.json());
        if (!parsed.success || !buckets.includes(bucket)) {
          unexpected.push("list-contract");
          return Response.json({ error: "Unexpected synthetic list contract" }, { status: 400 });
        }
        const { prefix, limit, offset } = parsed.data;
        calls.push({ operation: "list", bucket, prefix, offset });
        if (behavior.delayMs) await Bun.sleep(behavior.delayMs);
        if (behavior.missingBucket) return Response.json([]);
        if (behavior.failListOffset === offset) return Response.json({ message: "Synthetic listing failure" }, { status: 503 });
        if (behavior.malformedPage) return Response.json(null);
        if (behavior.unsafeName) return Response.json([{ name: behavior.unsafeName, id: null, metadata: null, updated_at: null }]);
        const entries = new Map<string, {
          name: string; id: string | null; updated_at: string | null;
          metadata: { size: number; mimetype: string; eTag: string } | null;
        }>();
        for (const object of files.filter((file) => file.bucket === bucket)) {
          if (prefix && !object.key.startsWith(`${prefix}/`)) continue;
          const relative = prefix ? object.key.slice(prefix.length + 1) : object.key;
          const separator = relative.indexOf("/");
          if (separator !== -1) {
            const name = relative.slice(0, separator);
            entries.set(`folder:${name}`, { name, id: null, updated_at: null, metadata: null });
          } else {
            entries.set(`file:${relative}`, {
              name: relative,
              id: createHash("sha256").update(`${bucket}\0${object.key}`).digest("hex"),
              updated_at: object.updatedAt,
              metadata: {
                size: object.bytes.length + (behavior.wrongSize ? 1 : 0),
                mimetype: object.contentType,
                eTag: createHash("md5").update(object.bytes).digest("hex"),
              },
            });
          }
        }
        const sorted = [...entries.values()].sort((a, b) =>
          a.name < b.name ? -1 : a.name > b.name ? 1 : a.id === null ? -1 : 1);
        const start = behavior.repeatPage ? 0 : offset;
        return Response.json(sorted.slice(start, start + limit));
      }
      if (request.method === "GET" && parts.length >= 6) {
        const bucket = decodeURIComponent(parts[4]);
        const objectKey = parts.slice(5).map(decodeURIComponent).join("/");
        calls.push({ operation: "download", bucket, key: objectKey });
        if (behavior.delayMs) await Bun.sleep(behavior.delayMs);
        if (behavior.failDownloadKey === objectKey) return Response.json({ message: "Synthetic download failure" }, { status: 503 });
        const object = files.find((file) => file.bucket === bucket && file.key === objectKey);
        if (!object) {
          unexpected.push("unmatched-download");
          return Response.json({ message: "Unmatched synthetic object key" }, { status: 404 });
        }
        if (behavior.changeAfterDownload && !changed) {
          object.updatedAt = "2026-09-19T00:00:00.000Z";
          changed = true;
        }
        let offset = 0;
        return new Response(new ReadableStream<Uint8Array>({
          pull(controller) {
            if (offset >= object.bytes.length) { controller.close(); return; }
            const end = Math.min(offset + 4096, object.bytes.length);
            controller.enqueue(object.bytes.slice(offset, end));
            offset = end;
          },
        }), { headers: { "content-type": object.contentType } });
      }
      unexpected.push("method");
      return Response.json({ error: "Unexpected synthetic fixture operation" }, { status: 405 });
    },
  });
  const url = `http://127.0.0.1:${server.port}`;
  const nativeFetch = globalThis.fetch;
  const guardedFetch = Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const requested = input instanceof Request ? input.url : String(input);
    if (new URL(requested).origin !== url) throw new Error("Storage fixture refused unowned egress");
    return nativeFetch(input, init);
  }, { preconnect: () => { throw new Error("Storage fixture refused preconnection"); } });
  const reader = createStorageReader(url, key, {}, guardedFetch);
  return { reader, url, key, calls, unexpected, behavior, close: () => server.stop(true) };
}
