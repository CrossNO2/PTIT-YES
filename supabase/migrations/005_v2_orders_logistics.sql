-- GreenBridge v2 - Migration 005: Orders & Single Source of Truth Bag Assignments
-- Rebuilt from zero for Packaging-as-a-Service (PaaS) architecture

-- 1. Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_code text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  address text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  delivery_date date NOT NULL,
  time_slot_start time NOT NULL DEFAULT '08:00',
  time_slot_end time NOT NULL DEFAULT '18:00',
  weight_kg numeric(8,2) NOT NULL DEFAULT 2.0 CHECK (weight_kg > 0),
  priority integer NOT NULL DEFAULT 1,
  notes text,
  status public.order_status NOT NULL DEFAULT 'pending',
  assigned_shipper_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_route_id uuid, -- FK added after routes table creation
  started_delivery_at timestamptz,
  delivered_at timestamptz,
  failure_reason text,
  proof_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_shop_order_code UNIQUE (shop_id, order_code)
);

-- 2. Order ↔ Bag Junction Table (SINGLE SOURCE OF TRUTH for Order ↔ PaaS Bag relationship)
CREATE TABLE IF NOT EXISTS public.order_bag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  bag_id uuid NOT NULL REFERENCES public.paas_bags(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  delivered_at timestamptz,
  is_primary boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT uq_order_bag UNIQUE (order_id, bag_id)
);

-- Cardinality Constraint 1: Exactly ONE primary bag per order
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_primary_bag
  ON public.order_bag_assignments (order_id)
  WHERE is_primary = true;

-- Cardinality Constraint 2: A bag CANNOT be actively assigned to multiple orders concurrently
CREATE UNIQUE INDEX IF NOT EXISTS uq_bag_active_order
  ON public.order_bag_assignments (bag_id)
  WHERE is_active = true;

-- 3. Order Status Audit History
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  old_status public.order_status,
  new_status public.order_status NOT NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. PII Access Audit Logs (Driver / Staff unmasking of customer contact details)
CREATE TABLE IF NOT EXISTS public.order_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  accessed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  reason text NOT NULL,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger: auto-log order status transitions
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
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_status ON public.orders;
CREATE TRIGGER trg_order_status
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_log_order_status_change();
