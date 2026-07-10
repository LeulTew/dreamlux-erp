const AUTH_STORAGE_KEYS = [
  "token",
  "user",
  "previewRole",
  "previewPermissionSlugs",
] as const;

export function clearAuthSessionStorage() {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of AUTH_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }
}
