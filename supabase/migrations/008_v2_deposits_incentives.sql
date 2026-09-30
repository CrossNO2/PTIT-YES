-- GreenBridge v2 - Migration 008: Deposits, Refunds & Green Points Incentives
-- Rebuilt from zero for Packaging-as-a-Service (PaaS) architecture

-- 1. PaaS Bag Customer Deposits & Refunds (Internal financial ledger)
CREATE TABLE IF NOT EXISTS public.customer_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  bag_id uuid NOT NULL REFERENCES public.paas_bags(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  deposit_amount_vnd numeric(10,2) NOT NULL DEFAULT 50000.00 CHECK (deposit_amount_vnd > 0),
  status public.deposit_status NOT NULL DEFAULT 'held',
  refund_amount_vnd numeric(10,2) CHECK (refund_amount_vnd >= 0),
  deduction_reason text,
  held_at timestamptz NOT NULL DEFAULT now(),
  refunded_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Green Points Ledger (Event/Action driven rewards, not raw scrap kg)
CREATE TABLE IF NOT EXISTS public.green_point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points_delta integer NOT NULL,
  transaction_type public.point_transaction_type NOT NULL,
  reference_type text NOT NULL CHECK (reference_type IN ('recovery_request', 'bag_return', 'voucher_redemption', 'deposit', 'admin_adjustment')),
  reference_id text NOT NULL,
  description text NOT NULL,
  idempotency_key text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Loyalty Vouchers Catalog
CREATE TABLE IF NOT EXISTS public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid REFERENCES public.shops(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  points_required integer NOT NULL CHECK (points_required > 0),
  discount_type public.discount_type NOT NULL DEFAULT 'fixed_amount',
  discount_value numeric(10,2) NOT NULL CHECK (discount_value > 0),
  quantity integer NOT NULL DEFAULT 100 CHECK (quantity >= 0),
  expiry_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Voucher Redemptions
CREATE TABLE IF NOT EXISTS public.voucher_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points_spent integer NOT NULL CHECK (points_spent >= 0),
  redemption_code text UNIQUE NOT NULL,
  qr_token_hash text NOT NULL,
  qr_expires_at timestamptz NOT NULL,
  status public.voucher_redemption_status NOT NULL DEFAULT 'active',
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
