-- Migration 18: Pickup QR Security Hardening

-- Customers rotate their own QR through a SECURITY DEFINER RPC so the token can
-- still be refreshed after a pickup has been assigned, without granting broad UPDATE rights.
CREATE OR REPLACE FUNCTION public.rotate_pickup_qr(p_pickup_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_pickup public.packaging_pickups%ROWTYPE;
  v_raw_token text;
  v_hash text;
  v_expires_at timestamptz;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_pickup FROM public.packaging_pickups WHERE id = p_pickup_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Pickup not found'; END IF;
  IF v_pickup.customer_id IS DISTINCT FROM v_actor_id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_pickup.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'INVALID_STATE: QR cannot be created for a terminal pickup';
  END IF;

  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_raw_token, 'sha256'), 'hex');
  v_expires_at := now() + interval '24 hours';

  UPDATE public.packaging_pickups
  SET qr_token_hash = v_hash, qr_expires_at = v_expires_at, updated_at = now()
  WHERE id = p_pickup_id;

  RETURN jsonb_build_object('pickup_id', p_pickup_id, 'raw_qr_token', v_raw_token, 'qr_expires_at', v_expires_at);
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_pickup_qr(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_pickup_qr(uuid) TO authenticated;

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
  v_actor_id uuid := auth.uid();
  v_pickup public.packaging_pickups%ROWTYPE;
  v_route public.routes%ROWTYPE;
  v_token_hash text;
  v_points integer;
  v_idempotency_key text;
  v_transaction_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_actual_weight_kg IS NULL OR p_actual_weight_kg <= 0 OR p_actual_weight_kg > 10000 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Actual weight must be between 0 and 10000 kg';
  END IF;

  SELECT * INTO v_pickup FROM public.packaging_pickups WHERE id = p_pickup_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Pickup not found'; END IF;
  IF v_pickup.status = 'completed' THEN RAISE EXCEPTION 'CONFLICT: Pickup already completed'; END IF;
  IF v_pickup.status NOT IN ('assigned', 'collecting') THEN RAISE EXCEPTION 'INVALID_STATE: Pickup must be assigned to an active route'; END IF;
  IF v_pickup.qr_token_hash IS NULL OR v_pickup.qr_expires_at IS NULL OR v_pickup.qr_expires_at < now() THEN
    RAISE EXCEPTION 'EXPIRED: Pickup QR is missing or expired';
  END IF;

  v_token_hash := encode(digest(p_qr_token, 'sha256'), 'hex');
  IF v_pickup.qr_token_hash IS DISTINCT FROM v_token_hash THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;
  IF v_pickup.assigned_route_id IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: Pickup has no route'; END IF;

  SELECT * INTO v_route FROM public.routes WHERE id = v_pickup.assigned_route_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Assigned route not found'; END IF;
  IF v_route.shipper_id IS DISTINCT FROM v_actor_id THEN RAISE EXCEPTION 'FORBIDDEN: Not assigned shipper'; END IF;
  IF v_route.status <> 'in_progress' THEN RAISE EXCEPTION 'PRECONDITION_FAILED: Route must be in_progress'; END IF;

  v_points := ROUND(p_actual_weight_kg * 10);
  v_idempotency_key := 'pickup_reward_' || p_pickup_id::text;

  UPDATE public.packaging_pickups
  SET status = 'completed', verified_quantity_kg = p_actual_weight_kg,
      qr_token_hash = NULL, qr_expires_at = now(), completed_at = now(), updated_at = now()
  WHERE id = p_pickup_id;

  UPDATE public.route_stops
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE route_id = v_pickup.assigned_route_id AND pickup_id = p_pickup_id;

  INSERT INTO public.green_point_transactions(customer_id, points_delta, transaction_type, packaging_pickup_id, description, idempotency_key)
  VALUES (v_pickup.customer_id, v_points, 'pickup_reward', p_pickup_id,
          'Green Points từ ' || p_actual_weight_kg || ' kg bao bì đã xác nhận', v_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_transaction_id;

  INSERT INTO public.notifications(user_id,type,title,message,metadata)
  VALUES (v_pickup.customer_id,'PICKUP_COMPLETED','Thu gom bao bì hoàn tất',
          'Bạn nhận +' || v_points || ' Green Points.', jsonb_build_object('pickup_id',p_pickup_id,'points',v_points));

  RETURN jsonb_build_object('success',true,'pickup_id',p_pickup_id,'points_awarded',v_points,
                            'actual_weight_kg',p_actual_weight_kg,'transaction_id',v_transaction_id);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_pickup_qr(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_pickup_qr(uuid, text, numeric) TO authenticated;
