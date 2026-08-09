-- Migration 05: Loyalty & Voucher System Schema

-- Vouchers
CREATE TABLE public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  points_required integer NOT NULL CHECK (points_required > 0),
  discount_type public.discount_type NOT NULL DEFAULT 'fixed_amount',
  discount_value numeric(10,2) NOT NULL CHECK (discount_value > 0),
  quantity integer NOT NULL CHECK (quantity >= 0),
  expiry_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Voucher Redemptions
CREATE TABLE public.voucher_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points_spent integer NOT NULL CHECK (points_spent > 0),
  redemption_code text NOT NULL UNIQUE,
  qr_token_hash text,
  qr_expires_at timestamptz,
  status public.redemption_status NOT NULL DEFAULT 'active',
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Green Point Transactions Ledger
CREATE TABLE public.green_point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points_delta integer NOT NULL,
  transaction_type public.point_transaction_type NOT NULL,
  packaging_pickup_id uuid REFERENCES public.packaging_pickups(id) ON DELETE SET NULL,
  voucher_redemption_id uuid REFERENCES public.voucher_redemptions(id) ON DELETE SET NULL,
  description text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
