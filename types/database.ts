export type UserAccountType = 'customer' | 'platform_admin' | 'shop_user';
export type ShopMemberRole = 'owner' | 'admin' | 'dispatcher' | 'shipper';
export type VehicleType = 'electric_motorbike' | 'motorbike' | 'small_van' | 'light_truck';
export type OrderStatus = 'pending' | 'ready' | 'assigned' | 'delivering' | 'delivered' | 'failed' | 'cancelled';
export type RouteStatus = 'draft' | 'optimizing' | 'optimized' | 'approved' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type StopType = 'warehouse' | 'delivery' | 'pickup';
export type StopStatus = 'pending' | 'arrived' | 'completed' | 'failed' | 'skipped';
export type PickupStatus = 'pending' | 'scheduled' | 'assigned' | 'collecting' | 'completed' | 'cancelled';
export type PointTransactionType = 'pickup_reward' | 'voucher_redemption' | 'admin_adjustment' | 'expired';
export type DiscountType = 'fixed_amount' | 'percentage';
export type RedemptionStatus = 'active' | 'used' | 'expired' | 'cancelled';

export interface Profile {
  id: string;
  email: string;
  account_type: UserAccountType;
  name: string;
  phone: string;
  avatar_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Shop {
  id: string;
  name: string;
  slug: string;
  address: string;
  lat: number;
  lng: number;
  logo_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShopMember {
  id: string;
  shop_id: string;
  user_id: string;
  member_role: ShopMemberRole;
  status: 'active' | 'invited' | 'suspended';
  joined_at: string;
  created_at: string;
  updated_at: string;
}

export interface Warehouse {
  id: string;
  shop_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  is_default: boolean;
  status: 'active' | 'maintenance' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  shop_id: string;
  name: string;
  vehicle_type: VehicleType;
  license_plate: string;
  capacity_kg: number;
  co2_kg_per_km: number;
  fuel_cost_vnd_per_km: number;
  status: 'active' | 'maintenance' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface ShipperShift {
  id: string;
  shop_id: string;
  shipper_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  start_warehouse_id?: string | null;
  max_work_minutes: number;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  shop_id: string;
  customer_id?: string | null;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  lat: number;
  lng: number;
  delivery_date: string;
  time_slot_start: string;
  time_slot_end: string;
  weight_kg: number;
  priority: number;
  notes?: string | null;
  status: OrderStatus;
  assigned_shipper_id?: string | null;
  assigned_route_id?: string | null;
  started_delivery_at?: string | null;
  delivered_at?: string | null;
  failure_reason?: string | null;
  proof_image_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Route {
  id: string;
  shop_id: string;
  warehouse_id: string;
  route_date: string;
  shipper_id?: string | null;
  vehicle_id?: string | null;
  naive_distance_km: number;
  optimized_distance_km: number;
  total_duration_mins: number;
  estimated_cost_vnd: number;
  status: RouteStatus;
  optimization_version: number;
  approved_by?: string | null;
  approved_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RouteStop {
  id: string;
  route_id: string;
  stop_type: StopType;
  order_id?: string | null;
  pickup_id?: string | null;
  sequence_index: number;
  estimated_arrival?: string | null;
  distance_from_previous_km: number;
  duration_from_previous_mins: number;
  status: StopStatus;
  arrived_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackagingPickup {
  id: string;
  shop_id: string;
  customer_id: string;
  address: string;
  lat: number;
  lng: number;
  packaging_type: string;
  estimated_quantity_kg: number;
  verified_quantity_kg?: number | null;
  pickup_date: string;
  available_from: string;
  available_until: string;
  status: PickupStatus;
  assigned_route_id?: string | null;
  qr_token_hash?: string | null;
  qr_expires_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GreenPointTransaction {
  id: string;
  customer_id: string;
  points_delta: number;
  transaction_type: PointTransactionType;
  packaging_pickup_id?: string | null;
  voucher_redemption_id?: string | null;
  description: string;
  idempotency_key: string;
  created_at: string;
}

export interface Voucher {
  id: string;
  shop_id?: string | null;
  name: string;
  description?: string | null;
  points_required: number;
  discount_type: DiscountType;
  discount_value: number;
  quantity: number;
  expiry_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VoucherRedemption {
  id: string;
  voucher_id: string;
  customer_id: string;
  points_spent: number;
  redemption_code: string;
  qr_token_hash: string;
  qr_expires_at: string;
  status: RedemptionStatus;
  redeemed_at: string;
  used_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ESGReport {
  id: string;
  shop_id: string;
  route_id: string;
  report_date: string;
  naive_distance_km: number;
  optimized_distance_km: number;
  km_saved: number;
  co2_saved_kg: number;
  packaging_collected_kg: number;
  cost_saved_vnd: number;
  emission_factor_snapshot: number;
  fuel_cost_factor_snapshot: number;
  baseline_method: string;
  calculation_version: number;
  created_at: string;
  updated_at: string;
}

export interface OrderAccessLog {
  id: string;
  order_id: string;
  accessed_by: string;
  action: string;
  reason: string;
  ip_address?: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  read_at?: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  shop_id?: string | null;
  actor_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  created_at: string;
}
