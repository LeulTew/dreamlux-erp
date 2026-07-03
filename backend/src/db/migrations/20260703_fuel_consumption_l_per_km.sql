-- Clarify and enforce vehicle fuel consumption as liters per kilometer (L/km).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vehicles_fuel_consumption_rate_l_per_km_check'
  ) THEN
    ALTER TABLE vehicles
      ADD CONSTRAINT vehicles_fuel_consumption_rate_l_per_km_check
      CHECK (fuel_consumption_rate > 0 AND fuel_consumption_rate <= 5) NOT VALID;
  END IF;
END $$;

ALTER TABLE vehicles
  VALIDATE CONSTRAINT vehicles_fuel_consumption_rate_l_per_km_check;
