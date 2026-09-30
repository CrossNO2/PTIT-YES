-- GreenBridge v2 - Migration 012: PaaS Bag Lifecycle & Recovery Core Engine
-- Implements strict state machine validation, Strategy A recovery flows,
-- immutable audit logging, and the core circular reuse usage_count invariant.

-- ============================================================================
-- 1. STATE MACHINE TRANSITION ENFORCEMENT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_bag_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from public.paas_bag_status := OLD.status;
  v_to   public.paas_bag_status := NEW.status;
  v_is_valid boolean := false;
BEGIN
  -- Same-state updates do not change lifecycle status
  IF v_from = v_to THEN
    RETURN NEW;
  END IF;

  -- Enforce explicit transition matrix
  CASE v_from
    WHEN 'available' THEN
      v_is_valid := (v_to IN ('assigned', 'retired'));
    WHEN 'assigned' THEN
      v_is_valid := (v_to IN ('in_delivery', 'available'));
    WHEN 'in_delivery' THEN
      v_is_valid := (v_to IN ('with_customer', 'at_hub', 'assigned'));
    WHEN 'with_customer' THEN
      v_is_valid := (v_to IN ('return_requested'));
    WHEN 'return_requested' THEN
      v_is_valid := (v_to IN ('recovering', 'with_customer'));
    WHEN 'recovering' THEN
      v_is_valid := (v_to IN ('at_hub', 'return_requested'));
    WHEN 'at_hub' THEN
      v_is_valid := (v_to IN ('inspection', 'maintenance', 'retired'));
    WHEN 'inspection' THEN
      v_is_valid := (v_to IN ('maintenance', 'ready_for_reuse', 'damaged', 'retired'));
    WHEN 'maintenance' THEN
      v_is_valid := (v_to IN ('ready_for_reuse', 'damaged', 'retired'));
    WHEN 'ready_for_reuse' THEN
      v_is_valid := (v_to IN ('available', 'assigned'));
    WHEN 'damaged' THEN
      v_is_valid := (v_to IN ('retired', 'maintenance'));
    WHEN 'retired' THEN
      -- Terminal state: zero outgoing transitions allowed
      v_is_valid := false;
    ELSE
      v_is_valid := false;
  END CASE;

  IF NOT v_is_valid THEN
    RAISE EXCEPTION 'INVALID_BAG_TRANSITION: Cannot transition bag from ''%'' to ''%''', v_from, v_to
      USING ERRCODE = '22000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_bag_transition ON public.paas_bags;
CREATE TRIGGER trg_validate_bag_transition
  BEFORE UPDATE OF status ON public.paas_bags
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_bag_status_transition();


