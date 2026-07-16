-- Issues #172/#173 follow-up indexes for production query shapes.
CREATE INDEX IF NOT EXISTS idx_inventory_movements_source_id
  ON public.inventory_movements(source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_allocations_open_returns
  ON public.event_allocations(event_id, departed_at, item_id)
  INCLUDE (
    quantity_allocated,
    returned_good_quantity,
    returned_damaged_quantity,
    returned_lost_quantity,
    returned_repair_quantity
  )
  WHERE departed_at IS NOT NULL AND status <> 'Returned';

CREATE INDEX IF NOT EXISTS idx_event_return_receipts_event_history
  ON public.event_return_receipts(event_id, created_at DESC, allocation_id);

CREATE TABLE IF NOT EXISTS public.event_return_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.event_return_receipts(id) ON DELETE RESTRICT,
  allocation_id UUID NOT NULL REFERENCES public.event_allocations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  good_delta INTEGER NOT NULL DEFAULT 0,
  damaged_delta INTEGER NOT NULL DEFAULT 0,
  lost_delta INTEGER NOT NULL DEFAULT 0,
  repair_delta INTEGER NOT NULL DEFAULT 0,
  outstanding_before INTEGER NOT NULL CHECK (outstanding_before >= 0),
  outstanding_after INTEGER NOT NULL CHECK (outstanding_after >= 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
  idempotency_key TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (good_delta <> 0 OR damaged_delta <> 0 OR lost_delta <> 0 OR repair_delta <> 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_return_corrections_idem
  ON public.event_return_corrections(receipt_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_return_corrections_allocation
  ON public.event_return_corrections(allocation_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.prevent_return_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'return audit records are append-only' USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_return_audit_mutation() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_event_return_corrections_immutable ON public.event_return_corrections;
CREATE TRIGGER trg_event_return_corrections_immutable
  BEFORE UPDATE OR DELETE ON public.event_return_corrections
  FOR EACH ROW EXECUTE FUNCTION public.prevent_return_audit_mutation();
ALTER TABLE public.event_return_corrections ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.event_return_corrections FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
