-- Issue #108: fuel_consumption_rate is stored as liters per kilometer (L/km).
-- Existing seed values such as 0.22 mean 0.22 L/km, so 12 km at 169 ETB/L is 446.16 ETB.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vehicles_fuel_consumption_rate_l_per_km_check'
      AND conrelid = 'vehicles'::regclass
  ) THEN
    ALTER TABLE vehicles
      ADD CONSTRAINT vehicles_fuel_consumption_rate_l_per_km_check
      CHECK (fuel_consumption_rate > 0 AND fuel_consumption_rate <= 5)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE vehicles
  VALIDATE CONSTRAINT vehicles_fuel_consumption_rate_l_per_km_check;
