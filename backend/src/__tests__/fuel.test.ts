import { describe, expect, test } from "bun:test";
import {
  calculateFuelCostLitersPerKm,
  FUEL_CONSUMPTION_UNIT,
  FUEL_CONSUMPTION_UNIT_LABEL,
  MAX_REASONABLE_LITERS_PER_KM,
  validateFuelConsumptionRateLitersPerKm,
} from "../lib/fuel";

describe("fuel cost helpers", () => {
  test("uses liters per kilometer for the issue #108 screenshot scenario", () => {
    const result = calculateFuelCostLitersPerKm({
      distanceKm: 12,
      fuelConsumptionRateLitersPerKm: 0.22,
      fuelPriceEtbPerLiter: 169,
    });

    expect(result.fuelLitersUsed).toBe(2.64);
    expect(result.fuelCostEtb).toBe(446.16);
  });

  test("exposes explicit L/km labels and rejects invalid vehicle rates", () => {
    expect(FUEL_CONSUMPTION_UNIT).toBe("L/km");
    expect(FUEL_CONSUMPTION_UNIT_LABEL).toBe("Liters per kilometer (L/km)");
    expect(MAX_REASONABLE_LITERS_PER_KM).toBe(5);
    expect(validateFuelConsumptionRateLitersPerKm(0.22)).toBe(0.22);
    expect(validateFuelConsumptionRateLitersPerKm(0)).toBeNull();
    expect(validateFuelConsumptionRateLitersPerKm(5.01)).toBeNull();
    expect(validateFuelConsumptionRateLitersPerKm("not-a-number")).toBeNull();
  });
});
