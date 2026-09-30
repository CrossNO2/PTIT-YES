-- Migration 11: System Defaults & Operational Bootstrap
-- Safe/idempotent defaults required for a fresh GreenBridge deployment.

CREATE TABLE IF NOT EXISTS public.platform_vehicle_defaults (
  vehicle_type public.vehicle_type PRIMARY KEY,
  default_capacity_kg numeric(10,2) NOT NULL,
  default_co2_kg_per_km numeric(10,4) NOT NULL,
  default_fuel_cost_vnd_per_km numeric(12,2) NOT NULL,
  description text NOT NULL
);

INSERT INTO public.platform_vehicle_defaults
  (vehicle_type, default_capacity_kg, default_co2_kg_per_km, default_fuel_cost_vnd_per_km, description)
VALUES
  ('electric_motorbike', 50.00, 0.0200, 500.00, 'Xe máy điện giao hàng nhẹ đô thị'),
  ('motorbike', 80.00, 0.0850, 1200.00, 'Xe máy xăng truyền thống'),
  ('small_van', 350.00, 0.1800, 3500.00, 'Xe Van nhỏ giao nhận nhiều điểm'),
  ('light_truck', 1000.00, 0.2800, 6000.00, 'Xe tải nhẹ ngoại thành')
ON CONFLICT (vehicle_type) DO UPDATE SET
  default_capacity_kg = EXCLUDED.default_capacity_kg,
  default_co2_kg_per_km = EXCLUDED.default_co2_kg_per_km,
  default_fuel_cost_vnd_per_km = EXCLUDED.default_fuel_cost_vnd_per_km,
  description = EXCLUDED.description;

-- The public customer flow needs exactly one operational shop. This is configuration,
-- not demo order/history data, and can be edited later from the admin workspace.
INSERT INTO public.shops (id, name, slug, address, lat, lng, is_active)
VALUES (
  '11111111-1111-1111-1111-111111111111'::uuid,
  'GreenBridge Main',
  'greenbridge-main',
  'Hà Nội, Việt Nam',
  21.027800,
  105.834200,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  updated_at = now();

-- Default hub so route optimization can be configured immediately. Admin may edit it later.
INSERT INTO public.warehouses (id, shop_id, name, address, lat, lng, is_default, status)
VALUES (
  '22222222-2222-2222-2222-222222222222'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'GreenBridge Main Hub',
  'Hà Nội, Việt Nam',
  21.027800,
  105.834200,
  true,
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  shop_id = EXCLUDED.shop_id,
  name = EXCLUDED.name,
  is_default = true,
  status = 'active',
  updated_at = now();

-- Starter voucher catalogue used by the real redemption flow. No fake redemptions are inserted.
INSERT INTO public.vouchers (
  id, shop_id, name, description, points_required,
  discount_type, discount_value, quantity, expiry_date, is_active
)
VALUES
  (
    '33333333-3333-3333-3333-333333333331'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'Voucher Giảm 50.000đ Đơn Hàng Eco',
    'Giảm trực tiếp 50.000đ cho đơn hàng đủ điều kiện trên GreenBridge.',
    100, 'fixed_amount', 50000, 500, current_date + 3650, true
  ),
  (
    '33333333-3333-3333-3333-333333333332'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'Voucher Miễn Phí Vận Chuyển 30k',
    'Giảm tối đa 30.000đ chi phí vận chuyển cho đơn đủ điều kiện.',
    60, 'fixed_amount', 30000, 500, current_date + 3650, true
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  points_required = EXCLUDED.points_required,
  discount_type = EXCLUDED.discount_type,
  discount_value = EXCLUDED.discount_value,
  is_active = true,
  updated_at = now();
