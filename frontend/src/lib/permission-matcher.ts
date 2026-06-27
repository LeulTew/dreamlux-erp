export type PermissionChecker = (slug: string) => boolean;

export function createPermissionMatcher(permissionSlugs: string[] = [], isSuperuser = false): PermissionChecker {
  const normalized = new Set(permissionSlugs);

  return (slug: string) => {
    if (isSuperuser || normalized.has("*") || normalized.has(slug)) {
      return true;
    }

    const moduleName = slug.split(":")[0];
    return Boolean(moduleName && normalized.has(`${moduleName}:*`));
  };
}

export function hasAnyPermission(hasPermission: PermissionChecker, slugs: string[]) {
  return slugs.some((slug) => hasPermission(slug));
}
