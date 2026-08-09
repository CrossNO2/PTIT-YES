-- Migration 15: Secured Route Matrix Cache Schema & Parameters

ALTER TABLE public.route_matrix_cache
  ADD COLUMN IF NOT EXISTS matrix_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS avoid_tolls boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avoid_highways boolean NOT NULL DEFAULT false;

-- Drop permissive client policies
DROP POLICY IF EXISTS "Authenticated users can insert route matrix cache" ON public.route_matrix_cache;

-- Restrict Insert/Update to Service Role / Server only
CREATE POLICY "Only server service role can insert route matrix cache"
  ON public.route_matrix_cache FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Only server service role can update route matrix cache"
  ON public.route_matrix_cache FOR UPDATE
  TO service_role
  USING (true);
