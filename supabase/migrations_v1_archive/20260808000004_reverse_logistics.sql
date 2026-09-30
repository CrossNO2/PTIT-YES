-- Migration 04: Reverse Logistics Schema

CREATE TABLE public.packaging_pickups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  address text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  packaging_type text NOT NULL,
  estimated_quantity_kg numeric(10,2) NOT NULL CHECK (estimated_quantity_kg > 0),
  verified_quantity_kg numeric(10,2) CHECK (verified_quantity_kg >= 0),
  pickup_date date NOT NULL,
  available_from time NOT NULL,
  available_until time NOT NULL,
  status public.pickup_status NOT NULL DEFAULT 'pending',
  assigned_route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  qr_token_hash text,
  qr_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add Foreign Key Constraint from route_stops to packaging_pickups
ALTER TABLE public.route_stops
  ADD CONSTRAINT route_stops_pickup_id_fkey
  FOREIGN KEY (pickup_id) REFERENCES public.packaging_pickups(id) ON DELETE CASCADE;
