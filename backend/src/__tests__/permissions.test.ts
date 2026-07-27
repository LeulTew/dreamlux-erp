import { describe, expect, test } from "bun:test";
import { hasPermissionSlug, roleNamesToPermissionSlugs } from "../lib/permissions";

describe("role permission seeds", () => {
  test("inventory storekeeper roles can manage event allocation dispatch without broad admin powers", () => {
    for (const roleName of ["INVENTORY_OFFICER", "INVENTORY_CONTROLLER", "inventory_controller"]) {
      const slugs = roleNamesToPermissionSlugs([roleName]);

      expect(hasPermissionSlug(slugs, "assets:write")).toBe(true);
      expect(hasPermissionSlug(slugs, "event_allocations:dispatch")).toBe(true);
      expect(hasPermissionSlug(slugs, "event_allocations:write")).toBe(false);
      expect(hasPermissionSlug(slugs, "reports:profit:read")).toBe(false);
      expect(hasPermissionSlug(slugs, "users:manage")).toBe(false);
      expect(hasPermissionSlug(slugs, "events:delete")).toBe(false);
    }
  });
});
