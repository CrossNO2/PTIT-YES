-- GreenBridge v2 - Migration 006: Routes & AI Logistics Context Signals
-- Rebuilt from zero for Packaging-as-a-Service (PaaS) architecture

-- 1. Dispatched Routes (Multi-stop delivery and/or recovery runs)
CREATE TABLE IF NOT EXISTS public.routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  route_date date NOT NULL,
  shipper_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  naive_distance_km numeric(8,2) NOT NULL DEFAULT 0 CHECK (naive_distance_km >= 0),
  optimized_distance_km numeric(8,2) NOT NULL DEFAULT 0 CHECK (optimized_distance_km >= 0),
  total_duration_mins integer NOT NULL DEFAULT 0 CHECK (total_duration_mins >= 0),
  estimated_cost_vnd numeric(12,2) NOT NULL DEFAULT 0 CHECK (estimated_cost_vnd >= 0),
  status public.route_status NOT NULL DEFAULT 'draft',
  route_type text NOT NULL DEFAULT 'delivery_with_recovery' CHECK (route_type IN ('delivery_only', 'delivery_with_recovery', 'dedicated_recovery')),
  optimization_version integer NOT NULL DEFAULT 1,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add foreign key from orders to routes now that routes exists
DO $$ BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT fk_orders_route
    FOREIGN KEY (assigned_route_id) REFERENCES public.routes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Road Distance & Duration Matrix Cache (Optimizes OSRM / Mapping overhead)
CREATE TABLE IF NOT EXISTS public.route_matrix_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_key text NOT NULL,
  destination_key text NOT NULL,
  travel_mode text NOT NULL DEFAULT 'DRIVE',
  routing_preference text NOT NULL DEFAULT 'OSRM_FASTEST',
  departure_bucket text NOT NULL DEFAULT 'DEFAULT',
  distance_meters integer NOT NULL,
  duration_seconds integer NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_route_matrix UNIQUE (origin_key, destination_key, travel_mode, routing_preference, departure_bucket)
);

-- 3. AI Logistics Context Signals (GALM environmental intelligence: traffic, rain, flooding risk, ETA)
CREATE TABLE IF NOT EXISTS public.context_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type public.signal_type NOT NULL,
  source public.signal_source NOT NULL DEFAULT 'SIMULATED',
  area_name text NOT NULL,
  lat double precision,
  lng double precision,
  severity_level text NOT NULL DEFAULT 'low' CHECK (severity_level IN ('low', 'medium', 'high', 'critical')),
  signal_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
