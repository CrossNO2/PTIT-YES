-- Migration 13: Atomic Route Approval & Order State Transition RPCs

--------------------------------------------------------------------------------
-- RPC 1: approve_optimized_routes
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_optimized_routes(
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
  v_actor_id uuid;
  v_route record;
  v_new_route_id uuid;
  v_route_count integer := 0;
BEGIN
  -- 1. Derive Actor Identity
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: User must be logged in';
  END IF;

  -- 2. Verify Shop Staff Permission (owner, admin, dispatcher)
  IF NOT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = p_shop_id
      AND user_id = v_actor_id
      AND member_role IN ('owner', 'admin', 'dispatcher')
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: User does not have dispatcher/admin role in shop';
  END IF;

  -- 3. Process each route in p_routes array
  FOR v_route IN SELECT * FROM jsonb_to_recordset(p_routes) AS (
    vehicle_id uuid,
    shipper_id uuid,
    stops jsonb,
    total_distance_km numeric,
    total_duration_mins integer,
    estimated_cost_vnd numeric
  ) LOOP
    -- Lock associated orders to prevent race conditions
    PERFORM 1 FROM public.orders
    WHERE id IN (
      SELECT (elem->>'orderId')::uuid
      FROM jsonb_array_elements(v_route.stops) AS elem
      WHERE elem->>'stopType' = 'delivery'
    )
    FOR UPDATE;

    -- Insert Route (Status: 'approved' if shipper null, 'assigned' if shipper provided)
    INSERT INTO public.routes (
      shop_id,
      warehouse_id,
      route_date,
      vehicle_id,
      shipper_id,
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
      0,
      v_route.total_distance_km,
      v_route.total_duration_mins,
      v_route.estimated_cost_vnd,
      CASE WHEN v_route.shipper_id IS NOT NULL THEN 'assigned'::public.route_status ELSE 'approved'::public.route_status END,
      p_optimization_version,
      v_actor_id,
      now()
    )
    RETURNING id INTO v_new_route_id;

    -- Insert Route Stops
    INSERT INTO public.route_stops (
      route_id,
      stop_type,
      order_id,
      pickup_id,
      sequence_index,
      distance_from_previous_km,
      duration_from_previous_mins,
      status
    )
    SELECT
      v_new_route_id,
      (elem->>'stopType')::public.stop_type,
      (elem->>'orderId')::uuid,
      (elem->>'pickupId')::uuid,
      (elem->>'sequenceIndex')::integer,
      COALESCE((elem->>'distanceFromPreviousKm')::numeric, 0),
      COALESCE((elem->>'durationFromPreviousMins')::integer, 0),
      'pending'::public.stop_status
    FROM jsonb_array_elements(v_route.stops) AS elem;

    -- Update Order Status
    UPDATE public.orders
    SET assigned_route_id = v_new_route_id,
        assigned_shipper_id = v_route.shipper_id,
        status = CASE WHEN v_route.shipper_id IS NOT NULL THEN 'assigned'::public.order_status ELSE 'ready'::public.order_status END,
        updated_at = now()
    WHERE id IN (
      SELECT (elem->>'orderId')::uuid
      FROM jsonb_array_elements(v_route.stops) AS elem
      WHERE elem->>'stopType' = 'delivery'
    );

    v_route_count := v_route_count + 1;
  END LOOP;

  -- 4. Audit Log
  INSERT INTO public.audit_logs (shop_id, actor_id, action, entity_type, new_data)
  VALUES (p_shop_id, v_actor_id, 'APPROVE_ROUTES', 'routes', jsonb_build_object('count', v_route_count, 'date', p_route_date));

  RETURN jsonb_build_object('success', true, 'approved_count', v_route_count);
END;
$$;

--------------------------------------------------------------------------------
-- RPC 2: assign_shipper_to_route
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_shipper_to_route(
  p_route_id uuid,
  p_shipper_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_route record;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_route FROM public.routes WHERE id = p_route_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Route % not found', p_route_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = v_route.shop_id AND user_id = v_actor_id
      AND member_role IN ('owner', 'admin', 'dispatcher') AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  UPDATE public.routes
  SET shipper_id = p_shipper_id,
      status = 'assigned',
      updated_at = now()
  WHERE id = p_route_id;

  UPDATE public.orders
  SET assigned_shipper_id = p_shipper_id,
      status = 'assigned',
      updated_at = now()
  WHERE assigned_route_id = p_route_id;

  INSERT INTO public.audit_logs (shop_id, actor_id, action, entity_type, entity_id, new_data)
  VALUES (v_route.shop_id, v_actor_id, 'ASSIGN_ROUTE', 'routes', p_route_id, jsonb_build_object('shipper_id', p_shipper_id));

  RETURN jsonb_build_object('success', true, 'route_id', p_route_id, 'shipper_id', p_shipper_id);
END;
$$;

--------------------------------------------------------------------------------
-- RPC 3: update_order_delivery_status (Enforces Permission-Guarded Transitions)
--------------------------------------------------------------------------------
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
  v_is_admin boolean := false;
  v_route_status public.route_status;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Order not found'; END IF;

  v_is_admin := EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = v_order.shop_id AND user_id = v_actor_id
      AND member_role IN ('owner','admin') AND status = 'active'
  );
  IF v_order.assigned_shipper_id IS DISTINCT FROM v_actor_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'FORBIDDEN: You are not assigned to this order';
  END IF;

  IF v_order.status = 'assigned' AND p_new_status <> 'delivering' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: assigned -> delivering only';
  ELSIF v_order.status = 'delivering' AND p_new_status NOT IN ('delivered','failed') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: delivering -> delivered|failed only';
  ELSIF v_order.status IN ('delivered','failed','cancelled') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: order is already terminal';
  ELSIF v_order.status NOT IN ('assigned','delivering') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: order must be assigned before delivery workflow';
  END IF;

  IF NOT v_is_admin THEN
    IF v_order.assigned_route_id IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: Order has no route'; END IF;
    SELECT status INTO v_route_status FROM public.routes WHERE id = v_order.assigned_route_id;
    IF v_route_status IS DISTINCT FROM 'in_progress'::public.route_status THEN
      RAISE EXCEPTION 'PRECONDITION_FAILED: Route must be in_progress';
    END IF;
  END IF;

  IF p_new_status = 'delivered' AND NULLIF(trim(COALESCE(p_proof_image_url,'')), '') IS NULL THEN
    RAISE EXCEPTION 'PROOF_REQUIRED: Delivery proof image is required';
  END IF;
  IF p_new_status = 'failed' AND NULLIF(trim(COALESCE(p_failure_reason,'')), '') IS NULL THEN
    RAISE EXCEPTION 'FAILURE_REASON_REQUIRED: Failure reason is required';
  END IF;

  UPDATE public.orders
  SET status = p_new_status,
      started_delivery_at = CASE WHEN p_new_status = 'delivering' THEN COALESCE(started_delivery_at,now()) ELSE started_delivery_at END,
      delivered_at = CASE WHEN p_new_status = 'delivered' THEN now() ELSE delivered_at END,
      failure_reason = CASE WHEN p_new_status = 'failed' THEN trim(p_failure_reason) ELSE failure_reason END,
      proof_image_url = CASE WHEN p_new_status = 'delivered' THEN p_proof_image_url ELSE proof_image_url END,
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.route_stops
  SET status = CASE
        WHEN p_new_status = 'delivered' THEN 'completed'::public.stop_status
        WHEN p_new_status = 'failed' THEN 'failed'::public.stop_status
        ELSE status
      END,
      completed_at = CASE WHEN p_new_status IN ('delivered','failed') THEN now() ELSE completed_at END,
      updated_at = now()
  WHERE order_id = p_order_id AND (v_order.assigned_route_id IS NULL OR route_id = v_order.assigned_route_id);

  INSERT INTO public.order_status_history(order_id,previous_status,new_status,changed_by,notes)
  VALUES (p_order_id,v_order.status,p_new_status,v_actor_id,CASE WHEN p_new_status='failed' THEN p_failure_reason ELSE NULL END);

  INSERT INTO public.audit_logs(shop_id,actor_id,action,entity_type,entity_id,new_data)
  VALUES (v_order.shop_id,v_actor_id,'ORDER_STATUS_CHANGE','orders',p_order_id,
          jsonb_build_object('from',v_order.status,'to',p_new_status,'proof',p_proof_image_url IS NOT NULL));

  RETURN jsonb_build_object('success',true,'order_id',p_order_id,'new_status',p_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_optimized_routes(uuid, uuid, date, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_optimized_routes(uuid, uuid, date, integer, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.assign_shipper_to_route(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_shipper_to_route(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_order_delivery_status(uuid, public.order_status, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_order_delivery_status(uuid, public.order_status, text, text) TO authenticated;
