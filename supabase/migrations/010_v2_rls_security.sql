-- GreenBridge v2 - Migration 010: Row Level Security (RLS) & Isolation Policies
-- Rebuilt from zero for Packaging-as-a-Service (PaaS) architecture

-- 1. Helper Security Functions (SECURITY DEFINER with fixed search_path)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND account_type = 'platform_admin' AND is_active = true
  );
$$;

-- Drop any 2-argument signature with defaults to prevent overload ambiguity
DROP FUNCTION IF EXISTS public.is_shop_member(uuid, text[]);

-- Canonical v2 2-argument function: checks shop membership and specific role authorization
CREATE OR REPLACE FUNCTION public.is_shop_member(p_shop_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = p_shop_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND (p_roles IS NULL OR member_role::text = ANY(p_roles))
  );
$$;

-- Canonical v2 1-argument function: checks general active shop membership (in-place replacement for legacy overload)
CREATE OR REPLACE FUNCTION public.is_shop_member(p_shop_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT public.is_shop_member(p_shop_id, NULL::text[]);
$$;

-- 2. Enable RLS on all domain tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipper_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pudo_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paas_bags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bag_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bag_maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_bag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_matrix_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.context_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.green_point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esg_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esg_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. Profiles Policies
CREATE POLICY "profiles_select_self" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_platform_admin() OR true); -- Read-only directory for collaboration
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 4. Shops & Members
CREATE POLICY "shops_select" ON public.shops FOR SELECT TO authenticated
  USING (is_active = true OR public.is_platform_admin() OR public.is_shop_member(id));
CREATE POLICY "shops_admin_manage" ON public.shops FOR ALL TO authenticated
  USING (public.is_platform_admin() OR public.is_shop_member(id, ARRAY['owner', 'admin']));

CREATE POLICY "shop_members_select" ON public.shop_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_shop_member(shop_id) OR public.is_platform_admin());
CREATE POLICY "shop_members_manage" ON public.shop_members FOR ALL TO authenticated
  USING (public.is_platform_admin() OR public.is_shop_member(shop_id, ARRAY['owner', 'admin']));

-- 5. Warehouses, Fleet, Shifts, PUDO
CREATE POLICY "warehouses_select" ON public.warehouses FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id) OR public.is_platform_admin());
CREATE POLICY "warehouses_manage" ON public.warehouses FOR ALL TO authenticated
  USING (public.is_platform_admin() OR public.is_shop_member(shop_id, ARRAY['owner', 'admin']));

CREATE POLICY "vehicles_select" ON public.vehicles FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id) OR public.is_platform_admin());
CREATE POLICY "vehicles_manage" ON public.vehicles FOR ALL TO authenticated
  USING (public.is_platform_admin() OR public.is_shop_member(shop_id, ARRAY['owner', 'admin']));

CREATE POLICY "shifts_select" ON public.shipper_shifts FOR SELECT TO authenticated
  USING (shipper_id = auth.uid() OR public.is_shop_member(shop_id) OR public.is_platform_admin());
CREATE POLICY "shifts_manage" ON public.shipper_shifts FOR ALL TO authenticated
  USING (public.is_platform_admin() OR public.is_shop_member(shop_id, ARRAY['owner', 'admin', 'dispatcher']));

CREATE POLICY "pudo_select" ON public.pudo_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "pudo_manage" ON public.pudo_locations FOR ALL TO authenticated USING (public.is_platform_admin());

-- 6. PaaS Bags & Lifecycle Policies
CREATE POLICY "paas_bags_select" ON public.paas_bags FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (current_shop_id IS NOT NULL AND public.is_shop_member(current_shop_id))
    OR current_holder_user_id = auth.uid()
  );

-- Hardened PaaS Bags RLS: Direct client UPDATE/INSERT/DELETE is strictly blocked for standard clients.
-- All lifecycle state, custody, location, and usage_count mutations MUST execute via SECURITY DEFINER RPCs.
-- Platform admin retains administrative maintenance access.
CREATE POLICY "paas_bags_admin_insert" ON public.paas_bags FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "paas_bags_admin_update" ON public.paas_bags FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "paas_bags_admin_delete" ON public.paas_bags FOR DELETE TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "lifecycle_select" ON public.bag_lifecycle_events FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (SELECT 1 FROM public.paas_bags b WHERE b.id = bag_id AND (public.is_shop_member(b.current_shop_id) OR b.current_holder_user_id = auth.uid()))
  );
CREATE POLICY "lifecycle_insert" ON public.bag_lifecycle_events FOR INSERT TO authenticated
  WITH CHECK (true); -- Append-only trigger and RPC insertion

