-- Migration 03: Logistics Core Schema

-- Warehouses
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Vehicles
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name text NOT NULL,
  vehicle_type public.vehicle_type NOT NULL DEFAULT 'motorbike',
  license_plate text NOT NULL,
  capacity_kg numeric(10,2) NOT NULL CHECK (capacity_kg > 0),
  co2_kg_per_km numeric(10,4) NOT NULL CHECK (co2_kg_per_km >= 0),
  fuel_cost_vnd_per_km numeric(12,2) NOT NULL CHECK (fuel_cost_vnd_per_km >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Shipper Shifts
CREATE TABLE public.shipper_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  shipper_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  start_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  max_work_minutes integer NOT NULL DEFAULT 480 CHECK (max_work_minutes > 0),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Routes (Pre-declarative for orders foreign key)
CREATE TABLE public.routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  route_date date NOT NULL,
  shipper_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  naive_distance_km numeric(10,2) NOT NULL DEFAULT 0,
  optimized_distance_km numeric(10,2) NOT NULL DEFAULT 0,
  total_duration_mins integer NOT NULL DEFAULT 0,
  estimated_cost_vnd numeric(12,2) NOT NULL DEFAULT 0,
  status public.route_status NOT NULL DEFAULT 'draft',
  optimization_version integer NOT NULL DEFAULT 1,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_code text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  address text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  delivery_date date NOT NULL,
  time_slot_start time NOT NULL,
  time_slot_end time NOT NULL,
  weight_kg numeric(10,2) NOT NULL CHECK (weight_kg > 0),
  priority integer NOT NULL DEFAULT 1 CHECK (priority >= 1 AND priority <= 5),
  notes text,
  status public.order_status NOT NULL DEFAULT 'pending',
  assigned_shipper_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  started_delivery_at timestamptz,
  delivered_at timestamptz,
  failure_reason text,
  proof_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_shop_code_unique UNIQUE (shop_id, order_code)
);

-- Route Stops
CREATE TABLE public.route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  stop_type public.stop_type NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  pickup_id uuid, -- Reference added in migration 04
  sequence_index integer NOT NULL CHECK (sequence_index >= 0),
  estimated_arrival timestamptz,
  distance_from_previous_km numeric(10,2) NOT NULL DEFAULT 0,
  duration_from_previous_mins integer NOT NULL DEFAULT 0,
  status public.stop_status NOT NULL DEFAULT 'pending',
  arrived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT route_stops_route_seq_unique UNIQUE (route_id, sequence_index),
  CONSTRAINT route_stops_single_ref CHECK (
    (stop_type = 'warehouse' AND order_id IS NULL AND pickup_id IS NULL) OR
    (stop_type = 'delivery' AND order_id IS NOT NULL AND pickup_id IS NULL) OR
    (stop_type = 'pickup' AND order_id IS NULL AND pickup_id IS NOT NULL)
  )
);

-- Route Matrix Cache
CREATE TABLE public.route_matrix_cache (
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
  CONSTRAINT route_matrix_cache_unique_key UNIQUE (origin_key, destination_key, travel_mode, routing_preference, departure_bucket)
);

CREATE INDEX route_matrix_cache_expires_at_idx ON public.route_matrix_cache(expires_at);
CREATE INDEX route_matrix_cache_lookup_idx ON public.route_matrix_cache (
  origin_key,
  destination_key,
  travel_mode,
  routing_preference,
  departure_bucket,
  expires_at
);
