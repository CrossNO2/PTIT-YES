-- GreenBridge v2 - Migration 004: PaaS Reusable Bags & Lifecycle Ledger
-- Rebuilt from zero for Packaging-as-a-Service (PaaS) architecture

-- 1. PaaS Reusable Delivery Bags (Physical Asset Center)
CREATE TABLE IF NOT EXISTS public.paas_bags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bag_code text UNIQUE NOT NULL,                       -- Human readable serial e.g. BAG-000001
  qr_code_hash text UNIQUE NOT NULL,                  -- Fixed cryptographic QR identifier on physical bag

  -- Asset Ownership (GreenBridge Platform owns all reusable packaging assets)
  owner_entity text NOT NULL DEFAULT 'GREENBRIDGE_PLATFORM',
  is_platform_owned boolean NOT NULL DEFAULT true,

  -- Commercial Allocation (Shop paying subscription/usage fee for this bag in their fleet)
  current_shop_id uuid REFERENCES public.shops(id) ON DELETE SET NULL,

  -- Custody Actor (Who holds custody responsibility: human user vs facility)
  current_holder_type text NOT NULL DEFAULT 'warehouse' CHECK (current_holder_type IN ('warehouse', 'shop', 'shipper', 'customer', 'pudo')),
  current_holder_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL, -- Populated ONLY when custody is held by an individual person

  -- Physical Location (Where the bag is physically located)
  current_location_type text NOT NULL DEFAULT 'warehouse' CHECK (current_location_type IN ('warehouse', 'customer_address', 'transit_vehicle', 'pudo_locker', 'cleaning_station')),
  current_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  current_pudo_id uuid REFERENCES public.pudo_locations(id) ON DELETE SET NULL,

  -- Asset Specifications
  model_type text NOT NULL DEFAULT 'standard_25l',
  size_category text NOT NULL DEFAULT 'medium' CHECK (size_category IN ('small', 'medium', 'large', 'insulated')),

  -- Lifecycle & Condition
  status public.paas_bag_status NOT NULL DEFAULT 'available',
  condition public.bag_condition NOT NULL DEFAULT 'new',

  -- Usage Cycle Accounting (Strictly incremented upon inspection certification for reuse)
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  max_cycles integer NOT NULL DEFAULT 100 CHECK (max_cycles > 0),

  -- Operational Timestamps
  manufacture_date date,
  last_inspected_at timestamptz,
  last_cleaned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Semantic Constraint: current_holder_user_id is strictly for human profiles
  CONSTRAINT chk_holder_user_semantics CHECK (
    (current_holder_type IN ('customer', 'shipper', 'shop') AND current_holder_user_id IS NOT NULL) OR
    (current_holder_type IN ('warehouse', 'pudo') AND current_holder_user_id IS NULL)
  ),

  -- Semantic Constraint: physical location entity matching
  CONSTRAINT chk_location_semantics CHECK (
    (current_location_type IN ('warehouse', 'cleaning_station') AND current_warehouse_id IS NOT NULL) OR
    (current_location_type = 'pudo_locker' AND current_pudo_id IS NOT NULL) OR
    (current_location_type IN ('customer_address', 'transit_vehicle'))
  )
);

-- 2. Immutable Bag Lifecycle Events
CREATE TABLE IF NOT EXISTS public.bag_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bag_id uuid NOT NULL REFERENCES public.paas_bags(id) ON DELETE CASCADE,
  from_status public.paas_bag_status,
  to_status public.paas_bag_status NOT NULL,
  event_type public.bag_event_type NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_id uuid,                                       -- Linked order if during delivery
  recovery_request_id uuid,                            -- Linked recovery if during return
  route_id uuid,                                       -- Linked route if in transit
  location_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Bag Inspection, Washing & Maintenance Logs
CREATE TABLE IF NOT EXISTS public.bag_maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bag_id uuid NOT NULL REFERENCES public.paas_bags(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  inspector_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  inspection_result text NOT NULL CHECK (inspection_result IN ('passed', 'needs_wash', 'repaired', 'degraded', 'scrapped')),
  maintenance_action text NOT NULL CHECK (maintenance_action IN ('inspected_ok', 'washed_sanitized', 'stitched_repaired', 'scrapped')),
  water_saved_liters numeric(8,2) NOT NULL DEFAULT 0,
  notes text,
  completed_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger: auto-log bag lifecycle state changes
CREATE OR REPLACE FUNCTION public.trg_log_bag_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.bag_lifecycle_events (
      bag_id,
      from_status,
      to_status,
      event_type,
      actor_id,
      location_notes,
      metadata
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      CASE
        -- Specific transition: ready_for_reuse -> available is RETURNED_TO_STOCK
        WHEN OLD.status = 'ready_for_reuse' AND NEW.status = 'available' THEN 'RETURNED_TO_STOCK'::public.bag_event_type
        WHEN OLD.status = 'assigned' AND NEW.status = 'available' THEN 'RETURNED_TO_STOCK'::public.bag_event_type
        WHEN NEW.status = 'ready_for_reuse' THEN
          CASE
            WHEN OLD.status = 'maintenance' THEN 'CLEANED_SANITIZED'::public.bag_event_type
            ELSE 'INSPECTED'::public.bag_event_type
          END
        WHEN NEW.status = 'assigned' THEN 'ASSIGNED_TO_ORDER'::public.bag_event_type
        WHEN NEW.status = 'in_delivery' THEN 'DISPATCHED_TO_SHIPPER'::public.bag_event_type
        WHEN NEW.status = 'with_customer' THEN 'DELIVERED_TO_CUSTOMER'::public.bag_event_type
        WHEN NEW.status = 'return_requested' THEN 'RECOVERY_REQUESTED'::public.bag_event_type
        WHEN NEW.status = 'recovering' THEN 'PICKED_UP_BY_SHIPPER'::public.bag_event_type
        WHEN NEW.status = 'at_hub' THEN 'RECEIVED_AT_HUB'::public.bag_event_type
        WHEN NEW.status = 'inspection' THEN 'INSPECTED'::public.bag_event_type
        WHEN NEW.status = 'maintenance' THEN 'CLEANED_SANITIZED'::public.bag_event_type
        WHEN NEW.status = 'available' THEN 'RETURNED_TO_STOCK'::public.bag_event_type
        WHEN NEW.status = 'damaged' THEN 'FLAGGED_DAMAGED'::public.bag_event_type
        WHEN NEW.status = 'retired' THEN 'RETIRED'::public.bag_event_type
        ELSE 'REGISTERED'::public.bag_event_type
      END,
      auth.uid(),
      'Location: ' || NEW.current_location_type || ' | Holder: ' || NEW.current_holder_type,
      jsonb_build_object(
        'usage_count', NEW.usage_count,
        'condition', NEW.condition,
        'current_shop_id', NEW.current_shop_id,
        'owner_entity', NEW.owner_entity,
        'current_holder_user_id', NEW.current_holder_user_id
      )
    );
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_paas_bag_status ON public.paas_bags;
CREATE TRIGGER trg_paas_bag_status
  BEFORE UPDATE ON public.paas_bags
  FOR EACH ROW EXECUTE FUNCTION public.trg_log_bag_status_change();
