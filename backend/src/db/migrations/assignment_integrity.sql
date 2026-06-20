-- Issue #31: storage-layer assignment integrity.
--
-- Assignment dates are owned by events, so overlap protection is enforced with
-- trigger checks plus transaction-scoped advisory locks on the assigned resource.
-- This preserves the existing schema while preventing concurrent double-booking.

CREATE OR REPLACE FUNCTION public.prevent_event_assignment_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_event record;
BEGIN
  SELECT id, start_date, end_date
  INTO target_event
  FROM public.events
  WHERE id = NEW.event_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event % does not exist or is deleted', NEW.event_id
      USING ERRCODE = '23503';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('employee-assignment:' || NEW.employee_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.event_assignments ea
    JOIN public.events e ON e.id = ea.event_id
    WHERE ea.employee_id = NEW.employee_id
      AND ea.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND e.deleted_at IS NULL
      AND e.id <> NEW.event_id
      AND e.start_date <= target_event.end_date
      AND e.end_date >= target_event.start_date
  ) THEN
    RAISE EXCEPTION 'Employee % is already assigned to an overlapping event', NEW.employee_id
      USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vehicle_assignments va
    JOIN public.events e ON e.id = va.event_id
    WHERE va.driver_id = NEW.employee_id
      AND e.deleted_at IS NULL
      AND e.id <> NEW.event_id
      AND e.start_date <= target_event.end_date
      AND e.end_date >= target_event.start_date
  ) THEN
    RAISE EXCEPTION 'Employee % is already booked as a driver for an overlapping event', NEW.employee_id
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_vehicle_assignment_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_event record;
BEGIN
  SELECT id, start_date, end_date
  INTO target_event
  FROM public.events
  WHERE id = NEW.event_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event % does not exist or is deleted', NEW.event_id
      USING ERRCODE = '23503';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('vehicle-assignment:' || NEW.vehicle_id::text, 0));
  IF NEW.driver_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('employee-assignment:' || NEW.driver_id::text, 0));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vehicle_assignments va
    JOIN public.events e ON e.id = va.event_id
    WHERE va.vehicle_id = NEW.vehicle_id
      AND va.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND e.deleted_at IS NULL
      AND e.id <> NEW.event_id
      AND e.start_date <= target_event.end_date
      AND e.end_date >= target_event.start_date
  ) THEN
    RAISE EXCEPTION 'Vehicle % is already assigned to an overlapping event', NEW.vehicle_id
      USING ERRCODE = '23P01';
  END IF;

  IF NEW.driver_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.event_assignments ea
    JOIN public.events e ON e.id = ea.event_id
    WHERE ea.employee_id = NEW.driver_id
      AND e.deleted_at IS NULL
      AND e.id <> NEW.event_id
      AND e.start_date <= target_event.end_date
      AND e.end_date >= target_event.start_date
  ) THEN
    RAISE EXCEPTION 'Driver % is already assigned to an overlapping event', NEW.driver_id
      USING ERRCODE = '23P01';
  END IF;

  IF NEW.driver_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.vehicle_assignments va
    JOIN public.events e ON e.id = va.event_id
    WHERE va.driver_id = NEW.driver_id
      AND va.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND e.deleted_at IS NULL
      AND e.id <> NEW.event_id
      AND e.start_date <= target_event.end_date
      AND e.end_date >= target_event.start_date
  ) THEN
    RAISE EXCEPTION 'Driver % is already assigned to an overlapping event', NEW.driver_id
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_event_assignment_overlap ON public.event_assignments;
CREATE TRIGGER trg_prevent_event_assignment_overlap
BEFORE INSERT OR UPDATE OF event_id, employee_id
ON public.event_assignments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_event_assignment_overlap();

DROP TRIGGER IF EXISTS trg_prevent_vehicle_assignment_overlap ON public.vehicle_assignments;
CREATE TRIGGER trg_prevent_vehicle_assignment_overlap
BEFORE INSERT OR UPDATE OF event_id, vehicle_id, driver_id
ON public.vehicle_assignments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_vehicle_assignment_overlap();
