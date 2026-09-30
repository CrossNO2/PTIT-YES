-- GreenBridge v2 - Migration 001: Extensions & Domain Enums
-- Rebuilt from zero for Packaging-as-a-Service (PaaS) architecture

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Identity & Roles
DO $$ BEGIN
  CREATE TYPE public.user_account_type AS ENUM ('customer', 'platform_admin', 'shop_user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.shop_member_role AS ENUM ('owner', 'admin', 'dispatcher', 'shipper');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Fleet
DO $$ BEGIN
  CREATE TYPE public.vehicle_type AS ENUM ('electric_motorbike', 'motorbike', 'small_van', 'light_truck');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Order Lifecycle
DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('pending', 'ready', 'assigned', 'delivering', 'delivered', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PaaS Bag Asset Lifecycle
DO $$ BEGIN
  CREATE TYPE public.paas_bag_status AS ENUM (
    'available',
    'assigned',
    'in_delivery',
    'with_customer',
    'return_requested',
    'recovering',
    'at_hub',
    'inspection',
    'maintenance',
    'ready_for_reuse',
    'damaged',
    'retired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bag_condition AS ENUM (
    'new',
    'excellent',
    'good',
    'fair',
    'needs_cleaning',
    'needs_repair',
    'damaged',
    'scrapped'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bag_event_type AS ENUM (
    'REGISTERED',
    'ASSIGNED_TO_ORDER',
    'DISPATCHED_TO_SHIPPER',
    'DELIVERED_TO_CUSTOMER',
    'RECOVERY_REQUESTED',
    'PICKED_UP_BY_SHIPPER',
    'DEPOSITED_AT_PUDO',
    'RECEIVED_AT_HUB',
    'INSPECTED',
    'CLEANED_SANITIZED',
    'REPAIRED',
    'RETURNED_TO_STOCK',
    'FLAGGED_DAMAGED',
    'RETIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reverse Logistics & Recovery Domain
DO $$ BEGIN
  CREATE TYPE public.recovery_request_status AS ENUM (
    'requested',
    'planned',
    'assigned',
    'in_transit',
    'picked_up',
    'completed',
    'failed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.recovery_strategy_type AS ENUM (
    'strategy_a_merged',
    'strategy_b_pudo',
    'strategy_c_dedicated'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Routing & Dispatched Trips
DO $$ BEGIN
  CREATE TYPE public.route_status AS ENUM (
    'draft',
    'optimizing',
    'optimized',
    'approved',
    'assigned',
    'in_progress',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.route_stop_type AS ENUM (
    'warehouse',
    'delivery',
    'recovery',
    'pudo_dropoff',
    'maintenance_hub'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Domain enum: stop_type (Ensures compatibility for environments/tools referencing stop_type)
DO $$ BEGIN
  CREATE TYPE public.stop_type AS ENUM (
    'warehouse',
    'delivery',
    'recovery',
    'pudo_dropoff',
    'maintenance_hub'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.stop_type ADD VALUE IF NOT EXISTS 'recovery';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.stop_type ADD VALUE IF NOT EXISTS 'pudo_dropoff';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.stop_type ADD VALUE IF NOT EXISTS 'maintenance_hub';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.route_stop_status AS ENUM (
    'pending',
    'arrived',
    'completed',
    'failed',
    'skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Financials, Deposits & Incentives
DO $$ BEGIN
  CREATE TYPE public.deposit_status AS ENUM (
    'held',
    'refunded',
    'forfeited',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.point_transaction_type AS ENUM (
    'bag_return_reward',
    'prompt_return_bonus',
    'voucher_redemption',
    'admin_adjustment',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.discount_type AS ENUM ('fixed_amount', 'percentage');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.voucher_redemption_status AS ENUM ('active', 'used', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AI Context Signals
DO $$ BEGIN
  CREATE TYPE public.signal_type AS ENUM (
    'TRAFFIC_CONGESTION',
    'WEATHER_RAIN',
    'FLOODING_RISK',
    'ETA_SURGE',
    'ROAD_RESTRICTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.signal_source AS ENUM (
    'SIMULATED',
    'API',
    'SYSTEM',
    'OPERATOR'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
