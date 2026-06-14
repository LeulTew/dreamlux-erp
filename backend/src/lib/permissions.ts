export type PermissionMap = Record<string, unknown>;

export function normalizePermissionMap(raw: unknown): PermissionMap {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as PermissionMap;
  }
  return {};
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePermissionSlugs(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return [...new Set(raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map(normalizeSlug))];
}

export function permissionMapToSlugs(map: PermissionMap): string[] {
  const slugs: string[] = [];

  for (const [moduleName, rawValue] of Object.entries(map)) {
    const moduleSlug = normalizeSlug(moduleName);

    if (moduleSlug === "all" && rawValue === true) {
      slugs.push("*");
      continue;
    }

    if (rawValue === "all" || rawValue === true) {
      slugs.push(`${moduleSlug}:*`);
      continue;
    }

    if (typeof rawValue === "string" && rawValue.trim()) {
      slugs.push(`${moduleSlug}:${normalizeSlug(rawValue)}`);
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const entry of rawValue) {
        if (typeof entry === "string" && entry.trim()) {
          slugs.push(`${moduleSlug}:${normalizeSlug(entry)}`);
        }
      }
    }
  }

  return [...new Set(slugs.map(normalizeSlug))];
}

export function hasPermissionSlug(permissionSlugs: string[], requiredSlug: string): boolean {
  const normalizedRequired = normalizeSlug(requiredSlug);
  const normalized = new Set(permissionSlugs.map(normalizeSlug));

  if (normalized.has("*")) {
    return true;
  }

  if (normalized.has(normalizedRequired)) {
    return true;
  }

  const moduleName = normalizedRequired.split(":")[0];
  if (moduleName && normalized.has(`${moduleName}:*`)) {
    return true;
  }

  return false;
}