CREATE POLICY "maintenance_select" ON public.bag_maintenance_logs FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_id AND public.is_shop_member(w.shop_id)));
CREATE POLICY "maintenance_manage" ON public.bag_maintenance_logs FOR ALL TO authenticated
  USING (public.is_platform_admin() OR EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_id AND public.is_shop_member(w.shop_id)));

-- 7. Orders & Bag Assignments
CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR public.is_shop_member(shop_id)
    OR assigned_shipper_id = auth.uid()
    OR public.is_platform_admin()
  );

CREATE POLICY "orders_insert" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_member(shop_id, ARRAY['owner', 'admin', 'dispatcher']) OR public.is_platform_admin());

CREATE POLICY "orders_update" ON public.orders FOR UPDATE TO authenticated
  USING (
    public.is_shop_member(shop_id, ARRAY['owner', 'admin', 'dispatcher'])
    OR assigned_shipper_id = auth.uid()
    OR public.is_platform_admin()
  );

CREATE POLICY "order_bag_assignments_select" ON public.order_bag_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "order_status_history_select" ON public.order_status_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "order_access_logs_manage" ON public.order_access_logs FOR ALL TO authenticated USING (true);

-- 8. Routes & Route Stops
CREATE POLICY "routes_select" ON public.routes FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id) OR shipper_id = auth.uid() OR public.is_platform_admin());
CREATE POLICY "routes_manage" ON public.routes FOR ALL TO authenticated
  USING (public.is_shop_member(shop_id, ARRAY['owner', 'admin', 'dispatcher']) OR public.is_platform_admin());
CREATE POLICY "routes_shipper_update" ON public.routes FOR UPDATE TO authenticated
  USING (shipper_id = auth.uid()) WITH CHECK (shipper_id = auth.uid());

CREATE POLICY "route_stops_select" ON public.route_stops FOR SELECT TO authenticated USING (true);
CREATE POLICY "route_stops_manage" ON public.route_stops FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (SELECT 1 FROM public.routes r WHERE r.id = route_id AND (public.is_shop_member(r.shop_id) OR r.shipper_id = auth.uid()))
  );

CREATE POLICY "route_matrix_cache_all" ON public.route_matrix_cache FOR ALL TO authenticated USING (true);
CREATE POLICY "context_signals_select" ON public.context_signals FOR SELECT TO authenticated USING (true);
CREATE POLICY "context_signals_manage" ON public.context_signals FOR ALL TO authenticated USING (public.is_platform_admin());

-- 9. Recovery Requests & Decisions
CREATE POLICY "recovery_requests_select" ON public.recovery_requests FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR public.is_shop_member(shop_id)
    OR assigned_shipper_id = auth.uid()
    OR public.is_platform_admin()
  );

CREATE POLICY "recovery_requests_insert_customer" ON public.recovery_requests FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() OR public.is_shop_member(shop_id) OR public.is_platform_admin());

CREATE POLICY "recovery_requests_update" ON public.recovery_requests FOR UPDATE TO authenticated
  USING (
    public.is_shop_member(shop_id, ARRAY['owner', 'admin', 'dispatcher'])
    OR assigned_shipper_id = auth.uid()
    OR (customer_id = auth.uid() AND status = 'requested')
    OR public.is_platform_admin()
  );

CREATE POLICY "recovery_decisions_select" ON public.recovery_decisions FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (SELECT 1 FROM public.recovery_requests rr WHERE rr.id = recovery_request_id AND public.is_shop_member(rr.shop_id))
  );

-- 10. Financial Deposits & Green Points Incentives
CREATE POLICY "deposits_select" ON public.customer_deposits FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_shop_member(shop_id) OR public.is_platform_admin());
CREATE POLICY "deposits_manage" ON public.customer_deposits FOR ALL TO authenticated
  USING (public.is_shop_member(shop_id, ARRAY['owner', 'admin']) OR public.is_platform_admin());

CREATE POLICY "green_points_select" ON public.green_point_transactions FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_platform_admin());

CREATE POLICY "vouchers_select" ON public.vouchers FOR SELECT TO authenticated
  USING (is_active = true OR public.is_platform_admin() OR (shop_id IS NOT NULL AND public.is_shop_member(shop_id)));
CREATE POLICY "voucher_redemptions_select" ON public.voucher_redemptions FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_platform_admin());

-- 11. ESG, Notifications & Audit Logs
CREATE POLICY "esg_reports_select" ON public.esg_reports FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id) OR public.is_platform_admin());
CREATE POLICY "esg_daily_select" ON public.esg_daily_metrics FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id) OR public.is_platform_admin());

CREATE POLICY "notifications_select_self" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notifications_update_self" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR (shop_id IS NOT NULL AND public.is_shop_member(shop_id, ARRAY['owner', 'admin'])));
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (true); -- Append-only
