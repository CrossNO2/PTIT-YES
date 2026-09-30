-- GreenBridge v2 - Complete Demonstrative Seed Data
-- Rebuilt from zero for Packaging-as-a-Service (PaaS) architecture
-- Fully idempotent and safely re-executable against staging & local environments

-- 1. Test Profiles (Sync role metadata for auth users and upsert available identities)
UPDATE public.profiles SET account_type = 'platform_admin', is_active = true WHERE email = 'admin@test.com';
UPDATE public.profiles SET account_type = 'shop_user', is_active = true WHERE email = 'shipper@test.com';
UPDATE public.profiles SET account_type = 'customer', is_active = true WHERE email IN ('customer@test.com', 'im3tuoi@gmail.com');

-- For local development where auth.users contains mock users, populate missing profiles
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO public.profiles (id, email, account_type, name, phone, is_active)
    SELECT u.id, u.email,
      CASE
        WHEN u.email LIKE 'admin%' THEN 'platform_admin'::public.user_account_type
        WHEN u.email LIKE 'shipper%' THEN 'shop_user'::public.user_account_type
        ELSE 'customer'::public.user_account_type
      END,
      COALESCE(u.raw_user_meta_data->>'full_name', u.email),
      '0901000000',
      true
    FROM auth.users u
    ON CONFLICT (id) DO UPDATE SET
      account_type = EXCLUDED.account_type,
      is_active = EXCLUDED.is_active;
  END IF;
END $$;

-- 2. Domain Seed Fixtures via Dynamic Identity Resolution
DO $$
DECLARE
  v_admin_id uuid;
  v_shipper_id uuid;
  v_shipper2_id uuid;
  v_customer_id uuid;
  v_customer2_id uuid;
  v_shop_id uuid;
  v_warehouse_id uuid;
  v_vehicle1_id uuid;
