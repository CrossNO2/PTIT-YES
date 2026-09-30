-- GreenBridge v2 - Migration 011: Core Business RPCs & Atomic Operations
-- Rebuilt from zero for Packaging-as-a-Service (PaaS) architecture

-- 1. RPC: Bind PaaS Bag to Outbound Order (Shop packing flow)
CREATE OR REPLACE FUNCTION public.assign_bag_to_order(
  p_order_id uuid,
  p_bag_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_bag public.paas_bags%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % does not exist', p_order_id; END IF;

  -- Verify permissions: Actor must belong to the shop
  IF NOT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = v_order.shop_id AND user_id = v_actor_id AND status = 'active'
  ) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: User does not belong to this shop';
  END IF;

  SELECT * INTO v_bag FROM public.paas_bags WHERE bag_code = p_bag_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAG_NOT_FOUND: Bag % does not exist', p_bag_code; END IF;

  IF v_bag.status NOT IN ('available', 'ready_for_reuse') THEN
    RAISE EXCEPTION 'INVALID_BAG_STATE: Bag % is currently % (must be available or ready_for_reuse)', p_bag_code, v_bag.status;
  END IF;

  -- Update Order Status
  UPDATE public.orders
  SET status = CASE WHEN status = 'pending' THEN 'ready'::public.order_status ELSE status END,
      updated_at = now()
  WHERE id = p_order_id;

  -- Update Bag State to assigned, current shop allocation and custody
  UPDATE public.paas_bags
  SET status = 'assigned',
      current_shop_id = v_order.shop_id,
      current_holder_type = 'shop',
      current_holder_user_id = v_actor_id,
      updated_at = now()
  WHERE id = v_bag.id;

  -- Insert single source of truth junction assignment (enforces active exclusivity & primary uniqueness)
  INSERT INTO public.order_bag_assignments (order_id, bag_id, is_primary, is_active)
  VALUES (p_order_id, v_bag.id, true, true)
  ON CONFLICT (order_id, bag_id) DO UPDATE SET is_active = true;

  -- Create customer deposit record (held status)
  IF v_order.customer_id IS NOT NULL THEN
    INSERT INTO public.customer_deposits (
      customer_id, shop_id, bag_id, order_id, deposit_amount_vnd, status
    ) VALUES (
      v_order.customer_id, v_order.shop_id, v_bag.id, v_order.id, 50000.00, 'held'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'bag_id', v_bag.id,
    'bag_code', v_bag.bag_code,
    'status', 'assigned'
  );
END;
$$;

-- 2. RPC: Approve Optimized Dispatched Routes (Atomic Multi-Stop Delivery & Recovery)
CREATE OR REPLACE FUNCTION public.approve_optimized_routes_v2(
  p_shop_id uuid,
  p_warehouse_id uuid,
  p_route_date date,
  p_optimization_version integer,
  p_routes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_route record;
  v_new_route_id uuid;
  v_route_count integer := 0;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  -- Verify Dispatcher/Admin role
  IF NOT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = p_shop_id AND user_id = v_actor_id
      AND member_role IN ('owner', 'admin', 'dispatcher') AND status = 'active'
  ) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: User lacks dispatcher role';
  END IF;

  FOR v_route IN SELECT * FROM jsonb_to_recordset(p_routes) AS (
    vehicle_id uuid,
    shipper_id uuid,
    route_type text,
    stops jsonb,
    total_distance_km numeric,
    total_duration_mins integer,
    estimated_cost_vnd numeric,
    naive_distance_km numeric
  ) LOOP
    -- Insert Route
    INSERT INTO public.routes (
      shop_id,
      warehouse_id,
      route_date,
      vehicle_id,
      shipper_id,
      route_type,
      naive_distance_km,
      optimized_distance_km,
      total_duration_mins,
      estimated_cost_vnd,
      status,
      optimization_version,
      approved_by,
      approved_at
    ) VALUES (
      p_shop_id,
      p_warehouse_id,
      p_route_date,
      v_route.vehicle_id,
      v_route.shipper_id,
      COALESCE(v_route.route_type, 'delivery_with_recovery'),
      COALESCE(v_route.naive_distance_km, 0),
      v_route.total_distance_km,
      v_route.total_duration_mins,
      COALESCE(v_route.estimated_cost_vnd, 0),
      CASE WHEN v_route.shipper_id IS NOT NULL THEN 'assigned'::public.route_status ELSE 'approved'::public.route_status END,
      p_optimization_version,
      v_actor_id,
      now()
    )
    RETURNING id INTO v_new_route_id;

    -- Insert Stops
    INSERT INTO public.route_stops (
      route_id,
      stop_type,
      order_id,
      recovery_request_id,
      pudo_location_id,
      sequence_index,
      distance_from_previous_km,
      duration_from_previous_mins,
      status
    )
    SELECT
      v_new_route_id,
      (elem->>'stopType')::public.route_stop_type,
      (elem->>'orderId')::uuid,
      (elem->>'recoveryRequestId')::uuid,
      (elem->>'pudoLocationId')::uuid,
      COALESCE((elem->>'sequenceIndex')::integer, 0),
      COALESCE((elem->>'distanceFromPreviousKm')::numeric, 0),
      COALESCE((elem->>'durationFromPreviousMins')::integer, 0),
      'pending'::public.route_stop_status
    FROM jsonb_array_elements(v_route.stops) AS elem;

    -- Update linked Orders
    UPDATE public.orders
    SET assigned_route_id = v_new_route_id,
        assigned_shipper_id = v_route.shipper_id,
        status = CASE WHEN v_route.shipper_id IS NOT NULL THEN 'assigned'::public.order_status ELSE status END,
        updated_at = now()
    WHERE id IN (
      SELECT (elem->>'orderId')::uuid
      FROM jsonb_array_elements(v_route.stops) AS elem
      WHERE elem->>'stopType' = 'delivery' AND elem->>'orderId' IS NOT NULL
    );

    -- Update linked Recovery Requests
    UPDATE public.recovery_requests
    SET assigned_route_id = v_new_route_id,
        assigned_shipper_id = v_route.shipper_id,
        status = CASE WHEN v_route.shipper_id IS NOT NULL THEN 'assigned'::public.recovery_request_status ELSE 'planned'::public.recovery_request_status END,
        updated_at = now()
    WHERE id IN (
      SELECT (elem->>'recoveryRequestId')::uuid
      FROM jsonb_array_elements(v_route.stops) AS elem
      WHERE elem->>'stopType' = 'recovery' AND elem->>'recoveryRequestId' IS NOT NULL
    );

    v_route_count := v_route_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'approved_routes_count', v_route_count);
