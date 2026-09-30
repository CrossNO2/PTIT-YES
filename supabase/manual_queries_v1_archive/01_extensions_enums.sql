-- Migration 01: Extensions & Enum Types
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Account Type (Global Identity)
CREATE TYPE public.user_account_type AS ENUM (
  'customer',
  'platform_admin',
  'shop_user'
);

-- Shop Member Role (Shop Tenant Identity)
CREATE TYPE public.shop_member_role AS ENUM (
  'owner',
  'admin',
  'dispatcher',
  'shipper'
);

-- Vehicle Type
CREATE TYPE public.vehicle_type AS ENUM (
  'electric_motorbike',
  'motorbike',
  'small_van',
  'light_truck'
);

-- Order Status
CREATE TYPE public.order_status AS ENUM (
  'pending',
  'ready',
  'assigned',
  'delivering',
  'delivered',
  'failed',
  'cancelled'
);

-- Route Status
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

-- Stop Type & Status
CREATE TYPE public.stop_type AS ENUM (
  'warehouse',
  'delivery',
  'pickup'
);

CREATE TYPE public.stop_status AS ENUM (
  'pending',
  'arrived',
  'completed',
  'failed',
  'skipped'
);

-- Packaging Pickup Status
CREATE TYPE public.pickup_status AS ENUM (
  'pending',
  'scheduled',
  'assigned',
  'collecting',
  'completed',
  'cancelled'
);

-- Point Transaction Type
CREATE TYPE public.point_transaction_type AS ENUM (
  'pickup_reward',
  'voucher_redemption',
  'admin_adjustment',
  'expired'
);

-- Voucher Discount Type & Redemption Status
CREATE TYPE public.discount_type AS ENUM (
  'fixed_amount',
  'percentage'
);

CREATE TYPE public.redemption_status AS ENUM (
  'active',
  'used',
  'expired',
  'cancelled'
);
