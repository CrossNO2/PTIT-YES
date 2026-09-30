-- Migration 07: Secure RPC Functions & Database Triggers

-- Trigger helper: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_shops_updated_at BEFORE UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_shop_members_updated_at BEFORE UPDATE ON public.shop_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_shipper_shifts_updated_at BEFORE UPDATE ON public.shipper_shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_route_stops_updated_at BEFORE UPDATE ON public.route_stops FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_packaging_pickups_updated_at BEFORE UPDATE ON public.packaging_pickups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vouchers_updated_at BEFORE UPDATE ON public.vouchers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_voucher_redemptions_updated_at BEFORE UPDATE ON public.voucher_redemptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_esg_reports_updated_at BEFORE UPDATE ON public.esg_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger helper: Handle new auth user creation -> insert public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, phone, account_type)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'customer'::public.user_account_type
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

--------------------------------------------------------------------------------
-- SECURE RPC 1: complete_route
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_route(
  p_route_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_route record;
  v_vehicle record;
  v_km_saved numeric(10,2);
  v_co2_saved numeric(10,4);
  v_packaging_collected numeric(10,2);
  v_cost_saved numeric(12,2);
  v_report_id uuid;
BEGIN
  -- 1. Derive Actor Identity from JWT
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: User must be logged in';
  END IF;

  -- 2. Lock and Fetch Route
  SELECT * INTO v_route
  FROM public.routes
  WHERE id = p_route_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Route % does not exist', p_route_id;
  END IF;

  IF v_route.status = 'completed' THEN
    RAISE EXCEPTION 'CONFLICT: Route % has already been completed', p_route_id;
  END IF;

  IF v_route.status <> 'in_progress' THEN
    RAISE EXCEPTION 'INVALID_STATE: Route must be in_progress before completion';
  END IF;

  -- 3. Verify Actor Permission (Must be assigned shipper or shop admin/owner)
  IF v_route.shipper_id != v_actor_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.shop_members
      WHERE shop_id = v_route.shop_id
        AND user_id = v_actor_id
        AND member_role IN ('owner', 'admin')
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN: You do not have permission to complete route %', p_route_id;
    END IF;
  END IF;

  -- 4. Check all route stops are terminal
  IF EXISTS (
    SELECT 1 FROM public.route_stops
    WHERE route_id = p_route_id
      AND status NOT IN ('completed', 'failed', 'skipped')
  ) THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: All stops must be completed, failed, or skipped before completing route';
  END IF;

  -- 5. Fetch Vehicle Factor Snapshots
  SELECT * INTO v_vehicle
  FROM public.vehicles
  WHERE id = v_route.vehicle_id;

  -- 6. Calculate Metrics
  v_km_saved := GREATEST(0, v_route.naive_distance_km - v_route.optimized_distance_km);
  v_co2_saved := v_km_saved * COALESCE(v_vehicle.co2_kg_per_km, 0.1500);
  v_cost_saved := v_km_saved * COALESCE(v_vehicle.fuel_cost_vnd_per_km, 3000.00);

  SELECT COALESCE(SUM(verified_quantity_kg), 0) INTO v_packaging_collected
  FROM public.packaging_pickups
  WHERE assigned_route_id = p_route_id
    AND status = 'completed';

  -- 7. Update Route Status
  UPDATE public.routes
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_route_id;

  -- 8. Create Atomic ESG Report (Unique constraint on route_id prevents duplicates)
  INSERT INTO public.esg_reports (
    shop_id,
    route_id,
    report_date,
    naive_distance_km,
    optimized_distance_km,
    km_saved,
    co2_saved_kg,
    packaging_collected_kg,
    cost_saved_vnd,
    emission_factor_snapshot,
    fuel_cost_factor_snapshot,
    baseline_method,
    calculation_version
  ) VALUES (
    v_route.shop_id,
    p_route_id,
    v_route.route_date,
    v_route.naive_distance_km,
    v_route.optimized_distance_km,
    v_km_saved,
    v_co2_saved,
    v_packaging_collected,
    v_cost_saved,
    COALESCE(v_vehicle.co2_kg_per_km, 0.1500),
    COALESCE(v_vehicle.fuel_cost_vnd_per_km, 3000.00),
    'CREATION_ORDER_V1',
    1
  )
  RETURNING id INTO v_report_id;

  -- 9. Audit Log
  INSERT INTO public.audit_logs (shop_id, actor_id, action, entity_type, entity_id, new_data)
  VALUES (v_route.shop_id, v_actor_id, 'COMPLETE_ROUTE', 'routes', p_route_id, jsonb_build_object('report_id', v_report_id));

  RETURN jsonb_build_object(
    'success', true,
    'route_id', p_route_id,
    'report_id', v_report_id,
    'km_saved', v_km_saved,
    'co2_saved_kg', v_co2_saved,
    'packaging_collected_kg', v_packaging_collected
  );
END;
$$;

--------------------------------------------------------------------------------
-- SECURE RPC 2: verify_pickup_qr
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_pickup_qr(
  p_pickup_id uuid,
  p_qr_token text,
  p_actual_weight_kg numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_pickup record;
  v_route record;
  v_token_hash text;
  v_points integer;
  v_idempotency_key text;
  v_transaction_id uuid;
BEGIN
  -- 1. Derive Actor Identity
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: User must be logged in';
  END IF;

  -- 2. Input Validation
  IF p_actual_weight_kg <= 0 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Actual weight must be greater than 0';
  END IF;

  -- 3. Lock Pickup Record
  SELECT * INTO v_pickup
  FROM public.packaging_pickups
  WHERE id = p_pickup_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Pickup % not found', p_pickup_id;
  END IF;

  IF v_pickup.status = 'completed' THEN
    RAISE EXCEPTION 'CONFLICT: Pickup % has already been completed', p_pickup_id;
  END IF;

  IF v_pickup.qr_expires_at < now() THEN
    RAISE EXCEPTION 'EXPIRED: QR token for pickup % has expired', p_pickup_id;
  END IF;

  -- 4. Hash Token & Check
  v_token_hash := encode(digest(p_qr_token, 'sha256'), 'hex');
  IF v_pickup.qr_token_hash != v_token_hash THEN
    RAISE EXCEPTION 'INVALID_TOKEN: QR token does not match';
  END IF;

  -- 5. Verify Shipper Ownership via Assigned Route
  IF v_pickup.assigned_route_id IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Pickup is not assigned to any route';
  END IF;

  SELECT * INTO v_route
  FROM public.routes
  WHERE id = v_pickup.assigned_route_id;

  IF v_route.shipper_id != v_actor_id THEN
    RAISE EXCEPTION 'FORBIDDEN: You are not assigned to the route for this pickup';
  END IF;

  IF v_route.status != 'in_progress' THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Route must be in_progress to verify pickup';
  END IF;

  -- 6. Calculate Green Points (10 points per kg verified)
  v_points := ROUND(p_actual_weight_kg * 10);
  v_idempotency_key := 'pickup_reward_' || p_pickup_id::text;

  -- 7. Update Pickup Status
  UPDATE public.packaging_pickups
  SET status = 'completed',
      verified_quantity_kg = p_actual_weight_kg,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_pickup_id;

  -- 8. Update Route Stop Status
  UPDATE public.route_stops
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE route_id = v_pickup.assigned_route_id
    AND pickup_id = p_pickup_id;

  -- 9. Record Point Transaction Ledger (Idempotent)
  INSERT INTO public.green_point_transactions (
    customer_id,
    points_delta,
    transaction_type,
    packaging_pickup_id,
    description,
    idempotency_key
  ) VALUES (
    v_pickup.customer_id,
    v_points,
    'pickup_reward',
    p_pickup_id,
    'Awarded ' || v_points || ' Green Points for ' || p_actual_weight_kg || ' kg packaging collected',
    v_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_transaction_id;

  -- 10. Notify Customer
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    metadata
  ) VALUES (
    v_pickup.customer_id,
    'PICKUP_COMPLETED',
    'Bao bì đã được thu gom thành công!',
    'Bạn đã tích lũy được ' || v_points || ' Green Points từ ' || p_actual_weight_kg || ' kg bao bì.',
    jsonb_build_object('pickup_id', p_pickup_id, 'points', v_points)
  );

  RETURN jsonb_build_object(
    'success', true,
    'pickup_id', p_pickup_id,
    'verified_quantity_kg', p_actual_weight_kg,
    'points_awarded', v_points,
    'transaction_id', v_transaction_id
  );
END;
$$;

--------------------------------------------------------------------------------
-- SECURE RPC 3: use_voucher_qr
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.use_voucher_qr(
  p_redemption_id uuid,
  p_qr_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_redemption record;
  v_voucher record;
  v_token_hash text;
BEGIN
  -- 1. Derive Actor Identity
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: User must be logged in';
  END IF;

  -- 2. Lock Redemption Record
  SELECT * INTO v_redemption
  FROM public.voucher_redemptions
  WHERE id = p_redemption_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Voucher redemption % not found', p_redemption_id;
  END IF;

  IF v_redemption.status = 'used' THEN
    RAISE EXCEPTION 'CONFLICT: Voucher has already been used';
  END IF;

  IF v_redemption.status = 'expired' OR v_redemption.qr_expires_at < now() THEN
    RAISE EXCEPTION 'EXPIRED: Voucher redemption QR has expired';
  END IF;

  -- 3. Token Hash Verification
  v_token_hash := encode(digest(p_qr_token, 'sha256'), 'hex');
  IF v_redemption.qr_token_hash != v_token_hash THEN
    RAISE EXCEPTION 'INVALID_TOKEN: Redemption QR token invalid';
  END IF;

  -- 4. Check Shop Membership Permission
  SELECT * INTO v_voucher
  FROM public.vouchers
  WHERE id = v_redemption.voucher_id;

  IF v_voucher.shop_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.shop_members
      WHERE shop_id = v_voucher.shop_id
        AND user_id = v_actor_id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN: You do not belong to the shop issuing this voucher';
    END IF;
  END IF;

  -- 5. Mark Voucher as Used
  UPDATE public.voucher_redemptions
  SET status = 'used',
      used_at = now(),
      updated_at = now()
  WHERE id = p_redemption_id;

  -- 6. Notify Customer
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    metadata
  ) VALUES (
    v_redemption.customer_id,
    'VOUCHER_USED',
    'Voucher đã được sử dụng thành công',
    'Voucher ' || v_voucher.name || ' đã được cửa hàng xác nhận sử dụng.',
    jsonb_build_object('redemption_id', p_redemption_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', p_redemption_id,
    'voucher_name', v_voucher.name,
    'used_at', now()
  );
END;
$$;



--------------------------------------------------------------------------------
-- SECURE RPC: start_route
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_route(p_route_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_route public.routes%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_route FROM public.routes WHERE id = p_route_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Route not found'; END IF;

  IF v_route.shipper_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Only the assigned shipper can start this route';
  END IF;

  IF v_route.status <> 'assigned' THEN
    RAISE EXCEPTION 'INVALID_STATE: Route must be assigned before start';
  END IF;

  UPDATE public.routes
  SET status = 'in_progress', started_at = COALESCE(started_at, now()), updated_at = now()
  WHERE id = p_route_id;

  INSERT INTO public.audit_logs (shop_id, actor_id, action, entity_type, entity_id, new_data)
  VALUES (v_route.shop_id, v_actor_id, 'START_ROUTE', 'routes', p_route_id, jsonb_build_object('status', 'in_progress'));

  RETURN jsonb_build_object('success', true, 'route_id', p_route_id, 'status', 'in_progress');
END;
$$;

REVOKE ALL ON FUNCTION public.start_route(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_route(uuid) TO authenticated;

-- Enforce explicit permissions
REVOKE ALL ON FUNCTION public.complete_route(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_route(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.verify_pickup_qr(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_pickup_qr(uuid, text, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.use_voucher_qr(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.use_voucher_qr(uuid, text) TO authenticated;


--------------------------------------------------------------------------------
-- SERVERLESS-SAFE RATE LIMIT RPC
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_scope text,
  p_window_seconds integer DEFAULT 60,
  p_max_requests integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_window_start timestamptz;
  v_bucket_key text;
  v_count integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_window_seconds < 1 OR p_window_seconds > 86400 OR p_max_requests < 1 OR p_max_requests > 10000 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_CONFIG';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );
  v_bucket_key := v_actor_id::text || ':' || left(COALESCE(p_scope, 'default'), 120);

  INSERT INTO public.api_rate_limits(bucket_key, window_start, request_count, updated_at)
  VALUES (v_bucket_key, v_window_start, 1, now())
  ON CONFLICT (bucket_key, window_start) DO UPDATE
    SET request_count = public.api_rate_limits.request_count + 1,
        updated_at = now()
  RETURNING request_count INTO v_count;

  -- Opportunistic cleanup, bounded to stale windows.
  DELETE FROM public.api_rate_limits
  WHERE window_start < now() - interval '2 days';

  RETURN jsonb_build_object(
    'success', v_count <= p_max_requests,
    'remaining', GREATEST(p_max_requests - v_count, 0),
    'reset_at', v_window_start + make_interval(secs => p_window_seconds)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO authenticated;
