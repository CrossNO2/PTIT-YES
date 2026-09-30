-- GreenBridge v2 - Migration 007: Recovery Domain & Explainable Decisions
-- Rebuilt from zero for Packaging-as-a-Service (PaaS) architecture

-- 1. Bag Recovery Requests (Replacing legacy generic packaging pickups)
CREATE TABLE IF NOT EXISTS public.recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bag_id uuid NOT NULL REFERENCES public.paas_bags(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status public.recovery_request_status NOT NULL DEFAULT 'requested',
  recovery_strategy public.recovery_strategy_type NOT NULL DEFAULT 'strategy_a_merged',
  pickup_address text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  pickup_date date NOT NULL,
  time_slot_start time NOT NULL DEFAULT '08:00',
  time_slot_end time NOT NULL DEFAULT '18:00',
  pudo_location_id uuid REFERENCES public.pudo_locations(id) ON DELETE SET NULL,
  assigned_route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  assigned_shipper_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  picked_up_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Explainable Recovery Decisions (Strategy selection, rationale & contextual snapshot)
CREATE TABLE IF NOT EXISTS public.recovery_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_request_id uuid NOT NULL REFERENCES public.recovery_requests(id) ON DELETE CASCADE,
  recommended_strategy public.recovery_strategy_type NOT NULL,
  selected_strategy public.recovery_strategy_type NOT NULL,
  decision_source text NOT NULL DEFAULT 'GALM_RULE_ENGINE' CHECK (decision_source IN ('GALM_AI', 'GALM_RULE_ENGINE', 'OPERATOR_OVERRIDE', 'SIMULATED')),
  estimated_distance_delta_km numeric(8,2) NOT NULL DEFAULT 0,
  estimated_duration_delta_mins integer NOT NULL DEFAULT 0,
  estimated_cost_delta_vnd numeric(12,2) NOT NULL DEFAULT 0,
  target_route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  context_signals_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, -- Snapshots weather/traffic/flooding signals used in decision
  rationale jsonb NOT NULL,                                     -- Explainability payload (e.g. distance delta, time delta, flood status, capacity check)
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Route Stops (Sequential points along a dispatched route)
CREATE TABLE IF NOT EXISTS public.route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  stop_type public.route_stop_type NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  recovery_request_id uuid REFERENCES public.recovery_requests(id) ON DELETE SET NULL,
  pudo_location_id uuid REFERENCES public.pudo_locations(id) ON DELETE SET NULL,
  sequence_index integer NOT NULL,
  estimated_arrival timestamptz,
  distance_from_previous_km numeric(8,2) NOT NULL DEFAULT 0 CHECK (distance_from_previous_km >= 0),
  duration_from_previous_mins integer NOT NULL DEFAULT 0 CHECK (duration_from_previous_mins >= 0),
  status public.route_stop_status NOT NULL DEFAULT 'pending',
  arrived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Upgrade safety: Ensure route_stops table matches v2 schema if upgrading from legacy v1
DO $$ BEGIN
  ALTER TABLE public.route_stops
    ADD COLUMN IF NOT EXISTS recovery_request_id uuid REFERENCES public.recovery_requests(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS pudo_location_id uuid REFERENCES public.pudo_locations(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.route_stops
    ALTER COLUMN stop_type TYPE public.route_stop_type USING stop_type::text::public.route_stop_type;
EXCEPTION WHEN others THEN NULL; END $$;

-- Drop legacy v1 single reference check constraint if present
DO $$ BEGIN
  ALTER TABLE public.route_stops DROP CONSTRAINT IF EXISTS route_stops_single_ref;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.route_stops DROP CONSTRAINT IF EXISTS chk_stop_reference;
EXCEPTION WHEN others THEN NULL; END $$;

-- Ensure a stop cannot be simultaneously null for all actions
ALTER TABLE public.route_stops
  ADD CONSTRAINT chk_stop_reference CHECK (
    (stop_type::text = 'warehouse') OR
    (stop_type::text = 'delivery' AND order_id IS NOT NULL) OR
    (stop_type::text = 'recovery' AND recovery_request_id IS NOT NULL) OR
    (stop_type::text = 'pudo_dropoff' AND pudo_location_id IS NOT NULL) OR
    (stop_type::text = 'maintenance_hub')
  );
