-- Migration 14: RLS Policy Isolation Hardening
-- Purpose:
--   1) Separate shop staff access from shipper access.
--   2) Replace policies created by migration 08 safely/idempotently.
--   3) Harden customer pickup tenant isolation.
-- Safe to rerun: every policy created below is dropped first.

--------------------------------------------------------------------------------
-- HELPER: SHOP STAFF (owner/admin/dispatcher)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_shop_staff(p_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shop_members sm
    WHERE sm.shop_id = p_shop_id
      AND sm.user_id = auth.uid()
      AND sm.member_role IN ('owner', 'admin', 'dispatcher')
      AND sm.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_shop_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_shop_staff(uuid) TO authenticated;

--------------------------------------------------------------------------------
-- ORDERS: REPLACE BROAD MIGRATION-08 POLICIES
--------------------------------------------------------------------------------
-- Old migration-08 names
DROP POLICY IF EXISTS "Shop members can view shop orders" ON public.orders;
DROP POLICY IF EXISTS "Shippers can view assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Shop admins can create/manage orders" ON public.orders;
DROP POLICY IF EXISTS "Assigned shippers can update order status" ON public.orders;

-- Hardened names (drop first so this migration is rerunnable)
DROP POLICY IF EXISTS "Shop staff can view all shop orders" ON public.orders;
DROP POLICY IF EXISTS "Assigned shippers can view assigned orders only" ON public.orders;
DROP POLICY IF EXISTS "Shop staff can manage order workflow" ON public.orders;

CREATE POLICY "Shop staff can view all shop orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (public.is_shop_staff(shop_id));

-- Temporary direct shipper SELECT for migration ordering.
-- Migration 17 removes this raw-row access and requires the masked RPC instead.
CREATE POLICY "Assigned shippers can view assigned orders only"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (assigned_shipper_id = auth.uid());

-- owner/admin/dispatcher may manage operational order workflow.
CREATE POLICY "Shop staff can manage order workflow"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (public.is_shop_staff(shop_id))
  WITH CHECK (public.is_shop_staff(shop_id));

--------------------------------------------------------------------------------
-- ROUTES: REPLACE BROAD MIGRATION-08 POLICIES
--------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Shop members can view routes" ON public.routes;
DROP POLICY IF EXISTS "Shippers can update assigned route status" ON public.routes;

DROP POLICY IF EXISTS "Shop staff can view all routes" ON public.routes;
DROP POLICY IF EXISTS "Assigned shippers can view assigned routes only" ON public.routes;

CREATE POLICY "Shop staff can view all routes"
  ON public.routes
  FOR SELECT
  TO authenticated
  USING (public.is_shop_staff(shop_id));

CREATE POLICY "Assigned shippers can view assigned routes only"
  ON public.routes
  FOR SELECT
  TO authenticated
  USING (shipper_id = auth.uid());

-- Do not recreate direct shipper UPDATE here.
-- Route status mutation should be performed through hardened RPCs later in the chain.

--------------------------------------------------------------------------------
-- ROUTE STOPS: REPLACE BROAD MIGRATION-08 POLICIES
--------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Shop members can view route stops" ON public.route_stops;
DROP POLICY IF EXISTS "Assigned shippers can update route stops" ON public.route_stops;

DROP POLICY IF EXISTS "Shop staff can view all route stops" ON public.route_stops;
DROP POLICY IF EXISTS "Assigned shippers can view assigned route stops only" ON public.route_stops;

CREATE POLICY "Shop staff can view all route stops"
  ON public.route_stops
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.routes r
      WHERE r.id = public.route_stops.route_id
        AND public.is_shop_staff(r.shop_id)
    )
  );

CREATE POLICY "Assigned shippers can view assigned route stops only"
  ON public.route_stops
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.routes r
      WHERE r.id = public.route_stops.route_id
        AND r.shipper_id = auth.uid()
    )
  );

-- Do not recreate direct shipper UPDATE here.
-- Stop/order mutation must go through the later hardened business RPCs.

--------------------------------------------------------------------------------
-- SHIPPER SHIFTS: DISPATCHER IS OPERATIONAL STAFF
--------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Shop admins can manage shipper shifts" ON public.shipper_shifts;
DROP POLICY IF EXISTS "Shop staff can manage shipper shifts" ON public.shipper_shifts;

CREATE POLICY "Shop staff can manage shipper shifts"
  ON public.shipper_shifts
  FOR ALL
  TO authenticated
  USING (public.is_shop_staff(shop_id))
  WITH CHECK (public.is_shop_staff(shop_id));

--------------------------------------------------------------------------------
-- SAFE SHIPPER ASSIGNED ORDERS RPC (MASK PII BY DEFAULT)
--------------------------------------------------------------------------------
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
  v_shipper_id uuid := auth.uid();
BEGIN
  IF v_shipper_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  -- Only active shipper members may use this RPC.
  IF NOT EXISTS (
    SELECT 1
    FROM public.shop_members sm
    WHERE sm.user_id = v_shipper_id
      AND sm.member_role = 'shipper'
      AND sm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.order_code,
    CASE
      WHEN coalesce(o.customer_name, '') = '' THEN ''
      WHEN length(o.customer_name) = 1 THEN '*'
      ELSE left(o.customer_name, 1) || repeat('*', greatest(length(o.customer_name) - 1, 1))
    END AS customer_name_masked,
    CASE
      WHEN coalesce(o.customer_phone, '') = '' THEN ''
      WHEN length(o.customer_phone) <= 4 THEN repeat('*', length(o.customer_phone))
      WHEN length(o.customer_phone) <= 7 THEN left(o.customer_phone, 2) || repeat('*', length(o.customer_phone) - 2)
      ELSE left(o.customer_phone, 4) || '***' || right(o.customer_phone, 3)
    END AS customer_phone_masked,
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

--------------------------------------------------------------------------------
-- CUSTOMER PICKUP TENANT HARDENING
--------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Customers can register packaging pickup" ON public.packaging_pickups;
DROP POLICY IF EXISTS "Customers can register pickup for operational shop" ON public.packaging_pickups;

CREATE POLICY "Customers can register pickup for operational shop"
  ON public.packaging_pickups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id = public.packaging_pickups.shop_id
        AND s.slug = 'greenbridge-main'
        AND s.is_active = true
    )
  );

--------------------------------------------------------------------------------
-- END MIGRATION 14
--------------------------------------------------------------------------------