import { describe, it, expect } from "vitest";
import { isDriverEligible, suggestEventRole, EVENT_ROLE_VALUES } from "@/lib/event-crew";

describe("event-crew eligibility & role suggestion (issue #146)", () => {
  describe("isDriverEligible", () => {
    it("matches durable driver signals regardless of capitalization/wording", () => {
      expect(isDriverEligible({ position: "Driver", department: "Logistics" })).toBe(true);
      expect(isDriverEligible({ position: "DRIVER", department: null })).toBe(true);
      expect(isDriverEligible({ position: "Senior Chauffeur", department: null })).toBe(true);
      expect(isDriverEligible({ position: null, department: "Logistics & Inventory" })).toBe(true);
      expect(isDriverEligible({ position: "Fleet Coordinator", department: null })).toBe(true);
      expect(isDriverEligible({ position: null, department: "Transport" })).toBe(true);
    });

    it("does not match non-driver staff", () => {
      expect(isDriverEligible({ position: "Photographer", department: "Photography" })).toBe(false);
      expect(isDriverEligible({ position: "Store Keeper", department: "Store" })).toBe(false);
      expect(isDriverEligible({ position: null, department: null })).toBe(false);
    });
  });

  describe("suggestEventRole", () => {
    it("returns empty string for no employee", () => {
      expect(suggestEventRole(undefined)).toBe("");
    });

    it("suggests a canonical, editable role from position/department", () => {
      expect(suggestEventRole({ position: "Driver", department: "Logistics" })).toBe("Driver");
      expect(suggestEventRole({ position: "Store Keeper", department: "Store" })).toBe("Store Keeper");
      expect(suggestEventRole({ position: "Inventory Lead", department: "Warehouse" })).toBe("Store Keeper");
      expect(suggestEventRole({ position: "Catering Supervisor", department: "Catering" })).toBe("Supervisor");
      expect(suggestEventRole({ position: "Team Leader", department: "Operations" })).toBe("Team Leader");
      expect(suggestEventRole({ position: "Operations Manager", department: "Operations" })).toBe("Event Manager");
      expect(suggestEventRole({ position: "Décor Designer", department: "Design" })).toBe("Décor Professional");
      expect(suggestEventRole({ position: "Assistant", department: "Events" })).toBe("Assistant");
    });

    it("only ever suggests a value from the canonical role list", () => {
      const samples = [
        { position: "Driver", department: "Logistics" },
        { position: "Random Title", department: "Nowhere" },
        { position: "Manager", department: "Events" },
      ];
      for (const s of samples) {
        expect(EVENT_ROLE_VALUES).toContain(suggestEventRole(s) as (typeof EVENT_ROLE_VALUES)[number]);
      }
    });
  });
});
