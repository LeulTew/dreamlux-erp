import { describe, expect, it } from "vitest";
import { permissionLabel } from "@/lib/permission-labels";

describe("permissionLabel (issue #180)", () => {
  it("maps known slugs to friendly business language", () => {
    expect(permissionLabel("assets:reconcile")).toBe("Run Stock Recounts");
    expect(permissionLabel("events:saved_views:share")).toBe("Share Saved Event Views");
    expect(permissionLabel("*")).toBe("Full System Access (everything)");
  });

  it("never returns a raw slug for unknown permissions", () => {
    const label = permissionLabel("future:new_module:read");
    expect(label).toBe("Future New Module Read");
    expect(label).not.toContain(":");
    expect(label).not.toContain("_");
  });
});
