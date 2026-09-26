import type { PermissionChecker } from "./permission-matcher";

export function resolveLandingRoute(authority: { isCurrent: boolean; hasPermission: PermissionChecker }): "/" | "/events" | "/assets" | null {
  if (!authority.isCurrent) return null;
  if (authority.hasPermission("hr:read") || authority.hasPermission("hr:write")) return "/";
  if (authority.hasPermission("events:read")) return "/events";
  if (authority.hasPermission("assets:read")) return "/assets";
  return null;
}
