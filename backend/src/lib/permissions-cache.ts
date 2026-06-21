type CachedUserPermissions = {
  permissionSlugs: string[];
  roleNames: string[];
};

// In-memory permission cache dictionary
const cache = new Map<string, CachedUserPermissions>();

export function getCachedUserPermissions(userId: string): CachedUserPermissions | null {
  return cache.get(userId) || null;
}

export function setCachedUserPermissions(userId: string, data: CachedUserPermissions): void {
  cache.set(userId, data);
}

export function invalidateUserCache(userId: string): void {
  cache.delete(userId);
  console.log(`[PermissionsCache] Invalidated cache entry for user: ${userId}`);
}

export function invalidateAllCache(): void {
  cache.clear();
  console.log(`[PermissionsCache] Invalidated all user permission cache entries`);
}
