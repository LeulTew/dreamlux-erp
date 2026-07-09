"use client";

export const AUTH_SESSION_CLEARED_EVENT = "dreamlux-auth-session-cleared";

const AUTH_STORAGE_KEYS = [
  "token",
  "user",
  "previewRole",
  "previewPermissionSlugs",
];

export function clearBrowserAuthSession() {
  if (typeof window === "undefined") return;

  for (const key of AUTH_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }

  window.dispatchEvent(new Event(AUTH_SESSION_CLEARED_EVENT));
}
