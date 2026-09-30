-- GreenBridge v2 - Migration 014: Enforce at most ONE decision per recovery request at database level
-- Guarantees 1-to-1 relationship between recovery_requests and recovery_decisions
-- Prevents duplicate decision creation under concurrent requests or retries

-- 1. Database-level UNIQUE Index on recovery_decisions(recovery_request_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_decisions_request_id
  ON public.recovery_decisions(recovery_request_id);

-- 2. Update evaluate_and_persist_recovery_decision_v2 RPC with atomic idempotency
-- If a decision already exists for p_recovery_request_id, safely return the existing decision ID
-- rather than violating uniqueness or duplicating decisions.
CREATE OR REPLACE FUNCTION public.evaluate_and_persist_recovery_decision_v2(
  p_recovery_request_id uuid,
  p_recommended_strategy public.recovery_strategy_type,
  p_selected_strategy public.recovery_strategy_type,
  p_distance_delta numeric,
  p_duration_delta integer,
  p_cost_delta numeric,
  p_target_route_id uuid DEFAULT NULL,
  p_context_signals jsonb DEFAULT '{}'::jsonb,
  p_rationale jsonb DEFAULT '{}'::jsonb,
  p_decision_source text DEFAULT 'GALM_RULE_ENGINE'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_recovery public.recovery_requests%ROWTYPE;
  v_route public.routes%ROWTYPE;
  v_decision_id uuid;
  v_shipper_id uuid := NULL;
  v_existing_decision_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  -- Lock recovery request row to serialize concurrent evaluation calls
  SELECT * INTO v_recovery FROM public.recovery_requests WHERE id = p_recovery_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_NOT_FOUND: %', p_recovery_request_id; END IF;

  -- Idempotency check: if decision already exists for this recovery request, return existing decision safely
  SELECT id INTO v_existing_decision_id FROM public.recovery_decisions WHERE recovery_request_id = p_recovery_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_existing', true,
      'decision_id', v_existing_decision_id,
      'recovery_request_id', p_recovery_request_id,
      'recommended_strategy', p_recommended_strategy,
      'selected_strategy', v_recovery.recovery_strategy,
      'target_route_id', v_recovery.assigned_route_id,
      'assigned_shipper_id', v_recovery.assigned_shipper_id,
      'estimated_distance_delta_km', p_distance_delta,
      'estimated_duration_delta_mins', p_duration_delta,
      'estimated_cost_delta_vnd', p_cost_delta
    );
  END IF;

  -- Verify target route if Strategy A is selected
  IF p_selected_strategy = 'strategy_a_merged' AND p_target_route_id IS NOT NULL THEN
    SELECT * INTO v_route FROM public.routes WHERE id = p_target_route_id FOR UPDATE;
    IF FOUND THEN
      v_shipper_id := v_route.shipper_id;
    END IF;
  END IF;

  -- Insert explainable decision into recovery_decisions (protected by UNIQUE index)
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
    p_recommended_strategy,
    p_selected_strategy,
    p_decision_source,
    COALESCE(p_distance_delta, 0),
    COALESCE(p_duration_delta, 0),
    COALESCE(p_cost_delta, 0),
    p_target_route_id,
    p_context_signals,
    p_rationale,
    v_actor_id
  )
  RETURNING id INTO v_decision_id;

  -- Update recovery request strategy and assignment atomically
  UPDATE public.recovery_requests
  SET recovery_strategy = p_selected_strategy,
      assigned_route_id = p_target_route_id,
      assigned_shipper_id = COALESCE(v_shipper_id, assigned_shipper_id),
      status = CASE
        WHEN p_selected_strategy = 'strategy_a_merged' AND p_target_route_id IS NOT NULL THEN 'assigned'::public.recovery_request_status
        WHEN p_selected_strategy = 'strategy_c_dedicated' THEN 'planned'::public.recovery_request_status
        ELSE status
      END,
      updated_at = now()
  WHERE id = p_recovery_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', v_decision_id,
    'recovery_request_id', p_recovery_request_id,
    'recommended_strategy', p_recommended_strategy,
    'selected_strategy', p_selected_strategy,
    'target_route_id', p_target_route_id,
    'assigned_shipper_id', v_shipper_id,
    'estimated_distance_delta_km', p_distance_delta,
    'estimated_duration_delta_mins', p_duration_delta,
    'estimated_cost_delta_vnd', p_cost_delta
  );
END;
$$;