END;
$$;

-- 3. RPC: Scan Bag QR, Verify Recovery, Refund Deposit & Award Green Points
CREATE OR REPLACE FUNCTION public.verify_and_complete_bag_recovery(
  p_recovery_request_id uuid,
  p_scanned_bag_qr text,
  p_condition public.bag_condition DEFAULT 'good'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_recovery public.recovery_requests%ROWTYPE;
  v_bag public.paas_bags%ROWTYPE;
  v_deposit public.customer_deposits%ROWTYPE;
  v_points_awarded integer := 50; -- Fixed incentive points for PaaS bag return (not raw kg!)
  v_idempotency_key text;
  v_hub_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_recovery FROM public.recovery_requests WHERE id = p_recovery_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_NOT_FOUND'; END IF;

  SELECT * INTO v_bag FROM public.paas_bags WHERE id = v_recovery.bag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAG_NOT_FOUND'; END IF;

  -- Validate scanned physical QR matches bag identity
  IF v_bag.qr_code_hash IS DISTINCT FROM p_scanned_bag_qr AND v_bag.bag_code IS DISTINCT FROM p_scanned_bag_qr THEN
    RAISE EXCEPTION 'QR_MISMATCH: Scanned QR does not match bag %', v_bag.bag_code;
  END IF;

  -- Deterministic Safe Hub Resolution:
  -- 1. Shop default active warehouse
  SELECT id INTO v_hub_id FROM public.warehouses
  WHERE shop_id = v_recovery.shop_id AND status = 'active' AND is_default = true
  LIMIT 1;

  -- 2. Any active warehouse belonging to the shop
  IF v_hub_id IS NULL THEN
    SELECT id INTO v_hub_id FROM public.warehouses
    WHERE shop_id = v_recovery.shop_id AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- 3. Existing valid warehouse associated with the bag context
  IF v_hub_id IS NULL AND v_bag.current_warehouse_id IS NOT NULL THEN
    SELECT id INTO v_hub_id FROM public.warehouses
    WHERE id = v_bag.current_warehouse_id AND status = 'active'
    LIMIT 1;
  END IF;

  -- 4. Platform/default cleaning depot
  IF v_hub_id IS NULL THEN
    SELECT id INTO v_hub_id FROM public.warehouses
    WHERE status = 'active' AND (is_default = true OR has_cleaning_facility = true)
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1;
  END IF;

  -- 5. If no valid warehouse can be resolved: reject recovery completion with a clear exception
  IF v_hub_id IS NULL THEN
    RAISE EXCEPTION 'NO_VALID_WAREHOUSE_FOUND: Unable to resolve active warehouse for recovery of bag %', v_bag.bag_code;
  END IF;

  -- Mark recovery request as completed
  UPDATE public.recovery_requests
  SET status = 'completed',
      picked_up_at = COALESCE(picked_up_at, now()),
      completed_at = now(),
      updated_at = now()
  WHERE id = p_recovery_request_id;

  -- Update bag state: arrived at hub / cleaning queue
  -- NOTE: usage_count is NOT incremented here. It is only incremented when the bag
  -- completes inspection and washing and is certified ready_for_reuse!
  UPDATE public.paas_bags
  SET status = 'at_hub',
      condition = p_condition,
      current_location_type = 'warehouse',
      current_warehouse_id = v_hub_id,
      current_holder_type = 'warehouse',
      current_holder_user_id = NULL,
      updated_at = now()
  WHERE id = v_bag.id;

  -- Deactivate active bag assignment for completed recovery cycle
  UPDATE public.order_bag_assignments
  SET is_active = false
  WHERE bag_id = v_bag.id AND is_active = true;

  -- Update associated route stop if exists
  UPDATE public.route_stops
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE recovery_request_id = p_recovery_request_id;

  -- Process Deposit Refund
  SELECT * INTO v_deposit FROM public.customer_deposits
  WHERE bag_id = v_bag.id AND customer_id = v_recovery.customer_id AND status = 'held'
  ORDER BY held_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    UPDATE public.customer_deposits
    SET status = 'refunded',
        refund_amount_vnd = deposit_amount_vnd,
        refunded_at = now(),
        updated_at = now()
    WHERE id = v_deposit.id;
  END IF;

  -- Award Green Points Incentive to Customer
  v_idempotency_key := 'bag_recovery_' || p_recovery_request_id::text;
  INSERT INTO public.green_point_transactions (
    customer_id,
    points_delta,
    transaction_type,
    reference_type,
    reference_id,
    description,
    idempotency_key
  ) VALUES (
    v_recovery.customer_id,
    v_points_awarded,
    'bag_return_reward',
    'recovery_request',
    p_recovery_request_id::text,
    'Thưởng trả túi PaaS ' || v_bag.bag_code,
    v_idempotency_key
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'recovery_id', p_recovery_request_id,
    'bag_code', v_bag.bag_code,
    'bag_status', 'at_hub',
    'deposit_refunded_vnd', COALESCE(v_deposit.deposit_amount_vnd, 0),
    'points_awarded', v_points_awarded
  );
END;
$$;

-- 4. RPC: Bag Inspection and Washing Workflow (Hub Operations)
-- THIS IS THE DEFINITIVE EVENT WHERE A USAGE CYCLE COMPLETES
CREATE OR REPLACE FUNCTION public.complete_bag_inspection_washing(
  p_bag_id uuid,
  p_warehouse_id uuid,
  p_result text,
  p_action text,
  p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_bag public.paas_bags%ROWTYPE;
  v_next_status public.paas_bag_status;
  v_cycle_completed boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_bag FROM public.paas_bags WHERE id = p_bag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAG_NOT_FOUND'; END IF;

  v_next_status := CASE
    WHEN p_result = 'passed' THEN 'ready_for_reuse'::public.paas_bag_status
    WHEN p_result = 'needs_wash' THEN 'maintenance'::public.paas_bag_status
    WHEN p_result = 'scrapped' THEN 'retired'::public.paas_bag_status
    ELSE 'available'::public.paas_bag_status
  END;

  v_cycle_completed := (v_next_status = 'ready_for_reuse');

  -- Insert Maintenance Log
  INSERT INTO public.bag_maintenance_logs (
    bag_id,
    warehouse_id,
    inspector_id,
    inspection_result,
    maintenance_action,
    water_saved_liters,
    notes
  ) VALUES (
    p_bag_id,
    p_warehouse_id,
    v_actor_id,
    p_result,
    p_action,
    2.50, -- Standard water metrics tracked per wash cycle
    p_notes
  );

  -- Update Bag: strictly increment usage_count ONLY when the bag completes the cycle and is ready for reuse!
  UPDATE public.paas_bags
  SET status = v_next_status,
      usage_count = CASE WHEN v_cycle_completed THEN usage_count + 1 ELSE usage_count END,
      condition = CASE WHEN p_result = 'passed' THEN 'good'::public.bag_condition ELSE condition END,
      last_inspected_at = now(),
      last_cleaned_at = CASE WHEN p_action = 'washed_sanitized' THEN now() ELSE last_cleaned_at END,
      current_warehouse_id = p_warehouse_id,
      current_location_type = 'warehouse',
      current_holder_type = 'warehouse',
      current_holder_user_id = NULL,
      updated_at = now()
  WHERE id = p_bag_id;

  RETURN jsonb_build_object(
    'success', true,
    'bag_id', p_bag_id,
    'bag_code', v_bag.bag_code,
    'new_status', v_next_status,
    'cycle_completed', v_cycle_completed,
    'new_usage_count', CASE WHEN v_cycle_completed THEN v_bag.usage_count + 1 ELSE v_bag.usage_count END
  );
END;
$$;
