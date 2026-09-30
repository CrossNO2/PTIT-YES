-- GreenBridge v2 - Migration 016: Align order_status_history schema
-- Renames legacy previous_status column to canonical v2 old_status and ensures trigger compatibility

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_status_history' AND column_name = 'previous_status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_status_history' AND column_name = 'old_status'
  ) THEN
    ALTER TABLE public.order_status_history RENAME COLUMN previous_status TO old_status;
  END IF;
END $$;

-- Recreate trigger function with search_path = '' and old_status column reference
CREATE OR REPLACE FUNCTION public.trg_log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.order_status_history (
      order_id,
      old_status,
      new_status,
      changed_by
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;
