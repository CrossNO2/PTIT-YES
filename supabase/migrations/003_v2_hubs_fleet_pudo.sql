-- GreenBridge v2 - Migration 003: Hubs, Fleet, Shifts & PUDO Network
-- Rebuilt from zero for Packaging-as-a-Service (PaaS) architecture

-- 1. Warehouses & Depots (Fulfillment, inspection, washing & maintenance)
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  has_cleaning_facility boolean NOT NULL DEFAULT true,
  has_inspection_depot boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Vehicles / Fleet
CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name text NOT NULL,
  vehicle_type public.vehicle_type NOT NULL DEFAULT 'motorbike',
  license_plate text NOT NULL,
  capacity_kg numeric(8,2) NOT NULL DEFAULT 50.0 CHECK (capacity_kg > 0),
  bag_capacity_units integer NOT NULL DEFAULT 15 CHECK (bag_capacity_units > 0),
  co2_kg_per_km numeric(6,4) NOT NULL DEFAULT 0.0850 CHECK (co2_kg_per_km >= 0),
  fuel_cost_vnd_per_km numeric(10,2) NOT NULL DEFAULT 1200.00 CHECK (fuel_cost_vnd_per_km >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Shipper Shifts
CREATE TABLE IF NOT EXISTS public.shipper_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  shipper_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  start_time time NOT NULL DEFAULT '08:00',
  end_time time NOT NULL DEFAULT '17:00',
  start_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  max_work_minutes integer NOT NULL DEFAULT 480 CHECK (max_work_minutes > 0),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. PUDO Locations & Smart Lockers (Strategy B Architecture Foundation)
CREATE TABLE IF NOT EXISTS public.pudo_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pudo_type text NOT NULL DEFAULT 'smart_locker' CHECK (pudo_type IN ('smart_locker', 'convenience_store', 'partner_hub')),
  address text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  total_slots integer NOT NULL DEFAULT 20 CHECK (total_slots > 0),
  available_slots integer NOT NULL DEFAULT 20 CHECK (available_slots >= 0),
  operating_hours text NOT NULL DEFAULT '24/7',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
