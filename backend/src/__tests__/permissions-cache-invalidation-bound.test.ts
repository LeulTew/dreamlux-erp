/**
 * Issue #159: `cache` was bounded at 2000 with LRU eviction, but the sibling
 * `invalidationTimestamps` map was only ever written or cleared wholesale. Every
 * user id ever invalidated was retained for the process lifetime — a slow,
 * monotonic leak in the same module #85 hardened for long-running processes.
 *
 * Pruning must not weaken the #85 guarantee: an invalidation that lands while a
 * DB fetch is in flight still has to reject that fetch's stale write.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import {
  setCachedUserPermissions,
  invalidateUserCache,
  invalidateAllCache,
  CACHE_TTL_MS,
  INVALIDATION_RETENTION_MS,
  INVALIDATION_PRUNE_THRESHOLD,
  _invalidationTimestampCount,
} from "../lib/permissions-cache";

const PERMISSIONS = { roleNames: ["CHEF"], permissionSlugs: ["events:read"] };

describe("permission cache invalidation timestamps stay bounded", () => {
  beforeEach(() => {
    invalidateAllCache();
  });

  test("does not grow without bound as distinct users are invalidated", () => {
    const start = Date.now();
    // Well past the prune threshold, spread over a window wider than retention
    // so ageing entries become reclaimable as the run proceeds.
    for (let index = 0; index < 12_000; index += 1) {
      invalidateUserCache(`user-${index}`, start + index * 100);
    }

    // Before #159 this was exactly 12_000 and kept climbing for the life of the
    // process. The bound is the point of the test, so assert the actual ceiling
    // rather than merely "fewer than we inserted".
    expect(_invalidationTimestampCount()).toBeLessThanOrEqual(
      INVALIDATION_PRUNE_THRESHOLD + 1,
    );
  });

  test("stays bounded even when every invalidation is simultaneous", () => {
    // Nothing is reclaimable by age here, so only the size-based sweep can hold
    // the line. This is the worst case for a burst of role changes.
    const start = Date.now();
    for (let index = 0; index < 20_000; index += 1) {
      invalidateUserCache(`burst-${index}`, start);
    }

    expect(_invalidationTimestampCount()).toBeLessThanOrEqual(
      INVALIDATION_PRUNE_THRESHOLD + 1,
    );
  });

  test("reclaims entries once they can no longer reject an in-flight write", () => {
    const start = Date.now();
    for (let index = 0; index < 5_000; index += 1) {
      invalidateUserCache(`stale-${index}`, start);
    }
    const beforePrune = _invalidationTimestampCount();

    // One invalidation far enough in the future that every earlier entry is
    // beyond retention.
    invalidateUserCache("fresh-user", start + INVALIDATION_RETENTION_MS + 1);

    expect(_invalidationTimestampCount()).toBeLessThan(beforePrune);
  });

  // The regression that matters: pruning must never drop a timestamp that is
  // still doing its job.
  test("still rejects a stale in-flight write after a prune has run", () => {
    const start = Date.now();
    for (let index = 0; index < 5_000; index += 1) {
      invalidateUserCache(`filler-${index}`, start);
    }

    const fetchStartedAt = start + INVALIDATION_RETENTION_MS + 500;
    const invalidatedAt = fetchStartedAt + 10; // lands mid-flight
    invalidateUserCache("racing-user", invalidatedAt);

    const accepted = setCachedUserPermissions(
      "racing-user",
      PERMISSIONS,
      invalidatedAt + 20,
      fetchStartedAt,
    );

    expect(accepted).toBe(false);
  });

  test("accepts a write whose fetch started after the invalidation", () => {
    const start = Date.now();
    invalidateUserCache("later-user", start);

    const accepted = setCachedUserPermissions(
      "later-user",
      PERMISSIONS,
      start + 20,
      start + 10,
    );

    expect(accepted).toBe(true);
  });

  test("retention comfortably exceeds the cache TTL", () => {
    // A write older than the TTL is evicted on read anyway, so retaining
    // timestamps beyond it is what makes pruning safe.
    expect(INVALIDATION_RETENTION_MS).toBeGreaterThan(CACHE_TTL_MS);
  });
});
