-- GreenBridge v2 - Migration 017: Corrective Alignment for Retained v1 Tables
-- Adds missing canonical v2 columns to green_point_transactions, warehouses, and routes.
-- Idempotent and safe for live staging/production database.

-- 1. Align green_point_transactions with v2 PaaS reward ledger model
ALTER TABLE public.green_point_transactions
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS reference_id text;

UPDATE public.green_point_transactions
SET reference_type = 'admin_adjustment',
    reference_id = COALESCE(packaging_pickup_id::text, voucher_redemption_id::text, id::text)
WHERE reference_type IS NULL;

ALTER TABLE public.green_point_transactions
  ALTER COLUMN reference_type SET NOT NULL,
  ALTER COLUMN reference_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.green_point_transactions
    ADD CONSTRAINT chk_gpt_reference_type
    CHECK (reference_type IN ('recovery_request', 'bag_return', 'voucher_redemption', 'deposit', 'admin_adjustment'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Align warehouses with v2 inspection & cleaning depot flags
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS has_cleaning_facility boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS has_inspection_depot boolean NOT NULL DEFAULT true;

-- 3. Align routes with v2 route_type domain
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS route_type text NOT NULL DEFAULT 'delivery_with_recovery';

DO $$ BEGIN
  ALTER TABLE public.routes
    ADD CONSTRAINT chk_routes_route_type
    CHECK (route_type IN ('delivery_only', 'delivery_with_recovery', 'dedicated_recovery'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
