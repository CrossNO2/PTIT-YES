-- Migration 19: Atomic Voucher Redemption RPC

CREATE OR REPLACE FUNCTION public.redeem_voucher(
  p_voucher_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid;
  v_voucher record;
  v_customer_points integer;
  v_redemption_id uuid;
  v_redemption_code text;
  v_token text;
  v_token_hash text;
  v_qr_expires_at timestamptz;
BEGIN
  -- 1. Derive Actor Identity
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: User must be logged in';
  END IF;

  -- 2. Lock Voucher row
  SELECT * INTO v_voucher
  FROM public.vouchers
  WHERE id = p_voucher_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Voucher % not found', p_voucher_id;
  END IF;

  -- 3. Check Voucher Status & Inventory
  IF NOT v_voucher.is_active THEN
    RAISE EXCEPTION 'INVALID_VOUCHER: Voucher is not active';
  END IF;

  IF v_voucher.expiry_date < current_date THEN
    RAISE EXCEPTION 'EXPIRED: Voucher has expired';
  END IF;

  IF v_voucher.quantity <= 0 THEN
    RAISE EXCEPTION 'OUT_OF_STOCK: Voucher is out of stock';
  END IF;

  -- 4. Check Customer Points Balance
  SELECT COALESCE(SUM(points_delta), 0) INTO v_customer_points
  FROM public.green_point_transactions
  WHERE customer_id = v_actor_id;

  IF v_customer_points < v_voucher.points_required THEN
    RAISE EXCEPTION 'INSUFFICIENT_POINTS: Not enough points. Required: %, Available: %', v_voucher.points_required, v_customer_points;
  END IF;

  -- 5. Generate secure redemption code and QR token
  -- Using crypto random bytes for security, encoding to hex
  v_redemption_code := encode(gen_random_bytes(12), 'hex');
  v_token := encode(gen_random_bytes(32), 'base64');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_qr_expires_at := now() + interval '1 day';

  -- 6. Insert Redemption
  INSERT INTO public.voucher_redemptions (
    voucher_id,
    customer_id,
    points_spent,
    redemption_code,
    qr_token_hash,
    qr_expires_at,
    status
  ) VALUES (
    p_voucher_id,
    v_actor_id,
    v_voucher.points_required,
    v_redemption_code,
    v_token_hash,
    v_qr_expires_at,
    'active'
  )
  RETURNING id INTO v_redemption_id;

  -- 7. Deduct points via ledger
  INSERT INTO public.green_point_transactions (
    customer_id,
    points_delta,
    transaction_type,
    voucher_redemption_id,
    description,
    idempotency_key
  ) VALUES (
    v_actor_id,
    -v_voucher.points_required,
    'voucher_redemption',
    v_redemption_id,
    'Redeemed voucher: ' || v_voucher.name,
    'redeem_' || v_redemption_id::text
  );

  -- 8. Decrease Voucher Quantity
  UPDATE public.vouchers
  SET quantity = quantity - 1,
      updated_at = now()
  WHERE id = p_voucher_id;

  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', v_redemption_id,
    'redemption_code', v_redemption_code,
    'raw_qr_token', v_token,
    'qr_expires_at', v_qr_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_voucher(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_voucher(uuid) TO authenticated;

-- Rotate/reveal a fresh QR token for an active redemption owned by the current customer.
CREATE OR REPLACE FUNCTION public.rotate_voucher_qr(p_redemption_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_redemption public.voucher_redemptions%ROWTYPE;
  v_token text;
  v_token_hash text;
  v_expires_at timestamptz;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_redemption
  FROM public.voucher_redemptions
  WHERE id = p_redemption_id AND customer_id = v_actor_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Redemption not found'; END IF;
  IF v_redemption.status <> 'active' THEN RAISE EXCEPTION 'INVALID_STATE: Voucher is not active'; END IF;

  v_token := encode(gen_random_bytes(32), 'base64');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires_at := now() + interval '1 day';

  UPDATE public.voucher_redemptions
  SET qr_token_hash = v_token_hash,
      qr_expires_at = v_expires_at,
      updated_at = now()
  WHERE id = p_redemption_id;

  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', p_redemption_id,
    'raw_qr_token', v_token,
    'qr_expires_at', v_expires_at,
    'redemption_code', v_redemption.redemption_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_voucher_qr(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_voucher_qr(uuid) TO authenticated;
