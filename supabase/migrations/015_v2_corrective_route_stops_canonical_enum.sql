-- GreenBridge v2 - Migration 015: Corrective Schema Migration for Canonical route_stop_type
-- Resolves route_stops.stop_type legacy enum dependency and upgrades to public.route_stop_type

-- 1. Safely drop any check constraints on route_stops referencing stop_type
ALTER TABLE public.route_stops DROP CONSTRAINT IF EXISTS chk_stop_reference;
ALTER TABLE public.route_stops DROP CONSTRAINT IF EXISTS route_stops_single_ref;

-- 2. Alter column type using explicit semantic mapping for legacy values:
--    'warehouse'       -> 'warehouse'
--    'delivery'        -> 'delivery'
--    'pickup'          -> 'recovery' (Legacy bag return pickups map to v2 recovery)
--    'recovery'        -> 'recovery'
--    'pudo_dropoff'    -> 'pudo_dropoff'
--    'maintenance_hub' -> 'maintenance_hub'
ALTER TABLE public.route_stops
  ALTER COLUMN stop_type TYPE public.route_stop_type
  USING (
    CASE stop_type::text
      WHEN 'warehouse' THEN 'warehouse'::public.route_stop_type
      WHEN 'delivery' THEN 'delivery'::public.route_stop_type
      WHEN 'pickup' THEN 'recovery'::public.route_stop_type
      WHEN 'recovery' THEN 'recovery'::public.route_stop_type
      WHEN 'pudo_dropoff' THEN 'pudo_dropoff'::public.route_stop_type
      WHEN 'maintenance_hub' THEN 'maintenance_hub'::public.route_stop_type
      ELSE 'delivery'::public.route_stop_type
    END
  );

-- 3. Recreate canonical v2 CHECK constraint using public.route_stop_type
ALTER TABLE public.route_stops
  ADD CONSTRAINT chk_stop_reference CHECK (
    (stop_type = 'warehouse') OR
    (stop_type = 'delivery' AND order_id IS NOT NULL) OR
    (stop_type = 'recovery' AND recovery_request_id IS NOT NULL) OR
    (stop_type = 'pudo_dropoff' AND pudo_location_id IS NOT NULL) OR
    (stop_type = 'maintenance_hub')
  );
