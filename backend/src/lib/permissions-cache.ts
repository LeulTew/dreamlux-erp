type CachedUserPermissions = {
  permissionSlugs: string[];
  roleNames: string[];
  cachedAt: number;
};

export type CachedUserPermissionsPublic = Omit<CachedUserPermissions, "cachedAt">;

// In-memory permission cache dictionary
const cache = new Map<string, CachedUserPermissions>();
const invalidationTimestamps = new Map<string, { timestamp: number; revision: number }>();
let globalInvalidatedAt = 0;
let invalidationRevision = 0;
let globalInvalidatedRevision = 0;
let nextInvalidationAgeSweep: number | null = null;

export const CACHE_TTL_MS = 60 * 1000; // 60 seconds
const MAX_CACHE_SIZE = 2000;

/**
 * How long an invalidation timestamp stays useful (#159).
 *
 * The timestamps exist only to reject a cache write whose DB fetch began before
 * an invalidation landed, so they matter for the lifetime of an in-flight fetch
 * — milliseconds in practice. Two full TTLs is a very generous upper bound on
 * that, and past it the entry cannot usefully reject anything: any write it
 * would refuse is already older than the TTL that would evict it anyway.
 */
export const INVALIDATION_RETENTION_MS = CACHE_TTL_MS * 2;

/**
 * Prune trigger for `invalidationTimestamps`. Sweeping on every invalidation
 * would make each call O(n); this amortises it while keeping the map bounded.
 */
export const INVALIDATION_PRUNE_THRESHOLD = 4000;

export function getPermissionCacheRevision(userId: string): number {
  return Math.max(globalInvalidatedRevision, invalidationTimestamps.get(userId)?.revision ?? 0);
}

/**
 * Returns cached permissions for a user, or null if the entry is missing or
 * expired. Stale entries are lazily evicted on read.
 * Refreshes key position for true LRU eviction.
 *
 * @param now — injectable clock for deterministic tests (defaults to Date.now())
 */
export function getCachedUserPermissions(
  userId: string,
  now: number = Date.now(),
): CachedUserPermissionsPublic | null {
  const entry = cache.get(userId);
  if (!entry) return null;

  if (now - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(userId);
    return null;
  }

  // Refresh LRU order on access
  cache.delete(userId);
  cache.set(userId, entry);

  return { permissionSlugs: entry.permissionSlugs, roleNames: entry.roleNames };
}

/**
 * Stores permissions for a user, stamping the current time for TTL tracking.
 * Enforces a maximum cache size via true LRU eviction.
 * Rejects writes if an invalidation occurred after the DB fetch started (`fetchedAt`).
 *
 * @param now — injectable clock for deterministic tests (defaults to Date.now())
 * @param fetchedAt — optional timestamp when the DB fetch started to prevent race conditions
 */
export function setCachedUserPermissions(
  userId: string,
  data: CachedUserPermissionsPublic,
  now: number = Date.now(),
  fetchedAt?: number,
): boolean {
  const userInvalidatedAt = invalidationTimestamps.get(userId)?.timestamp ?? 0;
  const lastInvalidatedAt = Math.max(userInvalidatedAt, globalInvalidatedAt);
  if (lastInvalidatedAt > 0 && fetchedAt !== undefined && lastInvalidatedAt >= fetchedAt) {
    // Invalidation occurred while DB fetch was in flight — discard stale write
    return false;
  }

  // Delete existing entry if present so re-insertion places it at the tail (MRU)
  if (cache.has(userId)) {
    cache.delete(userId);
  } else if (cache.size >= MAX_CACHE_SIZE) {
    // True LRU eviction: head of Map keys iterator is the least recently used
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }

  cache.set(userId, { ...data, cachedAt: now });
  return true;
}

/**
 * Drops invalidation timestamps that can no longer reject an in-flight write.
 *
 * Insertion order is not age order here, because re-invalidating an existing key
 * updates its value in place without moving it, so every entry is inspected
 * rather than stopping at the first recent one. If pruning by age is not enough
 * — every entry still current, i.e. a genuine burst — the oldest are dropped so
 * the map stays bounded regardless.
 */
function pruneInvalidationTimestamps(now: number): void {
  let removed = false;
  for (const [userId, invalidation] of invalidationTimestamps) {
    if (now - invalidation.timestamp > INVALIDATION_RETENTION_MS) {
      invalidationTimestamps.delete(userId);
      removed = true;
    }
  }

  if (invalidationTimestamps.size >= INVALIDATION_PRUNE_THRESHOLD) {
    // Leave headroom so a simultaneous burst does not sort the whole map per user.
    const surplus = invalidationTimestamps.size - Math.floor(INVALIDATION_PRUNE_THRESHOLD / 2);
    const oldestFirst = [...invalidationTimestamps.entries()]
      .sort(([, left], [, right]) => left.timestamp - right.timestamp)
      .slice(0, surplus);
    for (const [userId] of oldestFirst) {
      invalidationTimestamps.delete(userId);
      removed = true;
    }
  }
  // Evicting a marker must not make an old in-flight lookup current again.
  if (removed) globalInvalidatedRevision = ++invalidationRevision;
}

export function invalidateUserCache(userId: string, now: number = Date.now()): void {
  cache.delete(userId);
  nextInvalidationAgeSweep ??= now + INVALIDATION_RETENTION_MS;
  // Prune before inserting so this user's own fresh timestamp is never a
  // candidate for eviction: dropping it would reopen the race it guards.
  if (invalidationTimestamps.size >= INVALIDATION_PRUNE_THRESHOLD || now > nextInvalidationAgeSweep) {
    pruneInvalidationTimestamps(now);
    nextInvalidationAgeSweep = now + INVALIDATION_RETENTION_MS;
  }
  invalidationTimestamps.set(userId, { timestamp: now, revision: ++invalidationRevision });
}

export function invalidateAllCache(now: number = Date.now()): void {
  cache.clear();
  invalidationTimestamps.clear();
  nextInvalidationAgeSweep = null;
  globalInvalidatedAt = now;
  globalInvalidatedRevision = ++invalidationRevision;
}

/** Visible for testing only — returns current cache size. */
export function _cacheSize(): number {
  return cache.size;
}

/** Visible for testing only — returns the invalidation timestamp map size. */
export function _invalidationTimestampCount(): number {
  return invalidationTimestamps.size;
}
