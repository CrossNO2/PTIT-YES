-- GreenBridge v2 - Migration 009: ESG Circularity Metrics, Notifications & System Audit
-- Rebuilt from zero for Packaging-as-a-Service (PaaS) architecture

-- 1. Route-Level ESG Reports
CREATE TABLE IF NOT EXISTS public.esg_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  naive_distance_km numeric(8,2) NOT NULL DEFAULT 0,
  optimized_distance_km numeric(8,2) NOT NULL DEFAULT 0,
  km_saved numeric(8,2) NOT NULL DEFAULT 0,
  co2_saved_kg numeric(8,4) NOT NULL DEFAULT 0,
  fuel_cost_saved_vnd numeric(12,2) NOT NULL DEFAULT 0,
  bags_recovered_count integer NOT NULL DEFAULT 0,
  single_use_packaging_avoided_count integer NOT NULL DEFAULT 0,
  plastic_waste_prevented_kg numeric(8,2) NOT NULL DEFAULT 0,
  cost_per_order_vnd numeric(10,2) NOT NULL DEFAULT 0,
  cost_per_recovery_vnd numeric(10,2) NOT NULL DEFAULT 0,
  baseline_method text NOT NULL DEFAULT 'CREATION_ORDER_V1',
  calculation_version integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Shop-Level Daily Circularity KPIs
CREATE TABLE IF NOT EXISTS public.esg_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  active_bags_count integer NOT NULL DEFAULT 0,
  bags_in_circulation integer NOT NULL DEFAULT 0,
  bags_recovered_today integer NOT NULL DEFAULT 0,
  recovery_rate_percent numeric(5,2) NOT NULL DEFAULT 0.0 CHECK (recovery_rate_percent >= 0 AND recovery_rate_percent <= 100),
  avg_reuse_cycles numeric(5,2) NOT NULL DEFAULT 0.0,
  single_use_packages_avoided integer NOT NULL DEFAULT 0,
  co2_saved_kg numeric(10,4) NOT NULL DEFAULT 0,
  fuel_saved_vnd numeric(12,2) NOT NULL DEFAULT 0,
  avg_cost_per_order_vnd numeric(10,2) NOT NULL DEFAULT 0,
  avg_cost_per_recovery_vnd numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_shop_esg_date UNIQUE (shop_id, metric_date)
);

-- 3. In-App Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Global System Audit Trail (Immutable append-only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid REFERENCES public.shops(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
