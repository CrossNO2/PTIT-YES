-- Migration 16: Harden Route Approval & Assignment RPCs

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
  v_order_count integer := 0;
  v_unique_order_count integer := 0;
  v_vehicle_capacity numeric;
  v_total_weight numeric;
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

  -- 3. Validation: Warehouse
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses 
    WHERE id = p_warehouse_id AND shop_id = p_shop_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'INVALID_WAREHOUSE: Warehouse does not exist, is inactive, or belongs to another shop';
  END IF;

  -- 4. Pre-validation: uniqueness of orders across all proposed routes
  SELECT count(*) INTO v_order_count
  FROM (
    SELECT jsonb_array_elements(elem->'stops')->>'orderId' AS order_id
    FROM jsonb_array_elements(p_routes) AS elem
  ) q WHERE order_id IS NOT NULL;
  
  SELECT count(DISTINCT order_id) INTO v_unique_order_count
  FROM (
    SELECT jsonb_array_elements(elem->'stops')->>'orderId' AS order_id
    FROM jsonb_array_elements(p_routes) AS elem
  ) q WHERE order_id IS NOT NULL;

  IF v_order_count != v_unique_order_count THEN
    RAISE EXCEPTION 'INVALID_ORDERS: Duplicate orders found across proposed routes';
  END IF;

  -- 5. Process each route in p_routes array
  FOR v_route IN SELECT * FROM jsonb_to_recordset(p_routes) AS (
    vehicle_id uuid,
    shipper_id uuid,
    stops jsonb,
    total_distance_km numeric,
    total_duration_mins integer,
    estimated_cost_vnd numeric,
    naive_distance_km numeric
  ) LOOP
    -- Validation: Vehicle
    SELECT capacity_kg INTO v_vehicle_capacity FROM public.vehicles 
    WHERE id = v_route.vehicle_id AND shop_id = p_shop_id AND status = 'active';
    
    IF v_vehicle_capacity IS NULL THEN
      RAISE EXCEPTION 'INVALID_VEHICLE: Vehicle % does not exist or is inactive in shop', v_route.vehicle_id;
    END IF;

    -- Validation: Vehicle not overlapping in another route today
    IF EXISTS (
      SELECT 1 FROM public.routes 
      WHERE vehicle_id = v_route.vehicle_id AND route_date = p_route_date AND status != 'cancelled'
    ) THEN
      RAISE EXCEPTION 'VEHICLE_OVERLAP: Vehicle % is already assigned to a route on %', v_route.vehicle_id, p_route_date;
    END IF;

    -- Validation: Shipper (if provided)
    IF v_route.shipper_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = p_shop_id AND user_id = v_route.shipper_id AND member_role = 'shipper' AND status = 'active'
      ) THEN
        RAISE EXCEPTION 'INVALID_SHIPPER: Shipper % is not an active shipper in this shop', v_route.shipper_id;
      END IF;

      -- Validation: Shipper Shift
      IF NOT EXISTS (
        SELECT 1 FROM public.shipper_shifts
        WHERE shipper_id = v_route.shipper_id AND shift_date = p_route_date AND status IN ('scheduled', 'active')
      ) THEN
        RAISE EXCEPTION 'INVALID_SHIFT: Shipper % does not have a valid shift on %', v_route.shipper_id, p_route_date;
      END IF;

      -- Validation: Shipper overlap
      IF EXISTS (
        SELECT 1 FROM public.routes 
        WHERE shipper_id = v_route.shipper_id AND route_date = p_route_date AND status != 'cancelled'
      ) THEN
        RAISE EXCEPTION 'SHIPPER_OVERLAP: Shipper % is already assigned to a route on %', v_route.shipper_id, p_route_date;
      END IF;
    END IF;

    -- Lock associated orders to prevent race conditions
    PERFORM 1 FROM public.orders
    WHERE id IN (
      SELECT (elem->>'orderId')::uuid
      FROM jsonb_array_elements(v_route.stops) AS elem
      WHERE elem->>'stopType' = 'delivery'
    )
    FOR UPDATE;

    -- Validation: Orders
    IF EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id IN (
        SELECT (elem->>'orderId')::uuid
        FROM jsonb_array_elements(v_route.stops) AS elem
        WHERE elem->>'stopType' = 'delivery'
      )
      AND (
        o.shop_id != p_shop_id OR
        o.delivery_date != p_route_date OR
        o.status != 'ready' OR
        o.assigned_route_id IS NOT NULL
      )
    ) THEN
      RAISE EXCEPTION 'INVALID_ORDER_STATE: One or more orders do not belong to the shop, have wrong date, are not ready, or already assigned';
    END IF;

    -- Validation: Capacity
    SELECT COALESCE(SUM(weight_kg), 0) INTO v_total_weight FROM public.orders
    WHERE id IN (
      SELECT (elem->>'orderId')::uuid
      FROM jsonb_array_elements(v_route.stops) AS elem
      WHERE elem->>'stopType' = 'delivery'
    );

    IF v_total_weight > v_vehicle_capacity THEN
      RAISE EXCEPTION 'CAPACITY_EXCEEDED: Route total weight % exceeds vehicle capacity %', v_total_weight, v_vehicle_capacity;
    END IF;

    -- Insert Route
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
      COALESCE(v_route.naive_distance_km, 0),
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

  -- Validation: User is dispatcher/admin
  IF NOT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = v_route.shop_id AND user_id = v_actor_id
      AND member_role IN ('owner', 'admin', 'dispatcher') AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Validation: Route status must be 'approved'
  IF v_route.status != 'approved' THEN
    RAISE EXCEPTION 'INVALID_ROUTE_STATE: Route must be approved to assign shipper. Current status: %', v_route.status;
  END IF;
  
  -- Validation: Route has not started
  IF v_route.started_at IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_ROUTE_STATE: Route has already started';
  END IF;

  -- Validation: Shipper is active shop member with shipper role
  IF NOT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = v_route.shop_id AND user_id = p_shipper_id AND member_role = 'shipper' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'INVALID_SHIPPER: User is not an active shipper in this shop';
  END IF;

  -- Validation: Shipper has a valid shift for the route date
  IF NOT EXISTS (
    SELECT 1 FROM public.shipper_shifts
    WHERE shipper_id = p_shipper_id AND shift_date = v_route.route_date AND status IN ('scheduled', 'active')
  ) THEN
    RAISE EXCEPTION 'INVALID_SHIFT: Shipper does not have a valid shift on %', v_route.route_date;
  END IF;

  -- Validation: Shipper is not already assigned to another route on the same day
  IF EXISTS (
    SELECT 1 FROM public.routes
    WHERE shipper_id = p_shipper_id AND route_date = v_route.route_date AND status != 'cancelled'
  ) THEN
    RAISE EXCEPTION 'SHIPPER_OVERLAP: Shipper is already assigned to a route on %', v_route.route_date;
  END IF;

  -- Validation: Vehicle is not used by another route today
  IF EXISTS (
    SELECT 1 FROM public.routes
    WHERE vehicle_id = v_route.vehicle_id AND route_date = v_route.route_date AND id != p_route_id AND status != 'cancelled'
  ) THEN
    RAISE EXCEPTION 'VEHICLE_OVERLAP: Vehicle is already used by another route on %', v_route.route_date;
  END IF;

  -- Update Route
  UPDATE public.routes
  SET shipper_id = p_shipper_id,
      status = 'assigned',
      updated_at = now()
  WHERE id = p_route_id;

  -- Update Orders
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
