export const FUEL_CONSUMPTION_UNIT = "L/km";
export const FUEL_CONSUMPTION_UNIT_LABEL = "Liters per kilometer (L/km)";
export const MAX_REASONABLE_LITERS_PER_KM = 5;

export function validateFuelConsumptionRateLitersPerKm(rate: unknown): number | null {
  const numericRate = Number(rate);
  if (!Number.isFinite(numericRate) || numericRate <= 0 || numericRate > MAX_REASONABLE_LITERS_PER_KM) {
    return null;
  }
  return numericRate;
}

export function calculateFuelCostLitersPerKm(params: {
  distanceKm: number;
  fuelConsumptionRateLitersPerKm: number;
  fuelPriceEtbPerLiter: number;
}) {
  const fuelLitersUsed = Number((params.distanceKm * params.fuelConsumptionRateLitersPerKm).toFixed(2));
  const fuelCostEtb = Number((fuelLitersUsed * params.fuelPriceEtbPerLiter).toFixed(2));

  return {
    fuelLitersUsed,
    fuelCostEtb,
  };
}
