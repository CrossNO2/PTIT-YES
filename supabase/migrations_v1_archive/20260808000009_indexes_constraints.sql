-- Migration 09: Database Indexes for High-Performance Queries

CREATE INDEX idx_shop_members_user_shop ON public.shop_members(user_id, shop_id);
CREATE INDEX idx_orders_shop_date_status ON public.orders(shop_id, delivery_date, status);
CREATE INDEX idx_orders_shipper_date ON public.orders(assigned_shipper_id, delivery_date);
CREATE INDEX idx_orders_route_id ON public.orders(assigned_route_id);
CREATE INDEX idx_routes_shop_date ON public.routes(shop_id, route_date);
CREATE INDEX idx_routes_shipper_date ON public.routes(shipper_id, route_date);
CREATE INDEX idx_route_stops_route_seq ON public.route_stops(route_id, sequence_index);
CREATE INDEX idx_packaging_pickups_shop_date_status ON public.packaging_pickups(shop_id, pickup_date, status);
CREATE INDEX idx_packaging_pickups_customer_status ON public.packaging_pickups(customer_id, status);
CREATE INDEX idx_green_point_tx_customer_created ON public.green_point_transactions(customer_id, created_at);
CREATE INDEX idx_voucher_redemptions_customer_status ON public.voucher_redemptions(customer_id, status);
CREATE INDEX idx_esg_reports_shop_date ON public.esg_reports(shop_id, report_date);
CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, read_at);
CREATE INDEX idx_audit_logs_shop_created ON public.audit_logs(shop_id, created_at);
CREATE INDEX idx_shipper_shifts_shop_date_status ON public.shipper_shifts(shop_id, shift_date, status);

CREATE INDEX idx_geocoding_cache_expires ON public.geocoding_cache(expires_at);


-- Integrity constraints for first-production deployment.
-- One membership per user/shop and one license plate per shop.
CREATE UNIQUE INDEX uq_vehicles_shop_license_plate ON public.vehicles(shop_id, lower(license_plate));

-- GreenBridge currently models one shift per shipper/day.
CREATE UNIQUE INDEX uq_shipper_shifts_shipper_date ON public.shipper_shifts(shipper_id, shift_date);
ALTER TABLE public.shipper_shifts
  ADD CONSTRAINT shipper_shifts_valid_time CHECK (end_time > start_time);

-- Only one default warehouse per shop.
CREATE UNIQUE INDEX uq_warehouses_one_default_per_shop
  ON public.warehouses(shop_id)
  WHERE is_default = true;

-- Prevent assigning the same active vehicle/shipper to multiple routes on one day.
CREATE UNIQUE INDEX uq_routes_vehicle_date_active
  ON public.routes(vehicle_id, route_date)
  WHERE vehicle_id IS NOT NULL AND status <> 'cancelled';
CREATE UNIQUE INDEX uq_routes_shipper_date_active
  ON public.routes(shipper_id, route_date)
  WHERE shipper_id IS NOT NULL AND status <> 'cancelled';