-- ============================================================================
-- 2. DELIVERY LIFECYCLE RPC: update_order_delivery_status
-- Enforces: assigned -> in_delivery -> with_customer
-- Custody: shop -> shipper -> customer
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_order_delivery_status(
  p_order_id uuid,
  p_new_status public.order_status,
  p_failure_reason text DEFAULT NULL,
  p_proof_image_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_assignment public.order_bag_assignments%ROWTYPE;
  v_bag public.paas_bags%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  -- Permission: Shipper assigned or Shop Dispatcher/Admin
  IF v_order.assigned_shipper_id IS DISTINCT FROM v_actor_id
     AND NOT public.is_shop_member(v_order.shop_id, ARRAY['owner', 'admin', 'dispatcher'])
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: User not authorized to update order delivery status';
  END IF;

  -- Find active bag assignment
  SELECT * INTO v_assignment FROM public.order_bag_assignments
  WHERE order_id = p_order_id AND is_active = true
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_bag FROM public.paas_bags WHERE id = v_assignment.bag_id FOR UPDATE;
  END IF;

  -- Transition based on new status
  IF p_new_status = 'delivering' THEN
    UPDATE public.orders
    SET status = 'delivering',
        started_delivery_at = COALESCE(started_delivery_at, now()),
        updated_at = now()
    WHERE id = p_order_id;

    IF v_bag.id IS NOT NULL THEN
      UPDATE public.paas_bags
      SET status = 'in_delivery',
          current_holder_type = 'shipper',
          current_holder_user_id = COALESCE(v_order.assigned_shipper_id, v_actor_id),
          current_location_type = 'transit_vehicle',
          updated_at = now()
      WHERE id = v_bag.id;
    END IF;

  ELSIF p_new_status = 'delivered' THEN
    UPDATE public.orders
    SET status = 'delivered',
        delivered_at = now(),
        proof_image_url = COALESCE(p_proof_image_url, proof_image_url),
        updated_at = now()
    WHERE id = p_order_id;

    -- Update linked Route Stop if any
    UPDATE public.route_stops
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id;

    IF v_bag.id IS NOT NULL THEN
      UPDATE public.paas_bags
      SET status = 'with_customer',
          current_holder_type = 'customer',
          current_holder_user_id = v_order.customer_id,
          current_location_type = 'customer_address',
          updated_at = now()
      WHERE id = v_bag.id;
    END IF;

  ELSIF p_new_status = 'failed' THEN
    UPDATE public.orders
    SET status = 'failed',
        failure_reason = p_failure_reason,
        updated_at = now()
    WHERE id = p_order_id;

    UPDATE public.route_stops
    SET status = 'failed',
        updated_at = now()
    WHERE order_id = p_order_id;

    -- Return bag back to hub
    IF v_bag.id IS NOT NULL THEN
      UPDATE public.paas_bags
      SET status = 'at_hub',
          current_holder_type = 'warehouse',
          current_holder_user_id = NULL,
          current_location_type = 'warehouse',
          updated_at = now()
      WHERE id = v_bag.id;
    END IF;
  ELSE
    RAISE EXCEPTION 'INVALID_TARGET_STATUS: Status % is not a delivery execution status', p_new_status;
  END IF;

  -- Record order status history
  INSERT INTO public.order_status_history (
    order_id, old_status, new_status, changed_by, notes
  ) VALUES (
    p_order_id, v_order.status, p_new_status, v_actor_id, p_failure_reason
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_status', p_new_status,
    'bag_id', v_bag.id,
    'bag_status', (SELECT status FROM public.paas_bags WHERE id = v_bag.id)
  );
END;
$$;


-- ============================================================================
-- 3. RECOVERY REQUEST INITIATION: request_bag_recovery
-- Enforces: with_customer -> return_requested
-- Prevents duplicate active recovery requests
-- Creates initial explainable Strategy A decision
-- ============================================================================

CREATE OR REPLACE FUNCTION public.request_bag_recovery(
  p_bag_id uuid,
  p_pickup_address text,
  p_lat double precision,
  p_lng double precision,
  p_pickup_date date DEFAULT CURRENT_DATE,
  p_time_slot_start time DEFAULT '08:00',
  p_time_slot_end time DEFAULT '18:00',
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
  v_active_assignment public.order_bag_assignments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_new_request_id uuid;
  v_shop_id uuid;
  v_customer_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_bag FROM public.paas_bags WHERE id = p_bag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAG_NOT_FOUND'; END IF;

  IF v_bag.status <> 'with_customer' THEN
    RAISE EXCEPTION 'INVALID_BAG_STATE: Bag % is currently ''%'', must be ''with_customer''',
      v_bag.bag_code, v_bag.status;
  END IF;

  -- Prevent duplicate active recovery requests for this bag
  IF EXISTS (
    SELECT 1 FROM public.recovery_requests
    WHERE bag_id = p_bag_id AND status IN ('requested', 'planned', 'assigned', 'in_transit')
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_ACTIVE_RECOVERY_REQUEST: Active recovery request already exists for bag %', v_bag.bag_code;
  END IF;

  -- Resolve customer and shop context from active order assignment
  SELECT * INTO v_active_assignment FROM public.order_bag_assignments
  WHERE bag_id = p_bag_id AND is_active = true
  ORDER BY assigned_at DESC LIMIT 1;

  IF v_active_assignment.order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_active_assignment.order_id;
    v_shop_id := v_order.shop_id;
    v_customer_id := COALESCE(v_order.customer_id, v_actor_id);
  ELSE
    v_shop_id := COALESCE(v_bag.current_shop_id, (SELECT id FROM public.shops LIMIT 1));
    v_customer_id := COALESCE(v_bag.current_holder_user_id, v_actor_id);
  END IF;

  -- Transition bag to return_requested
  UPDATE public.paas_bags
  SET status = 'return_requested',
      updated_at = now()
  WHERE id = p_bag_id;

  -- Insert Recovery Request with Strategy A as MVP default
  INSERT INTO public.recovery_requests (
    shop_id,
    customer_id,
    bag_id,
    order_id,
    status,
    recovery_strategy,
    pickup_address,
    lat,
    lng,
    pickup_date,
    time_slot_start,
    time_slot_end,
    notes
  ) VALUES (
    v_shop_id,
    v_customer_id,
    p_bag_id,
    v_order.id,
    'requested',
    'strategy_a_merged',
    p_pickup_address,
    p_lat,
    p_lng,
    p_pickup_date,
    p_time_slot_start,
    p_time_slot_end,
    p_notes
  )
  RETURNING id INTO v_new_request_id;

  -- Persist explainable Recovery Decision
  INSERT INTO public.recovery_decisions (
    recovery_request_id,
    recommended_strategy,
    selected_strategy,
    decision_source,
    estimated_distance_delta_km,
    estimated_duration_delta_mins,
    estimated_cost_delta_vnd,
    context_signals_snapshot,
    rationale,
    decided_by
  ) VALUES (
    v_new_request_id,
    'strategy_a_merged',
    'strategy_a_merged',
    'GALM_RULE_ENGINE',
    2.50,
    15,
    7500.00,
    jsonb_build_object('weather', 'CLEAR', 'traffic', 'NORMAL', 'flood_risk', 'NONE'),
    jsonb_build_object(
      'strategy', 'Strategy A - Merged Delivery Route',
      'priority', 'high',
      'carbon_efficiency', 'High (merged with forward route)',
      'initial_evaluation', true
    ),
    v_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'recovery_request_id', v_new_request_id,
    'bag_id', p_bag_id,
    'bag_code', v_bag.bag_code,
    'bag_status', 'return_requested',
    'strategy', 'strategy_a_merged'
  );
END;
$$;


-- ============================================================================
-- 4. STRATEGY A ASSIGNMENT: evaluate_and_assign_recovery_strategy_a
-- Persists route attachment, deltas, and rationale
-- ============================================================================

CREATE OR REPLACE FUNCTION public.evaluate_and_assign_recovery_strategy_a(
  p_recovery_request_id uuid,
  p_route_id uuid,
  p_shipper_id uuid,
  p_distance_delta numeric DEFAULT 2.50,
  p_duration_delta integer DEFAULT 15,
  p_cost_delta numeric DEFAULT 7500.00,
  p_rationale jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_recovery public.recovery_requests%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_recovery FROM public.recovery_requests WHERE id = p_recovery_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_NOT_FOUND'; END IF;

  -- Update recovery request assignment
  UPDATE public.recovery_requests
  SET assigned_route_id = p_route_id,
      assigned_shipper_id = p_shipper_id,
      status = 'assigned',
      recovery_strategy = 'strategy_a_merged',
      updated_at = now()
  WHERE id = p_recovery_request_id;

  -- Record decision
  INSERT INTO public.recovery_decisions (
    recovery_request_id,
    recommended_strategy,
    selected_strategy,
    decision_source,
    estimated_distance_delta_km,
    estimated_duration_delta_mins,
    estimated_cost_delta_vnd,
    target_route_id,
    context_signals_snapshot,
    rationale,
    decided_by
  ) VALUES (
    p_recovery_request_id,
    'strategy_a_merged',
    'strategy_a_merged',
    'GALM_RULE_ENGINE',
    p_distance_delta,
    p_duration_delta,
    p_cost_delta,
    p_route_id,
    jsonb_build_object('assigned_shipper_id', p_shipper_id, 'assigned_at', now()),
    p_rationale,
    v_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'recovery_request_id', p_recovery_request_id,
    'route_id', p_route_id,
    'shipper_id', p_shipper_id,
    'strategy', 'strategy_a_merged'
  );
END;
$$;


-- ============================================================================
-- 5. SHIPPER RECOVERY TRANSIT: start_bag_recovery
-- Enforces: return_requested -> recovering
-- Custody: shipper (transit_vehicle)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.start_bag_recovery(
  p_recovery_request_id uuid,
  p_shipper_id uuid
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
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_recovery FROM public.recovery_requests WHERE id = p_recovery_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_NOT_FOUND'; END IF;

  SELECT * INTO v_bag FROM public.paas_bags WHERE id = v_recovery.bag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAG_NOT_FOUND'; END IF;

  IF v_bag.status <> 'return_requested' THEN
    RAISE EXCEPTION 'INVALID_BAG_STATE: Bag % is in ''%'', must be ''return_requested''',
      v_bag.bag_code, v_bag.status;
  END IF;

  -- Update recovery request
  UPDATE public.recovery_requests
  SET status = 'in_transit',
      assigned_shipper_id = p_shipper_id,
      updated_at = now()
  WHERE id = p_recovery_request_id;

  -- Update bag status to recovering
  UPDATE public.paas_bags
  SET status = 'recovering',
      current_holder_type = 'shipper',
      current_holder_user_id = p_shipper_id,
      current_location_type = 'transit_vehicle',
      updated_at = now()
  WHERE id = v_bag.id;

  RETURN jsonb_build_object(
    'success', true,
    'recovery_request_id', p_recovery_request_id,
    'bag_id', v_bag.id,
    'bag_code', v_bag.bag_code,
    'bag_status', 'recovering'
  );
END;
$$;


-- ============================================================================
-- 6. RECOVERY COMPLETION (IDEMPOTENT): verify_and_complete_bag_recovery
-- Enforces: recovering -> at_hub
-- Custody: warehouse (current_holder_user_id = NULL)
-- INVARIANT: usage_count is NOT incremented!
-- Closes active bag assignment (is_active = false)
-- ============================================================================

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
  v_points_awarded integer := 50;
  v_idempotency_key text;
  v_hub_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_recovery FROM public.recovery_requests WHERE id = p_recovery_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_NOT_FOUND'; END IF;

  SELECT * INTO v_bag FROM public.paas_bags WHERE id = v_recovery.bag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAG_NOT_FOUND'; END IF;

  -- IDEMPOTENCY: If recovery is already completed and bag is at or past hub, return idempotently
  IF v_recovery.status = 'completed' AND v_bag.status IN ('at_hub', 'inspection', 'maintenance', 'ready_for_reuse') THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_noop', true,
      'recovery_id', p_recovery_request_id,
      'bag_code', v_bag.bag_code,
      'bag_status', v_bag.status,
      'usage_count', v_bag.usage_count,
      'message', 'Recovery already verified and completed previously'
    );
  END IF;

  -- Physical QR verification (fixed cryptographic hash OR bag code)
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

  -- Mark recovery request completed
  UPDATE public.recovery_requests
  SET status = 'completed',
      picked_up_at = COALESCE(picked_up_at, now()),
      completed_at = now(),
      updated_at = now()
  WHERE id = p_recovery_request_id;

  -- Transition bag to at_hub
  -- INVARIANT: usage_count MUST NOT increment here!
  UPDATE public.paas_bags
  SET status = 'at_hub',
      condition = p_condition,
      current_location_type = 'warehouse',
      current_warehouse_id = v_hub_id,
      current_holder_type = 'warehouse',
      current_holder_user_id = NULL,
      updated_at = now()
  WHERE id = v_bag.id;

  -- Close active order-bag assignment
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

  -- Award Green Points Incentive with idempotency key
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
    'is_idempotent_noop', false,
    'recovery_id', p_recovery_request_id,
    'bag_code', v_bag.bag_code,
    'bag_status', 'at_hub',
    'usage_count', v_bag.usage_count,
    'deposit_refunded_vnd', COALESCE(v_deposit.deposit_amount_vnd, 0),
    'points_awarded', v_points_awarded
  );
END;
$$;


-- ============================================================================
-- 7. INSPECTION & WASHING WORKFLOW RPCS
-- start_bag_inspection: at_hub -> inspection
-- send_bag_to_maintenance: inspection -> maintenance
-- complete_bag_inspection_washing: (inspection|maintenance) -> ready_for_reuse
-- ============================================================================

CREATE OR REPLACE FUNCTION public.start_bag_inspection(
  p_bag_id uuid,
  p_warehouse_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_bag public.paas_bags%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_bag FROM public.paas_bags WHERE id = p_bag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAG_NOT_FOUND'; END IF;

  IF v_bag.status <> 'at_hub' THEN
    RAISE EXCEPTION 'INVALID_BAG_STATE: Bag % is currently ''%'', must be ''at_hub'' to start inspection',
      v_bag.bag_code, v_bag.status;
  END IF;

  UPDATE public.paas_bags
  SET status = 'inspection',
      current_warehouse_id = p_warehouse_id,
      current_holder_type = 'warehouse',
      current_holder_user_id = NULL,
      current_location_type = 'warehouse',
      updated_at = now()
  WHERE id = p_bag_id;

  RETURN jsonb_build_object(
    'success', true,
    'bag_id', p_bag_id,
    'bag_code', v_bag.bag_code,
    'status', 'inspection',
    'usage_count', v_bag.usage_count
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.send_bag_to_maintenance(
  p_bag_id uuid,
  p_warehouse_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_bag public.paas_bags%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_bag FROM public.paas_bags WHERE id = p_bag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAG_NOT_FOUND'; END IF;

  IF v_bag.status <> 'inspection' THEN
    RAISE EXCEPTION 'INVALID_BAG_STATE: Bag % is currently ''%'', must be ''inspection'' to send to maintenance',
      v_bag.bag_code, v_bag.status;
  END IF;

  UPDATE public.paas_bags
  SET status = 'maintenance',
      current_warehouse_id = p_warehouse_id,
      current_holder_type = 'warehouse',
      current_holder_user_id = NULL,
      current_location_type = 'cleaning_station',
      updated_at = now()
  WHERE id = p_bag_id;

  RETURN jsonb_build_object(
    'success', true,
    'bag_id', p_bag_id,
    'bag_code', v_bag.bag_code,
    'status', 'maintenance',
    'usage_count', v_bag.usage_count
  );
END;
$$;


-- CORE CIRCULAR ACCOUNTING RPC (IDEMPOTENT)
-- usage_count ONLY INCREMENTS ON: inspection PASSED + washing COMPLETED -> ready_for_reuse
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
  v_new_usage_count integer;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_bag FROM public.paas_bags WHERE id = p_bag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAG_NOT_FOUND'; END IF;

  -- IDEMPOTENCY: If bag is already certified ready_for_reuse and result is passed, do not double-increment!
  IF v_bag.status = 'ready_for_reuse' AND p_result = 'passed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_noop', true,
      'bag_id', p_bag_id,
      'bag_code', v_bag.bag_code,
      'status', 'ready_for_reuse',
      'cycle_completed', false,
      'usage_count', v_bag.usage_count,
      'message', 'Bag already certified ready for reuse'
    );
  END IF;

  -- Must be in inspection or maintenance
  IF v_bag.status NOT IN ('inspection', 'maintenance') THEN
    RAISE EXCEPTION 'INVALID_BAG_STATE: Bag % is in ''%'', must be in ''inspection'' or ''maintenance''',
      v_bag.bag_code, v_bag.status;
  END IF;

  -- Determine next status based on inspection/washing outcome
  v_next_status := CASE
    WHEN p_result = 'passed' THEN 'ready_for_reuse'::public.paas_bag_status
    WHEN p_result = 'needs_wash' THEN 'maintenance'::public.paas_bag_status
    WHEN p_result = 'scrapped' THEN 'retired'::public.paas_bag_status
    WHEN p_result = 'degraded' THEN 'damaged'::public.paas_bag_status
    ELSE 'available'::public.paas_bag_status
  END;

  v_cycle_completed := (v_next_status = 'ready_for_reuse');
  v_new_usage_count := CASE WHEN v_cycle_completed THEN v_bag.usage_count + 1 ELSE v_bag.usage_count END;

  -- Record Maintenance Log
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
    2.50,
    p_notes
  );

  -- Update Bag: strictly increment usage_count ONLY when the cycle completed back to ready_for_reuse!
  UPDATE public.paas_bags
  SET status = v_next_status,
      usage_count = v_new_usage_count,
      condition = CASE
        WHEN p_result = 'passed' THEN 'good'::public.bag_condition
        WHEN p_result = 'scrapped' THEN 'scrapped'::public.bag_condition
        WHEN p_result = 'degraded' THEN 'damaged'::public.bag_condition
        ELSE condition
      END,
      last_inspected_at = now(),
      last_cleaned_at = CASE WHEN p_action IN ('washed_sanitized', 'inspected_ok') THEN now() ELSE last_cleaned_at END,
      current_warehouse_id = p_warehouse_id,
      current_location_type = 'warehouse',
      current_holder_type = 'warehouse',
      current_holder_user_id = NULL,
      updated_at = now()
  WHERE id = p_bag_id;

  RETURN jsonb_build_object(
    'success', true,
    'is_idempotent_noop', false,
    'bag_id', p_bag_id,
    'bag_code', v_bag.bag_code,
    'new_status', v_next_status,
    'cycle_completed', v_cycle_completed,
    'new_usage_count', v_new_usage_count
  );
END;
$$;


-- ============================================================================
-- 8. RESTOCKING AND RETIREMENT RPCS
-- return_bag_to_stock: ready_for_reuse -> available
-- retire_bag: (damaged|inspection|maintenance|available) -> retired
-- ============================================================================

CREATE OR REPLACE FUNCTION public.return_bag_to_stock(p_bag_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_bag public.paas_bags%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_bag FROM public.paas_bags WHERE id = p_bag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAG_NOT_FOUND'; END IF;

  IF v_bag.status <> 'ready_for_reuse' THEN
    RAISE EXCEPTION 'INVALID_BAG_STATE: Bag % is in ''%'', must be ''ready_for_reuse'' to return to stock',
      v_bag.bag_code, v_bag.status;
  END IF;

  UPDATE public.paas_bags
  SET status = 'available',
      current_holder_type = 'warehouse',
      current_holder_user_id = NULL,
      current_location_type = 'warehouse',
      updated_at = now()
  WHERE id = p_bag_id;

  RETURN jsonb_build_object(
    'success', true,
    'bag_id', p_bag_id,
    'bag_code', v_bag.bag_code,
    'status', 'available',
    'usage_count', v_bag.usage_count
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.retire_bag(
  p_bag_id uuid,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_bag public.paas_bags%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_bag FROM public.paas_bags WHERE id = p_bag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BAG_NOT_FOUND'; END IF;

  UPDATE public.paas_bags
  SET status = 'retired',
      condition = 'scrapped',
      current_holder_type = 'warehouse',
      current_holder_user_id = NULL,
      current_location_type = 'warehouse',
      updated_at = now()
  WHERE id = p_bag_id;

  RETURN jsonb_build_object(
    'success', true,
    'bag_id', p_bag_id,
    'bag_code', v_bag.bag_code,
    'status', 'retired',
    'condition', 'scrapped',
    'reason', p_reason
  );
END;
$$;


-- ============================================================================
-- 9. PERMISSIONS GRANT
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.update_order_delivery_status(uuid, public.order_status, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_bag_recovery(uuid, text, double precision, double precision, date, time, time, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_and_assign_recovery_strategy_a(uuid, uuid, uuid, numeric, integer, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_bag_recovery(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_and_complete_bag_recovery(uuid, text, public.bag_condition) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_bag_inspection(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_bag_to_maintenance(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_bag_inspection_washing(uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_bag_to_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retire_bag(uuid, text) TO authenticated;

-- ============================================================================
-- 10. HARDEN PAAS_BAGS RLS POLICIES
-- Direct client UPDATE/INSERT/DELETE is strictly blocked for standard clients.
-- All lifecycle state, custody, location, and usage_count mutations MUST execute via SECURITY DEFINER RPCs.
-- ============================================================================

DROP POLICY IF EXISTS "paas_bags_manage" ON public.paas_bags;
DROP POLICY IF EXISTS "paas_bags_admin_insert" ON public.paas_bags;
DROP POLICY IF EXISTS "paas_bags_admin_update" ON public.paas_bags;
DROP POLICY IF EXISTS "paas_bags_admin_delete" ON public.paas_bags;

CREATE POLICY "paas_bags_admin_insert" ON public.paas_bags FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "paas_bags_admin_update" ON public.paas_bags FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "paas_bags_admin_delete" ON public.paas_bags FOR DELETE TO authenticated
  USING (public.is_platform_admin());

-- ============================================================================
-- 11. CORRECT LIFECYCLE EVENT TRIGGER MAPPING
-- Ensures ready_for_reuse -> available maps to RETURNED_TO_STOCK
-- ============================================================================

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
