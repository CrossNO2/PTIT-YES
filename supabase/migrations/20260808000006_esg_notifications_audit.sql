-- Migration 06: ESG Reports, Notifications & Audit Schema

-- ESG Reports (1 official report per route)
CREATE TABLE public.esg_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  route_id uuid NOT NULL UNIQUE REFERENCES public.routes(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  naive_distance_km numeric(10,2) NOT NULL DEFAULT 0,
  optimized_distance_km numeric(10,2) NOT NULL DEFAULT 0,
  km_saved numeric(10,2) NOT NULL DEFAULT 0,
  co2_saved_kg numeric(10,4) NOT NULL DEFAULT 0,
  packaging_collected_kg numeric(10,2) NOT NULL DEFAULT 0,
  cost_saved_vnd numeric(12,2) NOT NULL DEFAULT 0,
  emission_factor_snapshot numeric(10,4) NOT NULL DEFAULT 0,
  fuel_cost_factor_snapshot numeric(12,2) NOT NULL DEFAULT 0,
  baseline_method text NOT NULL DEFAULT 'CREATION_ORDER_V1',
  calculation_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Order Status History
CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  previous_status public.order_status,
  new_status public.order_status NOT NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Order Access Logs (Shipper Customer Phone Unmask Audit)
CREATE TABLE public.order_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  accessed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'UNMASK_CUSTOMER_INFO',
  reason text NOT NULL,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit Logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- Durable rate limit counters for serverless deployments.
CREATE TABLE public.api_rate_limits (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_key, window_start)
);


-- Cached geocoding results to minimize calls to the public Nominatim service.
CREATE TABLE public.geocoding_cache (
  address_key text PRIMARY KEY,
  query_address text NOT NULL,
  formatted_address text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  provider text NOT NULL DEFAULT 'nominatim',
  place_id text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
