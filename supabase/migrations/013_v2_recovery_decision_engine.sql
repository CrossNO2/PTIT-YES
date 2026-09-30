-- GreenBridge v2 - Migration 013: Recovery Decision & Route Optimization Engine
-- Rebuilt from zero for Packaging-as-a-Service (PaaS) architecture (GB-003)
-- Implements atomic explainable recovery decision persistence and Strategy A / Strategy C route assignment

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
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO v_recovery FROM public.recovery_requests WHERE id = p_recovery_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_NOT_FOUND: %', p_recovery_request_id; END IF;

  -- Verify target route if Strategy A is selected
  IF p_selected_strategy = 'strategy_a_merged' AND p_target_route_id IS NOT NULL THEN
    SELECT * INTO v_route FROM public.routes WHERE id = p_target_route_id FOR UPDATE;
    IF FOUND THEN
      v_shipper_id := v_route.shipper_id;
    END IF;
  END IF;

  -- Insert explainable decision into recovery_decisions
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

GRANT EXECUTE ON FUNCTION public.evaluate_and_persist_recovery_decision_v2(
  uuid,
  public.recovery_strategy_type,
  public.recovery_strategy_type,
  numeric,
  integer,
  numeric,
  uuid,
  jsonb,
  jsonb,
  text
) TO authenticated;

-- 4. Decision Immutability Enforcement
-- Ensures recovery decisions are strictly append-only; historical decisions cannot be mutated or deleted.
CREATE OR REPLACE FUNCTION public.fn_prevent_recovery_decision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'RECOVERY_DECISION_IMMUTABLE: recovery_decisions records cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_recovery_decision_mutation ON public.recovery_decisions;
CREATE TRIGGER trg_prevent_recovery_decision_mutation
  BEFORE UPDATE OR DELETE ON public.recovery_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_recovery_decision_mutation();
