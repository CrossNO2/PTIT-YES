-- Migration 17: PII Isolation & Shipper RLS Hardening

-- 1. Revoke direct SELECT for shipper on orders
-- Drop the policy that allowed shippers to SELECT raw PII directly
DROP POLICY IF EXISTS "Assigned shippers can view assigned orders only" ON public.orders;

-- 2. Fix RPC to always mask PII
CREATE OR REPLACE FUNCTION public.get_shipper_assigned_orders()
RETURNS TABLE (
  id uuid,
  order_code text,
  customer_name_masked text,
  customer_phone_masked text,
  address text,
  lat double precision,
  lng double precision,
  delivery_date date,
  time_slot_start time,
  time_slot_end time,
  weight_kg numeric,
  priority integer,
  status public.order_status,
  assigned_route_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shipper_id uuid;
BEGIN
  v_shipper_id := auth.uid();
  IF v_shipper_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.order_code,
    -- Always mask name and phone. Unmasking is done via specific API with audit log.
    (substring(o.customer_name from 1 for 1) || '***')::text AS customer_name_masked,
    (substring(o.customer_phone from 1 for 4) || '***' || substring(o.customer_phone from length(o.customer_phone)-2))::text AS customer_phone_masked,
    o.address,
    o.lat,
    o.lng,
    o.delivery_date,
    o.time_slot_start,
    o.time_slot_end,
    o.weight_kg,
    o.priority,
    o.status,
    o.assigned_route_id
  FROM public.orders o
  WHERE o.assigned_shipper_id = v_shipper_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shipper_assigned_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shipper_assigned_orders() TO authenticated;

-- Shippers mutate business state only through SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "Assigned shippers can update order status" ON public.orders;
DROP POLICY IF EXISTS "Shippers can update assigned route status" ON public.routes;
DROP POLICY IF EXISTS "Assigned shippers can update route stops" ON public.route_stops;
