-- Migration 08: Row Level Security (RLS) Policies across all 17 tables

-- 1. Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipper_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_matrix_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packaging_pickups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.green_point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esg_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geocoding_cache ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- Helper Function: Check shop membership and role
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_shop_member(p_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = p_shop_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_shop_admin(p_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = p_shop_id
      AND user_id = auth.uid()
      AND member_role IN ('owner', 'admin')
      AND status = 'active'
  );
$$;

--------------------------------------------------------------------------------
-- PROFILES POLICIES
--------------------------------------------------------------------------------
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Shop members can view profiles of other shop members"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shop_members sm1
      JOIN public.shop_members sm2 ON sm1.shop_id = sm2.shop_id
      WHERE sm1.user_id = auth.uid() AND sm2.user_id = public.profiles.id
    )
  );

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

--------------------------------------------------------------------------------
-- SHOPS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view active shops"
  ON public.shops FOR SELECT
  TO authenticated
  USING (is_active = true OR public.is_shop_member(id));

CREATE POLICY "Shop admins can update shop profile"
  ON public.shops FOR UPDATE
  USING (public.is_shop_admin(id));

--------------------------------------------------------------------------------
-- SHOP MEMBERS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY "Members can view members in same shop"
  ON public.shop_members FOR SELECT
  USING (public.is_shop_member(shop_id));

CREATE POLICY "Shop admins can manage members"
  ON public.shop_members FOR ALL
  USING (public.is_shop_admin(shop_id));

--------------------------------------------------------------------------------
-- WAREHOUSES, VEHICLES & SHIFTS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY "Shop members can view warehouses"
  ON public.warehouses FOR SELECT
  USING (public.is_shop_member(shop_id));

CREATE POLICY "Shop admins can manage warehouses"
  ON public.warehouses FOR ALL
  USING (public.is_shop_admin(shop_id));

CREATE POLICY "Shop members can view vehicles"
  ON public.vehicles FOR SELECT
  USING (public.is_shop_member(shop_id));

CREATE POLICY "Shop admins can manage vehicles"
  ON public.vehicles FOR ALL
  USING (public.is_shop_admin(shop_id));

CREATE POLICY "Shop members can view shipper shifts"
  ON public.shipper_shifts FOR SELECT
  USING (public.is_shop_member(shop_id) OR shipper_id = auth.uid());

CREATE POLICY "Shop admins can manage shipper shifts"
  ON public.shipper_shifts FOR ALL
  USING (public.is_shop_admin(shop_id));

--------------------------------------------------------------------------------
-- ORDERS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY "Shop members can view shop orders"
  ON public.orders FOR SELECT
  USING (public.is_shop_member(shop_id));

CREATE POLICY "Customers can view own orders"
  ON public.orders FOR SELECT
  USING (customer_id = auth.uid());

CREATE POLICY "Shippers can view assigned orders"
  ON public.orders FOR SELECT
  USING (assigned_shipper_id = auth.uid());

CREATE POLICY "Shop admins can create/manage orders"
  ON public.orders FOR ALL
  USING (public.is_shop_admin(shop_id));

CREATE POLICY "Assigned shippers can update order status"
  ON public.orders FOR UPDATE
  USING (assigned_shipper_id = auth.uid());

--------------------------------------------------------------------------------
-- ROUTES & ROUTE STOPS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY "Shop members can view routes"
  ON public.routes FOR SELECT
  USING (public.is_shop_member(shop_id) OR shipper_id = auth.uid());

CREATE POLICY "Shop admins can manage routes"
  ON public.routes FOR ALL
  USING (public.is_shop_admin(shop_id));

CREATE POLICY "Shippers can update assigned route status"
  ON public.routes FOR UPDATE
  USING (shipper_id = auth.uid());

CREATE POLICY "Shop members can view route stops"
  ON public.route_stops FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.routes r
      WHERE r.id = public.route_stops.route_id
        AND (public.is_shop_member(r.shop_id) OR r.shipper_id = auth.uid())
    )
  );

CREATE POLICY "Shop admins can manage route stops"
  ON public.route_stops FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.routes r
      WHERE r.id = public.route_stops.route_id AND public.is_shop_admin(r.shop_id)
    )
  );

CREATE POLICY "Assigned shippers can update route stops"
  ON public.route_stops FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.routes r
      WHERE r.id = public.route_stops.route_id AND r.shipper_id = auth.uid()
    )
  );

--------------------------------------------------------------------------------
-- ROUTE MATRIX CACHE POLICIES
--------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can read route matrix cache"
  ON public.route_matrix_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert route matrix cache"
  ON public.route_matrix_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

--------------------------------------------------------------------------------
-- PACKAGING PICKUPS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY "Customers can view own pickups"
  ON public.packaging_pickups FOR SELECT
  USING (customer_id = auth.uid());

CREATE POLICY "Shop members can view shop pickups"
  ON public.packaging_pickups FOR SELECT
  USING (public.is_shop_member(shop_id));

CREATE POLICY "Customers can register packaging pickup"
  ON public.packaging_pickups FOR INSERT
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Customers can cancel pending pickup"
  ON public.packaging_pickups FOR UPDATE
  USING (customer_id = auth.uid() AND status = 'pending');

CREATE POLICY "Shop admins can manage pickups"
  ON public.packaging_pickups FOR ALL
  USING (public.is_shop_admin(shop_id));

--------------------------------------------------------------------------------
-- GREEN POINT TRANSACTIONS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY "Customers can view own green point transactions"
  ON public.green_point_transactions FOR SELECT
  USING (customer_id = auth.uid());

CREATE POLICY "Shop admins can view green point transactions"
  ON public.green_point_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shop_members sm
      WHERE sm.user_id = auth.uid() AND sm.member_role IN ('owner', 'admin')
    )
  );

--------------------------------------------------------------------------------
-- VOUCHERS & REDEMPTIONS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view active vouchers"
  ON public.vouchers FOR SELECT
  TO authenticated
  USING (is_active = true OR (shop_id IS NOT NULL AND public.is_shop_admin(shop_id)));

CREATE POLICY "Shop admins can manage vouchers"
  ON public.vouchers FOR ALL
  USING (shop_id IS NOT NULL AND public.is_shop_admin(shop_id));

CREATE POLICY "Customers can view own voucher redemptions"
  ON public.voucher_redemptions FOR SELECT
  USING (customer_id = auth.uid());

CREATE POLICY "Customers can redeem vouchers"
  ON public.voucher_redemptions FOR INSERT
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Shop members can view shop voucher redemptions"
  ON public.voucher_redemptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vouchers v
      WHERE v.id = public.voucher_redemptions.voucher_id
        AND v.shop_id IS NOT NULL
        AND public.is_shop_member(v.shop_id)
    )
  );

--------------------------------------------------------------------------------
-- ESG REPORTS, AUDIT LOGS, NOTIFICATIONS POLICIES
--------------------------------------------------------------------------------
CREATE POLICY "Shop members can view ESG reports"
  ON public.esg_reports FOR SELECT
  USING (public.is_shop_member(shop_id));

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications read status"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Shop admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (shop_id IS NOT NULL AND public.is_shop_admin(shop_id));
