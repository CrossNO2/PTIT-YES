-- Complete Production Seed Data for Empty Supabase Instance

-- 1. Create Demo Users in auth.users (Password for all: password123)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES 
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@greenbridge.vn', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"account_type":"platform_admin","name":"Quản Trị Viên GreenBridge"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shipper1@greenbridge.vn', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"account_type":"shop_user","name":"Nguyễn Văn Giao (Shipper)"}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'customer1@gmail.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"account_type":"customer","name":"Trần Thị Xanh (Khách Hàng)"}', now(), now())
ON CONFLICT (id) DO NOTHING;

-- 2. Populate Profiles
INSERT INTO public.profiles (id, email, name, phone, account_type, is_active) VALUES 
  ('11111111-1111-1111-1111-111111111111', 'admin@greenbridge.vn', 'Quản Trị Viên GreenBridge', '0901234567', 'platform_admin', true),
  ('22222222-2222-2222-2222-222222222222', 'shipper1@greenbridge.vn', 'Nguyễn Văn Giao (Shipper)', '0912345678', 'shop_user', true),
  ('33333333-3333-3333-3333-333333333333', 'customer1@gmail.com', 'Trần Thị Xanh (Khách Hàng)', '0987654321', 'customer', true)
ON CONFLICT (id) DO UPDATE SET 
  account_type = EXCLUDED.account_type,
  name = EXCLUDED.name,
  phone = EXCLUDED.phone;

-- 3. Demo Shop: GreenBridge Logistics Express
INSERT INTO public.shops (id, name, slug, address, lat, lng, is_active)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'GreenBridge Logistics Express - Chi nhánh Hà Nội',
  'greenbridge-hn',
  '268 Đường Láng, Ngã Tư Sở, Đống Đa, Hà Nội',
  21.003118,
  105.814234,
  true
) ON CONFLICT (id) DO NOTHING;

-- 4. Shop Membership Assignments
INSERT INTO public.shop_members (shop_id, user_id, member_role, status)
VALUES 
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner', 'active'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'shipper', 'active')
ON CONFLICT (shop_id, user_id) DO NOTHING;

-- 5. Demo Warehouse
INSERT INTO public.warehouses (id, shop_id, name, address, lat, lng, is_default, status)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Kho Trung Tâm Đống Đa',
  '268 Đường Láng, Ngã Tư Sở, Đống Đa, Hà Nội',
  21.003118,
  105.814234,
  true,
  'active'
) ON CONFLICT (id) DO NOTHING;

-- 6. Demo Vehicles
INSERT INTO public.vehicles (id, shop_id, name, vehicle_type, license_plate, capacity_kg, co2_kg_per_km, fuel_cost_vnd_per_km, status)
VALUES
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Xe Điện EcoBike 01', 'electric_motorbike', '29-AA 123.45', 60.00, 0.0200, 500.00, 'active'),
  ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'Xe Máy Honda Wave 02', 'motorbike', '29-B1 678.90', 80.00, 0.0850, 1200.00, 'active'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Xe Van Dongben 03', 'small_van', '29-D 999.88', 350.00, 0.1800, 3500.00, 'active')
ON CONFLICT (id) DO NOTHING;

-- 7. Shipper Shifts
INSERT INTO public.shipper_shifts (id, shop_id, shipper_id, shift_date, start_time, end_time, start_warehouse_id, max_work_minutes, status)
VALUES 
  ('44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', CURRENT_DATE, '08:00:00', '17:00:00', '22222222-2222-2222-2222-222222222222', 480, 'active'),
  ('44444444-4444-4444-4444-444444444442', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', CURRENT_DATE + INTERVAL '1 day', '08:00:00', '17:00:00', '22222222-2222-2222-2222-222222222222', 480, 'scheduled')
ON CONFLICT (id) DO NOTHING;

-- 8. Orders for Routing
INSERT INTO public.orders (id, shop_id, customer_id, order_code, customer_name, customer_phone, address, lat, lng, delivery_date, time_slot_start, time_slot_end, weight_kg, priority, notes, status)
VALUES 
  ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'ORD-001', 'Trần Thị Xanh', '0987654321', '12 Chùa Bộc, Quang Trung, Đống Đa, Hà Nội', 21.007621, 105.828451, CURRENT_DATE, '08:30:00', '11:30:00', 12.50, 1, 'Giao giờ hành chính', 'ready'),
  ('55555555-5555-5555-5555-555555555552', '11111111-1111-1111-1111-111111111111', NULL, 'ORD-002', 'Lê Văn Hoàng', '0911223344', '54 Nguyễn Chí Thanh, Láng Hạ, Đống Đa, Hà Nội', 21.020584, 105.808945, CURRENT_DATE, '09:00:00', '12:00:00', 8.00, 2, 'Gọi trước khi giao', 'ready'),
  ('55555555-5555-5555-5555-555555555553', '11111111-1111-1111-1111-111111111111', NULL, 'ORD-003', 'Phạm Minh Tuấn', '0933445566', '102 Trường Chinh, Phương Mai, Đống Đa, Hà Nội', 21.000452, 105.836125, CURRENT_DATE, '13:00:00', '16:00:00', 15.00, 1, 'Hàng dễ vỡ', 'ready')
ON CONFLICT (id) DO NOTHING;

-- 9. Packaging Pickups for Reverse Logistics
INSERT INTO public.packaging_pickups (id, shop_id, customer_id, address, lat, lng, packaging_type, estimated_quantity_kg, pickup_date, available_from, available_until, status)
VALUES 
  ('66666666-6666-6666-6666-666666666661', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '12 Chùa Bộc, Quang Trung, Đống Đa, Hà Nội', 21.007621, 105.828451, 'Bao bì Carton & Túi Biodegradable', 3.50, CURRENT_DATE, '09:00:00', '12:00:00', 'pending')
ON CONFLICT (id) DO NOTHING;

-- 10. Vouchers
INSERT INTO public.vouchers (id, shop_id, name, description, points_required, discount_type, discount_value, quantity, expiry_date, is_active)
VALUES 
  ('77777777-7777-7777-7777-777777777771', '11111111-1111-1111-1111-111111111111', 'Voucher Giảm 20K Phí Vận Chuyển', 'Áp dụng cho mọi đơn hàng thu gom bao bì tái chế', 50, 'fixed_amount', 20000.00, 100, CURRENT_DATE + INTERVAL '30 days', true),
  ('77777777-7777-7777-7777-777777777772', '11111111-1111-1111-1111-111111111111', 'Voucher Eco-Partner Giảm 10%', 'Ưu đãi dành cho đối tác bảo vệ môi trường', 100, 'percentage', 10.00, 50, CURRENT_DATE + INTERVAL '60 days', true)
ON CONFLICT (id) DO NOTHING;

-- 11. Initial Green Points for Demo Customer
INSERT INTO public.green_point_transactions (customer_id, points_delta, transaction_type, description, idempotency_key)
VALUES 
  ('33333333-3333-3333-3333-333333333333', 150, 'pickup_reward', 'Điểm thưởng khởi tạo tài khoản xanh', 'init_reward_33333333')
ON CONFLICT (idempotency_key) DO NOTHING;
