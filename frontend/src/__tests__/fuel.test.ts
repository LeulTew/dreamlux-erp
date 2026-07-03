import { describe, expect, it } from "vitest";
import {
  calculateFuelCostPreviewLitersPerKm,
  FUEL_CONSUMPTION_UNIT,
  FUEL_CONSUMPTION_UNIT_LABEL,
  validateFuelConsumptionRateLitersPerKm,
} from "@/lib/fuel";

describe("fuel preview helpers", () => {
  it("uses liters per kilometer for the issue #108 screenshot scenario", () => {
    const result = calculateFuelCostPreviewLitersPerKm({
      distanceKm: 12,
      fuelConsumptionRateLitersPerKm: 0.22,
      fuelPriceEtbPerLiter: 169,
    });

    expect(result.fuelLitersUsed).toBe(2.64);
    expect(result.fuelCostEtb).toBe(446.16);
  });

  it("keeps frontend labels and validation aligned with backend semantics", () => {
    expect(FUEL_CONSUMPTION_UNIT).toBe("L/km");
    expect(FUEL_CONSUMPTION_UNIT_LABEL).toBe("Liters per kilometer (L/km)");
    expect(validateFuelConsumptionRateLitersPerKm(0.22)).toBe(0.22);
    expect(validateFuelConsumptionRateLitersPerKm(0)).toBeNull();
    expect(validateFuelConsumptionRateLitersPerKm(5.01)).toBeNull();
  });
});