BEGIN
  -- Resolve Profiles
  SELECT id INTO v_admin_id FROM public.profiles WHERE email = 'admin@test.com' LIMIT 1;
  SELECT id INTO v_shipper_id FROM public.profiles WHERE email = 'shipper@test.com' LIMIT 1;
  SELECT id INTO v_shipper2_id FROM public.profiles WHERE email = 'shipper2@test.com' LIMIT 1;
  IF v_shipper2_id IS NULL THEN v_shipper2_id := v_shipper_id; END IF;
  SELECT id INTO v_customer_id FROM public.profiles WHERE email = 'customer@test.com' LIMIT 1;
  SELECT id INTO v_customer2_id FROM public.profiles WHERE email IN ('customer2@test.com', 'im3tuoi@gmail.com') LIMIT 1;
  IF v_customer2_id IS NULL THEN v_customer2_id := v_customer_id; END IF;

  -- Upsert Shop
  INSERT INTO public.shops (id, name, slug, address, lat, lng, is_active)
  VALUES ('11111111-1111-1111-1111-111111111111', 'GreenBridge E-Commerce Flagship', 'greenbridge-main', '54 Liễu Giai, Ba Đình, Hà Nội', 21.031802, 105.814234, true)
  ON CONFLICT (slug) DO UPDATE SET is_active = true;

  SELECT id INTO v_shop_id FROM public.shops WHERE slug = 'greenbridge-main' LIMIT 1;

  -- Upsert Shop Memberships
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO public.shop_members (shop_id, user_id, member_role, status)
    VALUES (v_shop_id, v_admin_id, 'owner', 'active')
    ON CONFLICT (shop_id, user_id) DO UPDATE SET member_role = 'owner', status = 'active';
  END IF;

  IF v_shipper_id IS NOT NULL THEN
    INSERT INTO public.shop_members (shop_id, user_id, member_role, status)
    VALUES (v_shop_id, v_shipper_id, 'shipper', 'active')
    ON CONFLICT (shop_id, user_id) DO UPDATE SET member_role = 'shipper', status = 'active';
  END IF;

  -- Upsert Warehouse
  SELECT id INTO v_warehouse_id FROM public.warehouses WHERE shop_id = v_shop_id LIMIT 1;
  IF v_warehouse_id IS NULL THEN
    INSERT INTO public.warehouses (id, shop_id, name, address, lat, lng, is_default, has_cleaning_facility, has_inspection_depot, status)
    VALUES ('22222222-2222-2222-2222-222222222222', v_shop_id, 'Tổng Kho & Hub Vệ Sinh Đống Đa', '268 Đường Láng, Đống Đa, Hà Nội', 21.003118, 105.814234, true, true, true, 'active')
    RETURNING id INTO v_warehouse_id;
  ELSE
    UPDATE public.warehouses SET status = 'active', has_cleaning_facility = true, has_inspection_depot = true WHERE id = v_warehouse_id;
  END IF;

  -- Upsert Fleet / Vehicles
  SELECT id INTO v_vehicle1_id FROM public.vehicles WHERE shop_id = v_shop_id LIMIT 1;
  IF v_vehicle1_id IS NULL THEN
    INSERT INTO public.vehicles (id, shop_id, name, vehicle_type, license_plate, capacity_kg, co2_kg_per_km, fuel_cost_vnd_per_km, status)
    VALUES ('44444444-4444-4444-4444-444444444441', v_shop_id, 'Xe Máy Điện Green E1', 'electric_motorbike', '29-MD1 088.99', 45.0, 0.0150, 450.00, 'active')
    RETURNING id INTO v_vehicle1_id;
  ELSE
    UPDATE public.vehicles SET status = 'active' WHERE id = v_vehicle1_id;
  END IF;

  -- Upsert Shipper Shifts
  IF v_shipper_id IS NOT NULL THEN
    INSERT INTO public.shipper_shifts (shop_id, shipper_id, shift_date, start_time, end_time, start_warehouse_id, max_work_minutes, status)
    VALUES (v_shop_id, v_shipper_id, CURRENT_DATE, '08:00', '17:30', v_warehouse_id, 480, 'active')
    ON CONFLICT (shipper_id, shift_date) DO UPDATE SET status = 'active';
  END IF;

  -- Upsert PUDO Smart Lockers
  INSERT INTO public.pudo_locations (id, name, pudo_type, address, lat, lng, total_slots, available_slots, operating_hours, status)
  VALUES ('33333333-3333-3333-3333-333333333333', 'Smart Locker Láng Hạ - GreenPoint 01', 'smart_locker', '88 Láng Hạ, Đống Đa, Hà Nội', 21.015243, 105.815982, 24, 19, '24/7', 'active')
  ON CONFLICT (id) DO UPDATE SET status = 'active';

  -- Upsert PaaS Bags
  INSERT INTO public.paas_bags (
    id, bag_code, qr_code_hash, owner_entity, is_platform_owned, current_shop_id,
    current_holder_type, model_type, size_category, status, condition, usage_count,
    max_cycles, current_location_type, current_warehouse_id, current_holder_user_id
  ) VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', 'BAG-000001', 'qr_hash_bag_000001_secret', 'GREENBRIDGE_PLATFORM', true, v_shop_id, 'customer', 'standard_25l', 'medium', 'return_requested', 'good', 5, 100, 'customer_address', NULL, v_customer_id),
    ('bbbbbbbb-0000-0000-0000-000000000002', 'BAG-000002', 'qr_hash_bag_000002_secret', 'GREENBRIDGE_PLATFORM', true, v_shop_id, 'shipper', 'standard_25l', 'medium', 'in_delivery', 'new', 1, 100, 'transit_vehicle', NULL, v_shipper_id),
    ('bbbbbbbb-0000-0000-0000-000000000003', 'BAG-000003', 'qr_hash_bag_000003_secret', 'GREENBRIDGE_PLATFORM', true, v_shop_id, 'warehouse', 'thermal_35l', 'large', 'available', 'good', 14, 100, 'warehouse', v_warehouse_id, NULL),
    ('bbbbbbbb-0000-0000-0000-000000000004', 'BAG-000004', 'qr_hash_bag_000004_secret', 'GREENBRIDGE_PLATFORM', true, v_shop_id, 'warehouse', 'standard_25l', 'medium', 'maintenance', 'needs_cleaning', 8, 100, 'cleaning_station', v_warehouse_id, NULL),
    ('bbbbbbbb-0000-0000-0000-000000000005', 'BAG-000005', 'qr_hash_bag_000005_secret', 'GREENBRIDGE_PLATFORM', true, v_shop_id, 'warehouse', 'standard_25l', 'medium', 'ready_for_reuse', 'good', 22, 100, 'warehouse', v_warehouse_id, NULL)
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    condition = EXCLUDED.condition,
    usage_count = EXCLUDED.usage_count,
    current_location_type = EXCLUDED.current_location_type,
    current_warehouse_id = EXCLUDED.current_warehouse_id,
    current_holder_user_id = EXCLUDED.current_holder_user_id;

  -- Upsert Orders
  INSERT INTO public.orders (id, shop_id, customer_id, order_code, customer_name, customer_phone, address, lat, lng, delivery_date, time_slot_start, time_slot_end, weight_kg, status, assigned_shipper_id)
  VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', v_shop_id, v_customer_id, 'ORD-2026-001', 'Hoàng Tiêu Dùng', '0904000004', '12 Chùa Bộc, Đống Đa, Hà Nội', 21.007621, 105.828451, CURRENT_DATE - 2, '09:00', '12:00', 3.5, 'delivered', v_shipper_id),
    ('aaaaaaaa-0000-0000-0000-000000000002', v_shop_id, v_customer2_id, 'ORD-2026-002', 'Phạm Khách Hàng', '0905000005', '45 Thái Hà, Đống Đa, Hà Nội', 21.013589, 105.820711, CURRENT_DATE, '08:30', '11:30', 2.8, 'delivering', v_shipper_id),
    ('aaaaaaaa-0000-0000-0000-000000000003', v_shop_id, v_customer_id, 'ORD-2026-003', 'Hoàng Tiêu Dùng', '0904000004', '12 Chùa Bộc, Đống Đa, Hà Nội', 21.007621, 105.828451, CURRENT_DATE, '14:00', '17:00', 1.5, 'ready', NULL)
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    assigned_shipper_id = EXCLUDED.assigned_shipper_id;

  -- Upsert Order ↔ PaaS Bag Assignments
  INSERT INTO public.order_bag_assignments (order_id, bag_id, is_primary, is_active)
  VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', true, true),
    ('aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', true, true),
    ('aaaaaaaa-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000005', true, false)
  ON CONFLICT (order_id, bag_id) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    is_primary = EXCLUDED.is_primary;

  -- Upsert Recovery Request
  INSERT INTO public.recovery_requests (id, shop_id, customer_id, bag_id, order_id, status, recovery_strategy, pickup_address, lat, lng, pickup_date, time_slot_start, time_slot_end)
  VALUES (
    '77777777-0000-0000-0000-000000000001',
    v_shop_id,
    v_customer_id,
    'bbbbbbbb-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'assigned',
    'strategy_a_merged',
    '12 Chùa Bộc, Đống Đa, Hà Nội',
    21.007621,
    105.828451,
    CURRENT_DATE,
    '08:00',
    '12:00'
  ) ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    pickup_date = EXCLUDED.pickup_date;

  -- Upsert Recovery Decision
  INSERT INTO public.recovery_decisions (
    id, recovery_request_id, recommended_strategy, selected_strategy, decision_source,
    estimated_distance_delta_km, estimated_duration_delta_mins, estimated_cost_delta_vnd,
    context_signals_snapshot, rationale
  ) VALUES (
    'dddddddd-0000-0000-0000-000000000001',
    '77777777-0000-0000-0000-000000000001',
    'strategy_a_merged',
    'strategy_a_merged',
    'GALM_RULE_ENGINE',
    1.15,
    8,
    1380.00,
    jsonb_build_object('weather', 'CLEAR', 'flood_risk_level', 'NONE', 'traffic_level', 'MODERATE'),
    jsonb_build_object(
      'decision', 'Merge pickup into active delivery route RT-01',
      'distance_delta_km', 1.15,
      'duration_delta_mins', 8,
      'vehicle_capacity_ok', true,
      'flood_risk', 'No flooding detected on route segment',
      'justification', 'Shipper passes within 800m of customer address on return leg to hub'
    )
  ) ON CONFLICT (recovery_request_id) DO NOTHING;

  -- Upsert Route Today
  INSERT INTO public.routes (id, shop_id, warehouse_id, route_date, shipper_id, vehicle_id, naive_distance_km, optimized_distance_km, total_duration_mins, estimated_cost_vnd, status, route_type, approved_at, started_at)
  VALUES (
    '99999999-0000-0000-0000-000000000001',
    v_shop_id,
    v_warehouse_id,
    CURRENT_DATE,
    v_shipper_id,
    v_vehicle1_id,
    14.2,
    9.8,
    45,
    12500.00,
    'in_progress',
    'delivery_with_recovery',
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    route_type = EXCLUDED.route_type,
    approved_at = EXCLUDED.approved_at,
    started_at = EXCLUDED.started_at;

  -- Link order and recovery request to this route
  UPDATE public.orders SET assigned_route_id = '99999999-0000-0000-0000-000000000001' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
  UPDATE public.recovery_requests SET assigned_route_id = '99999999-0000-0000-0000-000000000001', assigned_shipper_id = v_shipper_id WHERE id = '77777777-0000-0000-0000-000000000001';

  -- Upsert Route Stops
  INSERT INTO public.route_stops (id, route_id, stop_type, order_id, recovery_request_id, sequence_index, distance_from_previous_km, duration_from_previous_mins, status)
  VALUES
    ('88888888-0000-0000-0000-000000000000', '99999999-0000-0000-0000-000000000001', 'warehouse'::public.route_stop_type, NULL, NULL, 0, 0.0, 0, 'completed'),
    ('88888888-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', 'delivery'::public.route_stop_type, 'aaaaaaaa-0000-0000-0000-000000000002', NULL, 1, 3.4, 15, 'arrived'),
    ('88888888-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000001', 'recovery'::public.route_stop_type, NULL, '77777777-0000-0000-0000-000000000001', 2, 2.1, 12, 'pending'),
    ('88888888-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000001', 'maintenance_hub'::public.route_stop_type, NULL, NULL, 3, 4.3, 18, 'pending')
  ON CONFLICT (route_id, sequence_index) DO UPDATE SET
    stop_type = EXCLUDED.stop_type,
    order_id = EXCLUDED.order_id,
    recovery_request_id = EXCLUDED.recovery_request_id,
    distance_from_previous_km = EXCLUDED.distance_from_previous_km,
    duration_from_previous_mins = EXCLUDED.duration_from_previous_mins,
    status = EXCLUDED.status;

  -- Upsert Customer Deposit
  INSERT INTO public.customer_deposits (id, customer_id, shop_id, bag_id, order_id, deposit_amount_vnd, status, held_at)
  VALUES (
    'cccccccc-0000-0000-0000-000000000001',
    v_customer_id,
    v_shop_id,
    'bbbbbbbb-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    50000.00,
    'held',
    CURRENT_TIMESTAMP - INTERVAL '2 days'
  ) ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    held_at = EXCLUDED.held_at,
    deposit_amount_vnd = EXCLUDED.deposit_amount_vnd;

  -- Upsert Green Points Ledger
  INSERT INTO public.green_point_transactions (id, customer_id, points_delta, transaction_type, reference_type, reference_id, description, idempotency_key)
  VALUES (
    '33333333-0000-0000-0000-000000000001',
    v_customer_id,
    100,
    'pickup_reward',
    'bag_return',
    '77777777-0000-0000-0000-000000000001',
    'Điểm thưởng trả túi PaaS đúng hạn trước đây',
    'seed_bonus_cust_1'
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  -- Upsert Context Signals
  INSERT INTO public.context_signals (id, signal_type, source, area_name, lat, lng, severity_level, signal_data, valid_from, valid_until)
  VALUES
    ('55555555-0000-0000-0000-000000000001', 'TRAFFIC_CONGESTION', 'SIMULATED', 'Ngã tư Thái Hà - Láng Hạ', 21.015112, 105.817234, 'medium', jsonb_build_object('speed_kmh', 14, 'delay_mins', 6), now(), now() + interval '4 hours'),
    ('55555555-0000-0000-0000-000000000002', 'FLOODING_RISK', 'SIMULATED', 'Tuyến Huỳnh Thúc Kháng', 21.018231, 105.811432, 'low', jsonb_build_object('flood_risk_level', 'SAFE', 'current_depth_cm', 0), now(), now() + interval '8 hours')
  ON CONFLICT (id) DO UPDATE SET
    severity_level = EXCLUDED.severity_level,
    signal_data = EXCLUDED.signal_data,
    valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until;

  -- Upsert ESG Reports & Metrics
  INSERT INTO public.esg_reports (id, shop_id, route_id, report_date, naive_distance_km, optimized_distance_km, km_saved, co2_saved_kg, packaging_collected_kg, cost_saved_vnd)
  VALUES (
    'eeeeeeee-0000-0000-0000-000000000001',
    v_shop_id,
    '99999999-0000-0000-0000-000000000001',
    CURRENT_DATE,
    14.2,
    9.8,
    4.4,
    0.3608,
    1.5,
    5280.00
  ) ON CONFLICT (route_id) DO UPDATE SET
    report_date = EXCLUDED.report_date,
    co2_saved_kg = EXCLUDED.co2_saved_kg,
    km_saved = EXCLUDED.km_saved;

  INSERT INTO public.esg_daily_metrics (shop_id, metric_date, active_bags_count, bags_in_circulation, bags_recovered_today, recovery_rate_percent, avg_reuse_cycles, single_use_packages_avoided, co2_saved_kg, fuel_saved_vnd, avg_cost_per_order_vnd, avg_cost_per_recovery_vnd)
  VALUES (
    v_shop_id,
    CURRENT_DATE,
    5,
    2,
    1,
    83.5,
    9.4,
    18,
    3.4500,
    48500.00,
    12500.00,
    4200.00
  ) ON CONFLICT (shop_id, metric_date) DO NOTHING;

END $$;
